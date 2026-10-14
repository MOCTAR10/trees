"""Régression · déclaration d'abattage et porte de conformité (Loi 016/01)."""

from tests_e2e.helpers import declare, detail, line


def _blockers(response) -> set[str]:
    d = response.get("detail") if isinstance(response, dict) else {}
    return {b.get("code") for b in (d.get("blockers") or [])} if isinstance(d, dict) else set()


def test_declaration_conforme_acceptee(world):
    """Une déclaration conforme est soumise et part au Ministère."""
    out = declare(world, [line(world, "Aucoumea klaineana", 96)])
    assert out["status"] == "soumise"


def test_sous_le_dme_de_l_ufa_bloque(world):
    """Une tige sous le DME fixé pour l'UFA (75 cm, plus strict que le provisoire) est bloquée."""
    r = declare(world, [line(world, "Aucoumea klaineana", 72)], expect=422)
    assert "below_dme" in _blockers(r)


def test_essence_reservee_bloquee(world):
    """Une essence mise en réserve (moabi) est bloquée (art. 124)."""
    r = declare(world, [line(world, "Baillonella toxisperma", 140)], expect=422)
    assert "reserved_species" in _blockers(r)


def test_arbre_hors_de_l_aac_bloque(world):
    """Un arbre localisé hors du polygone de l'AAC est bloqué."""
    r = declare(
        world, [line(world, "Aucoumea klaineana", 95, latitude=-0.5, longitude=13.95)], expect=422
    )
    assert "outside_aac" in _blockers(r)


def test_code_arbre_en_doublon_bloque(world):
    """Un code arbre déjà inscrit au registre ne peut pas être déclaré à nouveau."""
    first = line(world, "Aucoumea klaineana", 95)
    declare(world, [first])
    again = {**line(world, "Aucoumea klaineana", 95), "tree_code": first["tree_code"]}
    r = declare(world, [again], expect=422)
    assert "duplicate_code" in _blockers(r)


def test_aac_fermee_bloquee(world):
    """Une AAC fermée n'accepte plus de déclaration."""
    declare(world, [line(world, "Aucoumea klaineana", 95, aac="hob0")], aac="hob0", expect=422)


def test_essence_cites_signalee_sans_bloquer(world):
    """Une essence CITES (doussié, annexe II) est signalée (permis à joindre) mais ne bloque pas la soumission."""
    out = declare(world, [line(world, "Afzelia bipindensis", 96)])
    flags = {v for ln in out["lines_checked"] for v in ln["violations"]}
    assert "cites_listed" in flags


def test_rejet_de_declaration_sans_motif_refuse(world):
    """Le Ministère ne peut rejeter une déclaration sans motif."""
    out = declare(world, [line(world, "Aucoumea klaineana", 95)])
    world.p.call(
        "admin",
        "POST",
        f"/api/admin/inbox/declarations/{out['id']}/decision",
        json={"approve": False, "motif": ""},
        expect=400,
    )


def test_declaration_deja_tranchee(world):
    """Une déclaration déjà tranchée ne peut pas l'être une seconde fois."""
    out = declare(world, [line(world, "Aucoumea klaineana", 95)])
    world.p.post(
        "admin",
        f"/api/admin/inbox/declarations/{out['id']}/decision",
        {"approve": True},
        expect=200,
    )
    r = world.p.call(
        "admin",
        "PATCH",
        f"/api/felling/declarations/{out['id']}",
        json={"decision": "rejetee", "motif": "x"},
        expect=409,
    )
    assert "tranchée" in detail(r)


def test_approbation_autorise_les_tiges(world):
    """L'approbation passe les tiges au statut « Autorisé »."""
    ln = line(world, "Aucoumea klaineana", 95)
    out = declare(world, [ln])
    world.p.post(
        "admin",
        f"/api/admin/inbox/declarations/{out['id']}/decision",
        {"approve": True},
        expect=200,
    )
    tree = world.p.get("hob.dg", f"/api/felling/trees/{ln['tree_code']}")
    assert tree["status"] == "autorise" and tree["next_event"] == "abattu"


def test_page_de_decision_presente_les_verifications(world):
    """La page de décision du Ministère montre faits, vérifications et note de compétence."""
    out = declare(world, [line(world, "Aucoumea klaineana", 95)])
    d = world.p.get("admin", f"/api/admin/inbox/declarations/{out['id']}")
    assert d["checks"] and d["facts"] and d["approve_label"]
    assert "pour le compte de" in d["competence_note"]
