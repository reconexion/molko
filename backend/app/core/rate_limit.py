import threading
import time
from collections import deque

from fastapi import Request, status

from app.core.errors import api_error

# In-memory sliding windows: correct for a single process. With several workers
# each one counts on its own (limits multiply); move to Redis before scaling out.
# Behind a reverse proxy, run uvicorn with --proxy-headers so client.host is the
# real client IP and not the proxy's.
_hits: dict[str, deque[float]] = {}
_failures: dict[str, deque[float]] = {}
_lock = threading.Lock()

_MAX_KEYS = 50_000
_MAX_WINDOW_SECONDS = 3600
_SWEEP_EVERY_SECONDS = 60
_last_sweep = 0.0


def reset_rate_limits() -> None:
    with _lock:
        _hits.clear()
        _failures.clear()


def _sweep(store: dict[str, deque[float]], now: float) -> None:
    global _last_sweep
    if now - _last_sweep < _SWEEP_EVERY_SECONDS and len(store) < _MAX_KEYS:
        return
    _last_sweep = now
    for key in [k for k, window in store.items() if not window or now - window[-1] > _MAX_WINDOW_SECONDS]:
        del store[key]
    # A flood of distinct keys (rotating IPs) must not grow memory without bound.
    if len(store) >= _MAX_KEYS:
        for key in sorted(store, key=lambda k: store[k][-1])[: _MAX_KEYS // 10]:
            del store[key]


def allow(key: str, limit: int, window_seconds: int) -> bool:
    """Records a hit and returns False once `limit` hits fall inside the window."""
    now = time.monotonic()
    with _lock:
        _sweep(_hits, now)
        window = _hits.setdefault(key, deque())
        while window and now - window[0] > window_seconds:
            window.popleft()
        if len(window) >= limit:
            return False
        window.append(now)
        return True


def too_many_requests():
    return api_error(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "too_many_attempts",
        "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    )


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(scope: str, limit: int, window_seconds: int):
    """Per-client-IP limit, for endpoints anyone can reach."""

    def dependency(request: Request) -> None:
        if not allow(f"ip:{scope}:{client_ip(request)}", limit, window_seconds):
            raise too_many_requests()

    return dependency


# Failed-login tracking per account, on top of the per-IP limit: the IP limit alone
# does nothing against one password list spread over many IPs. Trade-off: someone
# can also lock a victim out for the window by failing on purpose.
def login_blocked(email: str, limit: int, window_seconds: int) -> bool:
    now = time.monotonic()
    with _lock:
        _sweep(_failures, now)
        window = _failures.get(email)
        if window is None:
            return False
        while window and now - window[0] > window_seconds:
            window.popleft()
        return len(window) >= limit


def record_login_failure(email: str) -> None:
    with _lock:
        _failures.setdefault(email, deque()).append(time.monotonic())


def clear_login_failures(email: str) -> None:
    with _lock:
        _failures.pop(email, None)
