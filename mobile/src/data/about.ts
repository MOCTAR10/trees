export const ABOUT_SECTIONS: { title: string; body: string }[] = [
  {
    title: "Foresterie Numérique",
    body: "La plateforme du Ministère des Eaux et Forêts pour suivre le bois du Gabon, de l'arbre sur pied jusqu'à l'usine. Elle applique la loi 016/01 portant Code forestier et répond au règlement européen contre la déforestation (RDUE).",
  },
  {
    title: "Pour qui",
    body: "Le Ministère instruit, décide et contrôle ; l'entreprise déclare, transporte, transforme et paie ; l'agent de terrain mesure et suit les arbres ; la coopérative valorise les résidus de bois.",
  },
  {
    title: "Ce que fait l'application",
    body: "Scan intelligent des arbres et reconnaissance des plantes, plaque QR et carnet DF10, chantiers et projets, bordereaux de transport, titres et taxes, contrôles terrain, anomalies détectées automatiquement, carte du territoire et rapports officiels en PDF.",
  },
  {
    title: "Vos données",
    body: "Chacun ne voit que son espace. Les connexions sont chiffrées, les mises à jour de l'application sont signées, et chaque action est datée, localisée et attribuée à son auteur.",
  },
  {
    title: "Éditeur",
    body: "Green Leaves Gabon, pour le Ministère des Eaux et Forêts. Version pilote : les données de démonstration sont fictives.",
  },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Faut-il du réseau pour travailler en forêt ?", a: "Non. Les scans et l'abattage s'enregistrent sur le téléphone et partent automatiquement au retour du réseau. Le badge en haut de l'écran indique « En ligne » ou le nombre d'envois en attente." },
  { q: "Pourquoi la photo doit-elle être prise en direct ?", a: "Photo, position GPS et heure sont prises au même instant au pied de l'arbre : c'est la valeur de preuve pour le Ministère et pour le RDUE. Aucune image ne peut être importée de la galerie." },
  { q: "Que contient la plaque QR ?", a: "Uniquement le code national de l'arbre. Toute son histoire est lue dans le registre par l'application officielle ; un lecteur ordinaire ne voit que le code." },
  { q: "Quelle différence entre le mode Arbre et le mode Plante ?", a: "Le mode Arbre mesure (espèce, diamètre à 1,30 m, hauteur, carbone, contrôle RDUE) et enregistre au registre. Le mode Plante reconnaît seulement une plante : rien n'est enregistré." },
  { q: "Pourquoi mesurer le diamètre à 1,30 m ?", a: "C'est la hauteur de poitrine, la référence en foresterie : elle sert au diamètre minimum d'exploitabilité (DME) et au calcul du volume et du carbone." },
  { q: "Chantier ou projet ouvert ?", a: "Le chantier est le cadre officiel d'une AAC, sur invitation de l'entreprise. Le projet ouvert est une campagne participative que chacun peut rejoindre." },
  { q: "Pourquoi ma déclaration est-elle refusée ?", a: "Le motif du Ministère s'affiche sur la déclaration et dans « Décisions reçues ». Corrigez le point indiqué, puis déposez à nouveau." },
  { q: "Comment installer une mise à jour ?", a: "Quand « Nouvelle mise à jour disponible » apparaît en haut de l'écran, touchez-le, terminez votre saisie, puis choisissez « Installer maintenant »." },
  { q: "J'ai perdu mon téléphone ou je quitte l'entreprise", a: "Prévenez votre entreprise ou le Ministère : le compte est suspendu en un geste, l'historique est conservé." },
  { q: "Les documents PDF ont-ils une valeur officielle ?", a: "Chaque document porte l'en-tête du Ministère, sa base légale et sa date de génération. La signature électronique reste à valider avec le Ministère pendant le pilote." },
  { q: "Où trouver la signification d'un sigle ?", a: "Dans Profil › « Glossaire & sigles », avec une recherche qui fonctionne même sans accents." },
];
