// Builder — Guide visuel du workflow forestier (Gabon)
// Source unique de vérité : données ci-dessous -> HTML -> PDF (Edge).
// Usage : node build.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_HTML = resolve(HERE, "..", "VISUEL_WORKFLOW_MINISTERE.html");
const NB = 12;

// ---------------------------------------------------------------- D2 -> SVG inline
function inlineSvg(file, prefix, height) {
  if (!existsSync(file)) throw new Error("SVG manquant : " + file);
  let s = readFileSync(file, "utf8").trim();
  const vb = s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (vb) {
    s = s.replace(/<svg/, `<svg width="${vb[1]}" height="${vb[2]}"`);
  }
  // préfixe les ids pour éviter les collisions entre plusieurs SVG
  s = s
    .replace(/id="([^"]+)"/g, (_, a) => `id="${prefix}-${a}"`)
    .replace(/url\(#([^)"']+)\)/g, (_, a) => `url(#${prefix}-${a})`)
    .replace(/xlink:href="#([^"]+)"/g, (_, a) => `xlink:href="#${prefix}-${a}"`)
    .replace(/href="#([^"]+)"/g, (_, a) => `href="#${prefix}-${a}"`);
  return `<div class="d2wrap" style="height:${height}">${s}</div>`;
}
const svgAutOpProd = inlineSvg(resolve(HERE, "autorites-op-produit.svg"), "aop", "150mm");
const svgAutAmen = inlineSvg(resolve(HERE, "autorites-amenagement.svg"), "aam", "148mm");
const svgTerritoire = inlineSvg(resolve(HERE, "territoire.svg"), "ter", "104mm");
const svgTracabilite = inlineSvg(resolve(HERE, "tracabilite.svg"), "tra", "104mm");

// Sceau de la République (repris de l'écran de connexion) — embarqué en base64
const SEAL_FILE = resolve(HERE, "..", "..", "mobile", "assets", "leaf_logo.jpg");
const SEAL = existsSync(SEAL_FILE) ? `data:image/jpeg;base64,${readFileSync(SEAL_FILE).toString("base64")}` : "";

// ---------------------------------------------------------------- Données
const WORKFLOW = [
  ["Demande l'agrément professionnel", "Délivre l'agrément", "DGF + DGICBVPF", "art. 102", "clip"],
  ["Demande d'exploration + inventaire", "Autorise l'exploration (≤ 12 mois)", "DGF / Direction Provinciale", "", "search"],
  ["Dépose le projet CPAET", "Signature de la convention provisoire (≤ 3 ans)", "MEFME / DGF", "art. 106–109", "doc"],
  ["Plan d'aménagement + plan d'industrialisation", "Avis comité → agrément → décret", "Ministre / DGF", "art. 20–26", "map"],
  ["Inventaire d'exploitation, PAO, CCC", "Approuve → autorise l'exploiter", "Direction Provinciale", "art. 45 / 121", "shield"],
  ["Marque les arbres (marteau + code)", "Contrôle le marquage", "Direction Provinciale / Cantonnement", "art. 130–133", "hammer"],
  ["Déclare l'abattage (≥ DME, GPS)", "Approuve / rejette la déclaration", "Direction Provinciale", "", "tree"],
  ["Carnet de chantier DF10 (alimenté auto)", "Vise le carnet", "Direction Provinciale / Cantonnement", "art. 49", "clip"],
  ["Émet bordereau / feuille de route", "Contrôle en route", "Autorité forestière provinciale", "art. 135", "truck"],
  ["Transforme (registre entrées / sorties)", "Contrôle la transformation", "DGICBVPF", "", "factory"],
  ["États annuels (31 mars) + taxes", "Contrôle", "DGF · DGI · Douanes", "art. 244", "coin"],
];

const REFERENTIEL = [
  {
    titre: "① Niveau entreprise — agrément · fiscalité · industrie",
    cls: "t-ent",
    rows: [
      ["Agrément professionnel", "DGF / DGICBVPF", "—", "art. 102"],
      ["Quittance taxe de superficie (400 F CFA/ha, ≤ 31 mars)", "DGI", "Annuelle", "art. 244"],
      ["Certificat de conformité du Plan d'Industrialisation (PI)", "DGICBVPF", "—", "art. 23 / 226"],
      ["Certificat de conformité du Plan de Développement Industriel (PDI)", "DGICBVPF", "—", "art. 226"],
    ],
  },
  {
    titre: "② Niveau unité d'aménagement (UFA / AAC)",
    cls: "t-ufa",
    rows: [
      ["Autorisation de mise en exploitation (AAC)", "Direction Provinciale", "3 ans", "art. 121"],
      ["CPAET — convention provisoire aménagement-exploitation-transformation", "MEFME / DGF", "3 ans non renouvelable", "art. 106–109"],
      ["Plan d'Aménagement (PA)", "Ministre / DGF", "30 ans (révision 5 ans)", "art. 20–26"],
      ["Plan de Gestion (PG)", "DGF", "—", "art. 28–30"],
      ["PAO — plan annuel d'opérations", "Direction Provinciale", "Annuel", "art. 45 / 121"],
      ["Plan de Protection de la Faune (PPF) + certificat de conformité", "DGFAP", "—", "—"],
      ["Étude d'Impact Environnemental (EIE) + certificat", "DGE / DGFAP", "Annuelle", "Loi 007/2014"],
      ["Quittance redevance de surveillance (≤ 300 F CFA/ha)", "AGEOS / Trésor", "Annuelle", "Loi de finances 2018"],
    ],
  },
  {
    titre: "③ Niveau produit — chaîne de production",
    cls: "t-prod",
    rows: [
      ["Carnet de chantier (DF10)", "Direction Provinciale / Cantonnement", "—", "art. 49 / 130–133"],
      ["Quittance taxe d'abattage à l'exportation (1,5 %)", "Douanes", "—", "art. 244"],
      ["Bordereau de roulage / transport", "Autorité forestière provinciale", "—", "art. 135"],
      ["Spécification", "Autorités forestières ports / provinciales", "—", "art. 138–140"],
      ["Permis d'exportation CITES", "ANPN (avis scientifique) + DGICBVPF (organe de gestion)", "—", "CITES"],
    ],
  },
];

const OPERATEURS = [
  ["Exploitant forestier", "« forestier seul » — pas d'usine", "tree", "g", ["Agrément", "Titre", "AAC / PAO", "Abattage", "Transport"], ["Transformation"]],
  ["Transformateur", "« industriel » — usine sans concession", "factory", "b", ["Agrément", "Achat / approvisionnement", "Transport", "Transformation", "États"], []],
  ["Intégré", "concession + usine", "cube", "d", ["Titre", "AAC / PAO", "Abattage", "Transport", "Transformation", "États"], []],
  ["Négoce / Export", "achat-revente, export", "globe", "b", ["Agrément", "Spécification", "Douanes", "Droits de sortie"], []],
  ["Forêt communautaire", "titulaire = la communauté", "leaf", "br", ["Convention", "PSG", "CAE", "Contrat d'approvisionnement"], []],
  ["Coopérative", "groupement d'opérateurs", "people", "br", ["Organisation", "Titres", "Agrégation des volumes"], []],
];

const SCENARIOS = [
  { n: "①", cls: "g", titre: "Dossier conforme", steps: [
    ["check", "ok", "Agrément & quittances à jour"],
    ["check", "ok", "AAC ouverte & autorisée"],
    ["check", "ok", "Arbre ≥ DME, dans les limites"],
    ["check", "ok", "Déclaration approuvée"],
    ["check", "ok", "DF10 + bordereau générés"],
    ["check", "ok", "Grume à l'usine, origine prouvée"],
  ], verdict: "green", texte: "PASSE — fluide & prouvé" },
  { n: "②", cls: "r", titre: "Irrégularité", steps: [
    ["check", "ok", "Titre & AAC en règle"],
    ["ban", "bad", "Arbre sous le DME — art. 124"],
    ["ban", "bad", "ou hors des limites de l'AAC"],
    ["ban", "bad", "ou essence mise en réserve"],
    ["cross", "bad", "Déclaration refusée par le système"],
  ], verdict: "red", texte: "BLOQUÉ — l'illicite ne passe pas" },
  { n: "③", cls: "a", titre: "Avertissement", steps: [
    ["check", "ok", "Titre & AAC en règle"],
    ["warn", "warn", "Document en renouvellement"],
    ["warn", "warn", "ou taxe non encore réglée"],
    ["check", "ok", "Déclaration <b>acceptée</b> et signalée"],
    ["stamp", "warn", "Décision de l'agent : approuver / <b>rejeter</b>"],
  ], verdict: "amber", texte: "LE MINISTÈRE DÉCIDE" },
];

// ---------------------------------------------------------------- Glossaire
const GLOSSAIRE = [
  { titre: "Autorités & administrations — qui délivre", rows: [
    ["AGEOS", "Agence Gabonaise d'Études et d'Observations Spatiales — surveillance satellitaire ; redevance de surveillance"],
    ["ANPN", "Agence Nationale des Parcs Nationaux — avis scientifique CITES, aires protégées"],
    ["DGE", "Direction Générale de l'Environnement — étude d'impact environnemental (Loi 007/2014)"],
    ["DGF", "Direction Générale des Forêts — instruit, délivre et contrôle au niveau central"],
    ["DGFAP", "Direction Générale de la Faune et des Aires Protégées — plan de protection de la faune"],
    ["DGI", "Direction Générale des Impôts — quittance de la taxe de superficie"],
    ["DGICBVPF", "Direction Générale des Industries, du Commerce, du Bois et de la Valorisation des Produits Forestiers — agrément transformation, PI/PDI, organe de gestion CITES"],
    ["MEFME", "Ministère des Eaux, des Forêts, de la Mer et de l'Environnement (Plan Climat, ODD, Affectation des Terres)"],
    ["Douanes", "Direction Générale des Douanes — taxe d'abattage à l'exportation, contrôle des sorties"],
    ["Trésor", "Services du Trésor du Gabon — quittance de la redevance de surveillance"],
    ["Dir. provinciale / Cantonnement", "Services déconcentrés — AAC, PAO, DF10, marquage, transport"],
    ["Autorité forestière provinciale", "Contrôle en route : bordereaux de roulage, spécifications"],
  ]},
  { titre: "Titres & aménagement", rows: [
    ["Titre", "Droit d'exploitation accordé par l'État (CFAD, PFA, PGG, forêt communautaire)"],
    ["CFAD", "Concession Forestière sous Aménagement Durable — 50 000 à 200 000 ha (art. 94–97)"],
    ["PFA", "Permis Forestier Associé — réservé aux nationaux (art. 96 / 99 / 100)"],
    ["PGG", "Permis de Gré à Gré — nationaux, ≤ 50 pieds, domaine rural (art. 95)"],
    ["FC", "Forêt Communautaire — portion du domaine rural gérée par une communauté villageoise"],
    ["UFA", "Unité Forestière d'Aménagement — le territoire : périmètre délimité contenant les AAC"],
    ["UFG", "Unité Forestière de Gestion — subdivision de l'UFA pour le plan de gestion"],
    ["PA", "Plan d'Aménagement — le règlement de l'UFA : rotation ≥ 20 ans, DME, possibilité (art. 20–26)"],
    ["PG", "Plan de Gestion — déclinaison du PA par UFG (art. 28–30)"],
    ["PAO", "Plan Annuel d'Opérations — programme de récolte de l'assiette de l'année (art. 45 / 121)"],
  ]},
  { titre: "Documents, fiscalité & notions", rows: [
    ["AAC", "Assiette Annuelle de Coupe — la parcelle de l'année ; ouverte 3 ans (art. 121)"],
    ["CAE", "Certificat Annuel d'Exploitation — autorise l'exploitation d'une forêt communautaire"],
    ["CCC", "Cahier des Clauses Contractuelles — lien titre ↔ communauté (art. 39–40 / 251)"],
    ["CPAET", "Convention Provisoire d'Aménagement-Exploitation-Transformation (≤ 3 ans, art. 106–109)"],
    ["DF10", "Carnet de chantier — registre des arbres abattus, alimenté automatiquement (art. 49)"],
    ["EIE", "Étude d'Impact Environnemental — certificat de conformité (Loi 007/2014)"],
    ["PI", "Plan d'Industrialisation — certificat de conformité (art. 23 / 226)"],
    ["PDI", "Plan de Développement Industriel — certificat de conformité (art. 226)"],
    ["PPF", "Plan de Protection de la Faune — obligatoire en concession"],
    ["PSG", "Plan Simple de Gestion — plan de la forêt communautaire (blocs de 5 ans)"],
    ["DME", "Diamètre Minimum d'Exploitabilité — seuil d'abattage par essence / UFA (art. 124)"],
    ["DBH", "Diamètre à Hauteur de Poitrine — diamètre mesuré à ~1,30 m"],
    ["FDL", "Fonds de Développement Local — contribution communautaire par m³ (défaut 800 F CFA/m³)"],
    ["CGSP", "Comité de Gestion et de Suivi des Projets — organe de répartition du FDL"],
    ["PV · FCFA · GPS", "Procès-verbal · Franc CFA (monnaie) · coordonnées géographiques"],
    ["art.", "Article du Code forestier — Loi n° 016/01 du 31 décembre 2001"],
  ]},
  { titre: "Référentiels internationaux & certification", rows: [
    ["CITES", "Convention sur le commerce international des espèces de faune et de flore menacées d'extinction"],
    ["RDUE / EUDR", "Règlement (UE) 2023/1115 sur la déforestation — diligence raisonnée à la parcelle"],
    ["FSC", "Forest Stewardship Council — certification de gestion durable"],
    ["PEFC / PAFC", "Programme de reconnaissance des certifications forestières / Pan African Forest Certification"],
    ["OLB / TLV", "Origine & Légalité du Bois / Timber Legality Verification — schémas de légalité"],
    ["HVC", "Hautes Valeurs de Conservation — valeurs à préserver (référentiel FSC)"],
    ["CLPE / FPIC", "Consentement libre, préalable et éclairé des communautés (information / consultation)"],
  ]},
];

// ---------------------------------------------------------------- SVG icons
const ICONS = {
  tree: '<path d="M12 2 L19 13 H5 Z"/><path d="M12 13 V22"/><path d="M8 22 h8"/>',
  doc: '<path d="M7 3 h7 l4 4 v14 h-11 z"/><path d="M14 3 v4 h4"/><path d="M9.5 12 h5"/><path d="M9.5 15.5 h5"/>',
  stamp: '<rect x="6" y="14" width="12" height="6" rx="1"/><path d="M9 14 v-2 a3 3 0 0 1 6 0 v2"/><path d="M4 21 h16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15 l5 5"/>',
  check: '<path d="M4 13 l5 5 L20 6"/>',
  cross: '<path d="M6 6 l12 12"/><path d="M18 6 l-12 12"/>',
  warn: '<path d="M12 3 L22 20 H2 Z"/><path d="M12 9.5 v5.5"/><path d="M12 18 h.01"/>',
  truck: '<rect x="2" y="7" width="11" height="8"/><path d="M13 10 h4 l3 3 v2 h-7 z"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  factory: '<path d="M3 21 h18"/><path d="M4 21 V13 l5 3 v-3 l5 3 v-3 l5 3 V21"/><rect x="16" y="5" width="3" height="6"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14 h3 v3 h-3 z"/><path d="M20 14 v7 h-7"/>',
  map: '<path d="M9 4 L3 6 V20 L9 18 L15 20 L21 18 V4 L15 6 Z"/><path d="M9 4 V18"/><path d="M15 6 V20"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M9 10 h6"/><path d="M9 14 h6"/><path d="M12 8 v8"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20 a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.4"/><path d="M14.6 20 a5 5 0 0 1 6.4 -4.6"/>',
  leaf: '<path d="M5 19 C5 10 12 5 20 4 C19 12 14 19 5 19 Z"/><path d="M5 19 C9 15 12 12 16 9"/>',
  cert: '<circle cx="12" cy="9" r="5"/><path d="M9 13 l-2 8 l5 -3 l5 3 l-2 -8"/>',
  clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 3 h6 v3 h-6 z"/><path d="M9 11 h6"/><path d="M9 15 h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12 h18"/><path d="M12 3 a14 14 0 0 1 0 18 a14 14 0 0 1 0 -18"/>',
  hammer: '<path d="M14 3 l7 7 l-3 3 l-7 -7 z"/><path d="M11 9 l-8 8 l3 3 l8 -8"/>',
  shield: '<path d="M12 3 l8 3 v6 c0 5 -4 8 -8 9 c-4 -1 -8 -4 -8 -9 V6 z"/><path d="M8.5 12 l2.5 2.5 l4.5 -5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M6 6 l12 12"/>',
  cube: '<path d="M12 3 l8 4.5 v9 l-8 4.5 l-8 -4.5 v-9 z"/><path d="M12 12 l8 -4.5"/><path d="M12 12 v9"/><path d="M12 12 l-8 -4.5"/>',
  leaf: '<path d="M5 19 C5 10 12 5 20 4 C19 12 14 19 5 19 Z"/><path d="M5 19 C9 15 12 12 16 9"/>',
  arrow: '<path d="M4 12 h15"/><path d="M13 6 l6 6 l-6 6"/>',
  arrowdown: '<path d="M12 4 v15"/><path d="M6 12 l6 6 l6 -6"/>',
  people2: '<circle cx="9" cy="8" r="3"/><path d="M3 20 a6 6 0 0 1 12 0"/>',
};
let iconCounter = 0;
function ic(name, cls = "") {
  const body = ICONS[name] || ICONS.doc;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

const CSS = `
:root{
  --g900:#08351f; --g800:#0b3d27; --g700:#0e5a3a; --g600:#1f7a4d; --g500:#2e8b57;
  --g300:#8fc7a9; --g200:#c3e2d1; --g100:#e2f1e8; --g050:#f0f8f3;
  --ink:#14241b; --dim:#5d6f64; --line:#cfded6;
  --amber:#b97708; --amber2:#e9a63a; --amberbg:#fdf4e3;
  --red:#b3261e; --redbg:#fdecea;
  --blue:#1f4e79; --bluebg:#eaf1f8;
  --brown:#8a5a2b; --brownbg:#f7efe6;
}
@page{ size: A4 landscape; margin: 10mm; }
*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; }
body{
  font-family:"Segoe UI","Calibri","Helvetica Neue",Arial,sans-serif;
  color:var(--ink); font-size:11px; line-height:1.32;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.page{ height:190mm; width:277mm; padding:5mm 4mm 4mm 4mm; page-break-after:always;
  position:relative; overflow:hidden; background:#fff; }
.page:last-child{ page-break-after:auto; }
.phead{ display:flex; align-items:center; gap:8px; border-bottom:2.5px solid var(--g600);
  padding-bottom:3px; margin-bottom:7px; }
.phead h2{ margin:0; font-size:16px; color:var(--g800); letter-spacing:.2px; }
.phead .sub{ color:var(--dim); font-size:10.5px; }
.phead .pnum{ margin-left:auto; color:var(--dim); font-size:10px; font-weight:600;
  background:var(--g050); border:1px solid var(--line); border-radius:20px; padding:1px 9px; white-space:nowrap; }
.ic{ width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.7;
  stroke-linecap:round; stroke-linejoin:round; flex:0 0 auto; }
.ic.sm{ width:15px; height:15px; }
.ic.lg{ width:30px; height:30px; }
.muted{ color:var(--dim); }
.center{ text-align:center; }

.cover{ display:flex; flex-direction:column; justify-content:center; align-items:center;
  background:linear-gradient(135deg,#08351f 0%,#0e5a3a 55%,#1f7a4d 100%); color:#fff; padding:14mm; }
.cover h1{ font-size:33px; margin:0 0 16px 0; line-height:1.05; text-align:center; letter-spacing:.3px; }
.cover h1 .h1sub{ display:block; font-size:18px; font-weight:600; color:#bfe6cf; margin-top:7px; letter-spacing:.2px; }
.cover .seal{ background:#fff; border-radius:12px; padding:8px 14px; margin-bottom:18px;
  box-shadow:0 8px 22px rgba(0,0,0,.28); }
.cover .seal img{ display:block; width:136px; height:auto; }
.cover .kick{ font-size:13px; letter-spacing:3px; text-transform:uppercase; color:#bfe6cf; margin-bottom:18px; }
.draftbadge{ font-size:11px; letter-spacing:2px; font-weight:800; text-transform:uppercase;
  color:#3a2600; background:#f6c96b; border:1px solid #e9a63a; border-radius:20px; padding:3px 13px; margin-bottom:18px; }
.draftnote{ margin-top:24px; max-width:232mm; background:rgba(255,255,255,.13);
  border:1px solid rgba(255,255,255,.34); border-radius:12px; padding:9px 14px;
  font-size:10.6px; color:#eaf7f0; text-align:left; }
.draftnote b{ color:#fff; }
.draftnote .src{ margin-top:6px; font-size:9.9px; color:#cfe9db; }
.cover .lead{ font-size:14px; color:#e7f6ee; max-width:205mm; text-align:center; margin-bottom:26px; }
.cover .flowline{ display:flex; gap:11px; align-items:center; flex-wrap:wrap; justify-content:center; margin-bottom:26px; }
.cover .fstep{ background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.35);
  border-radius:10px; padding:7px 10px; display:flex; align-items:center; gap:6px; color:#fff; font-weight:600; font-size:11px; }
.cover .fstep .ic{ color:#bff0d4; width:17px; height:17px; }
.legendbox{ margin-top:24px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.3);
  border-radius:12px; padding:9px 13px; display:flex; gap:15px; flex-wrap:wrap; justify-content:center; }
.lg{ display:flex; align-items:center; gap:6px; font-size:10.5px; color:#eaf7f0; }
.sw{ width:13px; height:13px; border-radius:4px; border:1px solid rgba(0,0,0,.15); }

.card{ border:1.5px solid var(--line); border-radius:10px; background:#fff; padding:7px 9px; }
.c-green{ background:var(--g050); border-color:var(--g300); }
.c-dark{ background:var(--g800); border-color:var(--g800); color:#eafff3; }
.c-dark .muted{ color:#bfe6cf; }
.c-amber{ background:var(--amberbg); border-color:var(--amber2); }
.c-red{ background:var(--redbg); border-color:#e7a9a4; }
.c-blue{ background:var(--bluebg); border-color:#a9c4dd; }
.c-brown{ background:var(--brownbg); border-color:#dcc3a6; }
.mnemonic{ margin-top:6px; text-align:center; font-size:11.5px; color:var(--g800);
  background:var(--g050); border:1.4px dashed var(--g300); border-radius:10px; padding:5px 9px; }

.chip{ display:inline-flex; align-items:center; gap:5px; border-radius:20px; padding:1.5px 8px;
  font-size:9.5px; border:1.2px solid var(--line); background:#fff; line-height:1.5; }
.chip b{ font-weight:700; }
.chip.g{ background:var(--g100); border-color:var(--g300); color:var(--g700); }
.chip.a{ background:var(--amberbg); border-color:var(--amber2); color:var(--amber); }
.chip.r{ background:var(--redbg); border-color:#e7a9a4; color:var(--red); }
.chip.b{ background:var(--bluebg); border-color:#a9c4dd; color:var(--blue); }
.chip.br{ background:var(--brownbg); border-color:#dcc3a6; color:var(--brown); }
.chip.dark{ background:rgba(255,255,255,.14); border-color:rgba(255,255,255,.45); color:#eafff3; }
.chip.auto{ background:#fff; border:1.2px dashed #8a9a8f; color:#0e5a3a; font-weight:700; }
.tag{ font-size:9px; font-weight:700; letter-spacing:.6px; text-transform:uppercase; color:var(--dim); }

.icobadge{ width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center;
  background:var(--g100); color:var(--g700); flex:0 0 auto; }
.icobadge.dark{ background:var(--g800); color:#bfe6cf; }
.icobadge.amber{ background:var(--amberbg); color:var(--amber); }
.icobadge.red{ background:var(--redbg); color:var(--red); }
.icobadge.brown{ background:var(--brownbg); color:var(--brown); }
.icobadge.blue{ background:var(--bluebg); color:var(--blue); }
.icobadge .ic{ width:19px; height:18px; }

.phead .ic.lg{ width:26px; height:26px; }

.phead .pnum{ margin-left:auto; color:var(--dim); font-size:10px; font-weight:600;
  background:var(--g050); border:1px solid var(--line); border-radius:20px; padding:1px 9px; }
.ic{ width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.7;
  stroke-linecap:round; stroke-linejoin:round; flex:0 0 auto; }

/* swimlane */
.lane{ display:grid; grid-template-columns: 1fr 30px 1.25fr; gap:4px 6px; align-items:stretch; }
.lcell{ display:flex; align-items:center; gap:7px; border-radius:9px; padding:4px 8px; border:1.4px solid var(--line); }
.lcell .n{ font-size:10px; font-weight:800; color:var(--dim); width:14px; }
.arrowcell{ display:flex; align-items:center; justify-content:center; color:var(--g500); }
.lanehdr{ display:grid; grid-template-columns:1fr 34px 1fr; gap:6px; margin-bottom:5px; }
.lanehdr div{ font-size:11px; font-weight:800; letter-spacing:.5px; padding:3px 8px; border-radius:8px; }
.lanehdr .l{ background:var(--g100); color:var(--g800); }
.lanehdr .r{ background:var(--g800); color:#eafff3; }
.auth-chips{ display:flex; gap:6px; flex-wrap:wrap; margin-top:7px; align-items:center; }
.auth-chips .lbl{ font-size:9.5px; color:var(--dim); font-weight:700; text-transform:uppercase; letter-spacing:.5px; }

/* table */
.table{ width:100%; border-collapse:collapse; }
.table th{ background:var(--g700); color:#fff; text-align:left; padding:3.2px 6px; font-size:8.6px;
  letter-spacing:.3px; text-transform:uppercase; }
.table td{ border-bottom:1px solid var(--line); padding:2.6px 6px; font-size:8.7px; vertical-align:top; }
.table tr:nth-child(even) td{ background:#f6faf8; }
.table .aut{ font-weight:700; color:var(--g700); white-space:nowrap; }
.table .base{ color:var(--dim); white-space:nowrap; }
.tbl-title{ font-size:11px; font-weight:800; color:var(--g800); margin:0 0 3px; }

/* glossaire */
.glo-cols{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.glo-col{ display:flex; flex-direction:column; gap:10px; }
.glo .row{ display:flex; gap:8px; padding:1.5px 0; border-bottom:1px dotted var(--line); }
.glo .row:last-child{ border-bottom:0; }
.glo .sig{ flex:0 0 96px; font-weight:800; color:var(--g700); font-size:9.1px; line-height:1.3; }
.glo .def{ flex:1; font-size:9.1px; line-height:1.32; color:var(--ink); }

/* d2 embed */
.d2wrap{ display:flex; align-items:center; justify-content:center; width:100%; }
.d2wrap svg{ max-width:100%; max-height:100%; width:auto; height:auto; }

/* autorisations */
.authgrid{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.authgrid .card{ display:flex; flex-direction:column; gap:5px; min-height:24mm; }
.authgrid h3{ margin:0; font-size:11.5px; color:var(--g800); }
.flowrow{ display:flex; align-items:center; justify-content:center; gap:8px; }
.fnode{ display:flex; align-items:center; gap:8px; border-radius:11px; padding:8px 12px; border:1.5px solid var(--line); }
.fnode.ent{ background:var(--g050); border-color:var(--g300); }
.fnode.min{ background:var(--g800); border-color:var(--g800); color:#eafff3; }
.fnode small{ display:block; font-size:9.5px; color:var(--dim); }
.fnode.min small{ color:#bfe6cf; }
.bigarrow{ color:var(--g600); font-size:22px; font-weight:800; }

/* scenarios */
.scen{ display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }
.scol{ border-radius:12px; padding:9px; border:1.6px solid var(--line); display:flex; flex-direction:column; gap:6px; }
.scol.g{ background:var(--g050); border-color:var(--g300); }
.scol.r{ background:var(--redbg); border-color:#e7a9a4; }
.scol.a{ background:var(--amberbg); border-color:var(--amber2); }
.scol h3{ margin:0; font-size:12.5px; }
.sstep{ background:#fff; border:1.2px solid var(--line); border-radius:8px; padding:4px 7px;
  display:flex; align-items:center; gap:6px; font-size:10px; }
.sstep.ok{ border-color:#bfe0cd; }
.sstep.warn{ border-color:#e9a63a; }
.sstep.bad{ border-color:#e7a9a4; }
.verdict{ margin-top:auto; border-radius:9px; padding:6px 9px; font-weight:800; font-size:11px; text-align:center; color:#fff; }
.verdict.green{ background:var(--g600); }
.verdict.red{ background:var(--red); }
.verdict.amber{ background:var(--amber); }

.foot{ position:absolute; bottom:2mm; left:5mm; right:5mm; display:flex; justify-content:space-between;
  color:#9aab9f; font-size:8.5px; border-top:1px solid var(--line); padding-top:2px; }
`;

// ---------------------------------------------------------------- Helpers de page
function page(num, icon, titre, sub, body) {
  return `<section class="page">
  <div class="phead">${ic(icon, "lg")}
    <div><h2>${titre}</h2><div class="sub">${sub}</div></div>
    <span class="pnum">Planche ${num} / ${NB}</span>
  </div>
  ${body}
  <div class="foot"><span>Draft Workflow</span><span>L'entreprise déclare · le Ministère décide · la loi se prouve</span></div>
</section>`;
}

// ---------------------------------------------------------------- Planches
const p1 = `<section class="page cover">
  ${SEAL ? `<div class="seal"><img src="${SEAL}" alt="Sceau — République Gabonaise"></div>` : ""}
  <div class="kick">République Gabonaise — secteur forêt-bois</div>
  <div class="draftbadge">Draft · Analyse du workflow</div>
  <h1>Ministère des Eaux et Forêts — Draft Workflow forestier
    <span class="h1sub">qui délivre, qui décide, quelles preuves</span></h1>
  <div class="lead">Guide visuel — Code forestier (Loi 016/01) &amp; exigences des marchés (RDUE).<br>
    Chaque document porte une <b>autorité légale compétente</b>, une validité et un poids juridique.</div>
  <div class="flowline">
    <div class="fstep">${ic("tree")} Forêt</div>
    <div class="fstep">${ic("clip")} Autorisation</div>
    <div class="fstep">${ic("hammer")} Abattage</div>
    <div class="fstep">${ic("qr")} Traçabilité</div>
    <div class="fstep">${ic("truck")} Transport</div>
    <div class="fstep">${ic("factory")} Transformation</div>
    <div class="fstep">${ic("globe")} Marché</div>
  </div>
  <div class="draftnote">
    <div class="src"><b>Sources analysées pour produire cette première version :</b>
      le Code forestier gabonais — <b>Loi 016/01</b> ; les <b>5 fiches pays du Timber Trade Portal</b> ;
      la documentation interne du projet (Doc Map, listings, modèles d'échange DF10 / bordereaux de roulage).</div>
  </div>
  <div class="legendbox">
    <div class="lg"><span class="sw" style="background:#2e8b57"></span> Entreprise — déclare</div>
    <div class="lg"><span class="sw" style="background:#08351f"></span> Ministère / autorité — délivre &amp; décide</div>
    <div class="lg"><span class="sw" style="background:#8a5a2b"></span> Communauté</div>
    <div class="lg"><span class="sw" style="background:#b3261e"></span> Blocage dur (illicite)</div>
    <div class="lg"><span class="sw" style="background:#e9a63a"></span> Avertissement</div>
  </div>
</section>`;

const p2 = page(2, "arrow", "Le workflow, en un coup d'œil",
  "11 étapes — l'entreprise agit à gauche, l'autorité compétente décide et délivre à droite.",
  `<div class="lanehdr">
     <div class="l">ENTREPRISE — déclare / exécute</div><div></div>
     <div class="r">AUTORITÉ — instruit · délivre · contrôle</div>
   </div>
   <div class="lane">${p2rows()}</div>`);

function p2rows() {
  return WORKFLOW.map(([eTxt, mTxt, aut, base]) => `
    <div class="lcell c-green"><svg class="ic" viewBox="0 0 24 24">${ICONS.doc}</svg><span><b>${eTxt}</b></span></div>
    <div class="arrowcell"><svg class="ic" viewBox="0 0 24 24">${ICONS.arrow}</svg></div>
    <div class="lcell c-dark"><svg class="ic" viewBox="0 0 24 24">${ICONS.stamp}</svg><span><b>${mTxt}</b><small>Autorité : ${aut}${base ? " · " + base : ""}</small></span></div>`).join("");
}

const p3 = page(3, "map", "Le découpage du territoire — qui décide quoi",
  "Titre → UFA → jusqu'à 30 assiettes annuelles de coupe (AAC).",
  `${svgTerritoire}
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:6px">
    <div class="card c-blue"><b>① TITRE FORESTIER — le cadre (décidé par le Ministère)</b>
      <div class="muted" style="margin-top:3px">les types de titre : <b>CFAD</b> · <b>PFA</b> · <b>PGG</b> · <b>forêt communautaire</b> — le droit d'exploiter accordé par l'État</div></div>
    <div class="card c-dark"><b>② UFA &amp; PA — le territoire et son plan → Ministère</b>
      <div class="muted" style="margin-top:3px">périmètre et grille des 30 AAC : issus du plan d'aménagement agréé</div></div>
    <div class="card c-green"><b>③ L'ANNÉE → Entreprise</b>
      <div class="muted" style="margin-top:3px">inventaire d'exploitation, PAO, activation de l'assiette de l'année</div></div>
    <div class="card c-dark"><b>L'OUVERTURE → Ministère</b>
      <div class="muted" style="margin-top:3px">autorisation d'exploiter, ouverture puis fermeture de l'assiette</div></div>
  </div>
  <div class="callout" style="margin-top:8px">
    <div class="tag">À ne pas confondre — UFA ≠ PA</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
      <div class="card c-blue"><b>UFA = le territoire (le contenant)</b>
        <div class="muted" style="margin-top:3px"><b>Unité Forestière d'Aménagement</b> : un <b>périmètre</b> délimité par l'administration dans le domaine permanent. C'est un <b>lieu</b> (surface, limites, cartographie) qui <b>contient</b> les AAC.</div></div>
      <div class="card c-green"><b>PA — le document (le contenu)</b>
        <div class="muted" style="margin-top:3px"><b>Plan d'Aménagement</b> : le <b>règlement</b> de ce territoire — rotation ≥ 20 ans, DME, possibilité annuelle → il <b>produit</b> la grille des 30 AAC. Approuvé par le <b>Ministre</b> (art. 20–26), révisé tous les 5 ans.</div></div>
  </div>
  <div class="mnemonic"><b>À retenir :</b> « L'UFA est le terrain ; le PA est son plan d'urbanisme. »</div>`);

function groupChips(items) {
  return `<div class="auth-chips" style="justify-content:center;margin-top:5px">
    <span class="lbl">Groupes</span>
    ${items.map(i => `<span class="chip" style="background:${i.bg};border-color:${i.bd};color:${i.fg}">${i.t}</span>`).join("")}
  </div>`;
}
const CHIP = {
  e: { t: "① Entreprise", bg: "#fdf4e3", bd: "#d9a94a", fg: "#6b4500" },
  a: { t: "② Aménagement (UFA / AAC)", bg: "#eef7f1", bd: "#8fc7a9", fg: "#0b3d27" },
  p: { t: "③ Produit", bg: "#eaf1f8", bd: "#a9c4dd", fg: "#12283d" },
};

const p4 = page(4, "cert", "Documents ➜ Autorité — ① Entreprise & ③ Produit",
  "Traits colorés par groupe · ① orange (entreprise) et ③ bleu (produit).",
  `${svgAutOpProd}${groupChips([CHIP.e, CHIP.p])}`);

const p5 = page(5, "cert", "Documents ➜ Autorité — ② Aménagement (UFA / AAC)",
  "Traits verts · les documents de l'aménagement et l'autorité qui les délivre.",
  `${svgAutAmen}${groupChips([CHIP.a])}`);

const p6 = page(6, "doc", "Référentiel des documents & autorités",
  "Table de référence : document · autorité compétente · validité · base légale.",
  REFERENTIEL.map(g => `
    <div style="margin-bottom:6px">
      <div class="tbl-title">${g.titre}</div>
      <table class="table"><thead><tr>
        <th style="width:44%">Document</th><th style="width:26%">Autorité qui délivre</th>
        <th style="width:16%">Validité</th><th style="width:14%">Base légale</th>
      </tr></thead><tbody>
      ${g.rows.map(r => `<tr><td>${r[0]}</td><td class="aut">${r[1]}</td><td>${r[2]}</td><td class="base">${r[3]}</td></tr>`).join("")}
      </tbody></table>
    </div>`).join(""));

const p7 = page(7, "stamp", "Les 4 autorisations d'exploiter — article 14",
  "Pas d'exploitation sans autorisation préalable. Le cycle est identique pour les quatre.",
  `<div class="authgrid">
    <div class="card c-green"><div class="icobadge">${ic("clip")}</div><h3>Certificat annuel d'assiette</h3>
      <span class="muted">UFA en convention provisoire</span></div>
    <div class="card c-green"><div class="icobadge">${ic("doc")}</div><h3>Permis annuel d'opérations</h3>
      <span class="muted">UFA avec plan d'aménagement validé</span></div>
    <div class="card c-green"><div class="icobadge">${ic("cert")}</div><h3>Certificat de vente de coupe</h3>
      <span class="muted">Ventes de coupe</span></div>
    <div class="card c-brown"><div class="icobadge brown">${ic("people2")}</div><h3>CAE</h3>
      <span class="muted">Forêt communautaire</span></div>
  </div>
  <div class="flowrow" style="margin-top:16px">
    <div class="fnode ent"><span class="icobadge">${ic("doc")}</span><span><b>1. Demande</b><small>l'entreprise dépose son plan</small></span></div>
    <div class="bigarrow">→</div>
    <div class="fnode min"><span class="icobadge dark">${ic("stamp")}</span>
      <span><b>2. Décision</b><small>délivrer · rejeter (motif obligatoire)</small></span></div>
    <div class="bigarrow">→</div>
    <div class="fnode ent"><div class="icobadge">${ic("arrow")}</div>
      <span><b>3. Notification de démarrage</b><small>l'entreprise annonce le lancement</small></span></div>
  </div>
  <div style="display:flex;justify-content:center;gap:10px;margin-top:16px">
    <span class="chip a">soumis</span><span class="chip g">délivré</span><span class="chip r">rejeté</span>
    <span class="chip b" style="margin-left:14px">Art. 14 — pas d'exploitation avant délivrance + notification</span>
  </div>`);

const p8 = page(8, "shield", "La porte de conformité — deux niveaux",
  "Illicite technique = blocage net. Le reste = avertissement, l'autorité tranche.",
  `<div style="display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center;height:150mm">
    <div class="card c-green" style="text-align:center;padding:14px">
      <div class="icobadge" style="margin:0 auto 8px;width:46px;height:46px">${ic("tree", "lg")}</div>
      <b>Déclaration d'abattage</b>
      <div class="muted" style="margin-top:4px">titre · AAC · code arbre · espèce · DBH · GPS</div>
    </div>
    <div>
      <div class="card c-red" style="display:flex;gap:12px;align-items:flex-start">
        <div class="icobadge red" style="width:44px;height:44px">${ic("ban", "lg")}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:800;color:#b3261e">BLOQUÉ — soumission impossible</div>
          <div class="muted" style="margin-bottom:6px">Ce qui est techniquement illicite</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span class="chip r">Sans autorisation — art. 14</span>
            <span class="chip r">Sous le DME — art. 124</span>
            <span class="chip r">Essence mise en réserve</span>
            <span class="chip r">Code arbre en doublon</span>
            <span class="chip r">Arbre hors de l'AAC</span>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:center;gap:40px;margin:6px 0;color:#8a9a8f">
        ${ic("arrowdown", "lg")}${ic("arrowdown", "lg")}
      </div>
      <div class="card c-amber" style="display:flex;gap:12px;align-items:flex-start">
        <div class="icobadge amber" style="width:44px;height:44px">${ic("warn", "lg")}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:800;color:#8a5a00">AVERTISSEMENT — soumission acceptée</div>
          <div class="muted" style="margin-bottom:6px">Signalé à l'autorité, qui décide</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span class="chip a">Document expiré</span>
            <span class="chip a">Taxe impayée — art. 283</span>
            <span class="chip a">Autorisation en attente</span>
            <span class="chip a">Carnet non tenu</span>
            <span class="chip a">CITES sans permis</span>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:center;margin-top:10px">
        <div class="card c-dark" style="display:flex;align-items:center;gap:8px">
          ${ic("stamp")}<b>Décision de l'agent : approuver · rejeter (motif obligatoire)</b>
        </div>
      </div>
    </div>
  </div>`);

const p9 = page(9, "people", "Les types d'opérateurs — qui fait quoi",
  "Tous les profils conservés · capacités cumulables · rien n'est nécessairement obligatoire.",
  `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px">
    ${OPERATEURS.map(([nom, desc, icon, tone, actifs, inactifs]) => `
      <div class="card">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="icobadge ${tone}">${ic(icon)}</div>
          <div><b>${nom}</b><div class="muted">${desc}</div></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:7px">
          ${actifs.map(a => `<span class="chip g">${a}</span>`).join("")}
          ${inactifs.map(a => `<span class="chip" style="opacity:.45">${a}</span>`).join("")}
        </div>
      </div>`).join("")}
  </div>
  <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <span class="auth-chips"><span class="lbl">Tronc commun</span></span>
    <span class="chip">Organisation titulaire</span>
    <span class="chip">Documents suivis (autorité + validité)</span>
    <span class="chip">Conformité à 2 niveaux</span>
    <span class="chip">Traçabilité DF10</span>
    <span class="chip">Taxes &amp; échéances</span>
  </div>`);

const p10 = page(10, "arrow", "Trois scénarios concrets",
  "Vert : conforme. Rouge : irrégularité bloquée. Orange : avertissement, décision de l'autorité.",
  `<div class="scen" style="height:150mm">
    ${SCENARIOS.map(s => `
      <div class="scol ${s.cls}">
        <h3>${s.n} ${s.titre}</h3>
        ${s.steps.map(([icon, tone, txt]) => `
          <div class="sstep ${stClass(tone)}">
            <svg class="ic" style="width:15px;height:15px;color:${toneColor(tone)}" viewBox="0 0 24 24">${ICONS[icon]}</svg>
            <span>${txt}</span>
          </div>`).join("")}
        <div class="verdict ${s.verdict}">${s.texte}</div>
      </div>`).join("")}
  </div>`);

function stClass(t) { return t === "ok" ? "ok" : t === "warn" ? "warn" : "bad"; }
function toneColor(t) { return t === "ok" ? "#2e8b57" : t === "warn" ? "#b97708" : "#b3261e"; }

const p11 = page(11, "qr", "La traçabilité de la grume — de l'arbre à l'usine",
  "Marquage · carnet DF10 · transport · réception · transformation.",
  `${svgTracabilite}
  <div style="display:flex;gap:10px;margin-top:8px">
    <div class="card c-amber" style="flex:1"><b style="color:#8a5a00">Preuves à chaque étape</b>
      <div class="muted" style="margin-top:4px">Autorisation · code d'arbre · numéro DF10 · bordereau · spécification</div></div>
    <div class="card c-green" style="flex:1"><b style="color:#0e5a3a">Ce que l'on reconstruit</b>
      <div class="muted" style="margin-top:4px">le parcours complet de chaque grume, de la souche au lot exporté</div></div>
    <div class="card" style="flex:1;display:flex;align-items:center;gap:10px">${ic("globe", "lg")}
      <div><b>Diligence RDUE</b><div class="muted">parcelle d'origine géolocalisée · compteurs de grumes</div></div></div>
    <div class="card" style="flex:1;display:flex;align-items:center;gap:10px">${ic("cert", "lg")}
      <div><b>Certification</b><div class="muted">FSC / PAFC — preuve complémentaire (ne remplace pas la RDUE)</div></div></div>
  </div>`);

function glossaryCard(g) {
  return `<div class="card">
    <div class="tbl-title">${g.titre}</div>
    <div class="glo">${g.rows.map(([sig, def]) =>
      `<div class="row"><span class="sig">${sig}</span><span class="def">${def}</span></div>`).join("")}</div>
  </div>`;
}

const p12 = page(12, "doc", "Glossaire des sigles & abréviations",
  "Tous les sigles employés dans ce guide — autorités, titres, documents, notions et référentiels internationaux.",
  `<div class="glo-cols">
    <div class="glo-col">${glossaryCard(GLOSSAIRE[0])}${glossaryCard(GLOSSAIRE[1])}</div>
    <div class="glo-col">${glossaryCard(GLOSSAIRE[2])}${glossaryCard(GLOSSAIRE[3])}</div>
  </div>`);

// ---------------------------------------------------------------- Assemblage
const HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Ministère des Eaux et Forêts — Draft Workflow forestier</title>
<style>${CSS}</style>
</head>
<body>
${p1}
${p2}
${p3}
${p4}
${p5}
${p6}
${p7}
${p8}
${p9}
${p10}
${p11}
${p12}
</body>
</html>
`;

writeFileSync(OUT_HTML, HTML, "utf8");
console.log("HTML écrit :", OUT_HTML, "(" + HTML.length + " octets)");
