export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface GlossarySection {
  key: string;
  title: string;
  entries: GlossaryEntry[];
}

export interface FlowStep {
  label: string;
  who: string;
  detail: string;
}

export const LOG_LIFECYCLE: FlowStep[] = [
  { label: "Inventorié", who: "Agent", detail: "Plaque QR posée et lue : l'arbre entre au registre." },
  { label: "Déclaré", who: "Entreprise", detail: "Diamètre minimum, AAC et essences contrôlés aussitôt." },
  { label: "Autorisé", who: "Ministère", detail: "Décision motivée ; un refus revient avec son motif." },
  { label: "Abattu", who: "Agent", detail: "Lecture au pied de l'arbre, inscription au carnet DF10 (art. 14)." },
  { label: "En transport", who: "Entreprise", detail: "Uniquement en émettant un bordereau de roulage (art. 135)." },
  { label: "Réceptionné", who: "Usine", detail: "Le destinataire reçoit la grume et en devient détenteur." },
  { label: "Transformé", who: "Usine", detail: "Lot produit inscrit au registre de transformation." },
];

export const FILE_FLOW: FlowStep[] = [
  { label: "Dépôt", who: "Entreprise", detail: "Déclaration, pièce, titre, étude, certification…" },
  { label: "À traiter", who: "Ministère", detail: "Le dossier arrive dans la file, avec l'autorité compétente." },
  { label: "Décision", who: "Ministère", detail: "Contrôles automatiques, puis autorisation ou refus motivé." },
  { label: "Retour", who: "Entreprise", detail: "La décision s'affiche dans « Décisions reçues »." },
];

export const MORE_FLOWS: { title: string; intro: string; steps: FlowStep[] }[] = [
  {
    title: "La plaque QR",
    intro: "Une plaque, un arbre, une histoire : la plaque porte seulement le code national de l'arbre.",
    steps: [
      { label: "Production", who: "Ministère", detail: "Plaques gravées sur métal ou imprimées, pour les codes du registre." },
      { label: "Pose", who: "Agent", detail: "Clouée et lue : l'arbre entre au registre." },
      { label: "Lectures", who: "Tous", detail: "Mesure, abattage, contrôle, réception : chaque lecture est datée et localisée." },
      { label: "Fiche", who: "Application", detail: "Essence, titre, AAC, détenteur, DF10, bordereau, historique — selon votre rôle." },
    ],
  },
  {
    title: "Le scan d'un arbre",
    intro: "Toujours le même parcours guidé, photo, position et heure prises au même instant.",
    steps: [
      { label: "Arbre", who: "Photo", detail: "La silhouette entière." },
      { label: "Écorce", who: "Photo", detail: "Sa texture aide à reconnaître l'essence." },
      { label: "Feuilles", who: "Photo", detail: "Fleurs et fruits en option." },
      { label: "Diamètre à 1,30 m", who: "Agent", detail: "Les deux bords du tronc validés ; plaque QR ou capteur pour la distance." },
      { label: "Rapport", who: "Plateforme", detail: "Espèce, diamètre, hauteur, carbone, contrôle RDUE." },
    ],
  },
  {
    title: "Un contrôle sur le terrain",
    intro: "Du constat à la sanction, tout est tracé et le procès-verbal est produit en PDF.",
    steps: [
      { label: "Contrôle", who: "Inspecteur", detail: "Lecture de la plaque ou du bordereau : vérifications immédiates." },
      { label: "Procès-verbal", who: "Ministère", detail: "Conforme, avec réserve ou non conforme, avec la base légale." },
      { label: "Suite", who: "Ministère", detail: "Mise en demeure, amende, saisie… avec une échéance." },
      { label: "Contestation", who: "Entreprise", detail: "Une fois, depuis « À faire » ; elle arrive dans « À traiter »." },
    ],
  },
  {
    title: "L'économie circulaire",
    intro: "Les résidus de l'exploitation deviennent des revenus locaux.",
    steps: [
      { label: "Résidus", who: "Entreprise", detail: "Chutes, branches, sciure déclarées avec leur position." },
      { label: "Réservation", who: "Coopérative", detail: "Les lots proches sont proposés et réservés." },
      { label: "Collecte", who: "Coopérative", detail: "Enregistrée dans l'application." },
      { label: "Valorisation", who: "Artisans", detail: "Mobilier, briquettes, biochar." },
    ],
  },
  {
    title: "Travailler sans réseau",
    intro: "En forêt, l'application continue de fonctionner.",
    steps: [
      { label: "Saisie", who: "Agent", detail: "Scans et abattage enregistrés sur le téléphone." },
      { label: "Attente", who: "Application", detail: "Le badge indique le nombre d'envois en attente." },
      { label: "Envoi", who: "Application", detail: "Automatique dès le retour du réseau." },
    ],
  },
];

export const WORK_MODES: { title: string; points: string[] }[] = [
  {
    title: "Chantier",
    points: [
      "Site officiel ouvert sur une AAC autorisée",
      "Sur invitation de l'entreprise",
      "Liste des tiges du registre à mesurer",
      "Avancement suivi tige par tige",
    ],
  },
  {
    title: "Projet ouvert",
    points: [
      "Campagne participative autour d'un lieu",
      "Chacun peut rejoindre en un geste",
      "Les scans de tous les participants s'additionnent",
      "Inventaire, carbone, suivi d'une zone…",
    ],
  },
];

export const GLOSSARY: GlossarySection[] = [
  {
    key: "acteurs",
    title: "Parties prenantes",
    entries: [
      { term: "MEFME", definition: "Ministère des Eaux, des Forêts, de la Mer et de l'Environnement." },
      { term: "DGF", definition: "Direction Générale des Forêts : instruit, délivre et contrôle au niveau central." },
      { term: "DP", definition: "Directions provinciales et cantonnements : AAC, PAO, DF10, marquage, transport." },
      { term: "DGFAP", definition: "Direction Générale de la Faune et des Aires Protégées." },
      { term: "DGE", definition: "Direction Générale de l'Environnement : études d'impact (loi 007/2014)." },
      { term: "ANPN", definition: "Agence Nationale des Parcs Nationaux : aires protégées, avis CITES." },
      {
        term: "DGICBVPF",
        definition: "Direction Générale des Industries, du Commerce, du Bois et de la Valorisation des Produits Forestiers.",
      },
      { term: "AGEOS", definition: "Agence Gabonaise d'Études et d'Observations Spatiales : surveillance satellitaire." },
      { term: "DGI", definition: "Direction Générale des Impôts : taxe de superficie." },
      { term: "Douanes", definition: "Taxe d'abattage à l'exportation, contrôle des sorties." },
      { term: "Trésor", definition: "Redevance de surveillance." },
    ],
  },
  {
    key: "titres",
    title: "Titres et aménagement",
    entries: [
      { term: "CFAD", definition: "Concession Forestière sous Aménagement Durable (art. 94 à 97)." },
      { term: "PFA", definition: "Permis Forestier Associé, réservé aux nationaux." },
      { term: "PGG", definition: "Permis de Gré à Gré : nationaux, 50 pieds au plus (art. 95)." },
      { term: "FC", definition: "Forêt Communautaire, gérée par une communauté villageoise." },
      { term: "UFA / UFG", definition: "Unité Forestière d'Aménagement / de Gestion." },
      { term: "PA / PG", definition: "Plan d'Aménagement / Plan de Gestion." },
      { term: "PAO", definition: "Plan Annuel d'Opérations : la récolte de l'année (art. 45 et 121)." },
      { term: "AAC", definition: "Assiette Annuelle de Coupe : la parcelle de l'année, ouverte 3 ans (art. 121)." },
    ],
  },
  {
    key: "documents",
    title: "Documents et notions",
    entries: [
      { term: "DF10", definition: "Carnet de chantier : registre des arbres abattus, rempli automatiquement." },
      { term: "DME", definition: "Diamètre Minimum d'Exploitabilité : seuil d'abattage par essence (art. 124)." },
      { term: "DBH", definition: "Diamètre à hauteur de poitrine, mesuré à 1,30 m." },
      { term: "Bordereau", definition: "Bordereau de roulage : accompagne tout transport de grumes (art. 135)." },
      { term: "CAE", definition: "Certificat Annuel d'Exploitation d'une forêt communautaire." },
      { term: "CPAET", definition: "Convention Provisoire d'Aménagement-Exploitation-Transformation." },
      { term: "CCC", definition: "Cahier des Clauses Contractuelles entre le titulaire et les communautés." },
      { term: "FDL", definition: "Fonds de Développement Local : contribution aux communautés par m³." },
      { term: "EIE", definition: "Étude d'Impact Environnemental (loi 007/2014)." },
      { term: "PPF", definition: "Plan de Protection de la Faune, obligatoire en concession." },
      { term: "PV", definition: "Procès-verbal de contrôle." },
      { term: "art.", definition: "Article du Code forestier, loi n° 016/01 du 31 décembre 2001." },
    ],
  },
  {
    key: "international",
    title: "Référentiels internationaux",
    entries: [
      { term: "RDUE / EUDR", definition: "Règlement (UE) 2023/1115 contre la déforestation : diligence raisonnée." },
      { term: "CITES", definition: "Convention sur le commerce international des espèces menacées." },
      { term: "FSC · PAFC", definition: "Certifications de gestion durable des forêts." },
      { term: "UICN", definition: "Union internationale pour la conservation de la nature." },
      { term: "WDPA", definition: "Base mondiale des aires protégées." },
    ],
  },
  {
    key: "application",
    title: "Termes de l'application",
    entries: [
      { term: "Plaque QR", definition: "Porte uniquement le code national de l'arbre ; la fiche s'ouvre dans l'application." },
      { term: "Chantier", definition: "Site officiel d'une AAC, sur invitation, avec les tiges du registre à mesurer." },
      { term: "Projet ouvert", definition: "Campagne participative que chacun peut rejoindre en un geste." },
      { term: "Groupe", definition: "Votre entreprise ou votre coopérative : le travail de l'équipe, mis à jour en direct." },
      { term: "Détenteur", definition: "L'organisation qui a la grume entre les mains à cette étape." },
      { term: "Anomalie", definition: "Écart détecté automatiquement : avertissement ou bloquant." },
      { term: "GFW · RADD", definition: "Global Forest Watch · alertes de déforestation détectées par radar." },
    ],
  },
];
