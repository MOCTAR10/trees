import pytest

from app.services import db, gbif, species_memory, species_rank


class FakeDb:
    def __init__(self):
        self.cache = {}
        self.learned = {}

    async def fetch_one(self, sql, *args):
        if "species_occurrence_cache" in sql:
            key = (args[0], args[1], args[2])
            return {"occurrences": self.cache[key]} if key in self.cache else None
        return None

    async def execute(self, sql, *args):
        if "INTO species_occurrence_cache" in sql:
            self.cache[(args[0], args[1], args[2])] = args[3]
        elif "INTO species_learned" in sql:
            row = self.learned.setdefault(
                args[0], {"seen_count": 0, "family": args[1], "common_names": set()}
            )
            row["seen_count"] += 1
            row["common_names"] |= set(args[2])

    async def fetch_all(self, sql, *args):
        return [{"scientific_name": k, **v} for k, v in self.learned.items()]


@pytest.fixture
def fake(monkeypatch):
    f = FakeDb()
    monkeypatch.setattr(db, "fetch_one", f.fetch_one)
    monkeypatch.setattr(db, "execute", f.execute)
    monkeypatch.setattr(db, "fetch_all", f.fetch_all)
    return f


def test_cell_groups_nearby_points():
    assert species_memory.cell(0.39, 9.45) == species_memory.cell(0.41, 9.30)
    assert species_memory.cell(0.39, 9.45) != species_memory.cell(0.8, 9.45)


@pytest.mark.asyncio
async def test_gbif_is_asked_once_per_area(fake, monkeypatch):
    calls = []

    async def fake_validate(name, lat, lon):
        calls.append(name)
        return {"occurrences": 12}

    monkeypatch.setattr(gbif, "validate_species_for_location", fake_validate)
    assert await species_rank._local_occurrences("Aucoumea klaineana", 0.39, 9.45) == 12
    assert await species_rank._local_occurrences("Aucoumea klaineana", 0.41, 9.30) == 12
    assert calls == ["Aucoumea klaineana"]


@pytest.mark.asyncio
async def test_learning_counts_and_merges_names(fake):
    await species_memory.learn(
        "Aucoumea klaineana", 0.8, 0.39, 9.45, family="Burseraceae", common_names=["Okoumé"]
    )
    await species_memory.learn("Aucoumea klaineana", 0.7, 0.39, 9.45, common_names=["Gaboon"])
    await species_memory.learn("Weak one", 0.1, 0.39, 9.45)
    assert fake.learned["Aucoumea klaineana"]["seen_count"] == 2
    assert fake.learned["Aucoumea klaineana"]["common_names"] == {"Okoumé", "Gaboon"}
    assert "Weak one" not in fake.learned
