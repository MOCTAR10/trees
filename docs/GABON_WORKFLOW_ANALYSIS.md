# Gabon — Chaîne de valeur forestière légale & workflow cible (Ministère / Entreprise)

> Analyse croisée : **Code Forestier — Loi n° 016/01 du 31 décembre 2001** (`docs/LOI N°016_01 code forestier.pdf`)
> × **Timber Trade Portal — Fiche Pays Gabon** (Contexte & risques, Chaîne d'approvisionnement,
> Cadre légal, Documents clés, Tierce partie & certification)
> × **état actuel du code** (`backend-python`, `db/`, `mobile`).
>
> Objectif : dériver le workflow « Ministère » (autorité) et « Entreprise » (opérateur économique),
> avec les **documents à téléverser** à chaque niveau et les règles de conformité vérifiables.

---

## 1. Ce que dit la Loi 016/01 (articles structurants)

### 1.1 Principes
- **Art. 13** — Toute forêt est propriété exclusive de l'État.
- **Art. 14** — Nul ne peut exploiter / récolter / transformer un produit forestier **sans autorisation préalable** de l'administration des Eaux et Forêts (hors droits d'usage coutumiers).
- **Art. 15** — L'administration est **paramilitaire** : information, contrôle, police, répression.
- **Art. 5–12** — Domaine forestier **permanent** (forêts domaniales classées + productives enregistrées) et **rural**.

### 1.2 Aménagement (par Unité Forestière d'Aménagement — UFA)
- **Art. 20–22** — Toute forêt domaniale doit avoir un **plan d'aménagement** : analyse socio-économique + biophysique, essences objectifs, rotation (≥ 20 ans), **DME/UFA**, possibilité annuelle, infrastructures, mesures sociales/environnementales.
- **Art. 23** — Le plan d'aménagement est **accompagné d'un plan d'industrialisation**, déposé **dans les 3 ans** de la convention provisoire (sinon annulation).
- **Art. 28–30** — Le plan d'aménagement est décliné en **plans de gestion** (par UFG), puis **AAC** et **PAO**.
- **Art. 39–40** — Le PAO est présenté avec le **Cahier des Clauses Contractuelles (CCC)**.
- **Art. 44 / 52** — Délais de l'administration : 3 mois (plan de gestion) / 2 mois (plan d'opérations) ; **silence = acceptation**.
- **Art. 45–48** — **PAO** par AAC ; une **AAC reste ouverte 3 ans** puis se ferme jusqu'à la fin de la rotation.
- **Art. 53–65** — **Inventaire d'aménagement** (tiges ≥ 20 cm, classes de 10 cm, précision 10 %) et **inventaire d'exploitation** (avant PAO, achevé 3 mois avant ouverture de l'AAC) ; cartographie SIG.

### 1.3 Permis forestiers
- **Art. 94** — Permis industriels : **CFAD**, **PFA**, **PGG**.
- **Art. 97** — **CFAD** : 50 000 – 200 000 ha ; plafond **600 000 ha** par titulaire.
- **Art. 96 / 99 / 100** — **PFA** : réservé aux **nationaux** ; ≤ 15 000 ha intégré en CFAD, ≤ 50 000 ha en aménagement propre.
- **Art. 95** — **PGG** : nationaux, **≤ 50 pieds**, domaine rural, à des fins de transformation locale.
- **Art. 102–103** — **Agrément professionnel** obligatoire (délai 3 mois ; silence = acceptation).
- **Art. 104–105** — **Comité pour l'industrialisation de la Filière Bois** (avis préalable).
- **Art. 106–111** — Procédure **CFAD** : **autorisation d'exploration** (≤ 12 mois, affichage 30 j) → **CPAET** (≤ 3 ans, 3 AAC provisoires ≤ 1/10ᵉ) → dépôt **PA + plan d'industrialisation** → avis Comité → agrément Ministre → **décret du Premier Ministre**.
- **Art. 112–113** — **PFA** attribué par **arrêté** du Ministre ; exploitation subordonnée à une **autorisation d'exploiter** du Chef d'Inspection Provinciale.
- **Art. 114** — **PGG** instruit à l'Inspection Provinciale.

### 1.4 Exploitation (récolte) et traçabilité
- **Art. 119–122** — Les **AAC** sont délimitées avant le PAO ; le PAO est transmis à l'**Inspection Provinciale** ; l'ouverture dépend de l'**autorisation d'exploiter** ; **marquage** des arbres à exploiter / à préserver **sous contrôle** de l'administration.
- **Art. 124** — On n'abat que les arbres **≥ DME** (DME/UFA), hors essences mises en réserve.
- **Art. 125–126** — Exceptions : arbre encroué ; abattages pour pistes / parcs / campements (souches laissées pour contrôle).
- **Art. 127–129** — Chaque titulaire possède un **marteau** enregistré ; tout arbre abattu est marqué (marteau + **code d'identification** sur souche, culée, grumes).
- **Art. 49 / 130–133** — **Carnet journalier d'abattage** + **carnet de chantier** (côté/paraphé par le Chef d'Inspection ; arrêté au 31 janvier).
- **Art. 134** — Interdiction d'abandonner des grumes de valeur (≥ 6 mois = abandon → propriété de l'État).
- **Art. 135** — **Feuille de route** (triple exemplaire) pour l'évacuation.
- **Art. 138–140** — **Feuille de spécification** pour achat/vente (visée par le service forestier ; subordonnée au paiement des taxes).
- **Art. 50–51 / 136–137 / 230** — **États trimestriels** et **états récapitulatifs annuels** (31 mars).

### 1.5 Industrialisation, commercialisation, taxes
- **Art. 223–226** — 1ʳᵉ/2ᵈ/3ᵉ transformation ; **plan d'industrialisation** (faisabilité, EIE, chronogramme, équipements, statuts/agrément, agrément professionnel).
- **Art. 231 / 227** — Taux de transformation locale (75 % légal, porté à **100 %** par l'interdiction d'export des grumes depuis le **15 mai 2010**).
- **Art. 235** — Monopole d'État sur **okoumé** et **ozigo**.
- **Art. 244–251** — Taxes/redevances : **abattage, superficie, renouvellement, transfert, transformation par sciage, droits de sortie, fermage, surcharge export hors quota, charges forestières** ; **Fonds** (art. 250) ; **contribution au développement communautaire** (art. 251, via le **CCC**).
- **Art. 252–261** — Droits d'usage coutumiers.

### 1.6 Répressif (à contractualiser en règles automatiques)
- **Art. 275** — Exploitation sans titre, coupe hors limites, **mauvaise tenue des carnets**, **non-paiement des taxes**, **non-présentation des documents techniques/comptables**.
- **Art. 276** — Exploitation sans plan d'aménagement agréé, non-respect du plan, non-respect des quotas.
- **Art. 279** — **Fausse déclaration** en matière forestière.
- **Art. 280** — Falsification des **marteaux** / titres.

---

## 2. Timber Trade Portal — documents clés par niveau

### 2.1 Niveau entreprise (agrément / fiscalité / industrie)
| Document | Autorité | Validité | Base légale |
| --- | --- | --- | --- |
| **Agrément professionnel** (exploitation/vente grumes : DGF ; transformation : DGICBVPF) | DGF / DGICBVPF | — | Art. 102 |
| **Quittance taxe de superficie** (400 F CFA/ha, ≤ 31 mars) | DGI | Annuelle | Art. 244 |
| **Certificat de conformité du Plan d'Industrialisation (PI)** | DGICBVPF | — | Art. 23 / 226 |
| **Certificat de conformité du Plan de Développement Industriel (PDI)** | DGICBVPF | — | Art. 226 |

### 2.2 Niveau unité d'aménagement (UFA / AAC)
| Document | Autorité | Validité | Base légale |
| --- | --- | --- | --- |
| **Autorisation de mise en exploitation** (AAC) | Direction Provinciale | 3 ans | Art. 121 |
| **CPAET** (convention provisoire aménagement-exploitation-transformation) | MEFME / DGF | 3 ans non renouvelable | Art. 106–109 |
| **Plan d'Aménagement (PA)** | Ministre / DGF | 30 ans (révision 5 ans) | Art. 20–26 |
| **Plan de Gestion (PG)** | DGF | — | Art. 28–30 |
| **PAO** | Direction Provinciale | Annuel | Art. 45, 121 |
| **Plan de Protection de la Faune (PPF)** + certificat de conformité | DGFAP | — | — |
| **Étude d'Impact Environnemental (EIE)** + certificat de conformité | DGE / DGFAP | Annuelle | Loi 007/2014 |
| **Quittance redevance de surveillance** (≤ 300 F CFA/ha) | AGEOS / Trésor | Annuelle | Loi de finances 2018 |

### 2.3 Niveau produit (chaîne de production)
| Document | Autorité | Base légale |
| --- | --- | --- |
| **Carnet de chantier (DF10)** | Direction Provinciale / Cantonnement | Art. 49, 130–133 |
| **Quittance taxe d'abattage à l'exportation** (1,5 % produits transformés) | Douanes | Art. 244 |
| **Bordereau de roulage / transport** | Autorité forestière provinciale | Art. 135 |
| **Spécification** | Autorités forestières ports/provinciales | Art. 138–140 |
| **Permis d'exportation CITES** | ANPN (avis scientifique) + DGICBVPF (organe de gestion) | CITES |

### 2.4 Social / droits des tiers / EUDR
- **PV de consultation des parties prenantes**, **suivi des griefs**, **copie du plan d'aménagement / PSG** (CLPE/FPIC — la loi gabonaise impose information/consultation/participation, **pas** un CLPE général).
- **Certificat de conformité PI/PDI** (droits des tiers).
- **Gabon classé « risque faible » EUDR** ; diligence raisonnée au niveau de la **parcelle d'origine**.
- Espèces sous contrainte : **Kévazingo** (Guibourtia spp., CITES II) **interdit** ; **Afo, Andok, Douka/Makoré, Moabi** mises en réserve 25 ans (décret 2009) ; **Ozigo** encadré (décret 2016).

### 2.5 Contexte & risques (Fiche Pays)
- **23,5 M ha** de forêt ≈ **87 %** du territoire ; **14 M ha** de forêt de production ; **100 % propriété publique** (État).
- Domaine **permanent** (concessions + aires protégées) et domaine **rural** (droits coutumiers).
- Déforestation **0,12 %/an**, dégradation **0,09 %/an** ; 13 parcs nationaux (> 12 % du territoire).
- Indicateurs macro : **CPI 29/100**, **IDAT 84,06/100**, **Sourcing Hub 3/100**, **EUDR = FAIBLE RISQUE**.
- ⚠️ Le Gabon étant « risque faible » EUDR, la diligence raisonnée reste **au niveau de la parcelle d'origine** (RDUE art. 9–11) — le titre valide ne suffit pas.

### 2.6 Chaîne d'approvisionnement (structure industrielle)
- **4 titres** : CFAD, PFA, PGG (domaine permanent) + **Forêts Communautaires** (domaine rural).
- **3 profils d'opérateurs** post-interdiction export grumes : **intégré** (concession + usine), **forestier seul** (pas d'usine), **industriel** (usine sans concession → risque d'approvisionnement).
- **24 essences** principales ; l'**Okoumé** = **> 60 %** des grumes. Sciages **> 70 %** de la production ; placage/contreplaqué notable (top 5 mondial du placage).
- **197 unités** de transformation en 2020 (dont 70 à la **ZES de Nkok**) ; sciages exportés **> 85 %** ; **> 40 % vers la Chine**, **~30 % Europe**.
- **Logistique** : ports d'**Owendo** (Libreville) et **Port-Gentil** ; sites sous douane (**Franceville**, hub **Lastourville**, Nkok).
- Ordres de grandeur 2019 : **97 concessions** / **12,74 M ha** sous aménagement ; **51 FC** en convention définitive (259 883 ha) + **41** provisoires (113 454 ha).

### 2.7 Certification tierce partie
- Objectif national annoncé en 2019 : **100 % des concessions certifiées d'ici 2022** (retrait possible du titre sinon).
- **Gestion durable** : **FSC 2 062 190 ha** ; **PAFC (PEFC) 596 822 ha**.
- **Légalité+** : FSC CW/FM **235 593 ha** ; OLB (BV) 0 ; LS (Nepcon) **321 428 ha** ; TLV (CU) **431 528 ha**.
- Norme **PAFC BC** validée le 26–27 octobre 2020.
- La certification **ne remplace pas** la diligence raisonnée EUDR, mais apporte des preuves (HVC, CLPE, griefs, social).

---

## 3. Chaîne de valeur de référence (workflow légal)

```
[Entreprise]                                   [Ministère / Administration]
    │
    ├─1. Agrément professionnel ───────────────► délivre (DGF/DGICBVPF)
    │
    ├─2. Demande d'exploration ────────────────► Autorisation d'exploration (≤12 mois)
    │        + inventaire d'exploration
    │
    ├─3. Dépôt projet CPAET + inventaire ──────► CPAET (≤3 ans, 3 AACp ≤10 %)
    │
    ├─4. Dépôt PA + Plan d'industrialisation ──► Comité FIFB (avis) → agrément Ministre
    │                                              → décret PM = CFAD  (ou arrêté PFA)
    │
    ├─5. Demande ouverture AAC
    │        + inventaire d'exploitation ──────► validation → PAO + CCC approuvés
    │        + PAO + CCC                        → Autorisation d'exploiter (AAC ouverte 3 ans)
    │
    ├─6. Marquage des arbres (QR/peinture/GPS)  [contrôle administration]
    │
    ├─7. Déclaration d'abattage (stems ≥ DME) ─► autorisation (art. 14 + 124)
    │        + marteau + code arbre
    │
    ├─8. Abattage → carnet de chantier (DF10)   [visa Inspection Provinciale]
    │        → quantification résidus (Phase 2)
    │
    ├─9. Transport → bordereau de roulage /
    │        feuille de route / spécification
    │
    ├─10. Transformation → registre entrées/sorties, états trimestriels
    │
    └─11. États annuels (31 mars) + taxes ─────► contrôle DGF / DGI / Douanes
```

### 3.1 Précisions de chronologie (Cadre légal TTP)
- **Titre (permanent)** : appel d'offre → **convention provisoire d'exploitation** (≤ 3 ans, non renouvelable) ;
  pendant ces 3 ans : **inventaire multi-ressources** + **plan d'aménagement** → **attestation de conformité** →
  demande de **convention définitive d'exploitation** (**15 ans**, renouvelable 1 fois) attribuée par **décret du Premier Ministre** sous forme de concession (CFAD).
- **Découpage** : PA (30 ans, révisé 5 ans) → série de production en **6 unités quinquennales** → **5 AAC chacune** = **30 AAC/UFA**.
- **Avant récolte** : **PAO par AAC** (issu de l'**inventaire d'exploitation**) soumis à la Direction des Forêts pour vérification/approbation. Après approbation, délivrance de :
  - **Certificat annuel d'assiette de coupe** (UFA en convention provisoire), ou
  - **Permis Annuel d'Opérations** (UFA avec PA validé), ou
  - **Certificat de vente de coupe** (ventes de coupe) ;
  + **Notification de démarrage des activités** auprès de la délégation régionale des forêts.
- **DF10** : carnet **sécurisé** fourni par l'administration, précisant **UFA + AAC**, essences, dimensions, **n° de grume + code-barres** (pas encore systématique), tenue **quotidienne**, signé par l'administration ; sert à déterminer la **taxe d'abattage**.
- **Forêt Communautaire (FC)** : demande d'une **association villageoise** → réunions d'information/cartographie participative → **convention provisoire** → **PSG** (blocs de 5 ans + inventaire plein du 1er bloc) → **convention définitive de gestion** (rotation **25 ans**). Pour exploiter : **CAE** délivré sur plan annuel d'activités + pièces (PV/attestation/certificat de matérialisation des limites, attestation d'expertise + certificat de conformité du rapport d'inventaire d'exploitation).
- **Environnement** : **EFI** obligatoire sur toutes les exploitations ; **EIE** si l'UFG couvre une zone tampon de réserve/parc ou pour une usine ; **PPF** obligatoire.

---

## 4. État actuel du système (rappel)

**Rôles** : `operator`, `company`, `cooperative`, `admin`.

**Existant backend** :
- `tree_scans` (mesure V1), `tree_scans_and_residues` (résidus/marketplace), `community_cooperatives`.
- `projects` / `project_participants` (campagnes scans Ministère/entreprises).
- **Abattage** (`008_abattage.sql`) : `tree_registry`, `felling_declarations` + `declaration_lines`, `custody_events`.
  - Entreprise déclare (permis `CFAD/PFA/PGG/ASC/ACBSL/foret_communautaire`, n° permis, UFA, AAC, année, lignes).
  - Contrôles auto : `below_dme`, `cites_listed`, `duplicate_code`, `no_measurement`.
  - Ministère (`admin`) tranche `autorisee/rejetee` → arbre `autorise`.
  - Événements de garde : `abattu → transporte → receptionne → transforme` (machine à états).
- `admin.py` : stats, utilisateurs, coopératives, anomalies (`below_dme_authorized`, `felled_without_authorization`).
- Mobile : `CompanyScreen` (résidus + onglet Abattage), `DeclareScreen`, `AdminScreen` (stats/users/déclarations/anomalies), `ProjetsScreen`.

---

## 5. Écarts (gap analysis)

| Domaine légal | Support actuel | Écart |
| --- | --- | --- |
| Titre/permis comme entité (CFAD/PFA/PGG/FC) | `tree_registry.permit_number` (chaîne libre) | ❌ Pas de table titre (surface, dates, titulaire, zone, statut) |
| Cycle exploration → CPAET → PA/PDI → CFAD | absent | ❌ Pas de workflow de demande/approbation |
| UFA / UFG / AAC / PAO | `ufa_label`, `aac_label` (chaînes) | ❌ Pas d'objets ni de statut d'ouverture/validité |
| Abattage hors AAC (contrôle spatial) | `compliance.lines_outside_aac` (PostGIS `ST_Covers`) | ✅ Bloque (`outside_aac`) — géométrie AAC requise |
| Documents légaux (entreprise/UFA/produit) | **absent** | ❌ Aucun téléversement, validité, autorité, vérification |
| DME/UFA (par UFA) | DME provisoire par espèce (`core/dme.py`) | ⚠️ DME global, pas par UFA/plan d'aménagement |
| Essences mises en réserve (Afo, Moabi, Kévazingo…) | `core/reserved_species.py` (liste provisoire) | ✅ Bloque (`reserved_species`, Art. 124) ; liste à consolider avec l'arrêté |
| Détection d'anomalies (illégal + conformité) | `services/anomalies.py` + `/api/anomalies` + `anomaly_reviews` | ✅ **9 familles** dérivées à la lecture, revue Ministère (`traitee`/`ecartee` motivé) + registre PDF — §7.2 pt 5 |
| Carnet de chantier / DF10 | Registre dérivé de `tree_registry` (`df10_entry_no`, `abandon_code`) + PDF | ✅ N° DF10, codes conventionnels d'abandon, export PDF ; visa administration à brancher (Slice 5) |
| Transport (bordereau/feuille de route/spécification) | `transport_documents` (périmètre organisation) + PDF | ✅ Cycle `brouillon→émis→réceptionné`, volume estimé ; QR par grume à brancher |
| Taxes/redevances (superficie, abattage, surveillance) | `tax_receipts` + **`tax_dues`** (échéancier) | ✅ Quittances + échéances (`status` dérivé `du`/`en_retard`/`paye`, surcharge double droit Art. 283), enregistrement/règlement ; télédéclaration DGI à brancher |
| États trimestriels / annuels, rapports | `GET /api/traceability/statements` + PDF | ✅ États par période (trimestre/année) ; transmission automatique DGF à brancher |
| CCC / FDL / communautés (art. 251) | `community_agreements` (CCC/FDL) + `/api/community` | ✅ CCC par titre/communauté, contribution `taux FDL × volume` (défaut 800 FCFA/m³), PV CGSP, décision Ministère (actif/suspendu/clos) ; répartition le long du CCC à brancher |
| PPF / EIE | absent | ❌ |
| Convention provisoire/définitive (15 ans), attestation de conformité | absent | ❌ |
| Certificat annuel d'assiette de coupe / **Permis Annuel d'Opérations** / certificat de vente de coupe | `aac_authorizations` + `/api/titles` | ✅ Quatre autorisations (assiette / PAO / vente de coupe / CAE) : demande entreprise → décision Ministère (délivrer / rejeter motivé) → PDF ; le PAO reste estampillé automatiquement à l'ouverture |
| **CAE** + pièces de matérialisation des limites (FC) | `aac_authorizations` (type `cae`) + `legal_documents` | ⚠️ Autorisation CAE ✅ (cycle complet) ; pièces de matérialisation des limites (FC) à brancher |
| Notification de démarrage des activités | `aac_authorizations.startup_notified_at` | ✅ Notification par l'entreprise après délivrance (art. 14) |
| Certification (FSC / PAFC / légalité+) | `certifications` + `/api/certifications` | ✅ Déclaration entreprise → vérification / rejet / suspension Ministère (motif requis) ; expiration dérivée à la lecture ; PDF |
| Tableau de bord Ministère | `services/dashboard.py` + `/api/dashboard` | ✅ Volumes par essence, taux de transformation, FDL/CCC, titres/AAC, documents, recettes, transport, certifications + PDF — §7.2 pt 7 |
| EUDR — diligence au niveau parcelle d'origine | `eudr_diligence` + `/api/eudr` + PDF | ✅ Déclaration par parcelle (WKT PostGIS), compteurs grumes abattues/géolocalisées, PV de consultation, décision Ministère, attestation PDF ; **géolocalisation** exacte de chaque grume à brancher |
| Multi-autorités (DGF, DGFAP, DGE, ANPN, DGICBVPF, Douanes) | `admin` unique | ❌ Rôle Ministère monolithique |
| Structures des parties (entité légale) | `company_id → users.id` (auto-référence) | ⚠️ Pas d'entité « entreprise » distincte |

---

## 6. Modèle de domaine — **implémenté** (`db/migrations/009_gouvernance.sql`)

**Option A retenue** : une entité unique **`organizations`** (`org_type ∈ entreprise|communaute|cooperative`)
porte les titres — elle unifie l'entreprise (opérateur économique) et la **communauté villageoise**
(titulaire d'une forêt communautaire, `Art. 156`). `users.organization_id` fait le pont avec les comptes
existants (l'ancien `users.company_id` reste en place le temps de la migration).

- **`organizations`** — `id, org_type, name, legal_form, registration_no, tax_id, email, phone, address, geom, is_active, created_by, created_at`.
- **`org_profiles`** (presets) — `code, label, org_type, activities[], allowed_title_types[], doc_required[], enabled_modules[], obligations jsonb, description` · seeds : `exploitant_forestier`, `transformateur`, `integre`, `negoce_export`, `foret_communautaire`.
- **`document_types`** (dictionnaire TTP) — `code, label, scope_type(company|title|ufa|aac|product|social), authority, validity_months, default_blocking, legal_ref` · **38 types** seedés.
- **`legal_documents`** — `id, scope_type, scope_id, doc_type→document_types, authority, reference, issued_at, expires_at, file_url, status(manquant|soumis|valide|rejete|expire), submitted_by, verified_by, verified_at, notes`.
- **`forest_titles`** — `id, title_type(CFAD|PFA|PGG|FC), reference, holder_org_id→organizations, zone(permanent|rural), surface_ha, geom, status(demande|exploration|provisoire|actif|expire|retire|rejete), exploration_start/end, cpaet_start/end, pa_approved_at, grant_ref, grant_date, created_by, decided_by, decided_at, decision_motif`.
- **`management_units`** (UFA) — `id, title_id, label, surface_ha, geom, plan_amenagement_ref, pa_approved_at, pa_expiry, plan_gestion_ref, rotation_years`.
- **`annual_cut_blocks`** (AAC/AACp) — `id, ufa_id, label, campaign_year, surface_ha, possibility_m3, geom, origin(plan_amenagement|cpaet_provisoire), status(prepare|soumis|autorise|ouvert|ferme), pao_reference, pao_submitted_at`.
- **`aac_authorizations`** — `id, aac_id, authorization_type(certificat_assiette|permis_annuel_operations|certificat_vente_coupe|cae), reference, issued_by, issued_at, valid_from, valid_to, startup_notified_at, startup_notified_by, plan_document_id, status(soumis|delivre|rejete), decision_motif`.
- **`tax_receipts`** — `id, org_id, title_id, tax_type(superficie|abattage|surveillance|transformation|renouvellement|transfert|fermage), period_year, amount_fcfa, receipt_ref, paid_at, due_at, status(du|paye|en_retard), document_id`.
- **`community_agreements`** (CCC/FDL) — `id, title_id, community_org_id, ccc_ref, ccc_signed_at, fdl_rate_fcfa_m3 DEFAULT 800, annual_volume_m3, contribution_fcfa, cgsp_minutes_document_id, status`.
- **`transport_documents`** — `id, org_id, doc_type(bordereau_roulage|feuille_route|specification), reference, from_label, to_label, tree_codes jsonb, volume_m3, issued_by, issued_at, status(brouillon|emis|receptionne), qr_payload`.
- **`certifications`** - `id, org_id, title_id, scheme(FSC|PAFC|PEFC|OLB|LS|TLV), cert_type(gestion_durable|legalite_plus), certificate_ref, surface_ha, valid_from, valid_to, status(soumis|actif|suspendu|expire|rejete), declared_by, verified_by, verified_at, decision_motif`.

**Tables Slice 5** (`db/migrations/011_slice5.sql`, additives) :
- **`tax_dues`** (échéancier) — `id, org_id, title_id, tax_type, period_year, amount_fcfa, due_at, notes, receipt_id→tax_receipts, created_by, created_at`. Le `status` (`du|en_retard|paye`) est **dérivé à la lecture** (`paye` si `receipt_id`, sinon `en_retard` si `due_at < CURRENT_DATE`, sinon `du`) ; la **surcharge** (= montant, double droit Art. 283) suit `en_retard`.
- **`eudr_diligence`** — `id, org_id, title_id, parcel_label, parcel_geom GEOMETRY(4326), consultation_document_id, geolocated_stem_count, felled_stem_count, declared_volume_m3, notes, status(soumis|valide|rejete), decision_motif, submitted_by, decided_by, decided_at, created_at`. Les compteurs de grumes sont calculés depuis `tree_registry` (périmètre organisation).

**Colonnes Slice 6** (`db/migrations/012_slice6.sql`, additives) :
- **`aac_authorizations`** : `+ decision_motif` (justification d'un rejet) et `+ startup_notified_by` (auteur de la notification de démarrage) + index `status`. Complète le cycle d'autorisation d'exploiter (art. 14) sans nouvelle table.

**Colonnes Slice 7** (`db/migrations/013_slice7.sql`, additives) :
- **`certifications`** : `+ declared_by, verified_by, verified_at, decision_motif` + index `status`/`scheme`, et la contrainte `status` accepte désormais `soumis`/`rejete`. Troisième volet TTP (certification tierce partie) sans nouvelle table.

**Table Slice 8** (`db/migrations/014_slice8.sql`, additive) :
- **`anomaly_reviews`** (revue d'anomalie) — `id, anomaly_type, subject_key, title_id→forest_titles, aac_id→annual_cut_blocks, org_id→organizations, status(ouverte|traitee|ecartee), decision_motif, reviewed_by→users, reviewed_at, created_at` · contrainte `UNIQUE(anomaly_type, subject_key)`. La **détection** des anomalies est dérivée à la lecture (`services/anomalies.py` : 9 familles, sévérité `hard`/`warning`) ; seule la **décision du Ministère** sur un `(type, subject_key)` stable est persistée. Index d'appui des agrégats du tableau de bord : `legal_documents(expires_at)`, `tree_registry(status)`, `transport_documents(status)`, `community_agreements(status)`.

Extensions **additives** sur l'existant :
- `users` : `+ organization_id`.
- `felling_declarations` : `+ title_id, aac_id, compliance jsonb`.
- `tree_registry` : `+ title_id, aac_id, hammer_mark, felled_at, stump_geom, df10_entry_no`.
- `custody_events` : `+ transport_document_id, destination`.

> Les **pièces du CAE** et autres justificatifs sont des `legal_documents` (portées `aac`/`title`) plutôt que des
> tables dédiées. Les **presets** (`org_profiles`) portent la liste des types de documents, donc **aucune
> configuration manuelle** n'est nécessaire à la création d'un compte.

**Statut** : ✅ **Slice 1 appliqué** — migration montée dans `docker-compose.yml`, seeds **38 + 5** vérifiés sur la base live (idempotente).

---

## 7. Workflow cible — Ministère vs Entreprise

### 7.1 Côté Entreprise (`company`)
1. **Mon entreprise → Documents** : téléverser agrément, quittances (superficie/surveillance), PI/PDI. Statut affiché (manquant/valide/expiré). Documents manquants/expirés → **avertissement** (le Ministère tranche à l'instruction).
2. **Titres & AAC** : voir titres (CFAD/PFA/PGG/FC), UFA, AAC et leur statut d'ouverture.
3. **Inventaire & PAO** : déposer l'inventaire d'exploitation, le PAO, le CCC → soumettre.
4. **Déclarations d'abattage** (existant enrichi) : sélectionner **titre + AAC**, saisir `tree_code`, marquage, espèce, DBH, GPS. Contrôles auto (DME/UFA, essences réservées, CITES, doublon, **AAC ouverte**, **documents valides**).
5. **Carnet de chantier (DF10)** : alimenté automatiquement par les événements `abattu/transporte` + codes d'abandon ; export PDF signé.
6. **Transport** : générer bordereau de roulage / feuille de route / spécification (QR par grume).
7. **Transformation** : registre entrées/sorties, états trimestriels.
8. **Rapports & taxes** : états annuels (31 mars), quittances, échéances.

### 7.2 Côté Ministère (`admin` + évent. inspecteurs)
1. **Titres** : instruire demandes (exploration → CPAET → PA/PDI → CFAD/PFA), notifier décisions (motif obligatoire si rejet).
2. **Documents** : vérifier/valider/rejeter par scope (entreprise, UFA, AAC, produit) ; gérer les échéances.
3. **UFA/AAC** : enregistrer plans d'aménagement/gestion, approuver PAO + CCC, délivrer l'**autorisation d'exploiter**, ouvrir/fermer l'AAC.
4. **Déclarations** : approuver/rejeter (existant).
5. ✅ **Anomalies** (étendues — Slice 8, `/api/anomalies`) : `below_dme`, `felled_without_authorization`, **abattage hors AAC**, **espèce réservée**, **AAC fermée / non ouverte**, **documents expirés**, **taxes impayées**, **CITES sans permis**, **transport sans bordereau** ; revue Ministère (`traitee` / `ecartee` motivée) et registre PDF.
6. **Redevances** : suivi des quittances, retards (double droit — art. 283).
7. ✅ **Tableau de bord** (Slice 8, `/api/dashboard`) : volumes par essence, taux de transformation, FDL/CCC, titres/AAC, documents, recettes, transport, certifications ; export PDF.

### 7.3 Rôles
- Court terme : `admin` = Ministère (option : **scopes** provincial/central dans `users`).
- Cible : distinguer **inspecteur provincial**, **agent central (DGF)**, **DGFAP/DGE/ANPN/Douanes** comme rôles ou attributs de portée.

---

## 8. Règles de conformité automatisables (deux niveaux)

**Blocages durs** (soumission impossible — l'illégal est technique) :
- Abattage interdit sans autorisation préalable (`Art. 14`).
- DBH < DME/UFA (`Art. 124`) · essence mise en réserve · code arbre en doublon · mesure absente · arbre hors AAC.

**Avertissements** (soumission possible → le Ministère peut toujours rejeter) :
- Documents manquants/expirés (`Art. 102, 140`), autorisation de récolte en attente, taxes impayées (`Art. 283`), carnet de chantier non tenu (`Art. 275`), CITES sans permis pour export.
- Fausse déclaration → flag fraude (`Art. 279`).

---

## 9. Plan de mise en œuvre (slices)
1. ✅ **Slice 1 — Données** : migration `009_gouvernance.sql` (organizations, presets, document_types, titres, UFA, AAC, autorisations, taxes, CCC, transport, certifications) + seeds (38 + 5), montée dans `docker-compose.yml` et **appliquée** sur la base live.
2. ✅ **Slice 2 — API** : `/api/organizations` (presets + wizard création → checklist auto + liaison compte), `/api/documents` (upload + checklists + vérification Ministère), `/api/titles` (titres/UFA/AAC + autorisations), `/api/taxes`, `/api/compliance` (évaluation 2 niveaux) ; porte de conformité **branchée dans `felling.py`** (blocage dur → `422`, avertissements stockés dans `felling_declarations.compliance`). Tests : `tests/test_governance.py` (11), `tests/test_felling.py` mis à jour ; `ruff` OK ; `pytest` **190 passed** (2 échecs préexistants hors périmètre : golden v2, corpus RAG).
3. ✅ **Slice 3 — Mobile** : côté **Entreprise** — onglets *Documents* (identité organisation + checklist auto + déclaration/màj d'un justificatif), *Titres & AAC* (demande de titre → UFA → AAC → soumission du PAO), *Taxes* (enregistrement de quittances) ; côté **Ministère** — onglets *Documents* (file « en attente » + validation/rejet motivé) et *Titres* (décisions du cycle de vie, délimitation UFA/AAC, autoriser/ouvrir/fermer/rejeter le PAO), plus le **verdict de conformité à deux niveaux** affiché sur chaque déclaration d'abattage. Clé i18n `org`/`docs`/`titles`/`taxes`/`compliance` ; composants `Badge`, `OrgDocuments`, `CompanyTitles`, `OrgTaxes`, `AdminDocuments`, `AdminTitles`, `DeclarationCompliance` ; onglets en bandeau défilant. Deux endpoints backend de lecture ajoutés pour l'UI : `GET /api/documents/types` (dictionnaire code→libellé) et `GET /api/titles/{id}/units` (UFA d'un titre). Tests : `tests/test_governance.py` (**14**), `__tests__/*.test.tsx` (**51** mobiles, dont 5 nouveaux suites) ; `ruff`/`tsc` OK ; `pytest` **193 passed** (2 échecs préexistants : golden v2, corpus RAG).
3 bis. ✅ **Correctif — porte de conformité complète** : `felling._check_line` émet désormais les deux blocages durs qui étaient déclarés mais jamais produits — `reserved_species` (nouveau `app/core/reserved_species.py` : liste provisoire Art. 124 / décret 2009 / Kévazingo, résolue par nom scientifique, alias ou vernaculaire) et `outside_aac` (nouveau `compliance.lines_outside_aac`, contrôle spatial PostGIS `ST_Covers` par lot via `unnest`, silencieux si l'AAC est inconnu/sans géométrie — une limite absente ne bloque jamais). Validation sur **Postgres réel** (dedans non signalé, dehors signalé, frontière non signalée, AAC inconnu → ∅). Tests : `tests/test_felling.py` **16** (5 ajoutés) ; `pytest` **198 passed** (mêmes 2 échecs préexistants).
4. ✅ **Slice 4 — Traçabilité** : migration `010_traceability.sql` (colonnes `tree_registry.abandon_code`/`df10_notes`, `transport_documents.title_id/aac_id/transporter/vehicle_ref`) **appliquée** sur la base live et montée dans `docker-compose.yml`. Backend : `/api/traceability` — registre **DF10** dérivé de `tree_registry` (`GET /api/traceability/df10`, numéro `DF10-{AAAA}-{NNNNNN}` estampillé à l'événement `abattu`, `PATCH .../df10/{code}` codes d'abandon conventionnels `core/df10.py`, `GET .../statements` états par trimestre/année — volumes **estimés** `core/log_volume.py`) et `/api/transport` (`bordereau_roulage|feuille_route|specification`, cycle `brouillon→émis→réceptionné`, périmètre par `organization`) ; exports PDF `render_df10_pdf`/`render_transport_pdf`/`render_statement_pdf` (`services/pdf_report.py`). Mobile : onglet *Traçabilité* — `CompanyTraceability` (carnet + abandon + création/émission/réception d'un bordereau + PDF) et `AdminTraceability` (registre national + états) ; `requestHeaders`/helpers PDF GET dans `client.ts`/`pdf.ts`. Correctif au passage d'un `AmbiguousParameterError` préexistant dans `felling.record_event` (`ST_MakePoint`). Tests : `tests/test_transport.py` (**12**), `tests/test_traceability.py` (**15**), `test_pdf_report.py` (**+3**) ; `__tests__/CompanyTraceability`/`AdminTraceability` (**6**) ; `ruff`/`tsc` OK ; `pytest` **228 passed** (2 échecs préexistants : golden v2, corpus RAG) ; smoke **Postgres réel** OK (transport 5,191 m³, DF10 estampillé, états 2 abattus / 11,932 m³).
5. ✅ **Slice 5 — Fiscalité, social, EUDR** : migration `011_slice5.sql` (`tax_dues` + `eudr_diligence` + index) **appliquée** sur la base live et montée dans `docker-compose.yml`. Backend : `/api/taxes/dues` (échéancier — `POST` création **Ministère**, `GET` liste par périmètre — **admin** tous, **entreprise** les siens —, `POST /{id}/settle` enregistre la quittance et lie l'échéance ; `status` dérivé `du|en_retard|paye` + surcharge double droit Art. 283), `/api/community` (annuaire `GET /communities`, `POST/GET /agreements` CCC/FDL — création **entreprise**, contribution `taux FDL × volume` défaut 800 FCFA/m³, `PATCH /agreements/{id}` décision **Ministère** actif/suspendu/clos + PV CGSP, `GET /agreements/summary`) et `/api/eudr` (diligence par parcelle — `POST/GET` **entreprise**, compteurs grumes abattues/géolocalisées depuis `tree_registry`, `parcel_geom` PostGIS `ST_GeomFromText`, `PATCH /{id}` décision **Ministère** valider/rejeter motivée, `GET /{id}/pdf`). PDF `render_diligence_pdf` (`services/pdf_report.py`). Mobile : onglet *Fiscalité & social* — `CompanyFiscal` (segments Échéances/CCC/EUDR : règlement d'une échéance, création d'un CCC, soumission d'une diligence + PDF) et `AdminFiscal` (création d'échéances, décision CCC + résumé des contributions, décision diligence + PDF). Clés i18n `fiscal` ; helpers client `list/create/settle/decide` + `exportDiligencePdf`/`sharePdf`. Tests : `tests/test_fiscalite.py` (**8**), `tests/test_community.py` (**9**), `tests/test_eudr.py` (**8**), `test_pdf_report.py` (**+1**) ; `__tests__/CompanyFiscal`/`AdminFiscal` (**8**) ; `ruff`/`tsc` OK ; `pytest` **254 passed** (2 échecs préexistants : golden v2, corpus RAG) ; `jest` **65 passed** (22 suites) ; smoke **Postgres réel** OK (jointures échéances/CCC/EUDR, insertion géométrie + `ST_AsText`).
6. ✅ **Slice 6 — Autorisation d'exploiter (art. 14)** : migration `012_slice6.sql` (colonnes `aac_authorizations.decision_motif`/`startup_notified_by` + index `status`) **appliquée** sur la base live et montée dans `docker-compose.yml`. Complète `aac_authorizations`, jusqu'ici **insert-only**, en cycle complet des 4 autorisations TTP. Backend (`/api/titles`) : `GET/POST /aacs/{id}/authorizations` (liste — périmètre organisation — et **demande** entreprise : certificat d'assiette / PAO / certificat de vente de coupe / CAE), `PATCH /authorizations/{id}` (décision **Ministère** délivrer/rejeter motivé, estampille `issued_by`/`issued_at`), `POST /authorizations/{id}/notify-startup` (**notification de démarrage** par l'entreprise, après délivrance, idempotente), `GET /authorizations/{id}/pdf`. PDF `render_authorization_pdf` + `AUTHORIZATION_TYPE_LABEL`/`AUTHORIZATION_STATUS_LABEL` (`services/pdf_report.py`). Mobile : composant partagé `AacAuthorizations` (`mode company|admin`) rendu dans chaque AAC par `CompanyTitles`/`AdminTitles` (demande + notification de démarrage + PDF côté entreprise ; délivrer/rejeter + PDF côté Ministère) ; `authTone` (`Badge.tsx`), clés i18n `titles.auth`, helpers client `list/request/decide/notifyStartup` + `exportAuthorizationPdf`. Tests : `tests/test_authorizations.py` (**8**), `test_pdf_report.py` (**+1**) ; `__tests__/AacAuthorizations` (**4**) ; `ruff`/`tsc` OK ; `pytest` **265 passed** ; `jest` **69 passed** (23 suites) ; smoke **Postgres réel** OK (`\d aac_authorizations` — colonnes + index).
7. ✅ **Slice 7 — Certifications tierces (FSC / PAFC)** : migration `013_slice7.sql` (colonnes `certifications.declared_by/verified_by/verified_at/decision_motif` + contrainte `status` étendue à `soumis`/`rejete` + index `status`/`scheme`) **appliquée** sur la base live et montée dans `docker-compose.yml`. Complète la table `certifications` (seedée en Slice 1, jamais pilotée) en cycle complet. Backend (`/api/certifications`) : `GET /` (liste par périmètre organisation, filtres `scheme`/`status`), `POST /` (**déclaration** entreprise — schéma, type gestion durable / légalité plus, référence, titre facultatif, surface, validité), `PATCH /{id}` (décision **Ministère** vérifier/rejeter/suspendre motivée, estampille `verified_by`/`verified_at`), `GET /summary` (synthèse par statut/schéma), `GET /{id}/pdf` ; `status` `expire` **dérivé à la lecture** (comme les échéances). PDF `render_certification_pdf` + `CERT_TYPE_LABEL`/`CERT_STATUS_LABEL` (`services/pdf_report.py`). Mobile : onglets *Certifications* — `CompanyCertifications` (déclaration + suivi + PDF) et `AdminCertifications` (synthèse, filtres par statut, vérifier/rejeter/suspendre + PDF) ; `certTone` (`Badge.tsx`), clés i18n `cert`, helpers client `list/declare/decide/certificationSummary` + `exportCertificationPdf`. Tests : `tests/test_certifications.py` (**9**), `test_pdf_report.py` (**+1**) ; `__tests__/CompanyCertifications`/`AdminCertifications` (**4**) ; `ruff`/`tsc` OK ; `pytest` **275 passed** ; `jest` **73 passed** (25 suites) ; smoke **Postgres réel** OK (`\d certifications` — colonnes + index).
8. ✅ **Slice 8 — Anomalies étendues & tableau de bord Ministère (§7.2 pts 5 & 7)** : migration `014_slice8.sql` (table **`anomaly_reviews`** `UNIQUE(anomaly_type, subject_key)` + index d'appui `legal_documents(expires_at)`, `tree_registry(status)`, `transport_documents(status)`, `community_agreements(status)`) **montée dans `docker-compose.yml`**. Backend : **`/api/anomalies`** (`GET` — sweep **dérivé à la lecture** de **9 familles** : blocages durs `below_dme`, `felled_without_authorization`, `abattage_hors_aac`, `espece_reservee`, `aac_fermee` ; avertissements `documents_expires`, `taxes_impayees`, `cites_sans_permis`, `transport_sans_bordereau` ; filtres `type`/`severity`/`review` ; `GET /summary` ; `POST /review` — décision **Ministère** `traitee`/`ecartee` (motif obligatoire pour écarter), upsert idempotent ; `GET /pdf` registre) via `services/anomalies.py` ; **`/api/dashboard`** (`GET` — volumes par essence + taux de transformation `core/log_volume.py`, titres/UFA/AAC, documents (expirés/sous 90 j), recettes (retards + double droit), CCC/FDL, transport, certifications ; `GET /pdf`) via `services/dashboard.py`. PDF `render_anomalies_pdf`/`render_dashboard_pdf` (`services/pdf_report.py`). Mobile : onglets du Ministère — `AdminAnomalies` (synthèse + filtres sévérité, acquitter/écarter motivé, réouvrir, registre PDF) et `AdminDashboard` (cartes de tête, table des volumes par essence, gouvernance/fiscalité/CCC/transport/certifications, PDF) ; clés i18n `anomaly`/`dashboard`, `tabDashboard` ; types + helpers client `listAdminAnomalies`/`anomalySummary`/`reviewAnomaly`/`dashboardOverview` + `exportAnomaliesPdf`/`exportDashboardPdf`. Tests : `tests/test_anomalies.py` (**7**), `tests/test_dashboard.py` (**3**) ; `__tests__/AdminAnomalies`/`AdminDashboard` (**3**) ; `ruff`/`tsc` OK ; `pytest` **285 passed** (suite complète, 0 échec) ; `jest` nouveaux suites **3 passed**.
9. 🔧 **Correctif CI (post-commit, Slice 7)** : `ruff check --fix` + `ruff format` (I001 dans `projects.py`, deux `RUF100` dans `tools/`), golden v2 régénéré (champ `tree_code` de la chaîne de traçabilité) et invariant corpus RAG recentré sur les essences **ligneuses** (le cohorte plantes, non ligneux, n'a volontairement pas de fiche bois). `pytest` **256 passed** ; CI GitHub **verte** (push `1ec40df`).

---

## 10. Décisions figées & points ouverts

**Décisions figées :**
1. **AAC** : le cadre (titre, UFA, grille ~30 AAC) vient du **Ministère / PA** ; l'**année** (inventaire, PAO, activation) vient de l'**entreprise** ; l'**autorisation/ouverture** reste au **Ministère**.
2. **`organizations`** réelle (option A) : unifie entreprise, communauté, coopérative — titulaire d'un titre = `organization`.
3. **Création par type** : presets `org_profiles`, **activités cumulables**, **tous les types conservés** (y compris négoce/export) ; rien n'est nécessairement obligatoire.
4. **Forêt communautaire** : titulaire = **communauté** (`Art. 156`), vente via **contrat d'approvisionnement** avec société de transformation (`Art. 158`) — pas modélisée comme une entreprise.
5. **Overrides** : **aucun au MVP** ; le cas échéant, **Ministère uniquement + tracé**.
6. **Conformité** : **blocages durs** (illégal technique) vs **avertissements** (docs/autorisations/taxes) → le **Ministère peut toujours rejeter**.

**Points ouverts :**
1. **`ASC` / `ACBSL`** : hors Loi 016/01 — source (arrêté / loi de finances) et périmètre à confirmer.
2. **DME** : passer du provisoire global au **DME/UFA** dès qu'un arrêté/plan est saisi.
3. **Modèle d'autorités** : `admin` unique vs scopes (provincial/central/DGFAP/DGE/ANPN/Douanes).
4. **Signature/QR** : authenticité (marteau, code arbre, code-barres DF10) hors-ligne.
5. **APV/FLEGT** : négociations à l'arrêt ; impact sur le suivi de légalité.
6. **Backfill** : migrer les comptes `company` / coopératives existants vers `organizations` (slice ultérieure).

---

*Document de travail généré à partir de `docs/LOI N°016_01 code forestier.pdf` et des 5 pages Timber Trade Portal — Fiche Pays Gabon (Contexte & risques, Chaîne d'approvisionnement, Cadre légal, Documents clés, Tierce partie & certification). À valider par le métier avant implémentation.*
