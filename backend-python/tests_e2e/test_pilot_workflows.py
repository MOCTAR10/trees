"""What each role sees once the whole pilot story has run (real PostgreSQL)."""


def _mine(world, rows, key="org_name"):
    tag = f"[{world.ns}]"
    return [r for r in rows if tag in (r.get(key) or "")]


def test_every_step_behaved_and_forbidden_steps_were_refused(world):
    summary = world.p.summary()
    assert all(s.ok for s in world.p.steps)
    assert summary["steps"] >= 150
    assert summary["refused_as_expected"] >= 18


def test_integrated_company_space(world, p):
    space = p.get("hob.dg", "/api/company/space")
    kinds = {t["kind"] for t in space["todo"]}
    assert {"to_ship", "slip_draft", "certification"} <= kinds
    assert "document" not in kinds
    decisions = {(d["kind"], d["outcome"]) for d in space["decisions"]}
    assert {
        ("declarations", "accord"),
        ("declarations", "rejet"),
        ("studies", "accord"),
        ("eudr", "accord"),
        ("certifications", "accord"),
    } <= decisions
    rejected = next(
        d for d in space["decisions"] if d["kind"] == "declarations" and d["outcome"] == "rejet"
    )
    assert "CITES" in rejected["motif"]
    assert rejected["acting_authority"] == "Ministère des Eaux et Forêts"
    assert any(c["result"] == "non_conforme" for c in space["controls"])


def test_sawmill_space_and_custody(world, p):
    space = p.get("sdl.dg", "/api/company/space")
    todo = {t["kind"]: t for t in space["todo"]}
    assert todo["slip_incoming"]["count"] == 1
    assert todo["to_process"]["count"] == 1
    assert any(
        c["control_type"] == "transformation" and c["result"] == "reserve"
        for c in space["controls"]
    )
    log = p.get("sdl.dg", f"/api/felling/trees/{world.trees['d1'][0]}")
    assert log["status"] == "transforme"
    assert [h["event"] for h in log["history"]] == [
        "abattu",
        "transporte",
        "receptionne",
        "transforme",
    ]
    received = p.get("sdl.dg", f"/api/felling/trees/{world.trees['d1'][2]}")
    assert received["is_holder"] and received["next_event"] == "transforme"
    in_transit = p.get("sdl.dg", f"/api/felling/trees/{world.trees['d1'][3]}")
    assert in_transit["can_receive"] and in_transit["status"] == "transporte"


def test_logger_under_provisional_convention(world, p):
    space = p.get("cfn.dg", "/api/company/space")
    kinds = [t["kind"] for t in space["todo"]]
    assert "tax" in kinds and "document" in kinds
    assert any(d["kind"] == "studies" and d["outcome"] == "rejet" for d in space["decisions"])


def test_field_agent_sees_felled_log_and_no_further_action(world, p):
    log = p.get("hob.agent1", f"/api/felling/trees/{world.trees['d1'][6]}")
    assert log["status"] == "abattu" and log["is_holder"]
    assert log["next_event"] is None and log["df10_entry_no"]
    authorised = p.get("hob.agent1", f"/api/felling/trees/{world.trees['d4'][0]}")
    assert authorised["status"] == "declare"


def test_roles_are_isolated(world, p):
    code = world.trees["d1"][6]
    p.call("cfn.dg", "GET", f"/api/felling/trees/{code}", expect=403)
    p.call("can.pres", "GET", "/api/company/space", expect=403)
    p.call("hob.agent1", "GET", "/api/admin/inbox", expect=403)
    p.call("hob.dg", "GET", "/api/admin/authorities", expect=403)


def test_ministry_inbox_shows_pending_files_with_competence(world, p):
    items = _mine(world, p.get("admin", "/api/admin/inbox/items"))
    by_type = {}
    for i in items:
        by_type.setdefault(i["type"], []).append(i)
    for queue in (
        "declarations",
        "documents",
        "authorizations",
        "pao",
        "studies",
        "certifications",
        "eudr",
        "titles",
    ):
        assert queue in by_type, f"file « {queue} » vide pour {world.ns}"
    for queue, rows in by_type.items():
        detail = p.get("admin", f"/api/admin/inbox/{queue}/{rows[0]['id']}")
        assert detail["competence_note"].startswith("Action réalisée par le Ministère")
        assert detail["checks"], queue
    decl = by_type["declarations"][0]
    assert decl["province_name"] in ("Haut-Ogooué", "Nyanga")


def test_authority_compass_counts_pending_files(world, p):
    compass = p.get("admin", "/api/admin/authorities")
    by = {a["code"]: a for a in compass["authorities"]}
    assert by["DGF"]["pending"] >= 2 and by["DP"]["pending"] >= 3
    assert all(a["interface"] == "a_venir" for a in compass["authorities"])


def test_anomaly_register_covers_the_pilot_irregularities(world, p):
    rows = _mine(world, p.get("admin", "/api/anomalies"))
    types = {a["type"] for a in rows}
    assert {"controle_non_conforme", "taxes_impayees", "documents_expires"} <= types
    reviewed = {a["review_status"] for a in rows}
    assert reviewed & {"traitee", "ecartee"}


def test_eudr_stems_are_located_in_the_parcel(world, p):
    dil = p.get("admin", f"/api/eudr/diligence/{world.slip['eudr']}")
    inside = dil.get("inside_parcel_stem_count") or dil.get("diligence", {}).get(
        "inside_parcel_stem_count"
    )
    assert inside and inside >= 7


def test_chantier_progress_counts_the_aac_registry(world, p):
    projects = p.get("hob.agent1", "/api/projects")
    chantier = next(x for x in projects if x["id"] == world.project["chantier"])
    assert chantier["registry_trees"] >= 9
    assert chantier["registry_scanned"] >= 6
    assert chantier["my_status"] == "active"


def test_map_and_dashboard_include_the_pilot_aac(world, p):
    lon, lat = 13.60, -0.78
    layers = p.get(
        "admin", f"/api/map/layers?zoom=12&bbox={lon - 0.05},{lat - 0.05},{lon + 0.1},{lat + 0.1}"
    )
    aac = layers["layers"]["aac"]
    features = aac.get("features", []) if isinstance(aac, dict) else aac
    assert any(world.ns in str(f.get("properties", {})) for f in features)
    dashboard = p.get("admin", "/api/dashboard")
    assert dashboard["harvest"] and dashboard["carbon"]
