"""Régression Entreprise · équipe de terrain, registre de transformation, suites de contrôle."""

from tests_e2e.helpers import non_compliant_control, received_logs


def test_l_entreprise_ouvre_liste_et_suspend_ses_agents(world):
    """L'entreprise ouvre le compte de son agent, le voit dans son équipe et le suspend."""
    email = world.email(f"agent{world.code()[-4:]}")
    agent = world.p.post(
        "hob.dg",
        "/api/organizations/me/agents",
        {"email": email, "password": "Pilote2026!", "first_name": "Aimé", "last_name": "Ondo"},
        expect=201,
    )
    assert agent["company_id"] == world.user["hob.dg"]
    team = world.p.get("hob.dg", "/api/organizations/me/agents")
    assert any(a["id"] == agent["id"] and a["is_active"] for a in team)
    out = world.p.patch(
        "hob.dg", f"/api/organizations/me/agents/{agent['id']}", {"is_active": False}
    )
    assert out["is_active"] is False


def test_la_scierie_enregistre_un_lot_et_consulte_son_registre(world):
    """La scierie enregistre un lot à partir de ses grumes réceptionnées et consulte son registre."""
    codes = received_logs(world, 2)
    reg = world.p.get("sdl.dg", "/api/mill/register")
    assert set(codes) <= {t["tree_code"] for t in reg["stock"]}
    lot = world.p.post(
        "sdl.dg",
        "/api/mill/outputs",
        {"product_type": "placage", "volume_m3": 1.5, "tree_codes": codes},
        expect=201,
    )
    assert sorted(lot["transformed"]) == sorted(codes)
    pdf = world.p.call("sdl.dg", "GET", "/api/mill/register/pdf", expect=200)
    assert bytes(pdf).startswith(b"%PDF")


def test_l_entreprise_voit_et_conteste_une_suite(world):
    """L'entreprise voit les suites qui la visent et peut en contester une."""
    control = non_compliant_control(world)
    fu = world.p.post(
        "admin",
        f"/api/controls/{control}/followups",
        {"action_type": "saisie"},
        expect=201,
    )
    mine = world.p.get("hob.dg", "/api/controls/followups")
    assert any(f["id"] == fu["id"] for f in mine)
    out = world.p.post(
        "hob.dg",
        f"/api/controls/followups/{fu['id']}/contest",
        {"reply": "Produits déjà déclarés"},
        expect=200,
    )
    assert out["status"] == "conteste"
