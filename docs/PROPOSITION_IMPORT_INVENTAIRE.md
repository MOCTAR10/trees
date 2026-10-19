# Proposition — Import de l'inventaire d'exploitation d'une AAC

*Foresterie Numérique · proposition au Ministère des Eaux et Forêts · version du modèle `proposition-2026-10` · 19 octobre 2026*

## 1. Objet

Aujourd'hui, une entreprise inscrit les tiges à abattre une à une, ou en scannant leurs plaques sur le terrain. Nous proposons
qu'elle puisse aussi **déposer l'inventaire d'exploitation complet d'une AAC** sous forme de tableur (Excel ou CSV).

1. Chaque ligne du fichier est **vérifiée** avec les règles déjà appliquées aux déclarations.
2. Le fichier n'est accepté que si **toutes les lignes sont conformes**.
3. Chaque tige est alors **inscrite au registre**, rattachée à l'AAC et à son titre.
4. Les **plaques QR** du lot s'impriment en une fois.

La saisie tige par tige et l'inventaire par scan restent possibles. Le modèle de colonnes ci-dessous est une **proposition** : si le
Ministère fournit son propre modèle (art. 19, normes techniques nationales), l'application s'y adapte sans changer les contrôles.

## 2. Fondement légal (Loi n° 016/01 portant code forestier)

| Article | Ce qu'il impose | Conséquence pour le fichier |
| --- | --- | --- |
| Art. 60 | L'inventaire d'exploitation **quantifie et localise précisément** les tiges exploitables et les tiges d'avenir, sur **toute la superficie de l'AAC**, avec un relevé cartographique détaillé. | Une ligne par tige, avec sa position GPS (obligatoire). |
| Art. 61 | Il porte sur les essences principales et secondaires (art. 31) ; seules les tiges de **qualité utilisable** sont comptabilisées. | Colonnes `essence` et `qualite`. |
| Art. 62 | Il est réalisé **avant le PAO** et **achevé trois mois avant** l'ouverture de l'AAC. | Import accepté sans autorisation d'exploiter ; colonne `date_releve` ; avertissement si l'AAC est déjà autorisée. |
| Art. 119–121 | L'AAC est délimitée avant le dépôt du PAO ; le PAO est approuvé par l'Inspection provinciale avec l'autorisation d'exploiter. | Le fichier est déposé pour une AAC enregistrée de l'entreprise. |
| Art. 122 | Les **arbres à exploiter et les arbres à préserver** (tiges d'avenir, tiges en réserve) sont marqués par l'opérateur sous le contrôle de l'administration. | Colonne `destination` ; un arbre à préserver ne peut jamais être déclaré à l'abattage. |
| Art. 124, 32, 67 | Abattage au-dessus du **DME de l'UFA** ; les **essences mises en réserve** pour raison d'intérêt général sont exclues. | Contrôle DME et essences réservées pour chaque tige à abattre. |
| Art. 120, 128 | Les marques restent visibles ; chaque arbre abattu porte un code d'identification. | Colonnes `code_arbre`, `marquage`, `numero_peint`. |
| Art. 130–133 | Le carnet de chantier (DF10) est tenu à l'abattage. | L'import alimente le registre, pas le DF10 : celui-ci reste rempli à l'abattage. |

Les **semenciers** ne figurent pas dans la loi 016/01. Ils relèvent du plan d'aménagement et de la pratique d'inventaire : à confirmer.

## 3. Modèle de colonnes proposé

Les nombres acceptent la **virgule décimale**. Les noms de colonnes peuvent être écrits en majuscules ou avec des accents, et
quelques variantes sont reconnues (« DHP (cm) », « Espèce », « Lat »…). Une colonne inconnue est signalée, puis ignorée.

| Colonne | Obligatoire | Format | Exemple | Explication | Fondement |
| --- | --- | --- | --- | --- | --- |
| `code_arbre` | non | texte | `GA-HOB-2026-00412` | Code d'identification de la tige. Laissé vide, il est attribué à l'import. | Art. 128 |
| `essence` | **oui** | texte | `Aucoumea klaineana` / `Okoumé` | Nom scientifique ou nom commercial. | Art. 31, 61 |
| `dhp_cm` | **oui** | nombre | `87,5` | Diamètre à 1,30 m, ou au-dessus des contreforts. | Art. 124 (DME) |
| `hauteur_fut_m` | non | nombre | `18,5` | Hauteur du fût, pour estimer le volume. | Pratique (PAO) |
| `latitude` | **oui** | degrés décimaux WGS84 | `-0,6912` | Négatif au sud de l'équateur. | Art. 60 ; RDUE |
| `longitude` | **oui** | degrés décimaux WGS84 | `13,2145` | | Art. 60 ; RDUE |
| `destination` | **oui** | `abattre` · `avenir` · `reserve` · `semencier` | `abattre` | Arbre à exploiter ou à préserver. | Art. 60, 122 |
| `marquage` | non | `qr` · `peinture` · `gps_photo` | `qr` | `qr` par défaut : le lot reçoit ses plaques. | Art. 120, 122 |
| `numero_peint` | si peinture | texte | `412` | Numéro peint, unique dans l'AAC. | Art. 120 |
| `layon` | non | texte | `L12` | Layon de comptage. | Art. 120 |
| `placette` | non | texte | `P12-04` | Placette ou bloc de comptage. | Art. 60 |
| `qualite` | non | `1` · `2` · `3` | `1` | 1 bonne, 2 moyenne, 3 inutilisable. | Art. 61 |
| `date_releve` | non | JJ/MM/AAAA | `14/02/2026` | Date du relevé de terrain. | Art. 62 |
| `observations` | non | texte (500 caractères au plus) | `Contreforts 1,2 m` | Remarque libre. | — |

**Limites** : 5 000 tiges et 5 Mo au plus par fichier. Une grande AAC se dépose en plusieurs fichiers.

**Formats** :
- **Excel (.xlsx)** : trois feuilles, « Inventaire » à remplir (listes déroulantes pour les valeurs fixes), « Exemple » et « Lisez-moi ».
- **CSV** : séparateur `;` (celui d'Excel en français), UTF-8 ; la virgule et la tabulation sont aussi reconnues.

**Ne figurent pas dans le fichier** :
- l'AAC et le titre : l'entreprise les choisit dans l'application ;
- le volume et la classe de diamètre : ils sont calculés par le serveur ;
- les photos : elles sont prises en direct au pied de l'arbre, jamais importées.

## 4. Contrôles appliqués à chaque ligne

| Contrôle | Concerne | Effet |
| --- | --- | --- |
| Position GPS manquante ou invalide | toutes les tiges | **Erreur** |
| Position hors du contour de l'AAC | toutes les tiges | **Erreur** |
| Diamètre sous le DME de l'UFA | tiges à abattre | **Erreur** |
| Essence mise en réserve inscrite « abattre » | tiges à abattre | **Erreur** (à inscrire « reserve ») |
| Code arbre déjà au registre ou répété | toutes les tiges | **Erreur** |
| Numéro peint déjà utilisé dans l'AAC | toutes les tiges | **Erreur** |
| Valeur hors liste, nombre ou date invalide, date future | toutes les tiges | **Erreur** |
| Essence CITES | tiges à abattre | Avertissement |
| Dans une aire protégée, hors concession attribuée | toutes les tiges | Avertissement |
| Essence non reconnue, qualité 3 à abattre | — | Avertissement |
| AAC déjà autorisée ou ouverte (art. 62) ; AAC sans contour | le fichier | Avertissement |

**Refus du fichier entier** :
- AAC fermée ;
- titre sans droit d'exploiter (ni convention provisoire ni définitive) ;
- AAC d'une autre organisation ;
- colonne obligatoire absente ;
- fichier trop grand.

L'absence d'autorisation d'exploiter **n'empêche pas** l'import, puisque l'inventaire précède le PAO. Elle continue en revanche de
bloquer la déclaration d'abattage et l'abattage (art. 14).

## 5. Déroulé

1. **Entreprise**, menu Exploitation → Abattage → « Importer un inventaire » (ou depuis l'AAC, dans Titres & AAC) : elle choisit
   l'AAC et télécharge le modèle.
2. Elle envoie le fichier depuis l'**application web** et voit un **aperçu** : nombre de lignes, de tiges à abattre et à préserver, et
   chaque ligne en erreur ou en avertissement. **Rien n'est inscrit** à ce stade.
3. Une fois les erreurs corrigées, elle **confirme**. Chaque tige entre au registre (statut « inventorié »), et les plaques QR du lot
   s'impriment.
4. À la déclaration d'abattage, « Reprendre l'inventaire » propose les **seules tiges à abattre**. Une tige d'avenir, en réserve ou
   semencier ne peut jamais être déclarée, ni abattue.
5. **Ministère**, sur la fiche de l'organisation : il voit l'historique des imports (qui, quand, quel fichier, combien de tiges dont
   combien à préserver) et peut imprimer les plaques d'un lot.

## 6. Questions au Ministère

1. **Modèle officiel** : le Ministère dispose-t-il d'un modèle de fiche d'inventaire d'exploitation (normes techniques, art. 19) ?
   Si oui, nous l'adoptons tel quel.
2. **Destinations** : les quatre valeurs (`abattre`, `avenir`, `reserve`, `semencier`) conviennent-elles ? Les semenciers doivent-ils
   être distingués des tiges en réserve ?
3. **Qualité** : quels codes de qualité (1/2/3, A/B/C…) et quelle règle pour une tige inutilisable ?
4. **Délai de l'art. 62** : l'inventaire achevé moins de trois mois avant l'ouverture doit-il rester un avertissement, ou devenir un
   blocage de l'ouverture ?
5. **Seuil de diamètre** : faut-il inventorier toutes les tiges au-dessus d'un diamètre minimal (par exemple 20 cm) ou seulement les
   tiges exploitables et d'avenir ?
6. **Validation** : l'Inspection provinciale doit-elle valider l'inventaire importé (contrôle par sondage) avant l'approbation du PAO ?
7. **Taille des fichiers** : 5 000 tiges par fichier conviennent-elles pour les plus grandes AAC ?
8. **Plaques** : faut-il une plaque QR pour chaque arbre à préserver, ou le marquage à la peinture suffit-il ?
