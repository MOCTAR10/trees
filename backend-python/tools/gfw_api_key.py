"""Crée une clé API Global Forest Watch et l'écrit dans le ``.env`` du dépôt.

Le mot de passe est saisi de façon masquée et n'est jamais affiché ni stocké ;
seule la clé obtenue est écrite (``GFW_API_KEY=...``) dans ``<dépôt>/.env``.
À lancer **dans votre propre terminal** (pas dans une conversation) ::

    cd backend-python
    .venv\\Scripts\\python.exe -m tools.gfw_api_key --email vous@exemple.org --organization MEF --alias trees

Puis rechargez l'API : ``docker compose up -d api``.
"""

from __future__ import annotations

import argparse
import getpass
import re
import sys
from pathlib import Path

import httpx

API = "https://data-api.globalforestwatch.org"
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def _token(email: str, password: str) -> str:
    resp = httpx.post(
        f"{API}/auth/token",
        data={"username": email, "password": password},
        timeout=30,
    )
    if resp.status_code != 200:
        raise SystemExit(
            f"Connexion GFW refusée (HTTP {resp.status_code}) : vérifiez vos identifiants."
        )
    body = resp.json()
    data = body.get("data", body)
    token = data.get("access_token") if isinstance(data, dict) else None
    if not token:
        raise SystemExit("Réponse GFW inattendue : aucun jeton reçu.")
    return token


def _create_key(token: str, email: str, organization: str, alias: str) -> str:
    resp = httpx.post(
        f"{API}/auth/apikey",
        json={"alias": alias, "email": email, "organization": organization, "domains": []},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise SystemExit(
            f"Création de la clé refusée (HTTP {resp.status_code}) : {resp.text[:200]}"
        )
    body = resp.json()
    data = body.get("data", body)
    key = data.get("api_key") if isinstance(data, dict) else None
    if not key:
        raise SystemExit("Réponse GFW inattendue : aucune clé reçue.")
    return key


def write_env(key: str, env_file: Path = ENV_FILE) -> None:
    """Set ``GFW_API_KEY`` in the .env, replacing any previous value."""
    text = env_file.read_text(encoding="utf-8") if env_file.exists() else ""
    line = f"GFW_API_KEY={key}"
    if re.search(r"(?m)^GFW_API_KEY=.*$", text):
        text = re.sub(r"(?m)^GFW_API_KEY=.*$", line, text)
    else:
        text = text.rstrip("\n") + f"\n\n# Global Forest Watch Data API\n{line}\n"
    env_file.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--organization", required=True)
    parser.add_argument("--alias", default="trees")
    args = parser.parse_args()
    password = getpass.getpass("Mot de passe GFW (saisie masquée) : ")
    key = _create_key(_token(args.email, password), args.email, args.organization, args.alias)
    write_env(key)
    print(f"Clé GFW créée (valable 1 an) et écrite dans {ENV_FILE}.")
    print("Rechargez l'API : docker compose up -d api")
    sys.exit(0)


if __name__ == "__main__":
    main()
