# Régression par rôle — Ministère, Entreprise, Agent, Coopérative : inventaire et couverture

Date : 15 octobre 2026 · après Slice 24.
Objectif : vérifier que **tout ce que fait le Ministère** (autorisations, décisions, pièces, titres, contrôles,
rapports) fonctionne de bout en bout, **et que l'effet de chaque acte est visible de l'autre côté**
(entreprise, agent, usine). Exécutée à chaque push, chaque nuit et à la demande par le workflow GitHub
**Régression** (`.github/workflows/regression.yml`), à travers la passerelle avec clé API.

## Méthode

1. **Inventaire automatique** des points d'accès ouverts au rôle `admin`, lu dans le code FastAPI
   (`scripts/role_coverage.py --role admin`) : **92** points d'accès (Ministère seul ou partagé).
2. **Mesure** : chaque appel de la régression est journalisé (acteur, méthode, chemin, statut attendu) ;
   un point d'accès est « vérifié » quand un compte du Ministère (`admin`, inspecteurs `mef.dp2`,
   `mef.brigade`) l'a exercé avec le résultat attendu.
3. **Écrans** : chaque écran Ministère de l'application est relié aux fonctions d'API qu'il importe,
   donc aux points d'accès qu'il appelle.
4. **Garde-fou** : la régression **échoue** si la couverture du Ministère **ou de l'Entreprise** descend
   sous **100 %** — une nouvelle fonction ne peut pas partir sans son test. (`set -o pipefail` dans le
   workflow : sans lui, le seuil n'aurait jamais fait échouer l'exécution — défaut corrigé.)

Avant ce travail : **35/92** points d'accès exercés par un compte Ministère (38 %). Après : **92/92**.

## Couverture par domaine (exécution du 15/10/2026)

| Domaine | Vérifiés |
| --- | --- |
| À traiter et décisions (files, page de décision, décision unifiée, provinces) | 4/4 |
| Parties prenantes (boussole) | 1/1 |
| Comptes et administration (comptes, désactivation, rôles, statistiques, coopératives) | 6/6 |
| Organisations (annuaire, fiche, création, comptes rattachés, profils, rattachement legacy) | 9/9 |
| Titres, UFA, AAC, DME, conventions, autorisations, études + PDF | 25/25 |
| Déclarations et registre des arbres (+ conformité, plaques QR) | 8/8 |
| Pièces légales (instruction, référentiel) | 3/3 |
| Fiscalité (quittances, échéances, statut) | 4/4 |
| Social (CCC / FDL) | 4/4 |
| Certifications (+ suspension, PDF) | 4/4 |
| RDUE (diligences, grumes, décision, PDF) | 5/5 |
| Traçabilité (DF10, états, états transmis) | 5/5 |
| Transport (bordereaux, régularisation, PDF) | 4/4 |
| Contrôles terrain et PV | 4/4 |
| Anomalies (registre, filtres, revue, synthèse, PDF) | 4/4 |
| Tableau de bord (+ PDF) | 2/2 |
| **Total** | **92/92** |

**Écrans** : les 20 écrans du Ministère (Tableau de bord, À traiter, Décision, Organisations, Fiche,
Contrôles, Parties prenantes, Menu → Titres, Comptes, Déclarations, Pièces, Études, Certifications,
Anomalies, Traçabilité, Fiscalité, DME, Conventions, Autorisations) n'appellent que des points d'accès vérifiés.

## Ce que vérifient les tests Admin (`tests_e2e/test_admin_0*.py`, 53 tests)

- **Comptes** : liste, désactivation (la connexion est alors refusée) puis réactivation, rôle invalide,
  compte inconnu, interdiction de se désactiver soi-même, nom/matricule fixés par le Ministère visibles
  par l'agent, statistiques, coopératives.
- **Organisations** : annuaire par province, fiche complète (titres, comptes, alertes), création +
  compte rattaché, profils réglementaires, rattachement des comptes legacy **rejouable** (0 au second
  passage), cloisonnement entre entreprises.
- **Titres** : liste/détail, UFA et AAC, **DME d'UFA fixé puis retiré** (le provisoire revient ; refus
  pour une entreprise), **résiliation d'une convention définitive** qui ramène le titre en provisoire
  **vu par l'entreprise**, PDF des conventions, autorisations et études, notification de démarrage visible.
- **Instruction** : déclarations (liste, détail, conformité, plaques QR, rejet motivé **lu par
  l'entreprise**), registre des arbres, pièces (instruction, référentiel ≥ 38 types, validation **vue
  par l'entreprise**), quittances (statut corrigé **vu par l'entreprise**), échéances, CCC/FDL,
  certifications (suspension **vue par l'entreprise**, PDF), RDUE (liste, PDF).
- **Contrôle** : DF10 et PDF, états et PDF, états annuels transmis, bordereaux (liste, détail, PDF,
  **régularisation par le Ministère** jusqu'à la réception), fiche grume sans action à la place de
  l'opérateur, contrôles filtrables avec compétence, registre des anomalies (synthèse, filtres, PDF),
  tableau de bord PDF, files « À traiter » par type et par province.

Avec les tests de parcours (13) et la régression par règle (72 autres tests, dont 21 pour le
cloisonnement des rôles), la suite compte **138 tests**, tous passés sur base neuve.

## Constats

- Aucun défaut applicatif nouveau dans le périmètre Admin : les 5 écarts du premier passage venaient
  des hypothèses des tests (nom d'un filtre `type`, champ `created_count`, type de pièce inexistant,
  profil agent lu via `/api/auth/me`).
- Résidus de données locales : 5 déclarations pilotes orphelines (comptes supprimés à la main lors du
  premier essai du jeu pilote) — supprimées ; sans incidence en CI (base neuve à chaque exécution).
- Rappels des passes précédentes : rejet de titre et de pièce sans motif (corrigés), sapelli présenté à
  tort comme CITES (corrigé), **limite de débit de la passerelle** à décider avant déploiement.

## Lire le rapport sur GitHub

Actions → **Régression** → dernière exécution : le résumé affiche la liste de contrôle règle par règle,
le tableau des refus attendus, puis **« Couverture du Ministère (Admin) »** (par domaine et par écran).
L'artefact `regression-reports` contient JUnit, déroulés et journaux.

---

# Espace Entreprise — inventaire et couverture

Même méthode, rôle `company` (`scripts/role_coverage.py --role company`) : points d'accès dont
`require_roles` nomme `company`, plus ceux ouverts à tout compte connecté (accueil, projets, carte,
espèces). Hors périmètre : la chaîne de scan avec images (`/api/v1`, `/api/v2`), la base de
connaissances et le diagnostic, couverts par leurs propres tests.

Avant : **33/94** points d'accès exercés par un compte entreprise (35 %). Après : **94/94**, et les
19 écrans entreprise (Accueil « À faire », Exploitation, Conformité, Finances, Économie circulaire,
Suivi des grumes, Déclaration, Chantiers et projets, composants partagés titres / conventions /
études / autorisations / DME) n'appellent que des points d'accès vérifiés.

## Ce que vérifient les tests Entreprise (`tests_e2e/test_company_0*.py`, 28 tests)

- **Accueil et profil** : rôle et organisation du compte, **nom saisi par le dirigeant visible par le
  Ministère**, accueil, groupe, arbres du compte.
- **Carte et espèces** : contexte national, tuiles, couches de l'emprise (AAC de l'entreprise),
  recherche, fiche d'un objet, contrôle d'un point ; référentiel et fiche d'essence.
- **Titres et actes** : l'entreprise ne voit **que ses titres** (refus sur ceux d'un tiers), ses UFA,
  AAC (statut) et DME applicable (75 cm d'UFA), conventions + attestation, études, autorisation et
  **leurs PDF** (refusés à un tiers).
- **Opérations** : détail et conformité de ses déclarations, plaques QR, registre limité à ses tiges,
  carnet DF10 et états (PDF), destinataires possibles (jamais elle-même), bordereau (détail, PDF) lu
  aussi par l'usine destinataire et **refusé à un tiers**, diligence RDUE (liste, détail, grumes,
  attestation), CCC et communautés, échéances fiscales (les siennes seulement), attestation de
  certification.
- **Chantiers et projets** : chantier sur **ses AAC seulement**, liste / détail / vue terrain,
  **chantier sur invitation** (rejoindre refusé sans invitation, accepter, quitter), invitation d'un
  compte inconnu refusée, gestion réservée au créateur, statut invalide refusé, **chantier clôturé**
  (adhésion et rattachement refusés), rattacher **son** scan (pas celui d'un autre), une entreprise
  qui participe aux projets des autres (rejoindre, accepter / décliner, quitter, rattacher).
- **Économie circulaire** : résidus de coupe attribués à une coopérative, libérés, refus pour un
  tiers et pour une double libération.

---

# Agent de terrain et Coopérative

Avant : agent **9/37** (24 %), coopérative **0/30**. Après : **37/37** et **30/30**, écrans compris
(Accueil, Chantier, Suivi des grumes, Projets, Historique, Profil ; espace Coopérative).

## Défauts réels révélés et corrigés (Slice 25)

1. **Compte coopérative inutilisable** : un compte « coopérative » créé par le Ministère depuis la fiche
   d'une organisation n'était relié à aucune coopérative communautaire — profil en erreur (400),
   résidus invisibles, collecte impossible. Désormais la coopérative communautaire de l'organisation est
   créée (une seule fois) et reliée au compte, avec son **profil d'activité** et sa **position**
   (migration `029_slice25.sql` : `community_cooperatives.organization_id`).
2. **Agent sans employeur** : un agent créé depuis la fiche d'une organisation n'avait pas le lien
   historique `users.company_id` — en-tête « employeur » en erreur (404), **carnet DF10 vide**,
   **abandon DF10 refusé** (« arbre d'une autre entreprise »), groupe et accueil incomplets. Désormais
   l'agent est relié au compte entreprise de son organisation (et les agents créés avant le dirigeant le
   sont à la création de celui-ci) ; la migration répare les comptes existants.
3. L'en-tête de l'espace entreprise affichait le **nom du dirigeant** au lieu du **nom de
   l'organisation** — corrigé.

## Ce que vérifient les tests (`test_agent_01_field.py` 9, `test_cooperative_01.py` 5)

- **Agent** : accueil, groupe, arbres ; nom saisi **visible par le Ministère** ; rattachement à
  l'employeur (organisation, titres, pièces) ; carte et espèces ; registre limité à son entreprise ;
  carnet DF10 et PDF, états ; **abandon d'une tige au DF10 vu par le Ministère** ; chantier où il est
  invité ; limites du rôle (pas d'ouverture de chantier, d'invitation, de clôture, aucune AAC à choisir).
- **Coopérative** : compte relié à sa coopérative (profil « briquettes énergétiques ») ; **résidus
  attribués par une entreprise, vus à proximité puis collectés**, double collecte refusée, **statut
  « collecté » vu par l'entreprise** ; accueil, carte, espèces, nom remonté au Ministère ; participation
  aux projets ; limites du rôle.

## Bilan

Suite de bout en bout : **180 tests**, tous passés (environnement identique à la CI, sans clé externe).
Couverture **imposée à 100 % pour les quatre rôles** à chaque exécution GitHub : Ministère 92/92,
Entreprise 94/94, Agent 37/37, Coopérative 30/30.
