"""Column model of the exploitation inventory imported from a spreadsheet.

Proposal submitted to the Ministry (Loi 016/01 art. 60-62, 119, 122, 124): only
the critical data — the AAC of the plan d'aménagement, the tree's number, its
species, position and diameter, and whether it is felled. The Ministry may later
give its own model (art. 19): renaming a column, adding an alias or changing the
row limit is done here; the parser and the checks read it.
"""

from __future__ import annotations

from dataclasses import dataclass

MODEL_VERSION = "proposition-2026-10-b"
MAX_ROWS = 5000
MAX_FILE_BYTES = 5 * 1024 * 1024

YES_NO = ("oui", "non")
#: Registry value of each answer to « à abattre ».
DESTINATION_OF = {"oui": "abattre", "non": "preserver"}
#: Trees to preserve (art. 122): never declarable nor fellable. ``avenir`` /
#: ``reserve`` / ``semencier`` come from the first version of the model.
KEPT_DESTINATIONS = frozenset({"preserver", "avenir", "reserve", "semencier"})


@dataclass(frozen=True)
class Column:
    key: str
    required: bool
    kind: str
    example: str
    help: str
    legal: str
    values: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()


COLUMNS: tuple[Column, ...] = (
    Column(
        "reference_aac",
        True,
        "texte",
        "AAC 2026-2",
        "Référence de l'AAC au plan d'aménagement ; elle doit être celle de l'AAC choisie.",
        "Art. 119 (AAC cartographiées au plan d'aménagement)",
        aliases=("aac", "ref_aac", "reference", "ref"),
    ),
    Column(
        "numero_arbre",
        False,
        "texte",
        "412",
        "Numéro de la tige sur le terrain (peint ou plaque), unique dans l'AAC.",
        "Art. 120 et 128 (marque et code d'identification)",
        aliases=("numero", "n_arbre", "numero_peint", "code_arbre"),
    ),
    Column(
        "essence",
        True,
        "texte",
        "Okoumé",
        "Nom commercial ou scientifique.",
        "Art. 31 et 61 ; DME, essences réservées, CITES",
        aliases=("espece", "nom_scientifique", "species"),
    ),
    Column(
        "latitude",
        True,
        "degrés décimaux",
        "-0,6912",
        "WGS84, négatif au sud de l'équateur.",
        "Art. 60 (« localiser précisément ») ; RDUE",
        aliases=("lat", "y"),
    ),
    Column(
        "longitude",
        True,
        "degrés décimaux",
        "13,2145",
        "WGS84.",
        "Art. 60 ; RDUE",
        aliases=("lon", "long", "x"),
    ),
    Column(
        "diametre_cm",
        True,
        "nombre",
        "87",
        "Diamètre à 1,30 m (au-dessus des contreforts), en cm.",
        "Art. 124 (Diamètre Minimum d'Exploitabilité de l'UFA)",
        aliases=("diametre", "dhp_cm", "dhp", "dbh_cm"),
    ),
    Column(
        "a_abattre",
        True,
        "oui / non",
        "oui",
        "« non » : arbre à préserver, il ne pourra jamais être déclaré à l'abattage.",
        "Art. 122 (arbres à exploiter et à préserver)",
        values=YES_NO,
        aliases=("abattre", "abattage", "a_exploiter"),
    ),
    Column(
        "observations",
        False,
        "texte",
        "semencier",
        "Remarque libre (500 caractères au plus).",
        "—",
        aliases=("remarques", "commentaire"),
    ),
)

#: Readable labels of the row and file codes (shown in the preview).
ISSUE_LABELS = {
    "required": "Valeur obligatoire manquante",
    "invalid_number": "Nombre invalide",
    "invalid_value": "Réponse attendue : oui ou non",
    "too_long": "Texte trop long",
    "aac_mismatch": "Référence d'AAC différente de l'AAC choisie",
    "missing_position": "Position GPS manquante",
    "invalid_position": "Position hors limites (latitude −90…90, longitude −180…180)",
    "duplicate_number": "Numéro d'arbre en doublon dans l'AAC",
    "outside_aac": "Arbre hors de l'AAC",
    "below_dme": "Sous le DME de l'UFA (art. 124)",
    "reserved_species": "Essence mise en réserve : à inscrire « non » (art. 124)",
    "unknown_species": "Essence non reconnue",
    "cites_listed": "Essence CITES",
    "in_protected_area": "Dans une aire protégée",
    "outside_concession": "Hors concession attribuée",
    "ignored_column": "Colonne non reconnue, ignorée",
    "aac_without_geometry": "AAC sans contour : position non vérifiée",
    "aac_open": "AAC déjà autorisée : l'inventaire doit précéder le PAO (art. 62)",
}

HELP_TEXT = (
    "Une ligne par tige de l'AAC (art. 60), arbres à abattre et arbres à préserver "
    "(art. 122). Sept colonnes : la référence de l'AAC au plan d'aménagement, le numéro "
    "de l'arbre, l'essence, la latitude, la longitude, le diamètre et « à abattre » "
    "(oui ou non). Le fichier est vérifié ligne par ligne ; l'import n'est confirmé que "
    "lorsque toutes les lignes sont conformes (les avertissements n'empêchent pas l'import)."
)


def by_key() -> dict[str, Column]:
    return {c.key: c for c in COLUMNS}


def describe() -> dict:
    """The model as served to the app (import guide) and printed in the template."""
    return {
        "version": MODEL_VERSION,
        "max_rows": MAX_ROWS,
        "max_file_mb": MAX_FILE_BYTES // (1024 * 1024),
        "help": HELP_TEXT,
        "columns": [
            {
                "key": c.key,
                "required": c.required,
                "kind": c.kind,
                "example": c.example,
                "help": c.help,
                "legal": c.legal,
                "values": list(c.values),
            }
            for c in COLUMNS
        ],
    }
