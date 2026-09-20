import json

from app.core.rate_limit import allow, too_many_requests

# ASGI middleware (not BaseHTTPMiddleware) so request bodies stream through untouched.

_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


def _error_response(status_code: int, code: str, message: str):
    body = json.dumps({"detail": {"code": code, "message": message}}).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
    return [
        {"type": "http.response.start", "status": status_code, "headers": headers},
        {"type": "http.response.body", "body": body},
    ]


async def _send_all(send, messages) -> None:
    for message in messages:
        await send(message)


class BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    """Rejects oversized request bodies before they are buffered in memory.

    Endpoints read the whole body (`await request.body()`, `await file.read()`), so
    without a cap one unauthenticated POST of a few GB exhausts the server's RAM.
    """

    def __init__(self, app, default_limit: int, path_limits: dict[tuple[str, str], int]):
        self.app = app
        self.default_limit = default_limit
        self.path_limits = path_limits

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)

        limit = self.path_limits.get((scope["method"], scope["path"]), self.default_limit)
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > limit
            except ValueError:
                return await _send_all(send, _error_response(400, "bad_request", "Content-Length inválido"))
            if too_big:
                return await _send_all(send, _error_response(413, "request_too_large", "La solicitud es demasiado grande"))

        received = 0
        response_started = False

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise BodyTooLarge()
            return message

        async def tracking_send(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except BodyTooLarge:
            if not response_started:
                await _send_all(send, _error_response(413, "request_too_large", "La solicitud es demasiado grande"))


class IpFloodMiddleware:
    """Coarse per-IP ceiling over every route, to blunt floods before any handler runs."""

    def __init__(self, app, limit: int, window_seconds: int):
        self.app = app
        self.limit = limit
        self.window_seconds = window_seconds

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            client = scope.get("client")
            if not allow(f"flood:{client[0] if client else 'unknown'}", self.limit, self.window_seconds):
                error = too_many_requests().detail
                return await _send_all(send, _error_response(429, error["code"], error["message"]))
        await self.app(scope, receive, send)


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        is_docs = scope["path"] in _DOCS_PATHS or scope["path"].startswith("/docs/")

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                extra = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"cache-control", b"no-store"),
                ]
                if not is_docs:
                    extra.append((b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"))
                if scope.get("scheme") == "https":
                    extra.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                headers.extend(pair for pair in extra if pair[0] not in present)
            await send(message)

        await self.app(scope, receive, send_with_headers)
