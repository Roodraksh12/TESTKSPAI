"""In-process job tracking for long-running FIR intake.

OCR plus a model call takes tens of seconds. Doing that inside the HTTP request
tied the work to the browser: navigating to another tab discarded the response,
and the officer had to re-upload from scratch. That is the wrong failure mode
for someone processing a stack of scans.

Jobs are therefore started server-side and polled. The work continues whether or
not anyone is watching, several scans can be in flight at once, and a result
stays collectable for a while after it finishes.

State lives in memory, which is the right size for this: a job is a transient
step on the way to a saved Case, and a restart losing an in-flight extraction is
recoverable by re-uploading. Nothing here is the system of record — the Case row
is, and that is written only when the officer confirms.
"""

from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Literal

JobStatus = Literal["queued", "processing", "done", "error"]

# How long a finished job stays collectable. Long enough for an officer to come
# back from another tab; short enough that memory does not grow unbounded.
RESULT_TTL_SECONDS = 30 * 60


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
        job = Job(
            uuid.uuid4().hex[:16],
            officer_id,
            filename,
            document_content=document_content,
            document_content_type=document_content_type,
        )
        with self._lock:
            self._jobs[job.id] = job
            self._evict_expired()
        return job

    def get(self, job_id: str, officer_id: str) -> Job | None:
        """Fetch a job, scoped to its owner so officers can't read each other's."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.officer_id != officer_id:
                return None
            return job

    def get_document(self, job_id: str, officer_id: str) -> dict[str, Any] | None:
        """Return a completed job's private scan only to the owning officer."""
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
                job.finished_at = time.time()

    def discard(self, job_id: str, officer_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.officer_id != officer_id:
                return False
            del self._jobs[job_id]
            return True

    def _evict_expired(self) -> None:
        """Drop finished jobs past their TTL. Caller must hold the lock."""
        now = time.time()
        stale = [
            jid
            for jid, job in self._jobs.items()
            if job.finished_at is not None and now - job.finished_at > RESULT_TTL_SECONDS
        ]
        for jid in stale:
            del self._jobs[jid]


fir_jobs = JobStore()
