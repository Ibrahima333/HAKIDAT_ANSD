# Ouverture aux données statistiques publiques

Ce projet est dérivé de HakiData. Il ajoute ce qui manquait pour travailler sur
des **statistiques officielles** plutôt que sur la seule base interne d'une
entreprise : un connecteur vers ANADS — Archive Nationale des Données du
Sénégal, le catalogue d'enquêtes et de microdonnées de l'ANSD — et un
rattachement géographique des territoires sénégalais.

ANADS n'est pas le portail Open Data Sénégal : ce sont deux plateformes
distinctes. ANADS est le catalogue de l'ANSD lui-même, avec ses propres fiches
d'enquêtes, ses propres conditions d'accès et sa propre API REST — c'est cette
API-là que le connecteur consomme.

Le reste de l'application — pipeline en six étapes, chat, tableau de bord,
alertes, export PDF, comptes et audit — est inchangé.

> Une première version incluait aussi un connecteur SDMX générique. Il a été
> retiré pour resserrer le périmètre du hackathon sur la source qui compte
> réellement pour l'ANSD : ANADS.

---

## 1. Connecteur ANADS — Archive Nationale des Données du Sénégal (ANSD)

**Pourquoi.** L'ANADS — *Archive Nationale des Données du Sénégal* — est le
catalogue de microdonnées de l'ANSD. Il tourne sur NADA et expose une API REST
publique. C'est la porte d'entrée officielle vers les enquêtes de l'agence.

**Le parcours suivi reproduit l'accès réel à une enquête ANADS :**

```
ANADS
  │
  ▼
Catalogue des enquêtes        GET /api/anads/search
  │
  ▼
Fiches descriptives           GET /api/anads/fiche/{idno}
  │
  ▼
Choix de l'enquête            (sélection dans l'interface)
  │
  ▼
Vérification des conditions   fiche.access_downloadable
d'accès aux données           (direct / public / open → oui ; licensed / remote / data_na → non)
  │
  ▼
Microdonnées                  POST /api/import-anads-microdata
  │
  ▼
HakiData                      table SQLite interrogeable
  │
  ▼
Analyse / SQL / IA            pipeline en six étapes, inchangé
```

**Ce qui a été fait.** `backend/utils/anads.py` couvre chaque étape :

- `search()` — le catalogue, filtrable, normalisé en colonnes françaises
  (`identifiant`, `titre`, `producteur`, `annee_debut`, `annee_fin`, `acces`…).
- `get_fiche(idno)` — la fiche descriptive complète d'une enquête : résumé,
  producteur, période et zone de collecte, contact, et surtout `access_type` /
  `access_downloadable` — c'est ici que la condition d'accès est vérifiée.
- `list_resources(idno)` — les fichiers attachés à l'enquête, avec leur nature
  (microdonnées vs document) et leur format.
- `fetch_microdata(idno, resource_id=None)` — télécharge le fichier de
  microdonnées et le met en table. **Lève `AnadsAccessError`** — pas une
  erreur réseau générique — quand la fiche indique une enquête sous licence,
  à accès distant ou aux données non disponibles : impossible de confondre
  « il faut demander l'accès à l'ANSD » avec une vraie panne.

Formats de microdonnées lus : CSV, Stata (`.dta`, via `pandas.read_stata`,
aucune dépendance supplémentaire), Excel (`.xlsx`/`.xls`), et les archives
`.zip` qui en contiennent (le plus volumineux des fichiers exploitables de
l'archive est retenu — les annexes, dictionnaire de variables ou
questionnaire, sont plus petites). Le format SPSS (`.sav`) et les archives
`.rar` sont refusés explicitement : aucune dépendance du projet ne sait les
lire, mieux vaut le dire que produire une table tronquée.

**Routes.**

| Route | Étape couverte |
|---|---|
| `GET /api/anads/search?q=&limit=` | Catalogue des enquêtes |
| `GET /api/anads/fiche/{idno}` | Fiche descriptive + vérification des conditions d'accès + liste des fichiers |
| `POST /api/import-anads-microdata` `{idno, resource_id?}` | Récupération des microdonnées (403 si l'accès ne le permet pas) |
| `POST /api/import-anads` `{query?}` | Import du catalogue entier comme table (pour analyser l'offre elle-même) |

**Interface.** Le panneau « ANADS — enquêtes de l'ANSD » suit le même
enchaînement : recherche → clic sur une enquête → fiche avec un badge d'accès
(vert si téléchargeable, ambre sinon, avec le contact ANSD et le lien vers la
fiche) → si accessible, choix du fichier et import en un clic. L'import du
catalogue complet (métadonnées seules) reste disponible en secondaire, pour
parcourir l'offre statistique elle-même plutôt qu'une enquête donnée.

**Vérifié en conditions réelles, sur le serveur de production de l'ANSD :**

- Catalogue : 286 enquêtes récupérées, dont 80 répondant à la recherche
  « emploi ». Répartition par condition d'accès : 110 sous licence, 90 non
  disponibles, 45 publiques, 26 en téléchargement direct, 15 en accès distant.
- Enquête sous licence (`SEN-ANSD-ENES-T3-2025-V1.0`) : `fetch_microdata` lève
  bien `AnadsAccessError` sans tenter de téléchargement.
- Enquête en accès direct (`SEN-ANSD-L2SME-2017-V1.0`, trois formats
  proposés — `.dta`, `.sav`, `.csv`) : le CSV (1273 lignes × 167 colonnes) est
  choisi automatiquement ; le `.dta` équivalent se lit correctement quand il
  est demandé explicitement par `resource_id`.
- Ressource cassée côté serveur (`SEN-ANSD-RGE-2016-V1.0`, l'archive `.zip`
  renvoie une erreur 500) : l'échec remonte proprement en `AnadsError`, sans
  planter et sans importer une page d'erreur HTML comme si c'était de la donnée.

### Certificat TLS incomplet côté serveur

Le serveur `anads.ansd.sn` ne transmet que son certificat final, sans
l'intermédiaire GlobalSign qui le relie à la racine. Les navigateurs et `curl`
vont chercher l'intermédiaire manquant tout seuls ; OpenSSL — donc Python — non,
et la vérification échoue avec `unable to get local issuer certificate`.

Le certificat intermédiaire est donc fourni dans `backend/utils/certs/` et chargé
au moment de la connexion. La chaîne redevient complète : **la vérification TLS
reste entière, elle n'est pas désactivée.** Si l'ANSD corrige la configuration de
son serveur, ce fichier devient simplement inutile.

---

## 2. Rattachement géographique

**Pourquoi.** Les statistiques publiques sont agrégées par territoire, jamais
géolocalisées au point. Elles ne contiennent donc pas de colonnes `latitude` /
`longitude`, alors que la règle carte du générateur de visualisation en exige.
Résultat : aucune carte ne pouvait sortir d'un tableau « par région ».

**Ce qui a été fait.** `backend/utils/geo_senegal.py` porte un répertoire des
14 régions, 45 départements et principales villes du Sénégal. La fonction
`enrich()` repère la colonne de territoire **d'après les valeurs**, pas d'après le
nom de la colonne, puis injecte les coordonnées.

- Comparaison insensible aux accents, à la casse et à la ponctuation :
  `SAINT LOUIS`, `saint-louis` et `Saint-Louis` sont le même lieu.
- Seuil de reconnaissance : 60 % des valeurs non nulles doivent correspondre,
  sinon la colonne est écartée.
- Les lignes dont le territoire est inconnu reçoivent `None` : elles restent dans
  le tableau et disparaissent seulement de la carte.
- Si le résultat porte déjà des coordonnées, rien n'est injecté.

**Point d'accroche.** `backend/scripts/run_analysis.py`, entre l'exécution SQL et
l'écriture du CSV. L'enrichissement est encadré par un `try` : un échec est
signalé dans les logs et n'interrompt jamais l'analyse. Quand il a lieu, il est
tracé dans `metadata.json` sous la clé `geo_enrichment` (colonne source, nombre de
territoires reconnus sur le total).

**Prompt de dataviz.** La liste des mots-clés géographiques a été étendue
(`commune`, `arrondissement`, `chef-lieu`, `par région`, `par département`), et
une note impose d'écarter les lignes sans coordonnées avant de tracer la carte
plutôt que de les remplir.

**Précision.** Centroïde approximatif pour les régions, position du chef-lieu pour
les départements. Suffisant pour situer une bulle, insuffisant pour un calcul de
distance.

---

## 3. Limites de ces ajouts

- **Cartes à bulles uniquement.** Le rattachement produit des points, pas des
  aplats par territoire. Un choroplèthe demanderait les contours GeoJSON des
  régions et départements.
- **Répertoire limité au Sénégal**, et aux communes principales seulement.
- **ANADS : microdonnées récupérables uniquement en accès direct, public ou
  ouvert.** Les enquêtes sous licence (la majorité du catalogue) restent hors
  de portée d'une récupération automatique — c'est une règle d'accès de
  l'ANSD, pas une limite technique du connecteur ; la fiche renvoie le contact
  et le lien pour en faire la demande.
- **SPSS (`.sav`) et archives `.rar` non lus.** Aucune dépendance du projet ne
  les prend en charge ; ces fichiers restent accessibles par leur URL directe,
  affichée dans la liste des ressources.
- **Pas de mise à jour automatique** d'un flux ou d'un catalogue importé : la
  table est figée à l'instant de l'import.
