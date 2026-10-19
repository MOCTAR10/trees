# Proposition — Import de l'inventaire d'exploitation d'une AAC

*Foresterie Numérique · proposition au Ministère des Eaux et Forêts · modèle `proposition-2026-10-b` · 20 octobre 2026*

L'entreprise dépose l'inventaire d'une AAC dans un tableur (Excel ou CSV) de **sept colonnes**. Chaque ligne est vérifiée,
puis chaque arbre est inscrit au registre et ses plaques QR s'impriment en une fois. La saisie arbre par arbre et le scan
sur le terrain restent possibles. Si le Ministère a son propre modèle (art. 19), l'application l'adopte.

## Les colonnes

| Colonne | Obligatoire | Exemple | Pourquoi (Loi 016/01) |
| --- | --- | --- | --- |
| `reference_aac` | oui | `AAC 2026-2` | Référence de l'AAC au plan d'aménagement ; elle doit être celle de l'AAC choisie (art. 119). |
| `numero_arbre` | non | `412` | Numéro peint ou plaque, unique dans l'AAC (art. 120, 128). |
| `essence` | oui | `Okoumé` | Nom commercial ou scientifique : DME, essences réservées, CITES (art. 31, 61, 124). |
| `latitude` | oui | `-0,6912` | Position GPS de l'arbre (art. 60 ; RDUE). |
| `longitude` | oui | `13,2145` | Position GPS de l'arbre. |
| `diametre_cm` | oui | `87` | Diamètre à 1,30 m : contrôle du DME de l'UFA (art. 124). |
| `a_abattre` | oui | `oui` / `non` | « non » = arbre à préserver, jamais déclarable à l'abattage (art. 122). |
| `observations` | non | `semencier` | Remarque libre. |

Virgule décimale acceptée. 5 000 arbres et 5 Mo au plus par fichier.

## Les contrôles

- **Ligne refusée** :
  - autre AAC que celle choisie ;
  - position GPS manquante ou hors de l'AAC ;
  - arbre à abattre sous le DME de l'UFA ;
  - essence mise en réserve marquée « oui » ;
  - numéro d'arbre en double ;
  - valeur invalide.
- **Avertissement** (n'empêche pas l'import) :
  - essence CITES ;
  - aire protégée ou hors concession ;
  - essence non reconnue ;
  - AAC déjà autorisée (art. 62 : l'inventaire précède le PAO).
- **Fichier refusé** : AAC fermée, titre sans droit d'exploiter, AAC d'une autre organisation.
- **Tout ou rien** : rien n'est inscrit tant qu'une ligne est en erreur.

L'absence d'autorisation d'exploiter n'empêche pas l'import (l'inventaire vient avant le PAO). Elle bloque toujours la
déclaration et l'abattage (art. 14).

## Ce que voit le Ministère

Sur la fiche de chaque organisation : qui a importé quel fichier, quand, combien d'arbres, combien à préserver, et les plaques
du lot.

## Questions au Ministère

1. Existe-t-il une fiche d'inventaire d'exploitation officielle (art. 19) ? Si oui, nous l'adoptons.
2. Sous quelle forme est écrite la référence d'une AAC dans les plans d'aménagement ?
3. « À abattre : oui / non » suffit-il, ou faut-il distinguer tiges d'avenir, tiges en réserve et semenciers ?
4. Un inventaire achevé moins de trois mois avant l'ouverture (art. 62) doit-il bloquer l'ouverture ?
5. L'Inspection provinciale valide-t-elle l'inventaire importé avant l'approbation du PAO ?
