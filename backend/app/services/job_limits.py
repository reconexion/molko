import threading


class TooManyConcurrentJobsError(Exception):
    pass


class JobLimiter:
    """Caps how many heavy background jobs (ffmpeg / yt-dlp) one account can have running.

    Each job keeps a whole video in memory plus a subprocess, so without a cap a
    single account could starve the shared backend for everyone else.
    """

    def __init__(self, max_per_user: int):
        self.max_per_user = max_per_user
        self._running: dict[int, int] = {}
        self._lock = threading.Lock()

    def acquire(self, user_id: int) -> None:
        with self._lock:
            if self._running.get(user_id, 0) >= self.max_per_user:
                raise TooManyConcurrentJobsError()
            self._running[user_id] = self._running.get(user_id, 0) + 1

    def release(self, user_id: int) -> None:
        with self._lock:
            remaining = self._running.get(user_id, 1) - 1
            if remaining <= 0:
                self._running.pop(user_id, None)
            else:
                self._running[user_id] = remaining
