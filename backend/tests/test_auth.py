import pytest
import time

import jwt

from app.core.config import settings
from tests.conftest import PASSWORD, register, set_subscription


def test_register_then_me(client):
    headers = register(client)
    res = client.get("/auth/me", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "ana@molko.dev"
    assert body["subscription"]["is_active"] is False
    assert body["youtube"] == {"enabled": True, "used": 0, "limit": 20}


def test_emails_are_case_insensitive(client):
    register(client, "Foo@Molko.dev")
    login = client.post("/auth/login", json={"email": "foo@MOLKO.dev", "password": PASSWORD})
    assert login.status_code == 200

    dup = client.post("/auth/register", json={"email": "FOO@molko.dev", "password": PASSWORD, "accept_terms": True})
    assert dup.status_code == 409


def test_login_errors_do_not_reveal_which_part_was_wrong(client):
    register(client)
    wrong_password = client.post("/auth/login", json={"email": "ana@molko.dev", "password": "nope-nope-nope"})
    unknown_email = client.post("/auth/login", json={"email": "nadie@molko.dev", "password": "nope-nope-nope"})
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert wrong_password.json()["detail"]["code"] == "invalid_credentials"


def test_password_rules(client):
    short = client.post("/auth/register", json={"email": "a@molko.dev", "password": "1234567", "accept_terms": True})
    too_long = client.post("/auth/register", json={"email": "b@molko.dev", "password": "x" * 73, "accept_terms": True})
    assert short.status_code == 422
    assert too_long.status_code == 422


def test_me_rejects_missing_forged_and_malformed_tokens(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer basura"}).status_code == 401

    forged = jwt.encode({"sub": "1", "exp": time.time() + 600}, "otra-llave-de-32-caracteres-o-mas-xx", algorithm="HS256")
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401

    non_numeric = jwt.encode({"sub": "abc", "exp": time.time() + 600}, settings.jwt_secret, algorithm="HS256")
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {non_numeric}"}).status_code == 401


def test_signup_cap_closes_registration_and_waitlist_takes_over(client, monkeypatch):
    monkeypatch.setattr(settings, "max_users", 1)
    assert client.get("/auth/config").json()["signups_open"] is True
    register(client, "primero@molko.dev")

    assert client.get("/auth/config").json()["signups_open"] is False
    blocked = client.post("/auth/register", json={"email": "segundo@molko.dev", "password": PASSWORD, "accept_terms": True})
    assert blocked.status_code == 403

    for _ in range(2):
        joined = client.post("/waitlist", json={"email": "Segundo@Molko.dev"})
        assert joined.status_code == 202
        assert joined.json() == {"joined": True}

    from app.db.base import SessionLocal
    from app.models.waitlist import WaitlistEntry

    db = SessionLocal()
    try:
        assert [e.email for e in db.query(WaitlistEntry).all()] == ["segundo@molko.dev"]
    finally:
        db.close()


def test_existing_user_can_still_log_in_when_cap_is_full(client, monkeypatch):
    monkeypatch.setattr(settings, "max_users", 1)
    register(client)
    res = client.post("/auth/login", json={"email": "ana@molko.dev", "password": PASSWORD})
    assert res.status_code == 200


def test_login_is_rate_limited(client):
    register(client)
    statuses = [
        client.post("/auth/login", json={"email": "ana@molko.dev", "password": "mala-mala-mala"}).status_code
        for _ in range(11)
    ]
    assert statuses[:9] == [401] * 9
    assert statuses[-1] == 429


def test_subscription_states(client):
    headers = register(client)
    for status, expected in [("active", True), ("trialing", True), ("past_due", False), ("canceled", False)]:
        set_subscription("ana@molko.dev", status)
        assert client.get("/auth/me", headers=headers).json()["subscription"]["is_active"] is expected


def test_registration_requires_accepting_the_terms(client):
    without = client.post("/auth/register", json={"email": "sin@molko.dev", "password": PASSWORD})
    explicit_no = client.post(
        "/auth/register", json={"email": "sin@molko.dev", "password": PASSWORD, "accept_terms": False}
    )
    for res in (without, explicit_no):
        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "terms_not_accepted"
    assert client.post("/auth/login", json={"email": "sin@molko.dev", "password": PASSWORD}).status_code == 401


def test_registration_records_name_and_terms_consent(client):
    res = client.post(
        "/auth/register",
        json={"email": "nombre@molko.dev", "password": PASSWORD, "accept_terms": True, "name": "  Ana   María \n"},
    )
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    me = client.get("/auth/me", headers=headers).json()
    assert me["name"] == "Ana María"
    assert me["terms_accepted"] is True

    from app.db.base import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "nombre@molko.dev").one()
        assert user.terms_version == settings.terms_version
        assert user.terms_accepted_at is not None
    finally:
        db.close()


def test_name_is_optional(client):
    headers = register(client)
    assert client.get("/auth/me", headers=headers).json()["name"] is None


@pytest.mark.parametrize("name", ["José", "O'Brien-Smith Jr.", "李雷", "Ana 2"])
def test_valid_names_are_accepted(client, name):
    headers = register(client)
    res = client.patch("/auth/me", json={"name": name}, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == name


@pytest.mark.parametrize(
    "name",
    ["<script>alert(1)</script>", "Ana​Bot", "Ana‮evil", "Ana\x00", "x" * 61, "a<b"],
)
def test_names_with_markup_invisible_or_control_characters_are_rejected(client, name):
    headers = register(client)
    assert client.patch("/auth/me", json={"name": name}, headers=headers).status_code == 422
    assert client.get("/auth/me", headers=headers).json()["name"] is None


def test_profile_name_can_be_changed_and_cleared(client):
    headers = register(client)
    assert client.patch("/auth/me", json={"name": "Luis"}, headers=headers).json()["name"] == "Luis"
    assert client.patch("/auth/me", json={"name": "   "}, headers=headers).json()["name"] is None
    assert client.patch("/auth/me", json={"name": None}, headers=headers).json()["name"] is None


def test_profile_update_requires_login_and_ignores_other_fields(client):
    assert client.patch("/auth/me", json={"name": "X"}).status_code == 401
    headers = register(client)
    client.patch("/auth/me", json={"name": "Ana", "email": "otro@molko.dev", "token_version": 99}, headers=headers)
    me = client.get("/auth/me", headers=headers).json()
    assert me["email"] == "ana@molko.dev"


def test_accounts_on_an_older_terms_version_must_accept_again(client, monkeypatch):
    headers = register(client)
    assert client.get("/auth/me", headers=headers).json()["terms_accepted"] is True

    monkeypatch.setattr(settings, "terms_version", "2099-01-01")
    assert client.get("/auth/me", headers=headers).json()["terms_accepted"] is False

    accepted = client.post("/auth/accept-terms", headers=headers)
    assert accepted.status_code == 200
    assert accepted.json()["terms_accepted"] is True
    assert client.post("/auth/accept-terms").status_code == 401


def test_cors_preflight_allows_patch(client):
    res = client.options(
        "/auth/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert res.status_code == 200
    assert "PATCH" in res.headers["access-control-allow-methods"]


def test_terms_version_matches_the_frontend_constant():
    # Si cambia el texto legal hay que subir la versión en los dos lados; esta prueba avisa
    # cuando solo se cambió uno (los usuarios no tendrían que re-aceptar, o la fecha mentiría).
    import re
    from pathlib import Path

    from app.core.config import Settings

    source = Path(__file__).resolve().parents[2] / "frontend/src/legal/terms.ts"
    match = re.search(r'TERMS_VERSION = "([^"]+)"', source.read_text())
    assert match, "no se encontró TERMS_VERSION en frontend/src/legal/terms.ts"
    assert match.group(1) == Settings.model_fields["terms_version"].default


def test_signup_cap_counts_every_account_however_old(client, monkeypatch):
    from datetime import timedelta

    from app.db.base import SessionLocal, utcnow
    from app.models.user import User

    monkeypatch.setattr(settings, "max_users", 1)
    register(client, "vieja@molko.dev", confirmed=False)
    db = SessionLocal()
    db.query(User).one().created_at = utcnow() - timedelta(days=30)
    db.commit()
    db.close()
    assert client.get("/auth/config").json()["signups_open"] is False


def test_a_google_state_token_is_not_a_session(client):
    import time as _time

    now = int(_time.time())
    state = jwt.encode(
        {"sub": "1", "tv": 0, "aud": "molko:google-state", "iat": now, "exp": now + 600},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    register(client)
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {state}"}).status_code == 401
