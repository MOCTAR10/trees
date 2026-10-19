"""Column model of the exploitation inventory imported from a spreadsheet.

Proposal submitted to the Ministry (Loi 016/01 art. 60-62, 122, 124): the
Ministry may later give its own model (art. 19 — national technical standards).
The model is data only: renaming a column, adding an alias, changing a list of
values or the row limit is done here, the parser and the checks read it.
"""

from __future__ import annotations

from dataclasses import dataclass

MODEL_VERSION = "proposition-2026-10"
MAX_ROWS = 5000
MAX_FILE_BYTES = 5 * 1024 * 1024

DESTINATIONS = ("abattre", "avenir", "reserve", "semencier")
#: Trees to preserve (art. 122): never declarable nor fellable.
KEPT_DESTINATIONS = frozenset({"avenir", "reserve", "semencier"})
MARKINGS = ("qr", "peinture", "gps_photo")
QUALITIES = ("1", "2", "3")
UNUSABLE_QUALITY = "3"


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
        "code_arbre",
        False,
        "texte",
        "GA-HOB-2026-00412",
        "Code d'identification de la tige. Laissé vide, il est attribué à l'import.",
        "Art. 128 (code d'identification de l'arbre)",
        aliases=("code", "n_arbre", "numero_arbre", "tree_code"),
    ),
    Column(
        "essence",
        True,
        "texte",
        "Aucoumea klaineana",
        "Nom scientifique ou nom commercial (Okoumé, Padouk…).",
        "Art. 31 et 61 (essences principales et secondaires) ; DME, réserve, CITES",
        aliases=("espece", "nom_scientifique", "species"),
    ),
    Column(
        "dhp_cm",
        True,
        "nombre",
        "87,5",
        "Diamètre en cm à 1,30 m, ou au-dessus des contreforts. Virgule ou point.",
        "Art. 124 (Diamètre Minimum d'Exploitabilité de l'UFA)",
        aliases=("dhp", "diametre", "diametre_cm", "dbh_cm"),
    ),
    Column(
        "hauteur_fut_m",
        False,
        "nombre",
        "18,5",
        "Hauteur du fût en mètres (estimation du volume).",
        "Pratique d'inventaire (préparation du PAO)",
        aliases=("hauteur_fut", "hauteur", "hauteur_m"),
    ),
    Column(
        "latitude",
        True,
        "degrés décimaux",
        "-0,6912",
        "WGS84, degrés décimaux (négatif au sud de l'équateur).",
        "Art. 60 (« localiser précisément ») ; RDUE (géolocalisation)",
        aliases=("lat", "y"),
    ),
    Column(
        "longitude",
        True,
        "degrés décimaux",
        "13,2145",
        "WGS84, degrés décimaux.",
        "Art. 60 (« localiser précisément ») ; RDUE (géolocalisation)",
        aliases=("lon", "long", "x"),
    ),
    Column(
        "destination",
        True,
        "liste",
        "abattre",
        "abattre, avenir (tige d'avenir), reserve (tige en réserve) ou semencier.",
        "Art. 60 et 122 (arbres à exploiter et à préserver) ; semencier : pratique",
        values=DESTINATIONS,
        aliases=("statut", "categorie"),
    ),
    Column(
        "marquage",
        False,
        "liste",
        "qr",
        "qr (plaque, par défaut), peinture ou gps_photo.",
        "Art. 120 et 122 (marquage des arbres)",
        values=MARKINGS,
        aliases=("marking", "type_marquage"),
    ),
    Column(
        "numero_peint",
        False,
        "texte",
        "412",
        "Numéro peint sur la tige. Obligatoire si le marquage est « peinture ».",
        "Art. 120 (marques toujours visibles)",
        aliases=("n_peint", "numero_peinture", "no_peint"),
    ),
    Column(
        "layon",
        False,
        "texte",
        "L12",
        "Layon de comptage.",
        "Art. 120 (layons de l'AAC)",
    ),
    Column(
        "placette",
        False,
        "texte",
        "P12-04",
        "Placette ou bloc de comptage.",
        "Art. 60 (relevé cartographique détaillé)",
        aliases=("parcelle", "bloc"),
    ),
    Column(
        "qualite",
        False,
        "liste",
        "1",
        "1 bonne, 2 moyenne, 3 inutilisable.",
        "Art. 61 (seules les tiges de qualité utilisable sont comptabilisées)",
        values=QUALITIES,
        aliases=("qualite_fut",),
    ),
    Column(
        "date_releve",
        False,
        "date JJ/MM/AAAA",
        "14/02/2026",
        "Date du relevé de terrain.",
        "Art. 62 (achevé trois mois avant l'ouverture de l'AAC)",
        aliases=("date",),
    ),
    Column(
        "observations",
        False,
        "texte",
        "Contreforts 1,2 m",
        "Remarque libre (500 caractères au plus).",
        "—",
        aliases=("remarques", "commentaire"),
    ),
)

#: Readable labels of the row and file codes (shown in the preview).
ISSUE_LABELS = {
    "missing_column": "Colonne obligatoire absente",
    "required": "Valeur obligatoire manquante",
    "invalid_number": "Nombre invalide",
    "invalid_value": "Valeur hors liste",
    "invalid_date": "Date invalide (JJ/MM/AAAA)",
    "future_date": "Date de relevé dans le futur",
    "invalid_code": "Code arbre invalide",
    "reserved_code": "Code réservé aux codes attribués",
    "too_long": "Texte trop long",
    "missing_position": "Position GPS manquante",
    "invalid_position": "Position hors limites (latitude −90…90, longitude −180…180)",
    "painted_number_required": "Numéro peint obligatoire pour le marquage peinture",
    "duplicate_code": "Code arbre en doublon",
    "duplicate_painted_number": "Numéro peint en doublon dans l'AAC",
    "outside_aac": "Arbre hors de l'AAC",
    "below_dme": "Sous le DME de l'UFA (art. 124)",
    "reserved_species": "Essence mise en réserve : à inscrire « reserve » (art. 124)",
    "unknown_species": "Essence non reconnue",
    "cites_listed": "Essence CITES",
    "in_protected_area": "Dans une aire protégée",
    "outside_concession": "Hors concession attribuée",
    "unusable_quality": "Qualité inutilisable (art. 61)",
    "ignored_column": "Colonne non reconnue, ignorée",
    "aac_without_geometry": "AAC sans contour : position non vérifiée",
    "aac_open": "AAC déjà ouverte : l'inventaire doit précéder le PAO (art. 62)",
}

HELP_TEXT = (
    "Une ligne par tige, sur toute la superficie de l'AAC (art. 60). Les arbres à "
    "préserver (avenir, réserve, semenciers) sont inventoriés et marqués comme les "
    "arbres à abattre (art. 122) : ils entrent au registre et ne pourront jamais être "
    "déclarés à l'abattage. Les nombres acceptent la virgule. Le fichier est vérifié "
    "ligne par ligne avant toute inscription ; l'import n'est confirmé que lorsque toutes "
    "les lignes sont conformes (les avertissements n'empêchent pas l'import)."
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
