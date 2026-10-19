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


def received_logs(world, n: int = 1) -> list[str]:
    """Felled HOB logs carried to the sawmill and received there (custody: SDL)."""
    codes = felled_trees(world, n)
    doc = slip(world, codes)
    world.p.patch("hob.dg", f"/api/transport/documents/{doc['id']}", {"status": "emis"})
    world.p.patch("sdl.dg", f"/api/transport/documents/{doc['id']}", {"status": "receptionne"})
    return codes


def non_compliant_control(world, org: str = "hob") -> int:
    """A non-compliant marking control on a fresh HOB log."""
    code = felled_trees(world)[0]
    out = world.p.post(
        "mef.dp2",
        "/api/controls",
        {
            "control_type": "marquage",
            "result": "non_conforme",
            "tree_code": code,
            "notes": "Marque du marteau absente",
            "pv_reference": world.ref(f"PV-{world.code()}"),
        },
        expect=201,
    )
    return out["id"]


def detail(response) -> str:
    """Error detail of a refused call, whatever its shape."""
    d = response.get("detail") if isinstance(response, dict) else response
    return str(d)


INVENTORY_HEAD = (
    "reference_aac",
    "numero_arbre",
    "essence",
    "latitude",
    "longitude",
    "diametre_cm",
    "a_abattre",
)
#: Reference of each pilot AAC in its plan d'aménagement (label without the namespace).
AAC_REF = {"hob1": "AAC 2026-1", "hob2": "AAC 2026-2", "hob0": "AAC 2025-1"}


def inventory_rows(world, specs: list[tuple], aac: str = "hob2", start: int = 0) -> list[dict]:
    """Rows of an inventory file: (species, diameter, « à abattre » oui/non) inside the AAC."""
    rows = []
    for i, (species, dbh, answer) in enumerate(specs):
        lon, lat = seed_pilot._point(world, aac, start + i)
        rows.append(
            {
                "reference_aac": AAC_REF[aac],
                "numero_arbre": world.code(),
                "essence": species,
                "latitude": str(lat).replace(".", ","),
                "longitude": str(lon).replace(".", ","),
                "diametre_cm": str(dbh).replace(".", ","),
                "a_abattre": answer,
            }
        )
    return rows


def inventory_csv(rows: list[dict], head: tuple[str, ...] = INVENTORY_HEAD) -> bytes:
    lines = [";".join(head)] + [";".join(str(r.get(k, "")) for k in head) for r in rows]
    return ("\n".join(lines) + "\n").encode("utf-8")


def inventory_upload(
    world,
    rows: list[dict],
    step: str = "preview",
    aac: str = "hob2",
    actor: str = "hob.dg",
    expect=200,
):
    return world.p.call(
        actor,
        "POST",
        f"/api/inventory/aacs/{world.aac[aac]}/{step}",
        files={"file": ("inventaire.csv", inventory_csv(rows), "text/csv")},
        expect=expect,
    )


def issue_codes(preview: dict) -> list[list[str]]:
    return [[i["code"] for i in r["issues"]] for r in preview["rows"]]


def imported(world, number: str, actor: str = "hob.dg") -> dict | None:
    """Registry row of an imported stem, found by its tree number."""
    rows = world.p.get(actor, "/api/felling/trees?status=inventorie")
    return next((t for t in rows if t.get("painted_number") == number), None)
