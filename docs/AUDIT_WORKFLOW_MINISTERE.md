# Audit — `VISUEL_WORKFLOW_MINISTERE.pdf` vs implémentation

Date : 14 octobre 2026 · état après Slice 19 (commit `1078b1e`), **mis à jour après Slices 20 et 21** (✔ = corrigé par Slice 20 ou 21).
Méthode : chaque planche confrontée au code (`backend-python/app`), au schéma
de la base live et aux écrans mobiles. ✅ implémenté · ⚠️ partiel · ❌ absent.

## Planche 2 — les 11 étapes

| # | Entreprise → Autorité | État | Où / écart |
| --- | --- | --- | --- |
| 1 | Agrément professionnel → délivré par DGF / DGICBVPF (art. 102) | ⚠️ | Pièce `agrement_*` déposée puis **vérifiée** (`legal_documents`) ; pas d'acte « délivrer l'agrément » côté Ministère. |
| 2 | Exploration + inventaire → autorisation ≤ 12 mois | ✅ | `forest_titles` `demande → exploration` (365 j). |
| 3 | CPAET → convention provisoire ≤ 3 ans (art. 106–109) | ✅ | statut `provisoire` (1 080 j) + `title_conventions`. |
| 4 | PA + PI → avis comité → agrément → décret (art. 20–26) | ⚠️ | passage `actif` + `pa_approved_at` ; **pas d'étapes comité / décret**. |
| 5 | Inventaire, PAO, CCC → autorisation d'exploiter (art. 45 / 121) | ✅ | AAC `prepare → soumis → autorise → ouvert → ferme`, 4 autorisations (art. 14), CCC/FDL. |
| 6 | Marquage (marteau + code) → **contrôle du marquage** (art. 130–133) | ✔ | contrôle terrain `marquage` (Slice 21) : lecture QR/code, vérification marteau/DF10, résultat + PV + GPS. |
| 7 | Déclaration d'abattage → approuver / rejeter | ✅ | porte de conformité + décision motivée. |
| 8 | DF10 alimenté auto → **visa du carnet** (art. 49) | ✔ | registre DF10 + PDF ✅ ; visa enregistré comme contrôle `visa_df10` sur l'AAC (Slice 21). |
| 9 | Bordereau / feuille de route → **contrôle en route** (art. 135) | ✔ | contrôle `route` (Slice 21) : lecture QR de la grume ou n° de bordereau, « en transport sans bordereau » détecté, PV ; non conforme → anomalie grave. |
| 10 | Transformation (registre) → contrôle DGICBVPF | ⚠️ | statut `transforme` + états ; acte de contrôle `transformation` ✔ (Slice 21) ; pas de registre entrées/sorties détaillé. |
| 11 | États annuels (31 mars) + taxes → contrôle DGF · DGI · Douanes (art. 244) | ⚠️ | états par période + échéancier fiscal ✅ ; échéance du 31 mars non suivie ; transmission DGI / Douanes « à brancher ». |

## Planche 3 — Titre → UFA → 30 AAC

- ✅ Titre, UFA (`management_units`, réf. PA, rotation), AAC, DME par UFA.
- ⚠️ La **grille des 30 AAC** n'est pas générée depuis le PA (AAC créées une à une).
- ⚠️ « AAC ouverte **3 ans** (art. 121) » : pas d'échéance d'ouverture suivie (seule l'anomalie `aac_fermee`).

## Planches 4–6 — documents & autorités

- ✅ Référentiel `document_types` : **38 types**, chacun avec autorité, validité et base légale — conforme à la planche 6 (agrément, quittances, PI/PDI, CPAET, PA, PG, PAO, PPF, EIE, redevance de surveillance, DF10, bordereau, spécification, CITES, taxe d'abattage export…).
- ⚠️ EIE : planche « DGE / DGFAP », référentiel « DGE ».
- ❌ **Multi-autorités** : toutes les décisions sont prises par un `admin` unique (décision figée §10 pt 3). L'autorité compétente est connue par document mais **pas affichée** dans les files de décision.

## Planche 7 — les 4 autorisations (art. 14)

✅ Certificat annuel d'assiette, Permis annuel d'opérations, Certificat de vente de coupe, CAE ; cycle demande → décision (motif obligatoire au rejet) → notification de démarrage.

## Planche 8 — porte de conformité

| Règle | Attendu | Implémenté |
| --- | --- | --- |
| Sans autorisation (art. 14) | **Bloqué** | ✔ **Bloqué** à la déclaration (Slice 20) : AAC obligatoire de l'organisation, autorisation délivrée et valide, démarrage notifié (`authorization_gate`). |
| Sous le DME (art. 124) | Bloqué | ✅ `below_dme` |
| Essence mise en réserve | Bloqué | ✅ `reserved_species` |
| Code arbre en doublon | Bloqué | ✅ `duplicate_code` |
| Arbre hors de l'AAC | Bloqué | ✅ `outside_aac` (PostGIS) |
| Document expiré | Avertissement | ✅ pièces requises par le profil |
| Taxe impayée (art. 283) | Avertissement | ✅ quittances / échéances en retard |
| Autorisation en attente | Avertissement | ✔ distinguée (`authorization_pending`) ; bloque l'**abattage** sur cette AAC (art. 14), reste un avertissement pour les autres dossiers |
| Carnet non tenu | Avertissement | ✔ `logbook_not_kept` : tiges abattues de l'AAC sans n° DF10 (Slice 21) |
| CITES sans permis | Avertissement | ✔ `cites_without_permit` : permis CITES d'exportation valide de l'organisation vérifié (Slice 21) |
| *(en plus)* Aire protégée / hors concession | — | ✅ avertissements GFW |

## Planche 9 — types d'opérateurs

✅ Exploitant forestier, Transformateur, Intégré, Négoce / Export, Forêt communautaire (`org_profiles`).
❌ **Coopérative** : pas de profil (organisations coopératives à `profile_code` NULL) — « organisation, titres, agrégation des volumes » non modélisés.

## Planche 10 — trois scénarios

✅ Conforme (passe) · ✅ Irrégularité DME / hors AAC / essence réservée (bloquée) · ✅ Avertissement (document, taxe → l'agent décide). ✔ Le cas « sans autorisation » est désormais bloqué (Slice 20).

## Planche 11 — traçabilité de la grume

✅ Autorisation, marquage, déclaration, DF10, bordereau, statuts jusqu'à `transforme`, diligence RDUE à la parcelle + géolocalisation par grume, certification (complémentaire).
⚠️ Réception en usine « QR par grume » : plaques QR et lien arbre ✅, pas d'écran de réception par lecture QR.

## Écarts à traiter (priorité)

1. ✔ **Porte de conformité — art. 14** : fait (Slice 20), avec choix de l'AAC dans l'écran entreprise.
2. ✔ **Autorité compétente et province** affichées sur chaque dossier (Slice 20, files « À traiter »).
3. ✔ **Contrôles terrain du Ministère** : marquage, visa DF10, route (lecture QR + PV), transformation (Slice 21) ; modèle officiel de PV à valider.
4. ✔ Avertissements carnet non tenu et CITES sans permis (Slice 21).
4 bis. ✔ **Page de décision unique** pour chaque dossier « À traiter » (Slice 21).
5. Profil **coopérative** : création d'organisation coopérative possible (Slice 20) ; profil réglementaire (agrégation des volumes) à définir.
6. Étapes comité / décret du PA, grille des 30 AAC, échéance d'ouverture de 3 ans, échéance du 31 mars.
