"""Bounded, durable job tracking for long-running FIR intake.

OCR plus a model call takes tens of seconds. Doing that inside the HTTP request
tied the work to the browser: navigating to another tab discarded the response,
and the officer had to re-upload from scratch. That is the wrong failure mode
for someone processing a stack of scans.

Jobs are therefore started server-side and polled. The work continues whether or
not anyone is watching, several scans can be in flight at once, and a result
stays collectable for a while after it finishes.

When migration 0019 is available, transient state and source bytes live in the
shared test database so every backend worker and a reloaded browser sees the
same queue. A bounded in-memory fallback keeps older development databases
usable. Nothing here is the system of record — the Case row is written only
after officer confirmation.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from psycopg.types.json import Jsonb

from app.services.db import execute, execute_returning, fetch_all, fetch_one, fetch_scalar

JobStatus = Literal["queued", "processing", "done", "error"]

# How long a finished job stays collectable. Long enough for an officer to come
# back from another tab; short enough that memory does not grow unbounded.
RESULT_TTL_SECONDS = 30 * 60
STALE_JOB_SECONDS = 2 * 60 * 60
MAX_JOBS_PER_OFFICER = 25


class JobCapacityError(RuntimeError):
    pass


class Job:
    def __init__(
        self,
        job_id: str,
        officer_id: str,
        filename: str,
        *,
        document_content: bytes | None = None,
        document_content_type: str | None = None,
    ) -> None:
        self.id = job_id
        self.officer_id = officer_id
        self.filename = filename
        # Original scan bytes are private job state and are never serialized in
        # an API response. They exist only until the confirmed Case is saved.
        self.document_content = document_content
        self.document_content_type = document_content_type
        self.status: JobStatus = "queued"
        self.stage: str = "Queued"
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created_at = time.time()
        self.finished_at: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "jobId": self.id,
            "filename": self.filename,
            "status": self.status,
            "stage": self.stage,
            "result": self.result,
            "error": self.error,
            "createdAt": self.created_at,
        }

    def summary(self) -> dict[str, Any]:
        """Queue-list view: everything except the (large) result payload."""
        data = self.as_dict()
        data.pop("result", None)
        return data


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(
        self,
        officer_id: str,
        filename: str,
        *,
        document_content: bytes | None = None,
        document_content_type: str | None = None,
    ) -> Job:
        self._evict_expired()
        job = Job(
            uuid.uuid4().hex[:16],
            officer_id,
            filename,
            document_content=document_content,
            document_content_type=document_content_type,
        )
        with self._lock:
            officer_job_count = sum(1 for item in self._jobs.values() if item.officer_id == officer_id)
            if officer_job_count >= MAX_JOBS_PER_OFFICER:
                raise JobCapacityError("Too many active FIR jobs; discard a finished job and retry")
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str, officer_id: str) -> Job | None:
        """Fetch a job, scoped to its owner so officers can't read each other's."""
        self._evict_expired()
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.officer_id != officer_id:
                return None
            return job

    def get_document(self, job_id: str, officer_id: str) -> dict[str, Any] | None:
        """Return a completed job's private scan only to the owning officer."""
        self._evict_expired()
        with self._lock:
            job = self._jobs.get(job_id)
            if (
                job is None
                or job.officer_id != officer_id
                or job.status != "done"
                or job.document_content is None
                or not job.document_content_type
            ):
                return None
            return {
                "filename": job.filename,
                "contentType": job.document_content_type,
                "content": job.document_content,
            }

    def list_for(self, officer_id: str) -> list[Job]:
        self._evict_expired()
        with self._lock:
            jobs = [j for j in self._jobs.values() if j.officer_id == officer_id]
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)

    def set_stage(self, job_id: str, stage: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = "processing"
                job.stage = stage

    def finish(self, job_id: str, result: dict[str, Any]) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = "done"
                job.stage = "Complete"
                job.result = result
                job.finished_at = time.time()

    def fail(self, job_id: str, message: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = "error"
                job.stage = "Failed"
                job.error = message
                job.document_content = None
                job.finished_at = time.time()

    def discard(self, job_id: str, officer_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.officer_id != officer_id:
                return False
            del self._jobs[job_id]
            return True

    def _evict_expired(self) -> None:
        """Drop finished jobs and fail abandoned in-flight work."""
        now = time.time()
        with self._lock:
            stale = [
                jid
                for jid, job in self._jobs.items()
                if job.finished_at is not None and now - job.finished_at > RESULT_TTL_SECONDS
            ]
            for jid in stale:
                del self._jobs[jid]
            for job in self._jobs.values():
                if job.status in {"queued", "processing"} and now - job.created_at > STALE_JOB_SECONDS:
                    job.status = "error"
                    job.stage = "Failed"
                    job.error = "Processing was interrupted; upload the FIR again"
                    job.document_content = None
                    job.finished_at = now


def _timestamp(value: Any) -> float:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _job_from_row(row: dict[str, Any]) -> Job:
    job = Job(row["id"], row["officerId"], row["filename"])
    job.document_content_type = row.get("contentType")
    job.status = row["status"]
    job.stage = row["stage"]
    job.result = row.get("result")
    job.error = row.get("error")
    job.created_at = _timestamp(row["createdAt"])
    job.finished_at = _timestamp(row["finishedAt"]) if row.get("finishedAt") else None
    return job


class DatabaseJobStore:
    """Postgres-backed transient FIR jobs shared by every backend worker."""

    _cleanup_lock = threading.Lock()
    _last_cleanup_at = 0.0

    @staticmethod
    def storage_ready() -> bool:
        # A missing migration may use the compatibility fallback. A real
        # database outage must surface as an outage rather than silently moving
        # private job state into one process's memory.
        return bool(fetch_scalar('SELECT to_regclass(\'public."FirIntakeJob"\')'))

    @classmethod
    def _expire(cls) -> None:
        # Polling can call get() every two seconds. Cleanup is housekeeping, not
        # part of every read, so throttle it per worker to avoid two needless
        # write transactions for every poll.
        now = time.monotonic()
        if now - cls._last_cleanup_at < 30:
            return
        with cls._cleanup_lock:
            if now - cls._last_cleanup_at < 30:
                return
            execute(
                '''
                UPDATE "FirIntakeJob"
                SET status = 'error', stage = 'Failed',
                    error = 'Processing was interrupted; upload the FIR again',
                    "documentData" = NULL, "finishedAt" = NOW(), "updatedAt" = NOW()
                WHERE status IN ('queued', 'processing')
                  AND "createdAt" < NOW() - INTERVAL '2 hours'
                ''',
            )
            execute(
                '''
                DELETE FROM "FirIntakeJob"
                WHERE "finishedAt" IS NOT NULL
                  AND "finishedAt" < NOW() - INTERVAL '30 minutes'
                ''',
            )
            cls._last_cleanup_at = now

    def create(
        self,
        officer_id: str,
        filename: str,
        *,
        document_content: bytes | None = None,
        document_content_type: str | None = None,
    ) -> Job:
        self._expire()
        count = fetch_scalar(
            'SELECT COUNT(*) FROM "FirIntakeJob" WHERE "officerId" = %(officerId)s',
            {"officerId": officer_id},
        ) or 0
        if int(count) >= MAX_JOBS_PER_OFFICER:
            raise JobCapacityError("Too many active FIR jobs; discard a finished job and retry")
        job = Job(
            uuid.uuid4().hex[:16],
            officer_id,
            filename,
            document_content=document_content,
            document_content_type=document_content_type,
        )
        execute(
            '''
            INSERT INTO "FirIntakeJob" (
              id, "officerId", filename, "contentType", "documentData",
              status, stage, "createdAt", "updatedAt"
            ) VALUES (
              %(id)s, %(officerId)s, %(filename)s, %(contentType)s, %(documentData)s,
              'queued', 'Queued', NOW(), NOW()
            )
            ''',
            {
                "id": job.id,
                "officerId": officer_id,
                "filename": filename,
                "contentType": document_content_type,
                "documentData": document_content,
            },
        )
        return job

    def get(self, job_id: str, officer_id: str) -> Job | None:
        self._expire()
        row = fetch_one(
            '''
            SELECT id, "officerId", filename, "contentType", status, stage,
                   result, error, "createdAt", "finishedAt"
            FROM "FirIntakeJob"
            WHERE id = %(id)s AND "officerId" = %(officerId)s
            ''',
            {"id": job_id, "officerId": officer_id},
        )
        return _job_from_row(row) if row else None

    def get_document(self, job_id: str, officer_id: str) -> dict[str, Any] | None:
        row = fetch_one(
            '''
            SELECT filename, "contentType", "documentData"
            FROM "FirIntakeJob"
            WHERE id = %(id)s AND "officerId" = %(officerId)s AND status = 'done'
            ''',
            {"id": job_id, "officerId": officer_id},
        )
        if not row or row.get("documentData") is None or not row.get("contentType"):
            return None
        return {
            "filename": row["filename"],
            "contentType": row["contentType"],
            "content": row["documentData"],
        }

    def list_for(self, officer_id: str) -> list[Job]:
        self._expire()
        rows = fetch_all(
            '''
            SELECT id, "officerId", filename, "contentType", status, stage,
                   error, "createdAt", "finishedAt"
            FROM "FirIntakeJob"
            WHERE "officerId" = %(officerId)s
            ORDER BY "createdAt" DESC
            LIMIT 25
            ''',
            {"officerId": officer_id},
        )
        return [_job_from_row(row) for row in rows]

    @staticmethod
    def set_stage(job_id: str, stage: str) -> None:
        execute(
            '''
            UPDATE "FirIntakeJob"
            SET status = 'processing', stage = %(stage)s, "updatedAt" = NOW()
            WHERE id = %(id)s
            ''',
            {"id": job_id, "stage": stage},
        )

    @staticmethod
    def finish(job_id: str, result: dict[str, Any]) -> None:
        execute(
            '''
            UPDATE "FirIntakeJob"
            SET status = 'done', stage = 'Complete', result = %(result)s,
                error = NULL, "finishedAt" = NOW(), "updatedAt" = NOW()
            WHERE id = %(id)s
            ''',
            {"id": job_id, "result": Jsonb(result)},
        )

    @staticmethod
    def fail(job_id: str, message: str) -> None:
        execute(
            '''
            UPDATE "FirIntakeJob"
            SET status = 'error', stage = 'Failed', error = %(error)s,
                "documentData" = NULL, "finishedAt" = NOW(), "updatedAt" = NOW()
            WHERE id = %(id)s
            ''',
            {"id": job_id, "error": message},
        )

    @staticmethod
    def discard(job_id: str, officer_id: str) -> bool:
        row = execute_returning(
            '''
            DELETE FROM "FirIntakeJob"
            WHERE id = %(id)s AND "officerId" = %(officerId)s
            RETURNING id
            ''',
            {"id": job_id, "officerId": officer_id},
        )
        return row is not None


class DurableJobStore:
    """Use shared Postgres storage when migration 0019 is present, else memory."""

    def __init__(self) -> None:
        self.memory = JobStore()
        self.database = DatabaseJobStore()

    def _store(self):
        return self.database if self.database.storage_ready() else self.memory

    def create(self, *args, **kwargs):
        return self._store().create(*args, **kwargs)

    def get(self, *args, **kwargs):
        return self._store().get(*args, **kwargs)

    def get_document(self, *args, **kwargs):
        return self._store().get_document(*args, **kwargs)

    def list_for(self, *args, **kwargs):
        return self._store().list_for(*args, **kwargs)

    def set_stage(self, *args, **kwargs):
        return self._store().set_stage(*args, **kwargs)

    def finish(self, *args, **kwargs):
        return self._store().finish(*args, **kwargs)

    def fail(self, *args, **kwargs):
        return self._store().fail(*args, **kwargs)

    def discard(self, *args, **kwargs):
        return self._store().discard(*args, **kwargs)


fir_jobs = DurableJobStore()
