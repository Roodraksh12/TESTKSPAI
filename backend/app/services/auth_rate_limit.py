"""Small process-local guard against credential brute forcing.

This is deliberately bounded and dependency-free. Deployments should also rate
limit at the reverse proxy because multiple API workers do not share memory.
"""

from __future__ import annotations

import threading
import time


class LoginAttemptLimiter:
    def __init__(
        self,
        *,
        badge_limit: int = 8,
        ip_limit: int = 30,
        window_seconds: int = 15 * 60,
        max_keys: int = 10_000,
    ) -> None:
        self.badge_limit = badge_limit
        self.ip_limit = ip_limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._attempts: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _badge_key(badge_id: str) -> str:
        return f"badge:{badge_id.strip().casefold()}"

    @staticmethod
    def _ip_key(ip: str) -> str:
        return f"ip:{ip or 'unknown'}"

    def retry_after(self, badge_id: str, ip: str, *, now: float | None = None) -> int:
        current = time.monotonic() if now is None else now
        with self._lock:
            self._prune(current)
            waits = []
            for key, limit in (
                (self._badge_key(badge_id), self.badge_limit),
                (self._ip_key(ip), self.ip_limit),
            ):
                attempts = self._attempts.get(key, [])
                if len(attempts) >= limit:
                    waits.append(max(1, int(self.window_seconds - (current - attempts[0]))))
            return max(waits, default=0)

    def record_failure(self, badge_id: str, ip: str, *, now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        with self._lock:
            self._prune(current)
            for key in (self._badge_key(badge_id), self._ip_key(ip)):
                self._attempts.setdefault(key, []).append(current)

    def record_success(self, badge_id: str) -> None:
        with self._lock:
            self._attempts.pop(self._badge_key(badge_id), None)

    def _prune(self, now: float) -> None:
        cutoff = now - self.window_seconds
        stale_keys = []
        for key, attempts in self._attempts.items():
            fresh = [attempt for attempt in attempts if attempt > cutoff]
            if fresh:
                self._attempts[key] = fresh
            else:
                stale_keys.append(key)
        for key in stale_keys:
            self._attempts.pop(key, None)

        if len(self._attempts) > self.max_keys:
            oldest = sorted(
                self._attempts,
                key=lambda key: self._attempts[key][-1],
            )[: len(self._attempts) - self.max_keys]
            for key in oldest:
                self._attempts.pop(key, None)


login_attempts = LoginAttemptLimiter()
