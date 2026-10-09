"""Unit tests for password hashing and HS256 JWT helpers (no DB)."""

import pytest

from app.core import security


def test_password_hash_round_trip():
    stored = security.hash_password("correct horse")
    assert stored.startswith("pbkdf2_sha256$")
    assert security.verify_password("correct horse", stored) is True


def test_verify_password_rejects_wrong():
    stored = security.hash_password("correct horse")
    assert security.verify_password("wrong", stored) is False


def test_verify_password_malformed():
    assert security.verify_password("x", "") is False
    assert security.verify_password("x", "not-a-hash") is False
    assert security.verify_password("x", "bcrypt$1$2$3") is False


def test_token_round_trip():
    token = security.create_access_token("a@b.c", "company", 7, "secret", 60)
    payload = security.decode_access_token(token, "secret")
    assert payload["sub"] == "a@b.c"
    assert payload["role"] == "company"
    assert payload["uid"] == 7
    assert payload["exp"] > payload["iat"]


def test_token_rejects_wrong_secret():
    token = security.create_access_token("a@b.c", "admin", 1, "secret", 60)
    with pytest.raises(ValueError):
        security.decode_access_token(token, "other-secret")


def test_token_rejects_tampering():
    token = security.create_access_token("a@b.c", "operator", 1, "secret", 60)
    head, payload, sig = token.split(".")
    forged = f"{head}.{payload}.{sig[:-2]}xx"
    with pytest.raises(ValueError):
        security.decode_access_token(forged, "secret")


def test_token_rejects_expired():
    token = security.create_access_token("a@b.c", "admin", 1, "secret", -1)
    with pytest.raises(ValueError, match="expiré"):
        security.decode_access_token(token, "secret")


def test_token_rejects_malformed():
    with pytest.raises(ValueError):
        security.decode_access_token("garbage", "secret")
