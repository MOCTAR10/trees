# Audit — parcours complet de l'application

Date : 14 octobre 2026 · état après Slice 21, **mis à jour après Slices 22, 23 et 26** (✔ = corrigé).
Complète `AUDIT_WORKFLOW_MINISTERE.md` (planches du guide Ministère) : ici, le parcours **de bout en bout**
par rôle et le cycle de vie de la grume, vérifiés dans le code **et en conditions réelles** (Postgres live,
données de test supprimées).

Méthode : (1) inventaire des 152 routes de l'API confronté aux appels du client mobile ; (2) navigation
réelle de chaque rôle dans `App.tsx` ; (3) déroulé live déclaration → approbation → abattage → transport →
réception → transformation → contrôle terrain.

## 1. Câblage API ↔ mobile

✅ Toutes les routes métier de l'API ont un appelant dans `mobile/src/api/client.ts` (hors
`/api/knowledge/*`, utilisé côté serveur pour le récit du rapport, et `/api/diagnostics`).
⚠️ Mais **deux fonctions client n'ont aucun écran** : `recordCustodyEvent` (`POST /api/felling/events`) et
`listRegistryTrees` (`GET /api/felling/trees`) — voir § 2.

## 2. Cycle de vie de la grume — rompu hors démonstration → ✔ **corrigé par Slice 22**

| Étape | Attendu | Constat (live) | Gravité |
| --- | --- | --- | --- |
| Déclaration → registre | La tige entre au registre rattachée à son AAC | ✔ `aac_id`, `title_id` et détenteur renseignés ; tiges existantes rattrapées | — |
| Abattage, transport, réception, transformation | L'agent / l'entreprise enregistre chaque événement | ✔ Écran **Suivi des grumes** (agent et entreprise) : abattage, transformation, réception | — |
| Réception | Statut `receptionne` | ✔ Statut ajouté ; posé par la réception du bordereau | — |
| Transformation | `transforme` après réception | ✔ Par le détenteur après réception ; messages de refus propres à chaque étape | — |
| Transport | Bordereau ⇄ statut des grumes | ✔ Émettre ⇒ `transporte` ; transport grume par grume refusé (art. 135) | — |
| Réception par l'usine | Le destinataire (autre organisation) réceptionne | ✔ Organisation destinataire choisie à l'émission ; elle seule réceptionne et devient détentrice | — |

✔ Corrigé par Slice 22. **Conséquences qu'avait l'`aac_id` manquant** (tout fonctionne sur la démo, rien sur des données réelles) :
avancement des **chantiers** (Slice 19), **carbone par AAC** (tableau de bord), avertissement **« carnet non
tenu »** et **lookup des contrôles terrain** (Slice 21) — testé : une tige déclarée normalement est signalée
✗ « Arbre sans AAC enregistrée » et sans organisation.

## 3. Parcours par rôle

### Agent de terrain (`operator`)
✅ Accueil, scan guidé hors-ligne, rapport, chantiers / projets, carte, espèces.
✔ Enregistre l'**abattage** depuis « Suivi des grumes » (Accueil), pour l'organisation de son employeur (Slice 22).
✔ Inventaire avant abattage : une plaque inconnue scannée inscrit l'arbre `inventorie` (AAC du point), repris à la déclaration (Slice 26).

### Entreprise (`company`)
✅ Pièces, titres & AAC (autorisations, conventions, études, DME), taxes, traçabilité (DF10, bordereaux),
fiscalité & social, certifications, déclarations (AAC + porte art. 14), chantiers.
✔ L'espace s'ouvre sur l'**Accueil « À faire »** ; navigation regroupée en 5 espaces (Slice 23).
✔ **Décisions reçues** (avec motif et autorité) sur l'Accueil (Slice 23) ; notifications push : à venir.
✔ Voit ses **anomalies** ouvertes et les **PV de contrôle** la concernant (Slice 23).
✔ Ouvre et suspend **ses propres comptes d'agents** (onglet Équipe, Slice 26).
🟡 Accueil et navigation dans le design system (Slice 23) ; les écrans internes gardent l'ancien `theme.ts` (thème sombre forcé).

### Coopérative (`cooperative`)
✅ Espace en quatre onglets (Slice 33, téléphone uniquement, système de design) : **Synthèse** (membres actifs, titres, AAC, volumes déclaré / autorisé / abattu, grumes par statut, pièces manquantes et taxes en retard des membres), **Membres** (ajout par recherche — nom, type, provinces seulement —, suspension / sortie motivées, réactivation, anciens membres listés mais non comptés, fiche d'un membre en lecture seule), **Conformité** (profil `cooperative_forestiere`, 4 pièces à déposer, *à valider par le métier*), **Résidus** (collecte, inchangée).
✔ Le Ministère gère aussi les adhésions depuis la fiche de la coopérative ; une entreprise membre voit « Membre de la coopérative … » sur son Accueil (lecture seule).
🟡 Appartenance à plusieurs coopératives admise, *à valider par le métier*.

### Ministère (`admin`)
✅ Tableau de bord, À traiter + page de décision, organisations, contrôles terrain, anomalies, carte.
✔ **PV PDF** de chaque contrôle (Ministère et opérateur contrôlé, Slice 24) ; ✔ **suites** (mise en demeure, amende,
transaction, saisie, suspension, poursuites), contestation par l'organisation, anomalie si échue (Slice 26).
✔ **Registre de transformation** (entrées réceptionnées, lots, rendement matière, PDF, alerte) consultable par organisation (Slice 26).
🟡 Rôle unique (`admin`) : ✔ chaque action indique « réalisé par le Ministère pour le compte de … » et la page **Parties prenantes** sert de boussole (Slice 23) ; séparation effective après le pilote.

## 4. Échéances légales non suivies (rappel)

✔ Ouverture d'AAC **3 ans** (art. 121) et états annuels au **31 mars** (art. 244) suivis (Slice 24). Restent : étapes
**comité / décret** du plan d'aménagement, grille des **30 AAC** générée depuis le PA.

## 5. Proposition de priorités

1. ✔ **Cycle de vie de la grume (Slice 22)** — fait. : `aac_id` à la déclaration (+ rattrapage des lignes existantes
   par `aac_label`/titre), statut `receptionne` au registre, messages de transition corrects ; écran
   **Abattage / Transport** pour l'agent et l'entreprise (lecture QR → abattu, avec GPS/photo) ; émission
   d'un bordereau = grumes `transporte`, réception (par le destinataire) = `receptionne`.
2. ✔ **Espace entreprise « À faire »** — fait (Slice 23). : ouvrir sur les actions dues et les décisions reçues (avec motif),
   anomalies et PV la concernant ; migrer l'espace vers le design system.
3. ✔ **PV de contrôle** en PDF (Slice 24) — et suites d'un contrôle non conforme (à valider par le métier).
4. 🟡 ✔ Échéances AAC / état annuel (Slice 24), ✔ registre de transformation (Slice 26), ✔ profil coopérative et agrégation des volumes (Slice 33) ; restent les étapes du PA.

## 6. Vérification par le jeu pilote (Slice 23)

Le parcours complet est désormais rejoué **par l'API** (`tools.seed_pilot`, `tests_e2e/`) : 170 appels, dont
20 étapes que les règles doivent refuser. Défauts révélés et corrigés : rejet d'un **titre** et d'une
**pièce** acceptés sans motif. La suite de bout en bout tourne sur PostgreSQL réel ; son branchement en CI est
la prochaine étape.

## 7. Audit complet du 15 octobre 2026

Portes : `pytest`, `tests_e2e` (PostgreSQL réel, clés externes vidées comme en CI), couverture par rôle **100 %**,
passerelle, `tsc` / `jest`, **audit des écrans** de chaque rôle sur les données pilote (aucun `undefined`, date ISO,
décimale anglaise, code interne ni état d'erreur), **sonde d'accès inter-organisations** (575 appels sur les
enregistrements d'autres organisations : aucune fuite — la scierie ne voit que les grumes qui lui sont adressées),
secrets (aucun suivi par git). Défauts corrigés : textes serveur et écrans en format anglais (dates, décimales,
codes) ; trois tests mobiles et le jeu d'écrans enregistré désynchronisés. Écarts fonctionnels traités en
**Slice 26** : inventaire par scan, comptes d'agents par l'entreprise, registre de transformation, suites des
contrôles, limite de débit par session. Reste : **séparation des autorités** (après le pilote, décision figée).
