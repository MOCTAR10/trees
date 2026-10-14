"""Small factories for the regression tests: each test makes its own fresh data."""

from tools import seed_pilot


def line(world, species: str, dbh: float, aac: str = "hob1", i: int = 0, **over) -> dict:
    lon, lat = seed_pilot._point(world, aac, i)
    return {
        "tree_code": world.code(),
        "marking_type": "qr",
        "species_scientific_name": species,
        "measured_dbh_cm": dbh,
        "latitude": lat,
        "longitude": lon,
        **over,
    }


def declare(
    world,
    lines: list[dict],
    actor: str = "hob.dg",
    aac: str = "hob1",
    title: str = "hob",
    expect=200,
    note: str = "",
):
    return world.p.post(
        actor,
        "/api/felling/declarations",
        {
            "permit_type": "foret_communautaire" if title == "mas" else "CFAD",
            "permit_number": world.ref(f"REG-{title}"),
            "aac_id": world.aac[aac],
            "title_id": world.title[title],
            "campaign_year": 2026,
            "lines": lines,
        },
        expect=expect,
        note=note,
    )


def authorised_trees(
    world, n: int = 1, species: str = "Aucoumea klaineana", dbh: float = 95
) -> list[str]:
    """Declare and approve ``n`` compliant stems on the open HOB AAC."""
    lines = [line(world, species, dbh, i=k) for k in range(n)]
    out = declare(world, lines)
    world.p.post(
        "admin",
        f"/api/admin/inbox/declarations/{out['id']}/decision",
        {"approve": True},
        expect=200,
    )
    return [ln["tree_code"] for ln in lines]


def felled_trees(world, n: int = 1, agent: str = "hob.agent1") -> list[str]:
    codes = authorised_trees(world, n)
    for k, code in enumerate(codes):
        lon, lat = seed_pilot._point(world, "hob1", k)
        world.p.post(
            agent,
            "/api/felling/events",
            {"tree_code": code, "event": "abattu", "latitude": lat, "longitude": lon},
            expect=200,
        )
    return codes


def slip(
    world, codes: list[str], destination: str | None = "sdl", actor: str = "hob.dg", expect=201
):
    body = {"doc_type": "bordereau_roulage", "tree_codes": codes}
    if destination:
        body["destination_org_id"] = world.org[destination]
    return world.p.post(actor, "/api/transport/documents", body, expect=expect)


def detail(response) -> str:
    """Error detail of a refused call, whatever its shape."""
    d = response.get("detail") if isinstance(response, dict) else response
    return str(d)
