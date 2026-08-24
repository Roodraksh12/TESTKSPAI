from app.services.auth_rate_limit import LoginAttemptLimiter


def test_badge_failures_are_limited_and_success_clears_them() -> None:
    limiter = LoginAttemptLimiter(badge_limit=2, ip_limit=10, window_seconds=60)

    limiter.record_failure("KA-TEST", "127.0.0.1", now=100)
    assert limiter.retry_after("KA-TEST", "127.0.0.1", now=101) == 0

    limiter.record_failure("ka-test", "127.0.0.1", now=102)
    assert limiter.retry_after("KA-TEST", "127.0.0.1", now=103) > 0

    limiter.record_success("KA-TEST")
    assert limiter.retry_after("KA-TEST", "different-ip", now=104) == 0


def test_ip_limit_covers_multiple_badges_and_expires() -> None:
    limiter = LoginAttemptLimiter(badge_limit=10, ip_limit=2, window_seconds=60)

    limiter.record_failure("KA-ONE", "10.0.0.1", now=100)
    limiter.record_failure("KA-TWO", "10.0.0.1", now=101)

    assert limiter.retry_after("KA-THREE", "10.0.0.1", now=102) > 0
    assert limiter.retry_after("KA-THREE", "10.0.0.1", now=162) == 0
