"""Régression Entreprise · accueil, profil, carte, espèces, titres et actes (lecture, PDF, cloisonnement)."""


def _pdf(world, actor, path):
    out = world.p.call(actor, "GET", path, expect=200, note=f"PDF {path}")
    assert bytes(out).startswith(b"%PDF"), path


def test_profil_du_compte_entreprise(world):
    """Le compte entreprise connaît son rôle et son organisation."""
    me = world.p.get("hob.dg", "/api/auth/me")
    assert me["role"] == "company" and me.get("organization_id") == world.org["hob"]


def test_nom_saisi_par_l_entreprise_visible_par_le_ministere(world):
    """Le nom saisi par le dirigeant est celui que voit le Ministère dans la liste des comptes."""
    world.p.patch("gte.dg", "/api/home/me", {"first_name": "Marc", "last_name": "Obame-Nzé"})
    users = {u["email"]: u for u in world.p.get("admin", "/api/admin/users")}
    assert users[world.email("gte.dg")]["last_name"] == "Obame-Nzé"


def test_accueil_groupe_et_arbres(world):
    """L'accueil, le groupe et les arbres du compte répondent pour l'entreprise."""
    assert world.p.get("hob.dg", "/api/home/summary") is not None
    assert world.p.get("hob.dg", "/api/group") is not None
    assert world.p.get("hob.dg", "/api/group/trees") is not None
    assert world.p.get("hob.dg", "/api/my-trees") is not None


def test_carte_couches_recherche_fiche_et_controle(world):
    """La carte : contexte national, tuiles, couches de l'emprise, recherche, fiche, contrôle d'un point."""
    assert world.p.get("hob.dg", "/api/map/context")
    assert world.p.get("hob.dg", "/api/map/tiles")
    layers = world.p.get("hob.dg", "/api/map/layers?zoom=12&bbox=13.55,-0.83,13.70,-0.68")
    aac = layers["layers"]["aac"]
    features = aac.get("features", []) if isinstance(aac, dict) else aac
    assert features
    results = world.p.get("hob.dg", f"/api/map/search?q={world.ns}")
    results = results.get("results", results) if isinstance(results, dict) else results
    assert results
    hit = results[0]
    world.p.get("hob.dg", f"/api/map/feature/{hit['layer']}/{hit['id']}")
    check = world.p.get("hob.dg", "/api/map/point-check?lat=-0.77&lon=13.61")
    assert check is not None


def test_especes_liste_et_fiche(world):
    """Le référentiel des espèces et la fiche d'une essence (DME, CITES) sont consultables."""
    species = world.p.get("hob.dg", "/api/species?q=Aucoumea")
    rows = species.get("items", species) if isinstance(species, dict) else species
    assert rows
    assert world.p.get("hob.dg", "/api/species/Afzelia bipindensis")


def test_titres_de_l_entreprise_uniquement(world):
    """L'entreprise ne voit que ses titres et ne lit pas ceux d'une autre organisation."""
    ids = {t["id"] for t in world.p.get("hob.dg", "/api/titles")}
    assert world.title["hob"] in ids and world.title["cfn"] not in ids
    assert world.p.get("hob.dg", f"/api/titles/{world.title['hob']}")
    world.p.call("hob.dg", "GET", f"/api/titles/{world.title['cfn']}", expect=(403, 404))


def test_ufa_aac_et_dme_de_l_entreprise(world):
    """L'entreprise consulte ses UFA, ses AAC (statut) et le DME applicable."""
    units = world.p.get("hob.dg", f"/api/titles/{world.title['hob']}/units")
    assert any(u["id"] == world.ufa["hob"] for u in units)
    aacs = {
        a["id"]: a["status"]
        for a in world.p.get("hob.dg", f"/api/titles/units/{world.ufa['hob']}/aacs")
    }
    assert aacs[world.aac["hob1"]] == "ouvert"
    dme = world.p.get("hob.dg", f"/api/titles/units/{world.ufa['hob']}/dme")
    rows = dme.get("entries", dme) if isinstance(dme, dict) else dme
    assert any(
        r["species_scientific_name"] == "Aucoumea klaineana" and r["dme_cm"] == 75 for r in rows
    )
    world.p.call("cfn.dg", "GET", f"/api/titles/units/{world.ufa['hob']}/aacs", expect=(403, 404))


def test_actes_du_titre_et_leurs_pdf(world):
    """L'entreprise retrouve conventions, attestation, études, autorisation et leurs PDF."""
    convs = world.p.get("hob.dg", f"/api/titles/{world.title['hob']}/conventions")
    final = next(c for c in convs if c["convention_type"] == "definitive")
    assert final.get("attestation_ref")
    _pdf(world, "hob.dg", f"/api/titles/{world.title['hob']}/conventions/{final['id']}/pdf")
    studies = world.p.get("hob.dg", f"/api/titles/{world.title['hob']}/studies")
    ppf = next(s for s in studies if s["study_type"] == "ppf")
    _pdf(world, "hob.dg", f"/api/titles/{world.title['hob']}/studies/{ppf['id']}/pdf")
    auth = world.p.get("hob.dg", f"/api/titles/aacs/{world.aac['hob1']}/authorizations")[0]
    _pdf(world, "hob.dg", f"/api/titles/authorizations/{auth['id']}/pdf")
    world.p.call("cfn.dg", "GET", f"/api/titles/authorizations/{auth['id']}/pdf", expect=(403, 404))


def test_organisation_de_l_entreprise_et_profils(world):
    """L'entreprise lit sa propre organisation et les profils réglementaires."""
    org = world.p.get("hob.dg", "/api/organizations/me")
    assert (org.get("id") or org.get("organization", {}).get("id")) == world.org["hob"]
    assert world.p.get("hob.dg", "/api/organizations/profiles")
    assert len(world.p.get("hob.dg", "/api/documents/types")) >= 38
