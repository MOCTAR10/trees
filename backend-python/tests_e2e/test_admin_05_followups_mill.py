"""Régression Ministère · suites des contrôles, registres de transformation."""

from tests_e2e.helpers import non_compliant_control


def test_le_ministere_notifie_suit_et_clot_une_suite(world):
    """Le Ministère notifie une suite, la retrouve parmi les suites ouvertes, puis la clôt."""
    control = non_compliant_control(world)
    fu = world.p.post(
        "admin",
        f"/api/controls/{control}/followups",
        {"action_type": "transaction", "amount_fcfa": 100000},
        expect=201,
    )
    assert fu["competent_codes"] and fu["acting_authority"]
    opened = world.p.get("admin", "/api/controls/followups")
    assert any(f["id"] == fu["id"] for f in opened)
    done = world.p.post(
        "admin", f"/api/controls/followups/{fu['id']}/status", {"status": "execute"}
    )
    assert done["status"] == "execute"


def test_le_ministere_consulte_le_registre_d_une_usine(world):
    """Le Ministère consulte le registre de transformation d'une organisation et son PDF."""
    reg = world.p.get("admin", f"/api/mill/register?org_id={world.org['sdl']}")
    assert reg["outputs"], "registre sans lot"
    pdf = world.p.call(
        "admin", "GET", f"/api/mill/register/pdf?org_id={world.org['sdl']}", expect=200
    )
    assert bytes(pdf).startswith(b"%PDF")


def test_le_ministere_voit_les_alertes_de_rendement(world):
    """Le Ministère liste les usines dont les sorties dépassent les entrées."""
    alerts = world.p.get("admin", "/api/mill/alerts")
    assert isinstance(alerts, list)


def test_le_ministere_consulte_la_memoire_des_especes(world):
    """Le Ministère consulte les espèces que la plateforme a identifiées et mémorisées."""
    memory = world.p.get("admin", "/api/species/learned/list")
    assert memory["count"] == len(memory["species"])
    world.p.call("hob.dg", "GET", "/api/species/learned/list", expect=403)
