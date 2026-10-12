"""Carnet de chantier (DF10) — conventional abandonment codes.

Loi 016/01 art. 130-133 requires every operator to keep a carnet de chantier
(DF10) on which each marked stem is logged: felled, or abandoned with the
conventional reason. These codes mirror the standard DF10 abbreviations used by
the Gabonese forestry administration; they are validated at the API boundary so
a register can never carry a free-text reason.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AbandonCode:
    code: str
    label: str
    felled: bool = False


DF10_ABANDON_CODES: tuple[AbandonCode, ...] = (
    AbandonCode("abattu", "Abattu"),
    AbandonCode("creux", "Creux / cœur pourri"),
    AbandonCode("penche", "Arbre penché / risque de chute"),
    AbandonCode("malade", "Arbre malade / dépérissant"),
    AbandonCode("non_trouve", "Marquage non retrouvé"),
    AbandonCode("protege", "Essence protégée / réservée"),
    AbandonCode("hors_limite", "Hors limites de l'AAC"),
    AbandonCode("dommage", "Abandon pour éviter un dommage au peuplement"),
    AbandonCode("autre", "Autre motif (préciser en note)"),
)

_BY_CODE = {entry.code: entry for entry in DF10_ABANDON_CODES}


def abandon_code_label(code: str | None) -> str | None:
    if not code:
        return None
    entry = _BY_CODE.get(code)
    return entry.label if entry is not None else code


def is_valid_abandon_code(code: str) -> bool:
    return code in _BY_CODE
