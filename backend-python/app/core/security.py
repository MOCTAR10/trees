"""Password hashing (PBKDF2-SHA256) and HS256 JWTs — standard library only.

Deliberately dependency-free so the CI stack needs no extra installs.
Tokens are minimal JWTs: base64url(header).base64url(payload).base64url(HMAC).
"""

import base64
import hashlib
import hmac
import json
import os
import time

PBKDF2_ITERATIONS = 200_000
_ALGO = "HS256"


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_b64, digest_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64d(salt_b64), int(iterations))
        return hmac.compare_digest(digest, _b64d(digest_b64))
    except (AttributeError, ValueError, TypeError):
        return False


def _sign(segment: str, secret: str) -> str:
    return _b64e(hmac.new(secret.encode(), segment.encode(), hashlib.sha256).digest())


def create_access_token(subject: str, role: str, user_id: int, secret: str, expires_in: int) -> str:
    now = int(time.time())
    header = {"alg": _ALGO, "typ": "JWT"}
    payload = {
        "sub": subject,
        "role": role,
        "uid": user_id,
        "iat": now,
        "exp": now + expires_in,
    }
    segment = (
        f"{_b64e(json.dumps(header, separators=(',', ':')).encode())}."
        f"{_b64e(json.dumps(payload, separators=(',', ':')).encode())}"
    )
    return f"{segment}.{_sign(segment, secret)}"


def decode_access_token(token: str, secret: str) -> dict:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError:
        raise ValueError("jeton malformé") from None

    expected = hmac.new(
        secret.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256
    ).digest()
    if not hmac.compare_digest(expected, _b64d(signature_b64)):
        raise ValueError("signature invalide")

    header = json.loads(_b64d(header_b64))
    if header.get("alg") != _ALGO:
        raise ValueError("algorithme non supporté")

    payload = json.loads(_b64d(payload_b64))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("jeton expiré")
    return payload
