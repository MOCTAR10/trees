"""Shared async HTTP client with bounded retries and exponential backoff.

Every outbound call (Pl@ntNet, GBIF, SoilGrids, Groq) goes through here so we
get connection pooling, uniform timeouts, and graceful recovery from transient
429/5xx responses and network hiccups. The client is process-wide but is
transparently recreated when the running event loop changes (tests spin up a
fresh loop per case).
"""

import asyncio
import logging

import httpx

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRIES = 2
INITIAL_BACKOFF_S = 0.5
MAX_BACKOFF_S = 8.0
RETRY_STATUS = frozenset({429, 500, 502, 503, 504})

_client: httpx.AsyncClient | None = None
_client_loop: asyncio.AbstractEventLoop | None = None


def get_client() -> httpx.AsyncClient:
    """Return a reusable client, recreated if it was bound to another loop."""
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client.is_closed or _client_loop is not loop:
        _client = httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        _client_loop = loop
    return _client


async def close_client() -> None:
    """Release the shared client (called from the FastAPI lifespan)."""
    global _client, _client_loop
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
    _client_loop = None


def _retry_after(response: httpx.Response, default: float) -> float:
    raw = response.headers.get("Retry-After")
    if raw:
        try:
            return min(float(raw), MAX_BACKOFF_S)
        except ValueError:
            pass
    return default


async def request(
    method: str,
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
    **kwargs,
) -> httpx.Response:
    """Perform a request, retrying transient failures with backoff.

    Returns the final response (even an error one) so callers keep control of
    ``raise_for_status()``; only transport errors are re-raised once retries
    are exhausted.
    """
    client = get_client()
    delay = INITIAL_BACKOFF_S
    last_exc: Exception | None = None

    for attempt in range(retries + 1):
        try:
            response = await client.request(method, url, timeout=timeout, **kwargs)
        except httpx.TransportError as exc:
            last_exc = exc
            if attempt == retries:
                raise
            log.warning("%s %s failed (%s); retrying in %.1fs", method, url, exc, delay)
        else:
            if response.status_code not in RETRY_STATUS or attempt == retries:
                return response
            delay = _retry_after(response, delay)
            log.warning("%s %s -> %s; retrying in %.1fs", method, url, response.status_code, delay)
        await asyncio.sleep(delay)
        delay = min(delay * 2, MAX_BACKOFF_S)

    raise last_exc if last_exc is not None else RuntimeError("request failed")
