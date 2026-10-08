"""Génère la présentation institutionnelle (DOCX + schémas) du projet
Digital Forestry / Forêt Circulaire.

Usage (depuis backend-python) :
    .\\.venv\\Scripts\\python ..\\docs\\generate_presentation.py

Le document produit : docs/Digital_Forestry_Presentation_FR.docx
"""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from PIL import Image, ImageDraw, ImageFont

DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)
OUT = DOCS / "Digital_Forestry_Presentation_FR.docx"

# --------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------
FOREST_DARK = RGBColor(0x14, 0x4A, 0x1A)
FOREST = RGBColor(0x2E, 0x7D, 0x32)
FOREST_MID = RGBColor(0x38, 0x8E, 0x3C)
EARTH = RGBColor(0x6D, 0x4C, 0x41)
GOLD = RGBColor(0xB0, 0x7D, 0x0A)
INK = RGBColor(0x21, 0x21, 0x21)
GREY = RGBColor(0x5A, 0x5A, 0x5A)

HEX_DARK = "144A1A"
HEX_FOREST = "2E7D32"
HEX_LIGHT = "E8F5E9"
HEX_SAND = "F4EFE6"
HEX_GOLD = "FBF3DC"
HEX_GREY = "5A5A5A"

# Fonts for the diagrams
FONT_DIR = Path("C:/Windows/Fonts")
F_TITLE = FONT_DIR / "segoeuib.ttf"
F_BOLD = FONT_DIR / "segoeuib.ttf"
F_REG = FONT_DIR / "segoeui.ttf"


# ==========================================================================
#  Helpers — diagrams (Pillow)
# ==========================================================================
def _font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:  # pragma: no cover - font fallback
        return ImageFont.load_default()


def _center_text(draw, cx, y, text, font, fill):
    w = draw.textlength(text, font=font)
    draw.text((cx - w / 2, y), text, font=font, fill=fill)


def _wrap(text, font, max_w, draw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_residue_tree() -> Path:
    W, H = 1500, 900
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    ft = _font(F_BOLD, 40)
    fh = _font(F_BOLD, 26)
    fi = _font(F_REG, 22)

    # Root node
    d.rounded_rectangle([520, 40, 980, 130], radius=18, fill="#" + HEX_DARK)
    _center_text(d, 750, 62, "LES RÉSIDUS DE L'ARBRE", ft, "white")

    # Connector
    d.line([750, 130, 750, 190], fill="#" + HEX_DARK, width=5)
    d.line([190, 190, 1310, 190], fill="#" + HEX_DARK, width=5)

    cols = [
        ("PRIMAIRES", "Aériens", ["Houppiers", "Branches", "Feuilles"], "#2E7D32"),
        ("PRIMAIRES", "Souterrains", ["Souches", "Racines pivotantes"], "#388E3C"),
        ("SECONDAIRES", "Industriels", ["Sciure", "Écorces", "Délignures"], "#6D4C41"),
        ("TERTIAIRES", "Chimiques", ["Sève", "Résines", "Tanins"], "#B07D0A"),
    ]
    box_w, gap = 320, 30
    x0 = 80
    for i, (t1, t2, items, color) in enumerate(cols):
        bx0 = x0 + i * (box_w + gap)
        bx1 = bx0 + box_w
        d.line([(bx0 + bx1) / 2, 190, (bx0 + bx1) / 2, 240], fill="#" + HEX_DARK, width=5)
        d.rounded_rectangle([bx0, 240, bx1, 300], radius=14, fill=color)
        _center_text(d, (bx0 + bx1) / 2, 250, t1, fh, "white")
        _center_text(d, (bx0 + bx1) / 2, 350, t2, fi, "#" + HEX_DARK)
        y = 400
        d.rounded_rectangle([bx0, y, bx1, y + 40 + 46 * len(items)], radius=12,
                            outline=color, width=3)
        yy = y + 20
        for it in items:
            d.text((bx0 + 24, yy), "•  " + it, font=fi, fill="#212121")
            yy += 46

    # Footer note
    _center_text(d, W / 2, 800,
                 "Rien ne se perd : chaque fraction devient une matière première.",
                 _font(F_BOLD, 24), "#" + HEX_DARK)
    out = ASSETS / "residu_tree.png"
    img.save(out)
    return out


def draw_workflow() -> Path:
    W, H = 1600, 520
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    fn = _font(F_BOLD, 21)
    fd = _font(F_REG, 17)

    steps = [
        ("1. Capture", "3 photos + GPS\n(écorce, feuille,\nhabitat)"),
        ("2. Espèce", "Identification\npar IA"),
        ("3. Mesure", "Diamètre (DBH)\npar vision"),
        ("4. Contexte", "Sol, canopée,\ngéographie"),
        ("5. Âge", "Modèles de\ncroissance"),
        ("6. Rapport", "Fiche arbre\n+ récit"),
        ("7. Valorisation", "Plan circulaire\n+ coopérative"),
    ]
    box_w, gap = 195, 20
    total = len(steps) * box_w + (len(steps) - 1) * gap
    x0 = (W - total) / 2
    for i, (t, sub) in enumerate(steps):
        bx0 = x0 + i * (box_w + gap)
        bx1 = bx0 + box_w
        fill = "#" + HEX_DARK if i in (0, len(steps) - 1) else "#" + HEX_LIGHT
        tcol = "white" if i in (0, len(steps) - 1) else "#" + HEX_DARK
        d.rounded_rectangle([bx0, 150, bx1, 370], radius=16, fill=fill,
                            outline="#" + HEX_FOREST, width=2)
        _center_text(d, (bx0 + bx1) / 2, 172, t, fn, tcol)
        yy = 220
        for line in sub.split("\n"):
            _center_text(d, (bx0 + bx1) / 2, yy, line, fd,
                         "white" if i in (0, len(steps) - 1) else "#333333")
            yy += 30
        if i < len(steps) - 1:
            d.polygon([(bx1 + 3, 252), (bx1 + 15, 260), (bx1 + 3, 268)],
                      fill="#" + HEX_FOREST)
    _center_text(d, W / 2, 70, "LE PARCOURS D'UN SCAN, DE LA FORÊT À LA VALEUR",
                 _font(F_BOLD, 30), "#" + HEX_DARK)
    _center_text(d, W / 2, 440,
                 "Mobile → Backend scientifique → Base de connaissance (IA) → Plan d'action validé",
                 fd, "#" + HEX_GREY)
    out = ASSETS / "workflow.png"
    img.save(out)
    return out


def draw_synergy() -> Path:
    W, H = 1500, 760
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    ft = _font(F_BOLD, 30)
    fh = _font(F_BOLD, 24)
    fi = _font(F_REG, 19)

    # Left company
    d.rounded_rectangle([60, 200, 470, 560], radius=18, fill="#" + HEX_LIGHT,
                        outline="#" + HEX_FOREST, width=3)
    _center_text(d, 265, 230, "ENTREPRISE", fh, "#" + HEX_DARK)
    _center_text(d, 265, 262, "forestière", fi, "#" + HEX_GREY)
    for i, t in enumerate(["Gère la concession", "Produit les résidus",
                           "A besoin de conformité", "Veut réduire l'incendie"]):
        d.text((95, 320 + i * 48), "• " + t, font=fi, fill="#212121")

    # Right community
    d.rounded_rectangle([1030, 200, 1440, 560], radius=18, fill="#" + HEX_GOLD,
                        outline="#" + HEX_GOLD, width=3)
    _center_text(d, 1235, 230, "COMMUNAUTÉ", fh, "#" + HEX_DARK)
    _center_text(d, 1235, 262, "coopératives locales", fi, "#" + HEX_GREY)
    for i, t in enumerate(["Transforme la matière", "Crée de l'emploi",
                           "Détient le savoir-faire", "Garde la valeur locale"]):
        d.text((1065, 320 + i * 48), "• " + t, font=fi, fill="#212121")

    # Center
    d.rounded_rectangle([560, 250, 940, 520], radius=18, fill="#" + HEX_DARK)
    _center_text(d, 750, 285, "PLATEFORME", ft, "white")
    _center_text(d, 750, 330, "Digitale", ft, "white")
    for i, t in enumerate(["mesure • conseille", "trace • documente", "relie les acteurs"]):
        _center_text(d, 750, 400 + i * 34, t, fi, "#D9EFD9")

    # Arrows
    d.polygon([(575, 330), (505, 355), (575, 380)], fill="#" + HEX_FOREST)
    d.polygon([(925, 330), (995, 355), (925, 380)], fill="#" + HEX_GOLD)

    # Shared value banner
    d.rounded_rectangle([360, 630, 1140, 700], radius=16, fill="#" + HEX_FOREST)
    _center_text(d, 750, 648, "VALEUR PARTAGÉE  •  Gagnant-Gagnant  •  Zéro résidu brûlé",
                 _font(F_BOLD, 24), "white")

    _center_text(d, W / 2, 90, "LA SYNERGIE ENTREPRISE ↔ COMMUNAUTÉ", ft, "#" + HEX_DARK)
    out = ASSETS / "synergy.png"
    img.save(out)
    return out


# ==========================================================================
#  Helpers — DOCX
# ==========================================================================
def shade(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def para_border_bottom(p, color="2E7D32", size=12):
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    pbdr.append(bottom)
    pPr.append(pbdr)


def page_number_footer(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.text = ""
    run = p.add_run("Digital Forestry — Présentation institutionnelle   |   Page ")
    run.font.size = Pt(8)
    run.font.color.rgb = GREY
    _add_field(p, "PAGE")
    r2 = p.add_run(" / ")
    r2.font.size = Pt(8)
    r2.font.color.rgb = GREY
    _add_field(p, "NUMPAGES")


def _add_field(paragraph, instr):
    run = paragraph.add_run()
    run.font.size = Pt(8)
    run.font.color.rgb = GREY
    fld1 = OxmlElement("w:fldChar")
    fld1.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = instr
    fld2 = OxmlElement("w:fldChar")
    fld2.set(qn("w:fldCharType"), "end")
    run._r.append(fld1)
    run._r.append(it)
    run._r.append(fld2)


class Doc:
    def __init__(self):
        self.d = Document()
        self._setup()

    def _setup(self):
        sec = self.d.sections[0]
        sec.top_margin = Cm(2.2)
        sec.bottom_margin = Cm(2.0)
        sec.left_margin = Cm(2.3)
        sec.right_margin = Cm(2.3)
        normal = self.d.styles["Normal"]
        normal.font.name = "Calibri"
        normal.font.size = Pt(11)
        normal.font.color.rgb = INK
        normal.paragraph_format.space_after = Pt(6)
        normal.paragraph_format.line_spacing = 1.12
        for name, size, color in (
            ("Title", 34, FOREST_DARK),
            ("Heading 1", 19, FOREST_DARK),
            ("Heading 2", 14, FOREST),
            ("Heading 3", 12, EARTH),
        ):
            st = self.d.styles[name]
            st.font.name = "Calibri"
            st.font.size = Pt(size)
            st.font.color.rgb = color
            st.font.bold = True
        page_number_footer(sec)

    # ---- building blocks ----
    def h1(self, text):
        p = self.d.add_heading(text, level=1)
        p.paragraph_format.space_before = Pt(16)
        p.paragraph_format.space_after = Pt(8)
        para_border_bottom(p, HEX_FOREST, 10)
        return p

    def h2(self, text):
        p = self.d.add_heading(text, level=2)
        p.paragraph_format.space_before = Pt(12)
        return p

    def h3(self, text):
        p = self.d.add_heading(text, level=3)
        p.paragraph_format.space_before = Pt(8)
        return p

    def p(self, text="", bold=False, italic=False, size=11, color=None, align=None):
        p = self.d.add_paragraph()
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.size = Pt(size)
        if color is not None:
            run.font.color.rgb = color
        if align is not None:
            p.alignment = align
        return p

    def rich(self, parts):
        """parts: list of (text, bold, italic, color)"""
        p = self.d.add_paragraph()
        for text, bold, italic, color in parts:
            r = p.add_run(text)
            r.bold = bold
            r.italic = italic
            if color is not None:
                r.font.color.rgb = color
        return p

    def bullet(self, text, bold_lead=None):
        p = self.d.add_paragraph(style="List Bullet")
        if bold_lead:
            r = p.add_run(bold_lead)
            r.bold = True
            r.font.color.rgb = FOREST_DARK
        p.add_run(text)
        return p

    def numbered(self, text, bold_lead=None):
        p = self.d.add_paragraph(style="List Number")
        if bold_lead:
            r = p.add_run(bold_lead)
            r.bold = True
            r.font.color.rgb = FOREST_DARK
        p.add_run(text)
        return p

    def callout(self, title, text, fill=HEX_GOLD, border=HEX_GOLD):
        t = self.d.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = t.rows[0].cells[0]
        shade(cell, fill)
        para = cell.paragraphs[0]
        r = para.add_run(title + "  ")
        r.bold = True
        r.font.color.rgb = FOREST_DARK
        r.font.size = Pt(11)
        r2 = para.add_run(text)
        r2.font.size = Pt(10.5)
        self._set_table_borders(t, border)
        self.d.add_paragraph().paragraph_format.space_after = Pt(2)
        return t

    def table(self, headers, rows, widths=None, header_fill=HEX_DARK,
              zebra=True, font_size=10):
        t = self.d.add_table(rows=1, cols=len(headers))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        hdr = t.rows[0].cells
        for i, htext in enumerate(headers):
            shade(hdr[i], header_fill)
            para = hdr[i].paragraphs[0]
            run = para.add_run(htext)
            run.bold = True
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            run.font.size = Pt(font_size)
        for r_i, row in enumerate(rows):
            cells = t.add_row().cells
            for c_i, val in enumerate(row):
                if zebra and r_i % 2 == 1:
                    shade(cells[c_i], HEX_LIGHT)
                para = cells[c_i].paragraphs[0]
                run = para.add_run(str(val))
                run.font.size = Pt(font_size)
        if widths:
            for i, w in enumerate(widths):
                for row in t.rows:
                    row.cells[i].width = Cm(w)
        self._set_table_borders(t, "C8DCC8")
        self.d.add_paragraph().paragraph_format.space_after = Pt(2)
        return t

    def _set_table_borders(self, table, color):
        tbl = table._tbl
        tblPr = tbl.tblPr
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            el = OxmlElement(f"w:{edge}")
            el.set(qn("w:val"), "single")
            el.set(qn("w:sz"), "6")
            el.set(qn("w:space"), "0")
            el.set(qn("w:color"), color)
            borders.append(el)
        tblPr.append(borders)

    def image(self, path, width_cm=16.5):
        p = self.d.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(str(path), width=Cm(width_cm))
        return p

    def page_break(self):
        self.d.add_page_break()

    def caption(self, text):
        p = self.d.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(text)
        r.italic = True
        r.font.size = Pt(9)
        r.font.color.rgb = GREY
        return p


# ==========================================================================
#  Document content
# ==========================================================================
def build():
    print("Génération des schémas ...")
    img_tree = draw_residue_tree()
    img_flow = draw_workflow()
    img_synergy = draw_synergy()

    doc = Doc()
    d = doc.d
    d.core_properties.title = "Digital Forestry — Présentation institutionnelle"
    d.core_properties.author = "Projet Digital Forestry (Forêt Circulaire)"
    d.core_properties.subject = "Identification, mesure et valorisation circulaire des arbres"

    # ---------------------------------------------------------------- cover
    for _ in range(3):
        d.add_paragraph()
    t = d.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run("DIGITAL FORESTRY")
    r.bold = True
    r.font.size = Pt(46)
    r.font.color.rgb = FOREST_DARK

    st = d.add_paragraph()
    st.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = st.add_run("La Forêt Circulaire")
    r.bold = True
    r.font.size = Pt(24)
    r.font.color.rgb = FOREST

    sub = d.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run(
        "Système numérique intégré d'identification, de mesure et de "
        "valorisation circulaire des arbres"
    )
    r.italic = True
    r.font.size = Pt(14)
    r.font.color.rgb = EARTH

    d.add_paragraph()
    tag = d.add_paragraph()
    tag.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = tag.add_run("« Chaque arbre compte. Chaque résidu a une valeur. »")
    r.bold = True
    r.font.size = Pt(15)
    r.font.color.rgb = GOLD

    for _ in range(4):
        d.add_paragraph()
    for line in (
        "Document de présentation institutionnelle",
        "Projet pilote — Bassin du Congo / Gabon",
        "Destiné aux partenaires publics, environnementaux et communautaires",
        "Octobre 2026",
    ):
        pp = d.add_paragraph()
        pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rr = pp.add_run(line)
        rr.font.size = Pt(12)
        rr.font.color.rgb = GREY

    doc.page_break()

    # ---------------------------------------------------------------- TOC
    doc.h1("Sommaire")
    toc = [
        "1.  Résumé exécutif",
        "2.  La problématique : un potentiel gaspillé",
        "3.  Notre solution en un coup d'œil",
        "4.  Le parcours complet, étape par étape",
        "5.  Les fonctionnalités clés",
        "6.  La science derrière le système (expliquée simplement)",
        "7.  L'économie circulaire — le cœur du projet",
        "8.  La synergie Entreprise ↔ Communauté",
        "9.  Cadre légal, RSE et conformité",
        "10. L'intelligence artificielle et la base de connaissance",
        "11. Pourquoi ce projet est une innovation",
        "12. Impact environnemental et Objectifs de Développement Durable",
        "13. Perspectives et feuille de route",
        "14. Conclusion et appel à l'action",
        "Annexe — Glossaire pour non-spécialistes",
    ]
    for item in toc:
        doc.p(item, size=12)

    doc.page_break()

    # ---------------------------------------------------------------- 1
    doc.h1("1.  Résumé exécutif")
    doc.p(
        "Digital Forestry est une application mobile intelligente qui accompagne "
        "les acteurs de la filière bois du premier geste en forêt jusqu'à la "
        "création de richesse locale. Concrètement, un opérateur prend trois photos "
        "d'un arbre (écorce, feuille et contexte). En quelques instants, le système "
        "identifie l'espèce, mesure le diamètre du tronc, estime la hauteur et l'âge, "
        "puis calcule tout ce que l'arbre va laisser derrière lui après l'abattage : "
        "branches, écorces, feuilles, souches, racines et sciure."
    )
    doc.p(
        "La seconde force du projet est de transformer ces « déchets » en ressources. "
        "Pour chaque fraction de l'arbre, la plateforme recommande une voie de "
        "valorisation concrète (biochar, briquettes, mobilier artisanal, colles sans "
        "formaldéhyde, etc.), chiffre la matière disponible et propose la coopérative "
        "locale la plus proche capable de la transformer. Elle produit enfin un plan "
        "d'action « gagnant-gagnant » conforme au droit gabonais et aux standards "
        "internationaux (FSC, PEFC/PAFC, Accord de Paris)."
    )
    doc.callout(
        "En une phrase :",
        "Digital Forestry mesure scientifiquement chaque arbre, puis organise "
        "la réutilisation totale de ses résidus au bénéfice de l'entreprise, des "
        "communautés locales et du climat.",
    )
    doc.p(
        "Le projet repose sur trois piliers indissociables : (1) la rigueur "
        "scientifique (formules forestières internationalement reconnues) ; "
        "(2) l'intelligence artificielle et une base de connaissance documentée et "
        "sourcée ; (3) l'économie circulaire au service des communautés. Il ne s'agit "
        "pas d'un simple outil de mesure, mais d'un véritable chaînon entre la forêt, "
        "l'industrie et le développement local.",
        bold=False,
    )
    doc.rich([
        ("Ce document présente : ", False, False, None),
        ("le fonctionnement complet de l'application, la science utilisée, la "
         "logique de l'économie circulaire, la synergie entreprise-communauté, "
         "le cadre légal, la conformité des rapports générés et les raisons pour "
         "lesquelles ce projet constitue une avancée majeure pour le Gabon.",
         False, True, GREY),
    ])

    doc.page_break()

    # ---------------------------------------------------------------- 2
    doc.h1("2.  La problématique : un potentiel gaspillé")
    doc.p(
        "Lorsqu'un arbre est abattu, la partie qui part à la scierie ne représente "
        "qu'une fraction de la biomasse totale. Le reste — branches, écorces, "
        "feuillages, souches, racines, sciure — est le plus souvent laissé sur place, "
        "brûlé à l'air libre ou abandonné. Ce gaspillage a des conséquences "
        "environnementales, économiques et sociales bien documentées."
    )
    doc.h2("2.1  Un triple gaspillage")
    doc.bullet(
        "la matière noble (bois, écorce, racines) est perdue alors qu'elle "
        "pourrait nourrir des filières locales ;", bold_lead="Gaspillage matériel : ")
    doc.bullet(
        "les résidus laissés à l'air libre se décomposent et émettent du méthane "
        "(CH₄), un gaz à effet de serre bien plus puissant que le CO₂ ; les tas "
        "constituent aussi un risque d'incendie.", bold_lead="Gaspillage climatique : ")
    doc.bullet(
        "les communautés riveraines profitent peu de la richesse créée par "
        "l'exploitation, alors que la loi gabonaise impose leur implication.",
        bold_lead="Gaspillage social : ",
    )
    doc.h2("2.2  Des obligations difficiles à prouver")
    doc.p(
        "Les entreprises forestières sont soumises à de nombreuses exigences : "
        "exploitation à faible impact, transformation locale, développement des "
        "communautés, réduction des risques, certification. Or, documenter et prouver "
        "ces efforts de manière fiable reste complexe. La conformité repose souvent "
        "sur des tableaux manuels, difficiles à tracer et à auditer."
    )
    doc.h2("2.3  Un manque d'outils simples sur le terrain")
    doc.p(
        "Les technologies existantes de télédétection (satellites, drones, LiDAR) "
        "sont puissantes mais coûteuses, lourdes à déployer et peu adaptées à "
        "l'échelle de l'arbre individuel. Il manque un outil léger, accessible à un "
        "opérateur équipé d'un simple smartphone, capable de produire une donnée "
        "scientifique exploitable et une décision économique immédiate."
    )
    doc.callout(
        "Le constat :",
        "du bois utile brûle ou pourrit, des communautés restent à l'écart, et la "
        "conformité environnementale est difficile à démontrer. C'est exactement "
        "l'espace que comble Digital Forestry.",
        fill=HEX_SAND, border="B8860B",
    )

    doc.page_break()

    # ---------------------------------------------------------------- 3
    doc.h1("3.  Notre solution en un coup d'œil")
    doc.p(
        "Digital Forestry est une chaîne complète : un smartphone capte, un moteur "
        "scientifique calcule, une intelligence artificielle conseille, et un plan "
        "d'action relie l'entreprise aux communautés. Trois fonctions forment le "
        "système."
    )
    doc.h2("3.1  Pilier 1 — MESURER (la science)")
    doc.p(
        "À partir de trois photos, le système identifie l'espèce et mesure l'arbre. "
        "Il s'appuie sur des formules utilisées par les instituts forestiers "
        "internationaux pour estimer la biomasse, la hauteur et l'âge. L'objectif : "
        "obtenir, sans matériel lourd, une donnée fiable et traçable."
    )
    doc.h2("3.2  Pilier 2 — COMPRENDRE (l'intelligence artificielle)")
    doc.p(
        "Un moteur de connaissance interroge une base documentaire spécialisée "
        "(espèces, formules, protocoles de transformation, textes de loi). "
        "L'intelligence artificielle croise ces informations pour produire un rapport "
        "clair en français et un plan d'action adapté au contexte réel."
    )
    doc.h2("3.3  Pilier 3 — VALORISER (l'économie circulaire et les communautés)")
    doc.p(
        "Chaque fraction de l'arbre est associée à une voie de transformation et à "
        "une coopérative locale. Le résultat est un plan « gagnant-gagnant » qui crée "
        "de la valeur partagée tout en réduisant les émissions de gaz à effet de serre."
    )
    doc.callout(
        "À retenir :",
        "Digital Forestry ne se contente pas de dire ce qu'est un arbre ; il dit "
        "ce que l'on peut en faire, par qui, et à quel bénéfice pour tous.",
    )

    doc.page_break()

    # ---------------------------------------------------------------- 4
    doc.h1("4.  Le parcours complet, étape par étape")
    doc.p(
        "Prenons un opérateur en forêt. Voici, sans jargon, tout ce qui se passe "
        "depuis son geste jusqu'au plan final."
    )
    doc.image(img_flow, width_cm=16.5)
    doc.caption("Figure 1 — Le parcours d'un scan, de la forêt à la valeur.")

    doc.h3("Étape 1 — La capture sur le terrain")
    doc.p(
        "L'opérateur prend trois photos guidées de l'arbre : l'écorce (le tronc), "
        "une feuille, et le contexte environnant. Le téléphone enregistre sa position "
        "GPS. Si le téléphone le permet, la distance entre l'opérateur et le tronc "
        "est également mesurée (mesure de profondeur par réalité augmentée)."
    )
    doc.h3("Étape 2 — L'identification de l'espèce")
    doc.p(
        "Les photos d'écorce et de feuille sont analysées par un service de "
        "reconnaissance botanique. Le système propose l'espèce la plus probable avec "
        "un indice de confiance, puis vérifie que cette espèce est bien présente dans "
        "la région grâce à une base mondiale de biodiversité. C'est une double "
        "vérification qui limite les erreurs."
    )
    doc.h3("Étape 3 — La mesure du diamètre (DBH)")
    doc.p(
        "Le diamètre à hauteur de poitrine (1,30 m du sol, noté « DBH ») est la "
        "mesure clé en foresterie. À partir de la photo et de la distance connue, le "
        "système détermine la largeur du tronc en centimètres. Une technique de vision "
        "par ordinateur (détection de contour) isole le tronc du reste de l'image."
    )
    doc.h3("Étape 4 — Le contexte écologique")
    doc.p(
        "Deux informations environnementales sont récupérées automatiquement : le "
        "type de sol (via une base mondiale des sols) et la densité du couvert "
        "forestier, c'est-à-dire l'ombrage au-dessus de l'arbre. Ces éléments "
        "modulent l'estimation de la croissance."
    )
    doc.h3("Étape 5 — L'estimation de l'âge et de la hauteur")
    doc.p(
        "La hauteur est déduite du diamètre (relation hauteur-diamètre). L'âge est "
        "estimé par des modèles de croissance propres à chaque espèce. Pour l'Okoumé, "
        "espèce emblématique du Gabon, un modèle scientifique dédié (Engone Obiang "
        "2013) est utilisé en complément pour vérifier le résultat."
    )
    doc.h3("Étape 6 — Le rapport (fiche arbre)")
    doc.p(
        "Le système assemble une fiche complète : espèce, diamètre, hauteur, âge, "
        "état sanitaire apparent, type de sol et couvert forestier. Un commentaire de "
        "synthèse rédigé en français, chaleureux et professionnel, replace l'arbre "
        "dans son histoire écologique et climatique. Ce rapport est archivé avec sa "
        "position géographique."
    )
    doc.h3("Étape 7 — Le plan de valorisation circulaire")
    doc.p(
        "C'est le cœur du projet. À partir du diamètre et de l'espèce, le système "
        "quantifie chaque résidu (en kilogrammes et en mètres cubes), interroge la "
        "base de connaissance pour recommander des transformations concrètes, identifie "
        "la coopérative locale adaptée, et produit un plan « gagnant-gagnant » avec "
        "les bénéfices RSE, l'impact communautaire et le gain climatique."
    )

    doc.page_break()

    # ---------------------------------------------------------------- 5
    doc.h1("5.  Les fonctionnalités clés")
    doc.table(
        ["Fonction", "Ce qu'elle apporte", "Public concerné"],
        [
            ["Capture guidée 3 vues + GPS", "Données terrain fiables et standardisées", "Opérateurs, techniciens"],
            ["Identification d'espèce par IA", "Reconnaissance botanique + double vérification", "Tous"],
            ["Mesure automatique du diamètre", "Dendrométrie sans matériel lourd", "Foresters, inventaires"],
            ["Estimation âge & hauteur", "Lecture scientifique du peuplement", "Aménagistes, chercheurs"],
            ["Rapport forestier en français", "Document lisible et archivable", "Direction, administration"],
            ["Quantification des résidus", "Matière disponible chiffrée (kg, m³)", "Exploitants, coopératives"],
            ["Plan de valorisation circulaire", "Décisions concrètes de transformation", "Industriels, coopératives"],
            ["Appariement des coopératives", "Rapproche matière et savoir-faire locaux", "Communautés"],
            ["Bilan carbone évité", "Estimation du méthane évité (CO₂éq)", "Bailleurs, État, ONG"],
            ["Conformité légale et RSE", "Preuve traçable (loi 016/01, FSC, PAFC)", "Entreprises, certificateurs"],
        ],
        widths=[5.5, 7.0, 4.5],
    )

    doc.page_break()

    # ---------------------------------------------------------------- 6
    doc.h1("6.  La science derrière le système (expliquée simplement)")
    doc.p(
        "La crédibilité du projet repose sur des formules reconnues par la "
        "communauté scientifique internationale. Voici, traduites en mots simples, "
        "les principales briques de calcul."
    )
    doc.h2("6.1  La biomasse : les formules de Chave")
    doc.p(
        "Les formules dites « de Chave » (du nom du chercheur Jérôme Chave) sont la "
        "référence mondiale pour estimer la quantité de bois et de matière d'un arbre "
        "vivant. Elles relient le diamètre, la hauteur et la densité du bois à la masse "
        "sèche totale. Digital Forestry utilise les versions de 2005 et 2014 selon les "
        "informations disponibles."
    )
    doc.callout(
        "Exemple (Okoumé, 60 cm de diamètre) :",
        "biomasse aérienne ≈ 2 430 kg • biomasse souterraine ≈ 438 kg • masse totale "
        "≈ 2 870 kg. Ce sont ces chiffres qui alimentent toute la suite du calcul.",
    )
    doc.h2("6.2  La croissance et l'âge : le modèle de Chapman-Richards")
    doc.p(
        "Un arbre ne grandit pas à vitesse constante : jeune, il croît vite en "
        "diamètre, puis son rythme ralentit avec l'âge. La courbe de Chapman-Richards "
        "décrit cette progression en forme de « S ». En inversant la formule, on "
        "retrouve l'âge probable à partir du diamètre mesuré. La compétition pour la "
        "lumière (le couvert forestier) est prise en compte : dans une forêt dense, la "
        "croissance est ralentie."
    )
    doc.h2("6.3  Le modèle spécifique de l'Okoumé")
    doc.p(
        "L'Okoumé occupe une place particulière au Gabon. Un modèle scientifique "
        "dédié, issu de sept parcelles permanentes gabonaises et congolaises (Engone "
        "Obiang et al., 2013), est utilisé en vérification croisée. Il indique une "
        "croissance maximale d'environ 2,26 cm par an autour de 21 cm de diamètre."
    )
    doc.h2("6.4  La relation hauteur-diamètre")
    doc.p(
        "Faute de pouvoir mesurer la hauteur directement, on l'estime à partir du "
        "diamètre via une relation validée pour les forêts d'Afrique centrale. Un "
        "arbre de 60 cm de diamètre atteint typiquement environ 30 mètres de hauteur."
    )
    doc.h2("6.5  La densité du bois : une signature par espèce")
    doc.p(
        "Chaque essence a sa densité propre, qui influence directement sa masse. "
        "L'Okoumé est léger (0,44 g/cm³), l'Azobé est très lourd (1,06 g/cm³) : à "
        "diamètre égal, un Azobé contient donc plus du double de matière qu'un Okoumé. "
        "Le système intègre ces densités pour chaque espèce."
    )
    doc.table(
        ["Espèce (nom local)", "Densité (g/cm³)", "Croissance", "Statut UICN"],
        [
            ["Okoumé (Aucoumea klaineana)", "0,44", "Rapide", "Vulnérable"],
            ["Ozigo (Dacryodes glaucescens)", "0,47", "Modérée", "Préoccupation mineure"],
            ["Padouk (Pterocarpus soyauxii)", "0,75", "Modérée à rapide", "Préoccupation mineure"],
            ["Moabi (Baillonella toxisperma)", "0,83", "Lente", "En danger"],
            ["Azobé (Lophira alata)", "1,06", "Très lente", "Vulnérable"],
        ],
        widths=[6.0, 3.5, 3.5, 4.0],
    )
    doc.caption(
        "Tableau 1 — Cinq essences gabonaises modélisées, avec leurs paramètres "
        "scientifiques réels."
    )

    doc.page_break()

    # ---------------------------------------------------------------- 7
    doc.h1("7.  L'économie circulaire — le cœur du projet")
    doc.p(
        "L'économie circulaire repose sur un principe simple : dans la nature, rien "
        "ne se perd, tout se transforme. Appliqué à l'arbre abattu, cela signifie que "
        "chaque partie — jusqu'à la sciure et la sève — peut devenir une ressource. "
        "Digital Forestry organise cette transformation, fraction par fraction."
    )

    doc.h2("7.1  L'arbre des résidus")
    doc.p(
        "On distingue quatre grandes familles de résidus, selon leur origine et leur "
        "nature. Cette classification, au cœur du moteur d'économie circulaire, est "
        "présentée ci-dessous."
    )
    doc.image(img_tree, width_cm=16.5)
    doc.caption("Figure 2 — Les quatre familles de résidus de l'arbre.")

    doc.h2("7.2  Détail des résidus et de leur valeur")
    doc.h3("Résidus primaires aériens (houppier)")
    doc.bullet(
        "partie haute de l'arbre, souvent laissée au sol ; elles peuvent être "
        "tranchées pour l'outillage et l'ébénisterie, ou brûlées proprement pour "
        "produire du biochar.", bold_lead="Branches et houppiers : ")
    doc.bullet(
        "riches en éléments nutritifs, elles peuvent enrichir les sols (compost, "
        "paillage) ou servir de substrat.", bold_lead="Feuilles : ")
    doc.h3("Résidus primaires souterrains")
    doc.bullet(
        "souvent jetées, elles renferment des bois torsadés très recherchés en "
        "ébénisterie (mobilier de luxe, sculptures) après un séchage soigné.",
        bold_lead="Souches : ",
    )
    doc.bullet(
        "les racines pivotantes peuvent être macérées pour produire un extrait "
        "naturel utilisable en agroforesterie (biopesticide).",
        bold_lead="Racines : ",
    )
    doc.h3("Résidus secondaires industriels")
    doc.bullet(
        "elle peut devenir des panneaux d'isolation par culture de mycélium "
        "(champignon), ou être compressée en briquettes combustibles.",
        bold_lead="Sciure : ",
    )
    doc.bullet(
        "riches en tanins, elles permettent de fabriquer des colles sans "
        "formaldéhyde pour le contreplaqué — une avancée sanitaire et écologique.",
        bold_lead="Écorces : ",
    )
    doc.bullet(
        "issues du sciage, elles se réutilisent en petites pièces, "
        "panneaux ou combustible.", bold_lead="Délignures : ",
    )
    doc.h3("Résidus tertiaires chimiques")
    doc.bullet("sève, résines et tanins sont des matières à haute valeur.", bold_lead="")
    doc.p(
        "Familles présentes dans la base de connaissance du système : branches, "
        "écorces, racines, feuillages, souches et sciure. Chaque fraction est "
        "reliée à un ou plusieurs protocoles de transformation documentés.",
        italic=True, color=GREY, size=10,
    )

    doc.h2("7.3  Les filières de transformation")
    doc.p(
        "Le système ne se contente pas de nommer un résidu : il propose un procédé "
        "technique précis, issu d'un protocole documenté et sourcé."
    )
    doc.table(
        ["Résidu", "Procédé de valorisation", "Produit obtenu"],
        [
            ["Branches fines (<10 cm)", "Pyrolyse TLUD (450–550 °C)", "Biochar pour sols acides"],
            ["Branches / sciure", "Pressage + liant (amidon de manioc)", "Briquettes de cuisson écologiques"],
            ["Branches épaisses (>15 cm)", "Sciage mobile (scierie à ruban)", "Planches, bois d'œuvre"],
            ["Écorces", "Extraction à l'eau chaude + Na₂CO₃", "Tanins → colles sans formaldéhyde"],
            ["Sciure + feuilles", "Culture de mycélium (Pleurote, Ganoderma)", "Panneaux isolants compostables"],
            ["Souches", "Séchage naturel 12–18 mois", "Mobilier d'art, sculptures, loupes"],
            ["Racines", "Macération / extraction", "Extraits naturels (agroforesterie)"],
        ],
        widths=[5.0, 6.5, 5.5],
    )
    doc.caption("Tableau 2 — Les filières de transformation par type de résidu.")

    doc.h2("7.4  Étude de cas chiffrée : un Okoumé de 62,5 cm")
    doc.p(
        "Prenons un arbre réel analysé par le système. Voici les quantités que le "
        "moteur calcule automatiquement (hauteur ≈ 29,9 m) :"
    )
    doc.table(
        ["Fraction", "Quantité"],
        [
            ["Branches fines (<10 cm) — biochar / briquettes", "399,5 kg"],
            ["Branches épaisses (>15 cm) — sciage mobile", "266,3 kg"],
            ["Écorces — tanins / colles bio", "141,5 kg"],
            ["Feuilles — compost / substrat", "106,5 kg"],
            ["Souche — mobilier d'art (volume)", "0,38 m³"],
            ["Racines — extraits naturels", "311,6 kg"],
            ["Sciure — panneaux / briquettes (volume)", "0,38 m³"],
            ["TOTAL des résidus valorisables", "≈ 1 562 kg"],
        ],
        widths=[11.0, 5.0],
    )
    doc.callout(
        "Ce que cela signifie :",
        "sur un seul arbre, près de 1,5 tonne de matière (hors tronc commercial) "
        "n'est plus un déchet mais une matière première. À l'échelle d'une concession, "
        "ces volumes deviennent une véritable filière industrielle locale.",
    )
    doc.p(
        "Le système estime aussi le bénéfice climatique : éviter la décomposition "
        "de ces résidus à l'air libre représente environ 2 187 kg d'équivalent CO₂ "
        "économisés pour cet unique arbre (voir section 12).",
    )

    doc.h2("7.5  La matrice espèce × résidu")
    doc.p(
        "Toutes les essences ne se valent pas : un Azobé, très dense, fournit plus "
        "de matière à l'hectare qu'un Okoumé. Le moteur adapte ses calculs à chaque "
        "espèce. Voici les masses calculées pour des arbres de 60 cm de diamètre :"
    )
    doc.table(
        ["Espèce (60 cm)", "Branches fines", "Branches épaisses", "Écorces", "Feuilles",
         "Souche", "Racines", "TOTAL résidus"],
        [
            ["Okoumé", "365 kg", "243 kg", "129 kg", "97 kg", "153 kg", "285 kg", "1 426 kg"],
            ["Ozigo", "389 kg", "259 kg", "138 kg", "104 kg", "163 kg", "304 kg", "1 521 kg"],
            ["Padouk", "614 kg", "409 kg", "220 kg", "164 kg", "258 kg", "479 kg", "2 405 kg"],
            ["Moabi", "678 kg", "452 kg", "243 kg", "181 kg", "285 kg", "529 kg", "2 657 kg"],
            ["Azobé", "861 kg", "574 kg", "311 kg", "230 kg", "362 kg", "671 kg", "3 377 kg"],
        ],
        widths=[2.4, 2.1, 2.4, 1.7, 1.7, 1.7, 1.8, 2.4],
        font_size=8.5,
    )
    doc.caption(
        "Tableau 3 — Résidus valorisables par espèce (arbres de 60 cm, calculs réels "
        "du moteur). L'Azobé, bois très lourd, génère près de 2,4 fois plus de matière "
        "que l'Okoumé."
    )

    doc.h2("7.6  Le carbone évité : un bénéfice mesurable")
    doc.p(
        "Lorsque des résidus humides restent au sol, leur décomposition libère du "
        "méthane. En les détournant vers des produits stables (biochar, mobilier séché, "
        "panneaux), on évite ces émissions. Le système applique une méthode "
        "scientifique reconnue (facteur d'émission de 0,05 kg de CH₄ par kg de matière "
        "sèche, converti avec un potentiel de réchauffement de 28) pour chiffrer le "
        "CO₂ équivalent évité."
    )

    doc.page_break()

    # ---------------------------------------------------------------- 8
    doc.h1("8.  La synergie Entreprise ↔ Communauté")
    doc.p(
        "Le véritable moteur du projet n'est pas seulement technique : c'est un "
        "modèle social. L'entreprise forestière dispose de la matière ; les "
        "communautés locales disposent du savoir-faire et du temps. Reliées par la "
        "plateforme, elles créent ensemble une valeur qui profite à tous."
    )
    doc.image(img_synergy, width_cm=16.5)
    doc.caption("Figure 3 — La synergie entreprise-communauté au cœur du modèle.")

    doc.h2("8.1  Ce que gagne l'entreprise")
    doc.bullet(
        "valoriser des résidus autrefois brûlés renforce ses engagements et sa "
        "certification.", bold_lead="Conformité et RSE : ")
    doc.bullet(
        "la démonstration concrète du développement communautaire exigé par la "
        "loi 016/01 (article 251).", bold_lead="Preuve documentée : ")
    doc.bullet(
        "nettoyer la parcelle réduit la charge de combustible et donc le risque "
        "d'incendie.", bold_lead="Réduction du risque : ")
    doc.bullet(
        "image responsable, relations apaisées avec les riverains, accès "
        "facilité aux marchés certifiés.", bold_lead="Image et acceptabilité : ")

    doc.h2("8.2  Ce que gagnent les communautés")
    doc.bullet("transformation des résidus en produits vendables (biochar, briquettes, mobilier).", bold_lead="Emplois et revenus : ")
    doc.bullet("maîtrise de techniques à forte valeur (pyrolyse, vision mycélium, extraction de tanins).", bold_lead="Compétences : ")
    doc.bullet("la richesse reste dans le territoire, au lieu de partir avec les grumes.", bold_lead="Valeur locale : ")
    doc.callout(
        "Le principe gagnant-gagnant :",
        "l'entreprise transforme une contrainte (gérer ses résidus) en atout (RSE et "
        "conformité) ; la communauté transforme une matière gratuite en revenus. "
        "Personne ne perd, la forêt y gagne.",
        fill=HEX_LIGHT, border=HEX_FOREST,
    )

    doc.h2("8.3  Les quatre profils de coopératives")
    doc.p(
        "La plateforme reconnaît quatre métiers complémentaires et oriente chaque "
        "lot de résidus vers le bon partenaire :"
    )
    doc.table(
        ["Profil de coopérative", "Spécialité", "Résidu privilégié"],
        [
            ["Biochar agricole", "Amendement des sols acides", "Branches fines, ramilles"],
            ["Briquettes énergie", "Combustible de cuisson écologique", "Sciure, déchets de coupe"],
            ["Mobilier artisanal", "Ébénisterie, sculpture, loupes", "Souches, branches épaisses"],
            ["Extraction biochimique", "Tanins, colles, extraits", "Écorces, racines"],
        ],
        widths=[5.0, 6.0, 6.0],
    )
    doc.p(
        "Un réseau de coopératives gabonaises est déjà intégré au système "
        "(Libreville, Port-Gentil, Franceville, Lambaréné, Mouila, Koulamoutou). "
        "La plateforme calcule automatiquement la coopérative la plus proche dans un "
        "rayon de 15 km (élargi si nécessaire) et estime le bénéfice économique local.",
        italic=True, color=GREY, size=10,
    )

    doc.page_break()

    # ---------------------------------------------------------------- 9
    doc.h1("9.  Cadre légal, RSE et conformité")
    doc.p(
        "Digital Forestry n'invente pas ses obligations : il s'appuie sur des textes "
        "existants et les traduit en actions concrètes et traçables. Chaque plan "
        "généré cite et met en correspondance le cadre juridique applicable."
    )
    doc.h2("9.1  Le Code forestier gabonais — Loi n° 016/01")
    doc.bullet(
        "exploitation à faible impact (EFIR) : inventaires avant abattage, "
        "planification des pistes, abattage directionnel pour limiter les dégâts.",
        bold_lead="Article 21 — ",
    )
    doc.bullet(
        "priorité à la transformation locale du bois sur le territoire national.",
        bold_lead="Article 22 — ",
    )
    doc.bullet(
        "développement des communautés riveraines : emploi local, "
        "coopératives, partage des bénéfices.", bold_lead="Article 251 — ",
    )
    doc.p(
        "Le projet prolonge directement ces articles : détourner les résidus vers les "
        "coopératives démontre l'application de l'article 251 et soutient la "
        "transformation locale de l'article 22."
    )
    doc.h2("9.2  FSC — Principes 3 et 4")
    doc.p(
        "Le Forest Stewardship Council impose le respect des droits des peuples "
        "autochtones et des communautés (Principe 3) et des relations communautaires "
        "équitables (Principe 4). La traçabilité fournie par la plateforme peut "
        "alimenter une certification de groupe, y compris pour les sous-produits "
        "(copeaux, écorces)."
    )
    doc.h2("9.3  PEFC / PAFC")
    doc.p(
        "PAFC est le référentiel africain du PEFC. Il exige la gestion durable des "
        "résidus (pas de brûlage à l'air libre), la contribution à l'emploi local et "
        "une chaîne de traçabilité pour les sous-produits. Les briquettes et le biochar "
        "issus de matière certifiée peuvent porter ce label."
    )
    doc.h2("9.4  Accord de Paris — Article 6")
    doc.p(
        "L'article 6 encadre les mécanismes de coopération climatique. En évitant le "
        "méthane issu des résidus, le projet contribue à des réductions d'émissions "
        "vérifiables. La stabilité du carbone du biochar (50 à 80 % du carbone retenu "
        "au-delà de 100 ans) peut générer des crédits carbone, sous réserve "
        "d'autorisation par l'État gabonais."
    )
    doc.h2("9.5  La conformité du rapport généré")
    doc.p(
        "Chaque rapport produit par la plateforme contient une section de conformité "
        "explicite, qui relie automatiquement les actions recommandées aux textes "
        "applicables. Le rapport répond aux exigences des bailleurs internationaux, "
        "notamment la directive de reporting climat extra-financier et le standard "
        "IPCC de niveau 2 (marge d'erreur de 25 % appliquée aux estimations de "
        "biomasse à l'échelle de la parcelle)."
    )

    doc.page_break()

    # ---------------------------------------------------------------- 10
    doc.h1("10.  L'intelligence artificielle et la base de connaissance")
    doc.p(
        "Un point souvent mal compris : l'intelligence artificielle du projet "
        "n'invente rien. Elle s'appuie sur une base documentaire fermée, vérifiée et "
        "sourcée. Cette technique s'appelle le RAG — pour « génération assistée par "
        "récupération d'information »."
    )
    doc.h2("10.1  Qu'est-ce que le RAG, simplement ?")
    doc.p(
        "Imaginez un expert qui, avant de répondre, consulte systématiquement sa "
        "bibliothèque. Le RAG fait exactement cela : le système recherche d'abord les "
        "documents pertinents dans sa base de connaissance, puis il rédige une réponse "
        "en s'appuyant sur ces documents. Résultat : des réponses fondées, traçables "
        "et cohérentes, et non des approximations."
    )
    doc.callout(
        "Garantie de fiabilité :",
        "chaque affirmation du plan de valorisation s'appuie sur un document sourcé "
        "(publication scientifique, protocole technique ou texte de loi). La source "
        "est conservée pour l'audit.",
    )

    doc.h2("10.2  Que contient la base de connaissance ?")
    doc.p(
        "La base couvre l'ensemble de la chaîne : l'écologie des espèces, les "
        "formules de calcul, les protocoles de transformation industrielle et les "
        "cadres juridiques. Voici sa composition actuelle :"
    )
    doc.table(
        ["Domaine", "Contenu", "Exemples"],
        [
            ["Espèces", "Fiches botaniques et technologiques complètes",
             "Okoumé, Azobé, Padouk, Ozigo, Moabi"],
            ["Formules", "Modèles de biomasse, croissance, hauteur, sciure",
             "Chave 2005 & 2014, Chapman-Richards, Engone Obiang 2013"],
            ["Protocoles", "Procédés de transformation des résidus",
             "Pyrolyse TLUD, mycélium, tanins, sciage mobile, séchage souches"],
            ["Cadre légal", "Textes et référentiels de conformité",
             "Loi 016/01 (art. 21, 22, 251), FSC P3-P4, PAFC, Accord de Paris art. 6"],
        ],
        widths=[3.2, 6.3, 7.0],
    )
    doc.caption(
        "Tableau 4 — Composition de la base de connaissance (documents indexés et "
        "sourcés)."
    )

    doc.h2("10.3  Les outils mobilisés (sans jargon)")
    doc.table(
        ["Fonction", "Rôle", "Nature"],
        [
            ["Reconnaissance botanique", "Identifier l'espèce depuis une photo", "Service spécialisé international"],
            ["Base mondiale de biodiversité", "Vérifier la présence régionale de l'espèce", "Données publiques scientifiques"],
            ["Base mondiale des sols", "Connaître le type de sol", "Données publiques scientifiques"],
            ["Suivi du couvert forestier", "Mesurer l'ombrage et la densité", "Données satellitaires"],
            ["Moteur de connaissance (IA)", "Chercher et raisonner sur la base documentaire", "Recherche d'information + génération"],
            ["Modèles de langage", "Rédiger les rapports en français", "Intelligence artificielle génératrice"],
        ],
        widths=[4.5, 6.5, 6.0],
    )

    doc.h2("10.4  Pourquoi est-ce fiable et complet ?")
    doc.bullet("chaque information est reliée à sa source, consultable pour audit.", bold_lead="Traçabilité : ")
    doc.bullet("la base est multilingue (français et anglais) et interrogeable dans les deux langues.", bold_lead="Multilingue : ")
    doc.bullet("les modèles scientifiques (Chave, Chapman-Richards, Engone Obiang) sont ceux des instituts de recherche.", bold_lead="Ancrage scientifique : ")
    doc.bullet("la base est conçue pour s'enrichir : nouvelles espèces, nouveaux protocoles, nouveaux textes.", bold_lead="Extensibilité : ")

    doc.page_break()

    # ---------------------------------------------------------------- 11
    doc.h1("11.  Pourquoi ce projet est une innovation")
    doc.p(
        "De nombreuses solutions existent séparément : des applications "
        "d'identification de plantes, des logiciels de calcul de biomasse, des "
        "plateformes de certification. Digital Forestry est, à notre connaissance, "
        "la première à les réunir dans une chaîne unique allant de l'arbre individuel "
        "à la valeur communautaire."
    )
    doc.table(
        ["Approche classique", "Digital Forestry"],
        [
            ["Mesure manuelle, lente, dépendante de l'opérateur", "Mesure assistée par vision, standardisée"],
            ["Identification approximative", "Identification IA + double vérification géographique"],
            ["Résidus non quantifiés", "Quantification fine par fraction (kg, m³)"],
            ["Valorisation non documentée", "Protocoles sourcés par résidu"],
            ["RSE déclarative", "RSE prouvée et traçable"],
            ["Communautés évoquées", "Coopératives concrètement impliquées et localisées"],
            ["Bilan carbone absent", "Méthane évité chiffré (CO₂éq)"],
            ["Outil spécialisé, complexe", "Smartphone simple, pour le terrain"],
        ],
        widths=[7.5, 8.5],
    )
    doc.h2("11.1  Sept innovations clés")
    doc.numbered("faire dialoguer identification botanique, mesure et urgence climatique dans un seul geste de terrain.", bold_lead="La fusion : ")
    doc.numbered("chaque fraction de résidu devient une décision économique, pas une statistique.", bold_lead="L'économie circulaire opérationnelle : ")
    doc.numbered("l'IA raisonne sur des documents vérifiables, pas sur des probabilités floues.", bold_lead="La connaissance sourcée (RAG) : ")
    doc.numbered("l'entreprise et la communauté sont reliées par la donnée.", bold_lead="Le lien social : ")
    doc.numbered("le plan généré est opposable aux auditeurs et aux bailleurs.", bold_lead="La conformité prouvée : ")
    doc.numbered("de quelques arbres à toute une concession, le système suit.", bold_lead="La scalabilité : ")
    doc.numbered("pensé pour le Gabon et le Bassin du Congo, mais adaptable à toute forêt tropicale.", bold_lead="L'ancrage local : ")

    doc.page_break()

    # ---------------------------------------------------------------- 12
    doc.h1("12.  Impact environnemental et Objectifs de Développement Durable")
    doc.p(
        "Le projet s'aligne naturellement sur plusieurs Objectifs de Développement "
        "Durable (ODD) des Nations unies, ce qui facilite son financement par les "
        "bailleurs internationaux et son intégration dans les politiques publiques."
    )
    doc.table(
        ["Objectif de Développement Durable", "Contribution du projet"],
        [
            ["ODD 8 — Travail décent et croissance", "Création d'emplois locaux via les coopératives"],
            ["ODD 12 — Consommation et production responsables", "Valorisation intégrale de la matière"],
            ["ODD 13 — Lutte contre le changement climatique", "Méthane évité, produits à longue durée de vie"],
            ["ODD 15 — Vie terrestre", "Meilleure connaissance et gestion des forêts"],
            ["ODD 1 — Pauvreté", "Revenus pour les communautés riveraines"],
            ["ODD 9 — Industrie et innovation", "Filières locales de transformation (biochar, panneaux)"],
        ],
        widths=[7.5, 8.5],
    )
    doc.h2("12.1  Le bénéfice climat, chiffré")
    doc.callout(
        "Exemple concret :",
        "pour un seul Okoumé de 62,5 cm, le système estime environ 2 187 kg de CO₂ "
        "équivalent évités. Rapporté à des milliers d'arbres, l'effet devient "
        "significatif à l'échelle nationale — tout en créant de la valeur locale.",
    )

    doc.page_break()

    # ---------------------------------------------------------------- 13
    doc.h1("13.  Perspectives et feuille de route")
    doc.p(
        "Le système fonctionne déjà de bout en bout sur cinq essences et l'ensemble "
        "des filières de résidus. Sa conception modulaire permet de l'étendre "
        "rapidement."
    )
    doc.h2("13.1  Court terme")
    doc.bullet("élargir la base de connaissance à davantage d'espèces gabonaises.")
    doc.bullet("enrichir les protocoles (nouvelles voies de valorisation, nouveaux liants biosourcés).")
    doc.bullet("intégrer le suivi de la collecte et de la transformation par les coopératives.")
    doc.h2("13.2  Moyen terme")
    doc.bullet("connexion aux registres carbone pour valoriser les crédits issus du biochar.")
    doc.bullet("tableaux de bord pour les administrations et les bailleurs.")
    doc.bullet("déploiement de coopératives pilotes sur le terrain avec accompagnement à l'usage.")
    doc.h2("13.3  Long terme")
    doc.bullet("extension au Bassin du Congo et à d'autres forêts tropicales.")
    doc.bullet("standardisation des rapports pour un usage réglementaire national.")

    # ---------------------------------------------------------------- 14
    doc.h1("14.  Conclusion et appel à l'action")
    doc.p(
        "Digital Forestry transforme un constat simple — la forêt gaspille ce "
        "qu'elle pourrait offrir — en une opportunité concrète : mesurer chaque arbre "
        "avec rigueur, valoriser chaque résidu avec intelligence, et faire profiter "
        "les communautés de la richesse créée."
    )
    doc.p(
        "C'est une solution à la croisée de la science, de la technologie, de "
        "l'économie circulaire et de la justice sociale. Elle répond directement aux "
        "attentes du Gabon et des bailleurs internationaux en matière de gestion "
        "durable, de transparence, de développement communautaire et de climat."
    )
    doc.callout(
        "Notre proposition :",
        "accompagner un pilote officiel sur une concession pilote, mesurer les "
        "résultats sur le terrain, et documenter l'impact environnemental, économique "
        "et social — pour bâtir, ensemble, la première filière forestière réellement "
        "circulaire du Bassin du Congo.",
        fill=HEX_LIGHT, border=HEX_FOREST,
    )
    doc.p("« Chaque arbre compte. Chaque résidu a une valeur. »", bold=True,
          align=WD_ALIGN_PARAGRAPH.CENTER, size=14, color=GOLD)

    doc.page_break()

    # ---------------------------------------------------------------- annexe
    doc.h1("Annexe — Glossaire pour non-spécialistes")
    gloss = [
        ("Biomasse", "La masse totale de matière vivante (ici, le bois et les tissus d'un arbre)."),
        ("DBH", "« Diameter at Breast Height » : diamètre du tronc mesuré à 1,30 m du sol."),
        ("Dendrométrie", "La science de mesurer les arbres (diamètre, hauteur, volume)."),
        ("Allométrie", "Relation mathématique entre les dimensions d'un arbre et sa masse."),
        ("Économie circulaire", "Modèle où les déchets d'un procédé deviennent les ressources d'un autre."),
        ("Biochar", "Charbon végétal produit par combustion contrôlée, utilisé pour enrichir les sols et stocker le carbone."),
        ("Pyrolyse TLUD", "Technique de combustion propre produisant du charbon végétal avec très peu de fumée."),
        ("Tanins", "Substances naturelles des écorces permettant de fabriquer des colles sans produits toxiques."),
        ("Mycélium", "Le « réseau » du champignon, utilisé pour lier la sciure en panneaux compostables."),
        ("RSE", "Responsabilité Sociétale des Entreprises : engagements environnementaux et sociaux volontaires."),
        ("FSC / PEFC / PAFC", "Systèmes internationaux de certification de la gestion durable des forêts."),
        ("RAG", "Technique d'IA qui répond en s'appuyant sur une base documentaire vérifiée."),
        ("GES / CO₂éq", "Gaz à effet de serre ; on exprime leur pouvoir de réchauffement en équivalent CO₂."),
        ("Méthane (CH₄)", "Gaz à effet de serre puissant émis par la décomposition des matières organiques."),
        ("EFIR", "Exploitation Forestière à Impact Réduit : pratiques limitant les dégâts en forêt."),
    ]
    doc.table(["Terme", "Définition simple"], gloss, widths=[4.5, 11.5])

    doc.p()
    doc.p(
        "Sources scientifiques et réglementaires principales : Chave et al. (2005, "
        "2014) ; Engone Obiang et al. (2013) ; Petter et al. (2016) ; loi gabonaise "
        "n° 016/01 ; FSC Principes 3-4 ; PEFC/PAFC ; Accord de Paris, article 6 ; "
        "IPCC (AR5).",
        italic=True, size=9, color=GREY,
    )

    d.save(OUT)
    print("Écrit :", OUT)


if __name__ == "__main__":
    build()
