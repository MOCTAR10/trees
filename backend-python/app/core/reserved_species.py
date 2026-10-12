"""Species reserved for reasons of general interest (Loi 016/01).

Article 124 opens the felling right to commercial timber species *except* the
wood species "mises en réserve pour raison d'intérêt général"; Articles 32 and
67 confirm that reserved species are excluded from the possibility and that the
administration may place any plant species in reserve. In Gabon practice the
25-year reserve of 2009 (Afo, Andok, Douka/Makoré, Moabi) and the Kévazingo
harvest ban operationalise this. Like the DME matrix, this list is carried
provisionally — pending the consolidated arrêtés — and is deliberately
data-driven so it can be swapped without touching the gate.
"""

from dataclasses import dataclass

from app.core.species_data import resolve_species


@dataclass(frozen=True)
class ReservedSpecies:
    scientific_name: str
    common_name_fr: str
    # Official basis / provenance for the reserve.
    basis: str
    # Free-text spellings (local trade names) that must resolve to this entry.
    aliases: tuple[str, ...] = ()


RESERVED_SPECIES: tuple[ReservedSpecies, ...] = (
    ReservedSpecies(
        scientific_name="Baillonella toxisperma",
        common_name_fr="Moabi",
        basis="Décret de 2009 — mise en réserve 25 ans (Loi 016/01 art. 124)",
        aliases=("moabi", "djita", "adjap", "african pearwood"),
    ),
    ReservedSpecies(
        scientific_name="Tieghemella heckelii",
        common_name_fr="Makoré",
        basis="Décret de 2009 — mise en réserve 25 ans (Loi 016/01 art. 124)",
        aliases=("makore", "makoré", "douka", "african cherry"),
    ),
    ReservedSpecies(
        scientific_name="Tieghemella africana",
        common_name_fr="Douka",
        basis="Décret de 2009 — mise en réserve 25 ans (Loi 016/01 art. 124)",
        aliases=("douka", "makore", "makoré"),
    ),
    ReservedSpecies(
        scientific_name="Petersianthus macrocarpus",
        common_name_fr="Afo",
        basis="Décret de 2009 — mise en réserve 25 ans (Loi 016/01 art. 124)",
        aliases=("afo", "essia", "essia abe", "combretodendron africanum"),
    ),
    ReservedSpecies(
        scientific_name="Irvingia gabonensis",
        common_name_fr="Andok",
        basis="Décret de 2009 — mise en réserve 25 ans (Loi 016/01 art. 124)",
        aliases=("andok", "andog", "mangue sauvage", "wild mango"),
    ),
    ReservedSpecies(
        scientific_name="Guibourtia demeusei",
        common_name_fr="Kévazingo",
        basis="Interdiction d'exploitation Kévazingo (Loi 016/01 art. 124 ; CITES II)",
        aliases=("kevazingo", "kévazingo", "bubinga", "akume", "essak"),
    ),
    ReservedSpecies(
        scientific_name="Guibourtia tessmannii",
        common_name_fr="Kévazingo",
        basis="Interdiction d'exploitation Kévazingo (Loi 016/01 art. 124 ; CITES II)",
        aliases=("kevazingo", "kévazingo", "bubinga", "gabon rosewood"),
    ),
    ReservedSpecies(
        scientific_name="Guibourtia pellegriniana",
        common_name_fr="Kévazingo",
        basis="Interdiction d'exploitation Kévazingo (Loi 016/01 art. 124 ; CITES II)",
        aliases=("kevazingo", "kévazingo", "bubinga"),
    ),
)

_BY_SCIENTIFIC = {entry.scientific_name.lower(): entry for entry in RESERVED_SPECIES}
_BY_ALIAS = {alias: entry for entry in RESERVED_SPECIES for alias in entry.aliases}


def reserved_species_for(name: str | None) -> ReservedSpecies | None:
    """Resolve a free-text species name to its reserve entry, else ``None``.

    Tries the canonical scientific name, then the shared species registry
    (which normalises aliases and vernacular names), then the reserved
    common/trade names directly.
    """
    if not name:
        return None
    key = name.strip().lower()
    if not key:
        return None

    entry = _BY_SCIENTIFIC.get(key)
    if entry is not None:
        return entry

    profile = resolve_species(name)
    if profile is not None:
        entry = _BY_SCIENTIFIC.get(profile.scientific_name.lower())
        if entry is not None:
            return entry

    return _BY_ALIAS.get(key)


def is_reserved_species(name: str | None) -> bool:
    """True when the species may not be felled (intérêt général reserve)."""
    return reserved_species_for(name) is not None
