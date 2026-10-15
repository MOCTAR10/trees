"""Régression · inventaire par scan, équipe, registre de transformation, suites des contrôles."""

import io
from datetime import date, timedelta

from PIL import Image

from tests_e2e.helpers import declare, line, non_compliant_control, received_logs
from tools import seed_pilot


def _scan(world, actor: str, code: str, aac: str = "hob1", i: int = 7, expect: int = 200):
    lon, lat = seed_pilot._point(world, aac, i)
    buf = io.BytesIO()
    Image.new("RGB", (640, 480), (70, 90, 60)).save(buf, "JPEG")
    r = world.p.http.request(
        "POST",
        "/api/v1/process-scan",
        data={
            "latitude": str(lat),
            "longitude": str(lon),
            "organs": "dbh",
            "circumference_cm": "260",
            "tree_code": code,
        },
        files={"images": ("dbh.jpg", buf.getvalue(), "image/jpeg")},
        headers={"Authorization": f"Bearer {world.p.tokens[actor]}"},
    )
    assert r.status_code == expect, r.text[:300]
    return r.json()


def _registry(world, code: str) -> dict | None:
    rows = world.p.get("hob.dg", "/api/felling/trees?status=inventorie")
    return next((t for t in rows if t["tree_code"] == code), None)


def test_une_plaque_inconnue_scannee_inscrit_l_arbre_a_l_inventaire(world):
    """Une plaque inconnue scannée par un agent inscrit l'arbre à l'inventaire de son entreprise, dans l'AAC du point."""
    code = world.code()
    out = _scan(world, "hob.agent1", code)
    assert out["tree_code"] == code and "tree_inventoried" in out["measurement_notes"]
    tree = _registry(world, code)
    assert tree and tree["aac_id"] == world.aac["hob1"] and tree["marking_type"] == "qr"


def test_la_declaration_reprend_une_tige_inventoriee(world):
    """Une tige inventoriée par scan passe « déclarée » quand l'entreprise la déclare."""
    code = world.code()
    _scan(world, "hob.agent1", code, i=8)
    declare(world, [line(world, "Aucoumea klaineana", 95, i=8, tree_code=code)])
    assert _registry(world, code) is None
    tree = world.p.get("hob.dg", f"/api/felling/trees/{code}")
    assert tree["status"] == "declare"


def test_un_arbre_d_une_autre_entreprise_n_est_jamais_inscrit(world):
    """Un code déjà inscrit par une autre entreprise est refusé, jamais réinscrit."""
    code = world.code()
    _scan(world, "hob.agent1", code, i=9)
    _scan(world, "cfn.agent1", code, aac="cfn1", expect=403)


def test_un_lot_doit_citer_des_grumes_receptionnees_par_l_usine(world):
    """Un lot d'usine cite au moins une grume réceptionnée par l'usine elle-même."""
    body = {"product_type": "sciage", "volume_m3": 1.0}
    p = world.p
    p.call("sdl.dg", "POST", "/api/mill/outputs", json={**body, "tree_codes": []}, expect=422)
    p.call(
        "sdl.dg", "POST", "/api/mill/outputs", json={**body, "tree_codes": ["INCONNU"]}, expect=404
    )
    hob = [t["tree_code"] for t in p.get("hob.dg", "/api/felling/trees?status=abattu")]
    p.call("sdl.dg", "POST", "/api/mill/outputs", json={**body, "tree_codes": hob[:1]}, expect=403)
    transit = p.get("sdl.dg", "/api/mill/register")["stock"]
    assert all(t["tree_code"] not in hob for t in transit)


def test_des_sorties_superieures_aux_entrees_levent_une_anomalie(world):
    """Des sorties d'usine supérieures au volume reçu lèvent l'anomalie « rendement matière »."""
    codes = received_logs(world)
    reg = world.p.get("sdl.dg", "/api/mill/register")
    volume = max(reg["totals"]["input_m3"], 1.0) * 2
    world.p.post(
        "sdl.dg",
        "/api/mill/outputs",
        {"product_type": "sciage", "volume_m3": volume, "tree_codes": codes},
        expect=201,
    )
    items = world.p.get("admin", "/api/anomalies?type=rendement_matiere_anormal")
    assert any(a["org_id"] == world.org["sdl"] for a in items)


def test_pas_de_suite_sans_non_conformite_ni_d_amende_sans_montant(world):
    """Un contrôle conforme n'appelle pas de suite ; une amende exige son montant."""
    ok = world.p.post(
        "mef.dp2",
        "/api/controls",
        {
            "control_type": "visa_df10",
            "result": "conforme",
            "aac_id": world.aac["hob1"],
            "notes": "RAS",
        },
        expect=201,
    )
    world.p.call(
        "admin",
        "POST",
        f"/api/controls/{ok['id']}/followups",
        json={"action_type": "mise_en_demeure"},
        expect=409,
    )
    control = non_compliant_control(world)
    world.p.call(
        "admin",
        "POST",
        f"/api/controls/{control}/followups",
        json={"action_type": "amende"},
        expect=422,
    )


def test_une_suite_echue_devient_une_anomalie_grave(world):
    """Une suite notifiée et non exécutée à l'échéance devient une anomalie grave."""
    control = non_compliant_control(world)
    past = (date.today() - timedelta(days=2)).isoformat()
    fu = world.p.post(
        "admin",
        f"/api/controls/{control}/followups",
        {"action_type": "amende", "amount_fcfa": 50000, "due_at": past},
        expect=201,
    )
    assert fu["display_status"] == "en_retard"
    items = world.p.get("admin", "/api/anomalies?type=suite_controle_en_retard")
    hit = [a for a in items if a["subject_key"] == f"suite:{fu['id']}"]
    assert hit and hit[0]["severity"] == "hard"


def test_une_contestation_passe_par_a_traiter(world):
    """Une contestation arrive dans « À traiter » : acceptée elle annule la suite, rejetée elle la maintient."""
    control = non_compliant_control(world)
    p = world.p
    kept, dropped = (
        p.post("admin", f"/api/controls/{control}/followups", {"action_type": a}, expect=201)
        for a in ("saisie", "suspension")
    )
    for fu in (kept, dropped):
        p.post("hob.dg", f"/api/controls/followups/{fu['id']}/contest", {"reply": "Contesté"})
    queue = {i["id"] for i in p.get("admin", "/api/admin/inbox/items?type=followups")}
    assert {kept["id"], dropped["id"]} <= queue
    p.post(
        "admin",
        f"/api/admin/inbox/followups/{kept['id']}/decision",
        {"approve": False, "motif": "Faits établis"},
    )
    p.post("admin", f"/api/admin/inbox/followups/{dropped['id']}/decision", {"approve": True})
    mine = {f["id"]: f for f in p.get("hob.dg", "/api/controls/followups")}
    assert mine[kept["id"]]["status"] == "notifie"
    assert mine[kept["id"]]["decision_motif"] == "Faits établis"
    assert dropped["id"] not in mine


def test_une_suite_contestee_attend_la_decision_et_ne_se_conteste_qu_une_fois(world):
    """Une suite contestée ne s'exécute qu'après décision, et ne se conteste qu'une fois."""
    control = non_compliant_control(world)
    p = world.p
    fu = p.post("admin", f"/api/controls/{control}/followups", {"action_type": "saisie"})
    p.call(
        "sdl.dg",
        "POST",
        f"/api/controls/followups/{fu['id']}/contest",
        json={"reply": "x"},
        expect=403,
    )
    p.post("hob.dg", f"/api/controls/followups/{fu['id']}/contest", {"reply": "Contesté"})
    p.call(
        "admin",
        "POST",
        f"/api/controls/followups/{fu['id']}/status",
        json={"status": "execute"},
        expect=409,
    )
    p.post(
        "admin",
        f"/api/admin/inbox/followups/{fu['id']}/decision",
        {"approve": False, "motif": "Maintenue"},
    )
    p.call(
        "hob.dg",
        "POST",
        f"/api/controls/followups/{fu['id']}/contest",
        json={"reply": "encore"},
        expect=409,
    )


def test_un_agent_suspendu_ne_peut_plus_agir(world):
    """Un agent suspendu par son entreprise voit ses appels refusés ; seule l'entreprise gère ses agents."""
    p = world.p
    email = world.email(f"susp{world.code()[-4:]}")
    p.call(
        "hob.agent1",
        "POST",
        "/api/organizations/me/agents",
        json={"email": email, "password": "Pilote2026!", "first_name": "A", "last_name": "B"},
        expect=403,
    )
    agent = p.post(
        "hob.dg",
        "/api/organizations/me/agents",
        {"email": email, "password": "Pilote2026!", "first_name": "Jules", "last_name": "Essono"},
        expect=201,
    )
    p.login("susp", email, "Pilote2026!")
    p.get("susp", "/api/home/summary")
    p.call(
        "sdl.dg",
        "PATCH",
        f"/api/organizations/me/agents/{agent['id']}",
        json={"is_active": False},
        expect=404,
    )
    p.patch("hob.dg", f"/api/organizations/me/agents/{agent['id']}", {"is_active": False})
    p.call("susp", "GET", "/api/home/summary", expect=401)
