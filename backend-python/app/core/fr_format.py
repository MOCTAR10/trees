"""French display formatting for text the server builds for the screens.

Dates read ``14/10/2026``, numbers use a decimal comma and a non-breaking space
between thousands, and internal codes (authorisation, certification types) are
shown with their French label.
"""

from datetime import date, datetime
from typing import Any

AUTHORIZATION_TYPE_LABEL = {
    "certificat_assiette": "Certificat annuel d'assiette de coupe",
    "permis_annuel_operations": "Permis annuel d'opérations",
    "certificat_vente_coupe": "Certificat de vente de coupe",
    "cae": "Cahier des charges (CAE)",
}

CERT_TYPE_LABEL = {
    "gestion_durable": "Gestion durable",
    "legalite_plus": "Légalité plus",
}


TAX_TYPE_LABEL = {
    "superficie": "Taxe de superficie",
    "abattage": "Taxe d'abattage",
    "surveillance": "Redevance de surveillance",
}


def fr_date(value: Any) -> str:
    """``date``/``datetime``/ISO string → ``JJ/MM/AAAA`` (empty when missing)."""
    if value is None or value == "":
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    text = str(value)
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return f"{text[8:10]}/{text[5:7]}/{text[0:4]}"
    return text


def fr_num(value: Any, digits: int = 0) -> str:
    """``3500000.0`` → ``3 500 000`` ; ``95.5`` with ``digits=1`` → ``95,5``."""
    if value is None:
        return ""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if digits == 0 or (number == int(number) and digits <= 1):
        text = f"{round(number):,}"
    else:
        text = f"{number:,.{digits}f}"
    return text.replace(",", " ").replace(".", ",")


def authorization_label(code: str | None) -> str:
    return AUTHORIZATION_TYPE_LABEL.get(code or "", code or "")


def with_authorization_label(text: str | None) -> str:
    """``"permis_annuel_operations · AAC-1"`` → ``"Permis annuel d'opérations · AAC-1"``."""
    text = text or ""
    for code, label in AUTHORIZATION_TYPE_LABEL.items():
        if text.startswith(code):
            return label + text[len(code) :]
    return text
