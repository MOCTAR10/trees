"""Authority compass for the pilot phase.

During the pilot the **Ministère des Eaux et Forêts** is the single acting
administration (role ``admin``): every decision is taken in its interface. Each
action still names the authority that is competent under the law (DGF, DGFAP,
DGE…), so the Ministry sees who will take it over once that stakeholder gets its
own interface. Attributions are indicative — *à valider par le métier*.
"""

ACTING = "Ministère des Eaux et Forêts"

#: code -> name, mission and the actions the Ministry performs on its behalf today.
AUTHORITIES: dict[str, dict] = {
    "DGF": {
        "name": "Direction Générale des Forêts",
        "mission": "Titres forestiers, aménagement, exploitation, contrôle forestier.",
        "actions": [
            "Instruire et décider les demandes de titre",
            "Statuer sur les diligences RDUE",
            "Vérifier les certifications",
            "Contrôles en route et suites des contrôles",
        ],
        "queues": ["titles", "eudr", "certifications"],
        "controls": ["route"],
    },
    "DP": {
        "name": "Directions Provinciales des Eaux et Forêts",
        "mission": "Instruction locale : AAC, PAO, autorisations d'exploiter, déclarations,"
        " marquage et carnet DF10.",
        "actions": [
            "Approuver les déclarations d'abattage",
            "Approuver les PAO et délivrer les autorisations d'exploiter (art. 14)",
            "Contrôle du marquage et visa du carnet DF10",
        ],
        "queues": ["declarations", "pao", "authorizations"],
        "controls": ["marquage", "visa_df10"],
    },
    "DGFAP": {
        "name": "Direction Générale de la Faune et des Aires Protégées",
        "mission": "Plans de protection de la faune (PPF), espèces protégées.",
        "actions": ["Valider les PPF et délivrer le certificat de conformité"],
        "queues": ["studies"],
        "controls": [],
    },
    "DGE": {
        "name": "Direction Générale de l'Environnement",
        "mission": "Études d'impact environnemental (EIE, Loi 007/2014).",
        "actions": ["Valider les EIE et délivrer le certificat de conformité"],
        "queues": ["studies"],
        "controls": [],
    },
    "ANPN": {
        "name": "Agence Nationale des Parcs Nationaux",
        "mission": "Parcs nationaux et leurs zones tampons.",
        "actions": ["Avis sur les abattages signalés en aire protégée"],
        "queues": [],
        "controls": [],
    },
    "DGICBVPF": {
        "name": "Direction Générale des Industries, du Commerce du Bois"
        " et de la Valorisation des Produits Forestiers",
        "mission": "Agrément professionnel, transformation, commerce du bois.",
        "actions": ["Vérifier l'agrément professionnel", "Contrôle de transformation"],
        "queues": [],
        "controls": ["transformation"],
    },
    "DGI": {
        "name": "Direction Générale des Impôts",
        "mission": "Fiscalité forestière (télédéclaration à brancher).",
        "actions": ["Suivi des quittances et des échéances fiscales"],
        "queues": [],
        "controls": [],
    },
    "DOUANES": {
        "name": "Direction Générale des Douanes",
        "mission": "Spécifications d'export, permis CITES aux frontières.",
        "actions": ["Contrôle des spécifications et des exportations"],
        "queues": [],
        "controls": [],
    },
}

_ALIASES: list[tuple[str, str]] = [
    ("DGICBVPF", "DGICBVPF"),
    ("DGFAP", "DGFAP"),
    ("ANPN", "ANPN"),
    ("DOUANE", "DOUANES"),
    ("DGI", "DGI"),
    ("DGE", "DGE"),
    ("DGF", "DGF"),
    ("PROVINCIAL", "DP"),
    ("INSPECTION", "DP"),
    ("CANTONNEMENT", "DP"),
    ("DIRECTION DES FORÊTS", "DGF"),
    ("FORESTIÈRE", "DGF"),
]


def codes_from(raw: str | None) -> list[str]:
    """Authority codes named in a free-text authority (``"DGFAP / DGE"`` → both)."""
    if not raw:
        return []
    text = raw.upper()
    found: list[str] = []
    for token, code in _ALIASES:
        if token in text and code not in found:
            if code == "DGI" and "DGICBVPF" in text and text.count("DGI") == 1:
                continue
            if code == "DGF" and "DGFAP" in text and text.count("DGF") == 1:
                continue
            found.append(code)
    return found


def competence(raw: str | None) -> dict:
    """What the Ministry does today and who is competent tomorrow."""
    codes = codes_from(raw)
    names = [AUTHORITIES[c]["name"] for c in codes]
    who = " / ".join(codes) if codes else (raw or "l'administration compétente")
    return {
        "acting_authority": ACTING,
        "competent_codes": codes,
        "competent_names": names,
        "competence_note": f"Action réalisée par le {ACTING} pour le compte de : {who}."
        " Interface dédiée prévue après la phase pilote.",
    }


def compass(pending: dict[str, int]) -> list[dict]:
    """Every stakeholder with what the Ministry handles for it and what is pending."""
    out = []
    for code, a in AUTHORITIES.items():
        out.append(
            {
                "code": code,
                "name": a["name"],
                "mission": a["mission"],
                "actions": a["actions"],
                "controls": a["controls"],
                "pending": sum(pending.get(q, 0) for q in a["queues"]),
                "interface": "a_venir",
                "acting_authority": ACTING,
            }
        )
    return out
