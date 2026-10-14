# Audit — parcours complet de l'application

Date : 14 octobre 2026 · état après Slice 21 (non poussé).
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

## 2. Cycle de vie de la grume — **rompu hors données de démonstration**

| Étape | Attendu | Constat (live) | Gravité |
| --- | --- | --- | --- |
| Déclaration → registre | La tige entre au registre rattachée à son AAC | `tree_registry` reçoit `aac_label` mais **jamais `aac_id`** (seul le jeu de démo le renseigne) | 🔴 |
| Abattage, transport, réception, transformation | L'agent / l'entreprise enregistre chaque événement | **Aucun écran** n'appelle `POST /api/felling/events` : une tige approuvée reste `autorise` pour toujours dans l'application | 🔴 |
| Réception | Statut `receptionne` | Le registre **n'a pas** de statut `receptionne` (contrainte CHECK) ; l'événement laisse `transporte` | 🔴 |
| Transformation | `transforme` après réception | Exige `receptionne`, jamais atteint → **409 systématique** (testé). Le message cite à tort l'« art. 14 » pour toute transition | 🔴 |
| Transport | Bordereau ⇄ statut des grumes | Émettre / réceptionner un bordereau **ne change pas** le statut des grumes ; l'événement `transporte` est accepté **sans bordereau** (le contrôle terrain le détecte après coup) | 🟠 |
| Réception par l'usine | Le destinataire (autre organisation) réceptionne | Seule l'**organisation émettrice** (ou le Ministère) peut passer le bordereau à `receptionne` | 🟠 |

**Conséquences de l'`aac_id` manquant** (tout fonctionne sur la démo, rien sur des données réelles) :
avancement des **chantiers** (Slice 19), **carbone par AAC** (tableau de bord), avertissement **« carnet non
tenu »** et **lookup des contrôles terrain** (Slice 21) — testé : une tige déclarée normalement est signalée
✗ « Arbre sans AAC enregistrée » et sans organisation.

## 3. Parcours par rôle

### Agent de terrain (`operator`)
✅ Accueil, scan guidé hors-ligne, rapport, chantiers / projets, carte, espèces.
❌ Ne peut enregistrer **ni l'abattage ni le transport** d'une tige qu'il a mesurée (§ 2).
⚠️ Inventaire avant abattage : un scan lié par QR n'alimente pas le registre (`inventorie` n'est jamais posé).

### Entreprise (`company`)
✅ Pièces, titres & AAC (autorisations, conventions, études, DME), taxes, traçabilité (DF10, bordereaux),
fiscalité & social, certifications, déclarations (AAC + porte art. 14), chantiers.
🟠 L'espace s'ouvre sur **« Résidus »** (économie circulaire, historique) ; **8 onglets** horizontaux ; pas
d'écran **« À faire »** (pièce expirée, taxe en retard, dossier rejeté, autorisation délivrée à notifier).
🟠 Aucune **notification** des décisions du Ministère : il faut ouvrir chaque onglet.
🟠 Ne voit **ni ses anomalies ni les PV de contrôle** la concernant (droit de réponse / contradictoire).
🟠 Ne peut pas créer **ses propres comptes d'agents** (seul le Ministère le peut) — choix à confirmer.
🟡 Thème sombre forcé et ancien `theme.ts` (pas encore migré vers le design system).

### Coopérative (`cooperative`)
🟠 Seulement la collecte de résidus. Pas de profil réglementaire (agrégation des volumes, planche 9).

### Ministère (`admin`)
✅ Tableau de bord, À traiter + page de décision, organisations, contrôles terrain, anomalies, carte.
🟠 Contrôle terrain : **pas de PV PDF** (seul document Ministère sans PDF) ; les suites (saisie, amende —
art. 15) ne sont pas modélisées.
🟠 Pas de **registre de transformation** (entrées / sorties d'usine) à contrôler.
🟡 Rôle unique (`admin`) : autorité et province affichées, non appliquées (décision figée §10 pt 3).

## 4. Échéances légales non suivies (rappel)

Ouverture d'AAC **3 ans** (art. 121), états annuels au **31 mars** (art. 244), étapes **comité / décret** du
plan d'aménagement, grille des **30 AAC** générée depuis le PA.

## 5. Proposition de priorités

1. 🔴 **Cycle de vie de la grume (Slice 22)** : `aac_id` à la déclaration (+ rattrapage des lignes existantes
   par `aac_label`/titre), statut `receptionne` au registre, messages de transition corrects ; écran
   **Abattage / Transport** pour l'agent et l'entreprise (lecture QR → abattu, avec GPS/photo) ; émission
   d'un bordereau = grumes `transporte`, réception (par le destinataire) = `receptionne`.
2. 🟠 **Espace entreprise « À faire »** : ouvrir sur les actions dues et les décisions reçues (avec motif),
   anomalies et PV la concernant ; migrer l'espace vers le design system.
3. 🟠 **PV de contrôle** en PDF et suites d'un contrôle non conforme (à valider par le métier).
4. 🟡 Échéances légales (§ 4), profil coopérative, registre de transformation.
