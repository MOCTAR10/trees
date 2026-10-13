"""Branded PDF export for the v1 measurement report and the v2 valorization plan.

Pure-python (reportlab) so it runs unmodified inside the slim API image — no
system libraries, no headless browser. Text is sanitised to WinAnsi so partial
LLM output (odd quotes, arrows, emoji) can never crash document generation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

FOREST = colors.HexColor("#2E7D32")
DARK = colors.HexColor("#144A1A")
LIGHT = colors.HexColor("#E8F5E9")
SAND = colors.HexColor("#F4EFE6")
GOLD = colors.HexColor("#B8860B")
GREY = colors.HexColor("#5A5A5A")
LINE = colors.HexColor("#CBD5C9")

BRAND = "Digital Forestry"
TAGLINE = "Mesure, identification et économie circulaire du bois — Bassin du Congo"

_ss = getSampleStyleSheet()
S_TITLE = ParagraphStyle(
    "Title",
    parent=_ss["Title"],
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=24,
    textColor=DARK,
    spaceAfter=2,
)
S_SUB = ParagraphStyle(
    "Sub", parent=_ss["Normal"], fontName="Helvetica", fontSize=10, leading=13, textColor=GREY
)
S_H2 = ParagraphStyle(
    "H2",
    parent=_ss["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=13,
    leading=16,
    textColor=FOREST,
    spaceBefore=8,
    spaceAfter=4,
)
S_BODY = ParagraphStyle(
    "Body",
    parent=_ss["Normal"],
    fontName="Helvetica",
    fontSize=10,
    leading=14,
    alignment=TA_JUSTIFY,
    textColor=colors.HexColor("#222222"),
)
S_SMALL = ParagraphStyle(
    "Small", parent=_ss["Normal"], fontName="Helvetica", fontSize=8, leading=11, textColor=GREY
)
S_CELL = ParagraphStyle("Cell", parent=_ss["Normal"], fontName="Helvetica", fontSize=9, leading=12)
S_CELLB = ParagraphStyle("CellB", parent=S_CELL, fontName="Helvetica-Bold")
S_CELLH = ParagraphStyle("CellH", parent=S_CELL, fontName="Helvetica-Bold", textColor=colors.white)


def _safe(value: Any) -> str:
    """Coerce to a WinAnsi-safe string (drop anything the base fonts cannot encode)."""
    if value is None:
        return ""
    text = str(value)
    return text.encode("cp1252", "replace").decode("cp1252")


def _fr_num(value: Any, digits: int = 1, suffix: str = "") -> str:
    if value is None:
        return "N/D"
    try:
        num = f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return _safe(value)
    num = num.replace(",", "\u00a0").replace(".", ",")  # fr grouping, comma decimals
    return _safe(num + suffix)


def _pct(value: Any) -> str:
    if value is None:
        return "N/D"
    return _fr_num(float(value) * 100, 0, " %")


def _header_footer(title: str):
    def draw(canvas, doc):
        canvas.saveState()
        width, height = A4
        canvas.setFillColor(DARK)
        canvas.rect(0, height - 26 * mm, width, 26 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(18 * mm, height - 15 * mm, BRAND)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(LIGHT)
        canvas.drawString(18 * mm, height - 21 * mm, _safe(title))
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(GREY)
        stamp = datetime.now(UTC).strftime("%d/%m/%Y %H:%M UTC")
        canvas.drawString(18 * mm, 9 * mm, _safe(f"Généré le {stamp}"))
        canvas.drawRightString(width - 18 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def _build(story: list, title: str) -> bytes:
    buf = BytesIO()
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=32 * mm,
        bottomMargin=18 * mm,
        title=title,
        author=BRAND,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    on_page = _header_footer(title)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=on_page)])
    doc.build(story)
    return buf.getvalue()


def _kv_table(rows: list[tuple[str, str]], col0: float = 55 * mm) -> Table:
    data = [[Paragraph(_safe(k), S_CELLB), Paragraph(_safe(v) or "N/D", S_CELL)] for k, v in rows]
    table = Table(data, colWidths=[col0, None])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), SAND),
                ("TEXTCOLOR", (0, 0), (0, -1), DARK),
                ("ROWBACKGROUNDS", (1, 0), (1, -1), [colors.white, LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _grid_table(header: list[str], rows: list[list[str]], widths: list[float]) -> Table:
    data = [[Paragraph(_safe(h), S_CELLH) for h in header]]
    for r in rows:
        data.append([Paragraph(_safe(c) or "—", S_CELL) for c in r])
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), FOREST),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


LEGAL_NOTE = (
    "Cadre légal et RSE — Code forestier gabonais (Loi 016/01, art. 21, 22 et 251 : "
    "exploitation à faible impact EFIR, transformation locale, développement communautaire), "
    "normes FSC (Principes 3 et 4) et PEFC/PAFC, et mécanismes de l'article 6 de l'Accord de Paris "
    "pour les émissions évitées."
)


def _references_block(items: Any) -> list:
    """Optional 'Références (corpus RAG)' section."""
    if not items:
        return []
    flowables: list = [Spacer(1, 4 * mm), Paragraph("Références (corpus RAG)", S_H2)]
    for item in items:
        flowables.append(Paragraph(_safe(f"• {item}"), S_SMALL))
    return flowables


DBH_METHOD_LABELS = {
    "tape_circumference": "Ruban (circonférence ÷ π)",
    "caliper": "Compas forestier",
    "operator_edges": "Photo — bords confirmés par l'opérateur",
    "sam2_opencv": "Vision IA (SAM 2.1 + OpenCV)",
    "opencv_depth": "Vision (profondeur)",
    "opencv_edge_profile": "Vision (profil des bords)",
    "yolo_opencv_hybrid": "Vision (YOLO + OpenCV)",
    "opencv_fallback": "Vision (OpenCV)",
    "multi_view_median": "Vision (médiane multi-vues)",
    "unavailable": "Non mesuré",
}

HEIGHT_METHOD_LABELS = {
    "clinometer": "Clinomètre (mesurée)",
    "manual": "Saisie terrain",
    "hd_curve": "Courbe hauteur-diamètre (estimée)",
}

MEASUREMENT_NOTE_LABELS = {
    "focal_client": "Focale fournie par l'appareil",
    "focal_exif": "Focale lue dans l'EXIF de la photo",
    "focal_estimated": "Focale estimée (26 mm éq.) — précision réduite",
    "depth_missing": "Distance au tronc non renseignée — vision non exécutée",
    "depth_ai_estimated": "Distance au tronc estimée par IA (Depth Anything V2)",
    "ai_segmentation": "Tronc découpé par IA (SAM 2.1)",
    "edges_operator": "Bords du tronc placés / confirmés par l'opérateur sur la photo",
    "depth_sensor": "Distance mesurée par le capteur de profondeur (LiDAR / ARCore)",
    "depth_qr_plate": "Distance mesurée grâce à la plaque QR de l'arbre (règle de taille connue)",
    "qr_plate_unreadable": "Plaque QR vue mais trop petite ou trop oblique pour mesurer",
    "qr_tree_unknown": "Plaque QR lue, mais code absent du registre ou d'une autre entreprise",
    "species_low_confidence": "Espèce non retenue : confiance d'identification < 15 %",
    "trunk_exceeds_frame": "Tronc plus large que le cadre — reculez",
    "vision_implausible": "Mesure vision hors plage plausible — écartée",
    "vision_failed": "Tronc non détecté par la vision",
    "reference_tape": "Référence ruban à 1,30 m",
    "reference_caliper": "Référence compas forestier",
}


def render_measurement_pdf(report: dict) -> bytes:
    """Phase 1 report -> branded A4 PDF."""
    species = report.get("species_scientific_name")
    common = report.get("species_common_name_fr")
    heading = f"{species or 'Espèce non identifiée'}{(' (' + common + ')') if common else ''}"

    story: list = [
        Paragraph("Rapport d'analyse forestière", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        Paragraph(_safe(heading), S_H2),
        _kv_table(
            [
                ("Espèce (scientifique)", report.get("species_scientific_name")),
                ("Nom commun (FR)", report.get("species_common_name_fr")),
                ("Confiance identification", _pct(report.get("species_confidence"))),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Dendrométrie", S_H2),
        _kv_table(
            [
                ("Diamètre (DBH)", _fr_num(report.get("measured_dbh_cm"), 1, " cm")),
                (
                    "Méthode",
                    DBH_METHOD_LABELS.get(report.get("dbh_method"), report.get("dbh_method")),
                ),
                ("Confiance DBH", _pct(report.get("dbh_confidence"))),
                ("DBH vision (contrôle)", _fr_num(report.get("dbh_vision_cm"), 1, " cm")),
                ("Écart vision / référence", _fr_num(report.get("dbh_discrepancy_pct"), 1, " %")),
                ("Incertitude multi-vues", _fr_num(report.get("dbh_uncertainty_cm"), 1, " cm")),
                ("Hauteur", _fr_num(report.get("estimated_height_m"), 1, " m")),
                (
                    "Méthode hauteur",
                    HEIGHT_METHOD_LABELS.get(
                        report.get("height_method"), report.get("height_method")
                    ),
                ),
                ("Âge estimé", _fr_num(report.get("estimated_age_years"), 1, " ans")),
                ("Modèle d'âge", report.get("age_model_used")),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Stock de carbone vivant", S_H2),
        _kv_table(
            [
                (
                    "Biomasse aérienne (AGB)",
                    _fr_num(report.get("aboveground_biomass_kg"), 0, " kg"),
                ),
                ("Carbone (AGB + racines)", _fr_num(report.get("carbon_stock_kg"), 0, " kg C")),
                ("Équivalent CO2", _fr_num(report.get("co2e_kg"), 0, " kg CO2e")),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Contexte écologique", S_H2),
        _kv_table(
            [
                ("État sanitaire", report.get("health_status")),
                ("Type de sol", report.get("soil_type")),
                ("Densité de canopée (FCD)", _pct(report.get("canopy_density_fcd"))),
            ]
        ),
    ]

    if report.get("narrative_fr"):
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Récit historique et climatique", S_H2),
            Paragraph(_safe(report["narrative_fr"]), S_BODY),
        ]

    notes = report.get("measurement_notes") or []
    if notes:
        story += [Spacer(1, 4 * mm), Paragraph("Qualité de la mesure", S_H2)]
        story += [
            Paragraph(_safe(f"• {MEASUREMENT_NOTE_LABELS.get(code, code)}"), S_SMALL)
            for code in notes
        ]

    story += _references_block(report.get("rag_sources"))
    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Conformité et responsabilité", S_H2),
                Paragraph(_safe(LEGAL_NOTE), S_SMALL),
            ]
        ),
    ]
    return _build(story, "Rapport d'analyse forestière")


def render_valorization_pdf(payload: dict) -> bytes:
    """Phase 2 valorization plan -> branded A4 PDF."""
    engine = payload.get("residue_engine", {}) or {}
    plan = payload.get("valorization_plan", {}) or {}
    summary = plan.get("analysis_summary", {}) or {}
    breakdown = plan.get("residue_breakdown", {}) or {}
    synergy = plan.get("win_win_synergy_plan", {}) or {}
    carbon = plan.get("carbon_offset_metadata", {}) or {}
    coops = payload.get("matched_cooperatives", []) or []

    def ch(name: str) -> dict:
        return breakdown.get(name, {}) or {}

    story: list = [
        Paragraph("Plan de valorisation — Économie Circulaire", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        Paragraph("Synthèse", S_H2),
        _kv_table(
            [
                ("Espèce", summary.get("species") or engine.get("species")),
                (
                    "Diamètre (DBH)",
                    _fr_num(summary.get("dbh_cm") or engine.get("dbh_cm"), 1, " cm"),
                ),
                ("Hauteur", _fr_num(summary.get("height_m") or engine.get("height_m"), 1, " m")),
                (
                    "Biomasse résiduelle totale",
                    _fr_num(
                        summary.get("total_waste_biomass_kg")
                        or engine.get("total_waste_biomass_kg"),
                        1,
                        " kg",
                    ),
                ),
                (
                    "Émissions méthane évitées",
                    _fr_num(carbon.get("avoided_methane_emissions_co2eq_kg"), 1, " kg CO2éq"),
                ),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Décomposition des résidus et voies de valorisation", S_H2),
        _grid_table(
            ["Voie", "Masse / Volume", "Recommandation principale"],
            [
                [
                    "Houppiers & branches (aérien)",
                    _fr_num(ch("canopy_and_branches").get("mass_kg"), 1, " kg"),
                    ch("canopy_and_branches").get("primary_recommendation")
                    or ch("canopy_and_branches").get("technical_protocol_summary"),
                ],
                [
                    "Écorce & liquides organiques",
                    _fr_num(ch("bark_and_organic_liquids").get("mass_kg"), 1, " kg"),
                    ch("bark_and_organic_liquids").get("primary_recommendation")
                    or ch("bark_and_organic_liquids").get("industrial_use_case"),
                ],
                [
                    "Souche & racines (souterrain)",
                    _fr_num(ch("stump_and_roots").get("volume_m3"), 3, " m³"),
                    ch("stump_and_roots").get("artisan_or_pharmaceutical_value"),
                ],
            ],
            widths=[50 * mm, 30 * mm, None],
        ),
        Spacer(1, 4 * mm),
        Paragraph("Synergie Entreprise ↔ Communauté", S_H2),
    ]

    csr = synergy.get("logging_company_csr_benefits", {}) or {}
    story.append(
        _grid_table(
            ["Bénéfices entreprise (RSE)", "Détail"],
            [
                ["Critères FSC", csr.get("fsc_criteria_met")],
                ["Conformité Loi 016/01", csr.get("gabon_law_016_compliance")],
                ["Réduction du risque d'incendie", csr.get("fire_hazard_reduction_index")],
            ],
            widths=[55 * mm, None],
        )
    )
    story.append(Spacer(1, 3 * mm))

    impact = synergy.get("community_impact_plan", {}) or {}
    story.append(
        _grid_table(
            ["Impact communauté", "Détail"],
            [
                [
                    "Coopérative cible",
                    impact.get("target_cooperative_name")
                    or (
                        f"ID {impact.get('target_cooperative_id')}"
                        if impact.get("target_cooperative_id")
                        else None
                    ),
                ],
                ["Profil", impact.get("profile_type")],
                ["Distance logistique", _fr_num(impact.get("logistical_distance_km"), 1, " km")],
                ["Valeur économique locale", impact.get("local_economic_value_creation_estimate")],
            ],
            widths=[55 * mm, None],
        )
    )

    if coops:
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Coopératives à proximité", S_H2),
            _grid_table(
                ["Coopérative", "Profil", "Distance", "Certifiée"],
                [
                    [
                        c.get("name"),
                        c.get("profile_type"),
                        _fr_num(c.get("distance_km"), 1, " km"),
                        "Oui" if c.get("is_certified") else "Non",
                    ]
                    for c in coops
                ],
                widths=[None, 45 * mm, 25 * mm, 20 * mm],
            ),
        ]

    story += _references_block(plan.get("references"))
    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Conformité et responsabilité", S_H2),
                Paragraph(_safe(LEGAL_NOTE), S_SMALL),
            ]
        ),
    ]
    return _build(story, "Plan de valorisation — Économie Circulaire")


DOC_TYPE_LABEL = {
    "bordereau_roulage": "Bordereau de roulage",
    "feuille_route": "Feuille de route",
    "specification": "Spécification (export)",
}
TRANSPORT_STATUS_LABEL = {
    "brouillon": "Brouillon",
    "emis": "Émis",
    "receptionne": "Réceptionné",
}
EUDR_STATUS_LABEL = {
    "soumis": "Soumis",
    "valide": "Validé",
    "rejete": "Rejeté",
}
AUTHORIZATION_TYPE_LABEL = {
    "certificat_assiette": "Certificat annuel d'assiette de coupe",
    "permis_annuel_operations": "Permis annuel d'opérations",
    "certificat_vente_coupe": "Certificat de vente de coupe",
    "cae": "Cahier des charges (CAE)",
}
AUTHORIZATION_STATUS_LABEL = {
    "soumis": "Soumis",
    "delivre": "Délivré",
    "rejete": "Rejeté",
}
CONVENTION_TYPE_LABEL = {
    "provisoire": "Convention provisoire",
    "definitive": "Convention définitive",
}
CONVENTION_STATUS_LABEL = {
    "active": "En vigueur",
    "expiree": "Expirée",
    "resiliee": "Résiliée",
}
STUDY_TYPE_LABEL = {
    "ppf": "Plan de Protection de la Faune (PPF)",
    "eie": "Étude d'Impact Environnemental (EIE)",
}
STUDY_STATUS_LABEL = {
    "soumis": "Soumis",
    "valide": "Validé",
    "rejete": "Rejeté",
    "expire": "Expiré",
}
CERT_TYPE_LABEL = {
    "gestion_durable": "Gestion durable",
    "legalite_plus": "Légalité plus",
}
CERT_STATUS_LABEL = {
    "soumis": "Soumis",
    "actif": "Actif",
    "suspendu": "Suspendu",
    "expire": "Expiré",
    "rejete": "Rejeté",
}


def _fmt_date(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y")
    return str(value)[:10]


def render_df10_pdf(
    rows: list[dict],
    org_name: str | None = None,
    title_id: int | None = None,
    aac_id: int | None = None,
) -> bytes:
    """Carnet de chantier (DF10) register -> branded A4 PDF."""
    rows = rows or []
    felled = [
        r for r in rows if r.get("status") in ("abattu", "transporte", "receptionne", "transforme")
    ]
    abandoned = [r for r in rows if r.get("abandon_code")]

    scope = org_name or "—"
    if title_id is not None:
        scope += f" · Titre #{title_id}"
    if aac_id is not None:
        scope += f" · AAC #{aac_id}"

    story: list = [
        Paragraph("Carnet de chantier (DF10)", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Opérateur", org_name or "—"),
                ("Périmètre", scope),
                ("Nombre de lignes", str(len(rows))),
                ("Arbres abattus", str(len(felled))),
                ("Arbres abandonnés", str(len(abandoned))),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Registre des arbres marqués", S_H2),
    ]

    grid_rows = [
        [
            r.get("df10_entry_no") or "—",
            r.get("tree_code"),
            r.get("species_scientific_name"),
            _fr_num(r.get("measured_dbh_cm"), 1),
            _fmt_date(r.get("felled_at")),
            r.get("abandon_label") or r.get("abandon_code") or "",
            r.get("status"),
        ]
        for r in rows
    ]
    if grid_rows:
        story.append(
            _grid_table(
                ["N° DF10", "Code", "Espèce", "DBH", "Abattu le", "Abandon", "Statut"],
                grid_rows,
                widths=[22 * mm, 20 * mm, None, 14 * mm, 20 * mm, 32 * mm, 20 * mm],
            )
        )
    else:
        story.append(Paragraph("Aucun arbre enregistré pour ce périmètre.", S_BODY))

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "Carnet de chantier obligatoire — Code forestier gabonais (Loi 016/01, "
                        "art. 130 à 133). Toute mauvaise tenue du carnet est sanctionnée (art. 275). "
                        "Le présent carnet numérique reprend les mentions du DF10 papier."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Carnet de chantier (DF10)")


def render_transport_pdf(doc: dict, trees: list[dict]) -> bytes:
    """Transport document (bordereau / feuille de route / spécification) -> PDF."""
    doc = doc or {}
    trees = trees or []
    doc_type = doc.get("doc_type")

    story: list = [
        Paragraph(_safe(DOC_TYPE_LABEL.get(doc_type, "Document de transport")), S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Référence", doc.get("reference")),
                ("Type", DOC_TYPE_LABEL.get(doc_type, doc_type)),
                ("Statut", TRANSPORT_STATUS_LABEL.get(doc.get("status"), doc.get("status"))),
                ("Origine", doc.get("from_label")),
                ("Destination", doc.get("to_label")),
                ("Transporteur", doc.get("transporter")),
                ("Véhicule", doc.get("vehicle_ref")),
                ("Nombre de grumes", str(len(trees))),
                ("Volume estimé", _fr_num(doc.get("volume_m3"), 3, " m³")),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Grumes transportées", S_H2),
    ]

    grid_rows = [
        [
            t.get("tree_code"),
            t.get("species_scientific_name"),
            _fr_num(t.get("measured_dbh_cm"), 1),
            t.get("hammer_mark"),
            t.get("status"),
        ]
        for t in trees
    ]
    if grid_rows:
        story.append(
            _grid_table(
                ["Code arbre", "Espèce", "DBH", "Marteau", "Statut"],
                grid_rows,
                widths=[26 * mm, None, 16 * mm, 26 * mm, 26 * mm],
            )
        )
    else:
        story.append(Paragraph("Aucune grume rattachée à ce document.", S_BODY))

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "Bordereau de roulage (Loi 016/01 art. 135) et spécification à l'export "
                        "(art. 138 à 140). Ce document doit accompagner chaque mouvement de bois ; "
                        "son absence constitue une anomalie relevée par l'administration."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Document de transport")


def render_statement_pdf(data: dict, org_name: str | None = None) -> bytes:
    """Regulatory statement (état trimestriel / annuel) -> branded A4 PDF."""
    data = data or {}
    period = data.get("period", {}) or {}
    totals = data.get("totals", {}) or {}
    by_status = totals.get("by_status", {}) or {}
    by_species = data.get("by_species", []) or []
    abandoned = data.get("abandoned", []) or []
    transport = data.get("transport", {}) or {}

    year = period.get("year")
    quarter = period.get("quarter")
    label = f"Année {year}" if not quarter else f"Année {year} — Trimestre {quarter}"

    story: list = [
        Paragraph("État d'exploitation", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Opérateur", org_name or "—"),
                ("Période", label),
                ("Arbres abattus", str(totals.get("stems_felled", 0))),
                ("Volume estimé", _fr_num(totals.get("estimated_volume_m3"), 3, " m³")),
                ("Taux de transformation", _pct(data.get("transformation_rate"))),
                ("Documents de transport", str(transport.get("documents", 0))),
                ("Volume transporté", _fr_num(transport.get("volume_m3"), 3, " m³")),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Répartition par statut", S_H2),
        _grid_table(
            ["Statut", "Arbres"],
            [[status, str(by_status.get(status, 0))] for status in by_status] or [["—", "0"]],
            widths=[None, 30 * mm],
        ),
        Spacer(1, 4 * mm),
        Paragraph("Volumes par essence", S_H2),
    ]

    if by_species:
        story.append(
            _grid_table(
                ["Essence", "Arbres", "Volume estimé (m³)"],
                [
                    [s.get("species"), str(s.get("stems", 0)), _fr_num(s.get("volume_m3"), 3)]
                    for s in by_species
                ],
                widths=[None, 25 * mm, 40 * mm],
            )
        )
    else:
        story.append(Paragraph("Aucun arbre abattu sur la période.", S_BODY))

    if abandoned:
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Arbres abandonnés (DF10)", S_H2),
            _grid_table(
                ["Motif", "Arbres"],
                [[a.get("label") or a.get("code"), str(a.get("count", 0))] for a in abandoned],
                widths=[None, 30 * mm],
            ),
        ]

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "États périodiques d'exploitation — Code forestier gabonais (Loi 016/01). "
                        "Volumes estimés à partir du diamètre (DBH) et d'un modèle hauteur-diamètre ; "
                        "ils ne remplacent pas le cubage légal d'une spécification."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "État d'exploitation")


def render_diligence_pdf(doc: dict, org_name: str | None = None) -> bytes:
    """EUDR due-diligence statement (parcel of origin) -> branded A4 PDF."""
    doc = doc or {}
    felled = doc.get("felled_stem_count") or 0
    geolocated = doc.get("geolocated_stem_count") or 0
    ratio = (geolocated / felled) if felled else None
    parcel_present = bool(doc.get("parcel_wkt"))
    inside = doc.get("inside_parcel_stem_count") or 0
    outside = doc.get("outside_parcel_stem_count") or 0
    title = doc.get("title_ref") or (f"#{doc.get('title_id')}" if doc.get("title_id") else None)
    consultation = doc.get("consultation_document_id")

    story: list = [
        Paragraph("Déclaration de diligence raisonnée (RDUE)", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Opérateur", org_name or doc.get("org_name")),
                ("Titre", title),
                ("Parcelle d'origine", doc.get("parcel_label")),
                ("Statut", EUDR_STATUS_LABEL.get(doc.get("status"), doc.get("status"))),
                ("Preuve de consultation", f"Document #{consultation}" if consultation else "—"),
                ("Grumes abattues", str(felled)),
                (
                    "Grumes géolocalisées",
                    f"{geolocated} ({_pct(ratio)})" if felled else str(geolocated),
                ),
                (
                    "Grumes dans la parcelle",
                    f"{inside} ({_pct(inside / geolocated)})"
                    if geolocated and parcel_present
                    else ("—" if not parcel_present else str(inside)),
                ),
                ("Grumes hors parcelle", str(outside) if parcel_present else "—"),
                ("Volume déclaré", _fr_num(doc.get("declared_volume_m3"), 3, " m³")),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Géolocalisation de la parcelle (WKT)", S_H2),
        Paragraph(_safe(doc.get("parcel_wkt") or "Polygone de parcelle non fourni."), S_SMALL),
    ]

    if doc.get("decision_motif"):
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Décision de l'administration", S_H2),
            Paragraph(_safe(doc["decision_motif"]), S_BODY),
        ]

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "Règlement (UE) 2023/1115 sur les produits zéro-déforestation (RDUE/EUDR), "
                        "art. 9 à 11 : les opérateurs doivent recueillir les coordonnées "
                        "géographiques de toutes les parcelles de production et des preuves de "
                        "consultation des parties prenantes. Le titre d'exploitation gabonais "
                        "(Loi 016/01) ne dispense pas de cette diligence."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Déclaration de diligence raisonnée (RDUE)")


def render_authorization_pdf(doc: dict, org_name: str | None = None) -> bytes:
    """Harvest authorization (assiette / PAO / vente de coupe / CAE) -> PDF.

    Materialises the Ministry decision that lets a company legally start
    harvesting a given annual cut block (Loi 016/01, art. 14: no felling
    without prior authorization).
    """
    doc = doc or {}
    auth_type = doc.get("authorization_type")
    title = doc.get("title_ref") or (f"#{doc.get('title_id')}" if doc.get("title_id") else None)
    plan_doc = doc.get("plan_document_id")
    validity_from = _fmt_date(doc.get("valid_from"))
    validity_to = _fmt_date(doc.get("valid_to"))
    validity = " → ".join(p for p in (validity_from, validity_to) if p) or "—"
    notified = doc.get("startup_notified_at")

    story: list = [
        Paragraph(
            _safe(AUTHORIZATION_TYPE_LABEL.get(auth_type, "Autorisation d'exploiter")),
            S_TITLE,
        ),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Opérateur", org_name or doc.get("org_name") or "—"),
                ("Titre", title),
                ("AAC", doc.get("aac_label") or f"#{doc.get('aac_id')}"),
                ("Type", AUTHORIZATION_TYPE_LABEL.get(auth_type, auth_type)),
                ("Référence", doc.get("reference") or "—"),
                ("Statut", AUTHORIZATION_STATUS_LABEL.get(doc.get("status"), doc.get("status"))),
                ("Validité", validity),
                ("Pièce liée", f"Document #{plan_doc}" if plan_doc else "—"),
                (
                    "Notification de démarrage",
                    _fmt_date(notified) if notified else "Non notifiée",
                ),
            ]
        ),
    ]

    if doc.get("decision_motif"):
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Décision de l'administration", S_H2),
            Paragraph(_safe(doc["decision_motif"]), S_BODY),
        ]

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "Aucun abattage n'est autorisé sans autorisation préalable (Code forestier "
                        "gabonais, Loi 016/01, art. 14). L'exploitation d'une assiette annuelle de "
                        "coupe requiert le certificat annuel d'assiette de coupe, le permis annuel "
                        "d'opérations, le certificat de vente de coupe ou le cahier des charges (CAE) "
                        "délivré par l'administration. Le démarrage des activités doit lui être notifié."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Autorisation d'exploiter")


def render_certification_pdf(doc: dict, org_name: str | None = None) -> bytes:
    """Third-party certification (FSC / PAFC / PEFC / OLB / LS / TLV) -> PDF.

    Materialises a company's certificate of sustainable forest management or
    legality-plus, as declared to and verified by the administration (Timber
    Trade Portal — tierce partie & certification).
    """
    doc = doc or {}
    scheme = doc.get("scheme")
    cert_type = doc.get("cert_type")
    title = doc.get("title_ref") or (f"#{doc.get('title_id')}" if doc.get("title_id") else None)
    surface = doc.get("surface_ha")
    validity_from = _fmt_date(doc.get("valid_from"))
    validity_to = _fmt_date(doc.get("valid_to"))
    validity = " → ".join(p for p in (validity_from, validity_to) if p) or "—"

    story: list = [
        Paragraph("Attestation de certification", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Opérateur", org_name or doc.get("org_name") or "—"),
                ("Schéma", scheme or "—"),
                ("Type", CERT_TYPE_LABEL.get(cert_type, cert_type)),
                ("Référence", doc.get("certificate_ref") or "—"),
                ("Titre", title),
                ("Surface", f"{surface:,.0f} ha".replace(",", " ") if surface else "—"),
                ("Validité", validity),
                ("Statut", CERT_STATUS_LABEL.get(doc.get("status"), doc.get("status"))),
            ]
        ),
    ]

    if doc.get("decision_motif"):
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Décision de l'administration", S_H2),
            Paragraph(_safe(doc["decision_motif"]), S_BODY),
        ]

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Portée", S_H2),
                Paragraph(
                    _safe(
                        "La certification tierce partie atteste la conformité de la gestion "
                        "forestière (FSC / PAFC / PEFC) ou de la légalité renforcée (OLB / LS / TLV). "
                        "Elle complète, sans le remplacer, le dispositif légal national (Code "
                        "forestier gabonais, Loi 016/01) et les obligations de diligence raisonnée "
                        "(RDUE)."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Certification")


def render_convention_pdf(doc: dict, org_name: str | None = None) -> bytes:
    """Convention provisoire / définitive + attestation de conformité -> PDF.

    Materialises the legal instrument that confers the right to harvest a
    forest title (Loi 016/01): the convention provisoire signed after the
    CPAET, the convention définitive (~15 ans) that turns a title 'actif',
    and the attestation de conformité the administration issues on
    satisfactory completion.
    """
    doc = doc or {}
    title_ref = doc.get("title_ref") or (f"#{doc.get('title_id')}" if doc.get("title_id") else None)
    validity = (
        " → ".join(
            p for p in (_fmt_date(doc.get("start_date")), _fmt_date(doc.get("end_date"))) if p
        )
        or "—"
    )
    if doc.get("attestation_ref"):
        issued = _fmt_date(doc.get("attestation_issued_at"))
        attestation = doc["attestation_ref"] + (f" — {issued}" if issued else "")
    else:
        attestation = "Non délivrée"

    story: list = [
        Paragraph(
            _safe(CONVENTION_TYPE_LABEL.get(doc.get("convention_type"), "Convention")),
            S_TITLE,
        ),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Opérateur", org_name or doc.get("org_name") or "—"),
                ("Titre", title_ref),
                (
                    "Type",
                    CONVENTION_TYPE_LABEL.get(
                        doc.get("convention_type"), doc.get("convention_type")
                    ),
                ),
                ("Référence", doc.get("reference") or "—"),
                ("Signature", _fmt_date(doc.get("signed_at")) or "—"),
                ("Période", validity),
                (
                    "Surface",
                    f"{_fr_num(doc.get('surface_ha'))} ha" if doc.get("surface_ha") else "—",
                ),
                ("Statut", CONVENTION_STATUS_LABEL.get(doc.get("status"), doc.get("status"))),
                ("Attestation de conformité", attestation),
            ]
        ),
    ]

    if doc.get("decision_motif"):
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Décision de l'administration", S_H2),
            Paragraph(_safe(doc["decision_motif"]), S_BODY),
        ]

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "L'attribution d'un titre d'exploitation forestière donne lieu à une "
                        "convention provisoire puis, à l'issue de la période probatoire, à une "
                        "convention définitive (Code forestier gabonais, Loi 016/01). L'attestation "
                        "de conformité est délivrée par l'administration lorsque les obligations de "
                        "la convention sont remplies."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Convention forestière")


def render_environmental_study_pdf(doc: dict, org_name: str | None = None) -> bytes:
    """PPF / EIE environmental study + certificat de conformité -> PDF.

    Materialises the environmental assessment attached to a forest title
    (Loi 016/01; Loi 007/2014): the Plan de Protection de la Faune (PPF,
    DGFAP) and the Étude d'Impact Environnemental (EIE, DGE), together with
    the certificat de conformité the administration issues on validation.
    """
    doc = doc or {}
    title_ref = doc.get("title_ref") or (f"#{doc.get('title_id')}" if doc.get("title_id") else None)
    validity = (
        " → ".join(
            p for p in (_fmt_date(doc.get("valid_from")), _fmt_date(doc.get("valid_to"))) if p
        )
        or "—"
    )
    if doc.get("certificate_ref"):
        issued = _fmt_date(doc.get("certificate_issued_at"))
        certificate = doc["certificate_ref"] + (f" — {issued}" if issued else "")
    else:
        certificate = "Non délivré"

    story: list = [
        Paragraph(
            _safe(STUDY_TYPE_LABEL.get(doc.get("study_type"), "Étude environnementale")),
            S_TITLE,
        ),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Opérateur", org_name or doc.get("org_name") or "—"),
                ("Titre", title_ref),
                ("Type", STUDY_TYPE_LABEL.get(doc.get("study_type"), doc.get("study_type"))),
                ("Autorité", doc.get("authority") or "—"),
                ("Référence", doc.get("reference") or "—"),
                ("Réalisée le", _fmt_date(doc.get("conducted_at")) or "—"),
                ("Validité", validity),
                ("Statut", STUDY_STATUS_LABEL.get(doc.get("status"), doc.get("status"))),
                ("Certificat de conformité", certificate),
            ]
        ),
    ]

    if doc.get("decision_motif"):
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Décision de l'administration", S_H2),
            Paragraph(_safe(doc["decision_motif"]), S_BODY),
        ]

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "Toute exploitation forestière est conditionnée à une évaluation "
                        "environnementale (Code forestier gabonais, Loi 016/01; Loi 007/2014). Le "
                        "Plan de Protection de la Faune (PPF) est une annexe du plan de gestion, "
                        "révisée tous les 5 ans, examinée par la Direction Générale de la Faune et "
                        "des Aires Protégées (DGFAP). L'Étude d'Impact Environnemental (EIE), d'une "
                        "validité annuelle, est instruite par la Direction Générale de "
                        "l'Environnement (DGE). Le certificat de conformité est délivré par "
                        "l'administration après validation de l'étude."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Étude environnementale")


SEVERITY_LABEL = {"hard": "Bloquant", "warning": "Avertissement"}
REVIEW_LABEL = {"ouverte": "Ouverte", "traitee": "Traitée", "ecartee": "Écartée"}


def render_anomalies_pdf(items: list[dict], summary: dict | None = None) -> bytes:
    """Ministry anomaly register -> branded A4 PDF."""
    items = items or []
    summary = summary or {}
    by_type = summary.get("by_type", []) or []

    story: list = [
        Paragraph("Registre des anomalies", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        _kv_table(
            [
                ("Anomalies détectées", str(summary.get("total", len(items)))),
                ("Bloquantes (illégal)", str(summary.get("hard", 0))),
                ("Avertissements", str(summary.get("warning", 0))),
                ("Non examinées", str(summary.get("ouvertes", 0))),
            ]
        ),
    ]

    if by_type:
        story += [
            Spacer(1, 4 * mm),
            Paragraph("Répartition par type", S_H2),
            _grid_table(
                ["Anomalie", "Gravité", "Nombre", "Ouvertes"],
                [
                    [
                        e.get("label") or e.get("type"),
                        SEVERITY_LABEL.get(e.get("severity"), "—"),
                        str(e.get("count", 0)),
                        str(e.get("ouvertes", 0)),
                    ]
                    for e in by_type
                ],
                widths=[None, 24 * mm, 20 * mm, 20 * mm],
            ),
        ]

    story += [Spacer(1, 4 * mm), Paragraph("Détail", S_H2)]
    if items:
        story.append(
            _grid_table(
                ["Gravité", "Sujet", "Détail", "Revue"],
                [
                    [
                        SEVERITY_LABEL.get(i.get("severity"), i.get("severity") or "—"),
                        i.get("subject") or i.get("subject_key"),
                        i.get("detail") or "—",
                        REVIEW_LABEL.get(i.get("review_status"), "—"),
                    ]
                    for i in items
                ],
                widths=[22 * mm, 32 * mm, None, 20 * mm],
            )
        )
    else:
        story.append(Paragraph("Aucune anomalie détectée sur le périmètre.", S_BODY))

    story += [
        Spacer(1, 5 * mm),
        KeepTogether(
            [
                Paragraph("Base légale", S_H2),
                Paragraph(
                    _safe(
                        "Contrôles dérivés du Code forestier gabonais (Loi 016/01) : "
                        "autorisation préalable d'abattage (art. 14), diamètre minimum "
                        "d'exploitation (art. 124), tenue du carnet de chantier (art. 275) et "
                        "régime des redevances (art. 283)."
                    ),
                    S_SMALL,
                ),
            ]
        ),
    ]
    return _build(story, "Registre des anomalies")


def _as_tonnes(kg: Any) -> float | None:
    try:
        return float(kg) / 1000.0
    except (TypeError, ValueError):
        return None


def render_dashboard_pdf(data: dict | None = None) -> bytes:
    """Ministry dashboard rollup -> branded A4 PDF."""
    data = data or {}
    harvest = data.get("harvest", {}) or {}
    by_species = harvest.get("by_species", []) or []
    harvest_status = harvest.get("by_status", {}) or {}
    titles = data.get("titles", {}) or {}
    aac = data.get("aac", {}) or {}
    documents = data.get("documents", {}) or {}
    taxes = data.get("taxes", {}) or {}
    community = data.get("community", {}) or {}
    transport = data.get("transport", {}) or {}
    certs = data.get("certifications", {}) or {}

    story: list = [
        Paragraph("Tableau de bord — Ministère", S_TITLE),
        Paragraph(_safe(TAGLINE), S_SUB),
        Spacer(1, 6 * mm),
        Paragraph("Exploitation", S_H2),
        _kv_table(
            [
                ("Arbres abattus", str(harvest.get("stems_felled", 0))),
                ("Volume estimé", _fr_num(harvest.get("estimated_volume_m3"), 3, " m³")),
                ("Taux de transformation", _pct(harvest.get("transformation_rate"))),
                (
                    "Répartition par statut",
                    " · ".join(f"{k} : {v}" for k, v in harvest_status.items()) or "—",
                ),
            ]
        ),
        Spacer(1, 4 * mm),
        Paragraph("Volumes par essence", S_H2),
    ]
    if by_species:
        story.append(
            _grid_table(
                ["Essence", "Arbres", "Volume estimé (m³)"],
                [
                    [s.get("species"), str(s.get("stems", 0)), _fr_num(s.get("volume_m3"), 3)]
                    for s in by_species
                ],
                widths=[None, 25 * mm, 40 * mm],
            )
        )
    else:
        story.append(Paragraph("Aucun arbre abattu enregistré.", S_BODY))

    story += [
        Spacer(1, 4 * mm),
        Paragraph("Gouvernance & fiscalité", S_H2),
        _kv_table(
            [
                ("Titres forestiers", str(titles.get("total", 0))),
                ("Surface titrée", _fr_num(titles.get("surface_ha"), 0, " ha")),
                ("AAC", str(aac.get("total", 0))),
                ("Possibilité AAC", _fr_num(aac.get("possibility_m3"), 0, " m³")),
                ("Documents", str(documents.get("total", 0))),
                ("Documents expirés", str(documents.get("expired", 0))),
                ("Documents expirant sous 90 j", str(documents.get("expiring_soon", 0))),
                ("Échéances en retard", str(taxes.get("overdue", 0))),
                ("Montant en retard", _fr_num(taxes.get("overdue_amount_fcfa"), 0, " FCFA")),
                ("Quittances réglées", str(taxes.get("receipts", 0))),
                ("CCC actifs", str(community.get("active", 0))),
                ("Contribution FDL", _fr_num(community.get("contribution_fcfa"), 0, " FCFA")),
                ("Volume CCC annuel", _fr_num(community.get("annual_volume_m3"), 0, " m³")),
                ("Documents de transport", str(transport.get("documents", 0))),
                ("Volume transporté", _fr_num(transport.get("volume_m3"), 3, " m³")),
                ("Certifications", str(certs.get("total", 0))),
            ]
        ),
    ]

    carbon = data.get("carbon", {}) or {}
    story += [
        Spacer(1, 4 * mm),
        Paragraph("Carbone vivant mesuré (scans)", S_H2),
        _kv_table(
            [
                ("Arbres mesurés", str(carbon.get("scans", 0))),
                ("dont référence ruban / compas", str(carbon.get("reference_scans", 0))),
                ("dont liés au registre (QR)", str(carbon.get("linked_scans", 0))),
                ("Stock mesuré", _fr_num(_as_tonnes(carbon.get("co2e_kg")), 2, " t CO2e")),
            ]
        ),
    ]
    if carbon.get("by_aac"):
        story.append(
            _grid_table(
                ["AAC", "Titre", "Scans", "t CO2e"],
                [
                    [
                        a.get("aac_label"),
                        a.get("title_ref"),
                        str(a.get("scans", 0)),
                        _fr_num(_as_tonnes(a.get("co2e_kg")), 2),
                    ]
                    for a in carbon["by_aac"]
                ],
                widths=[None, 40 * mm, 20 * mm, 30 * mm],
            )
        )
    return _build(story, "Tableau de bord")
