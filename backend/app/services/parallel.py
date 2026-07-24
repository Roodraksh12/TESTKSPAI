"""Concurrency and caching helpers for read-heavy endpoints.

The database is remote (Supabase), so a round-trip costs roughly 300ms against
the ~1ms of a local socket. Endpoints that compose 6-10 independent aggregates
were paying that serially, which is what made pages feel slow — the work itself
is trivial, the waiting is not.

Two mitigations, both aimed at wall-clock rather than query cost:

1. ``gather`` runs independent queries on separate pooled connections at once,
   so an endpoint costs about one round-trip instead of the sum of them.
2. ``cached`` memoises expensive aggregates for a few seconds. District-level
   statistics do not change between two clicks, and a stale-by-15-seconds
   clearance rate is not a number anyone acts on differently.

Nothing here is used for writes or for anything an officer confirms — caching a
decision surface would be wrong. It covers dashboards and charts only.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, TypeVar

T = TypeVar("T")

# Sized to sit under the connection pool's max_size so a burst of parallel
# queries can never starve the pool and deadlock waiting for a connection.
_executor = ThreadPoolExecutor(max_workers=6, thread_name_prefix="scrb-fanout")


def gather(tasks: dict[str, Callable[[], Any]]) -> dict[str, Any]:
    """Run independent zero-argument callables concurrently, keyed by name.

    A failing task yields ``None`` for its key rather than taking down the whole
    response — a broken sparkline should not blank an entire dashboard.
    """
    futures = {key: _executor.submit(fn) for key, fn in tasks.items()}
    results: dict[str, Any] = {}
    for key, future in futures.items():
        try:
            results[key] = future.result()
        except Exception:
            results[key] = None
    return results


class TTLCache:
    """Tiny thread-safe time-to-live cache."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._store: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get_or_compute(self, key: Any, compute: Callable[[], T]) -> T:
        now = time.monotonic()
        with self._lock:
            hit = self._store.get(key)
            if hit and now - hit[0] < self._ttl:
                return hit[1]

        # Computed outside the lock so one slow query cannot block every reader.
        value = compute()
        with self._lock:
            self._store[key] = (now, value)
        return value

    def invalidate(self, key: Any | None = None) -> None:
        with self._lock:
            if key is None:
                self._store.clear()
            else:
                self._store.pop(key, None)


# Aggregate views: refreshed often enough to feel live, long enough to absorb
# navigation between tabs without re-querying.
analytics_cache = TTLCache(ttl_seconds=20)
# The graph is costlier to build and changes only when cases or links change.
network_cache = TTLCache(ttl_seconds=45)


def invalidate_all() -> None:
    """Drop cached aggregates. Called after writes that change what they show."""
    analytics_cache.invalidate()
    network_cache.invalidate()
