# Hakidata ANSD

Projet de gestion, analyse et visualisation de données publiques et de requêtes métier autour des thématiques couvertes par l'ANSD (emploi, santé, données ouvertes, etc.).

Le dépôt contient à la fois :
- une API backend Python,
- une interface web frontend,
- des scripts de traitement / visualisation,
- des requêtes SQL et des prompts de requêtes,
- des schémas de données et des exports de résultats.

## Objectif du projet

L'application permet de :
- charger ou exploiter des données publiques,
- interroger des données via SQL ou via une logique métier/LLM,
- générer des visualisations et des rapports,
- exposer une interface web pour explorer les résultats,
- héberger les données de configuration et les réponses exportées dans un environnement Dockerisé.

## Stack technique

- Backend : Python / FastAPI
- Frontend : Vite + React
- Base de données : MySQL pour l'authentification / métadonnées, avec d'autres données / tables de travail selon les traitements applicatifs
- Conteneurisation : Docker / Docker Compose
- Analyse / visualisation : scripts Python et fichiers de sortie dans `outputs/`

## Architecture du dépôt

```text
.
├── backend/                 # API, services, repos, routes, utilitaires
├── frontend-v2/             # Interface utilisateur
├── dataviz/                 # Scripts de génération de graphiques/statistiques
├── sql/                     # Requêtes SQL
├── requests/                # Requêtes et prompts d'utilisation
├── schema/                  # Schémas et descriptions de structures de données
├── uploads/                 # Fichiers importés par les utilisateurs
├── outputs/                 # Résultats générés / exports
├── deploy/                  # Scripts / fichiers pour le déploiement
├── docker-compose.yml       # Configuration Docker Compose
├── Dockerfile               # Image du backend
├── requirements.txt         # Dépendances Python
├── ARCHITECTURE.md          # Documentation d'architecture
├── CONTEXT.md               # Contexte du projet
├── FONCTIONNALITES.md       # Description fonctionnelle
├── README.md                # Documentation du projet
├── LICENSE                  # Licence du projet
└── ...
```

## Pré-requis

Avant de lancer le projet, vérifiez que vous avez installé :

- Docker
- Docker Compose
- Git
- Un terminal Unix-like (ou PowerShell / zsh sur macOS/Linux)

## Variables d'environnement

Le projet utilise des variables d'environnement via un fichier `.env` à la racine du dépôt (ou via le mécanisme configuré par Docker Compose).

Exemple de base :

```bash
AUTH_DB_ROOT_PASSWORD=hakidata_root_secret
AUTH_DB_USER=hakidata
AUTH_DB_PASSWORD=hakidata_secret
DB_ENCRYPTION_KEY=your_secret_key
MAX_USERS=100
```

Si le fichier `.env` n’existe pas encore, créez-le avant le lancement avec les valeurs adaptées à votre environnement.

## Démarrage rapide avec Docker

Depuis la racine du projet :

```bash
docker-compose up --build
```

Cette commande va construire et démarrer les services suivants :

- `backend` : API sur le port `8009`
- `frontend` : interface web sur le port `3000`
- `mysql-auth` : base de données MySQL interne
- `adminer` : interface d'administration DB sur le port `8091`

### Accès

- Frontend : http://localhost:3000
- Backend API : http://localhost:8009
- Adminer : http://localhost:8091

### Arrêt

```bash
docker-compose down
```

Pour supprimer aussi les volumes persistants :

```bash
docker-compose down -v
```

## Lancement du backend seul

Si vous souhaitez travailler uniquement sur l’API :

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python backend/main.py
```

Selon la structure du projet, certaines dépendances ou variables d’environnement peuvent être nécessaires avant le lancement.

## Lancement du frontend seul

Depuis `frontend-v2/` :

```bash
cd frontend-v2
npm install
npm run dev
```

Le port utilisé dépend de la configuration Vite, mais dans le contexte Docker le frontend est exposé via le port `3000`.

## Description des dossiers

### `backend/`
Contient la logique applicative du serveur :
- routes / endpoints API,
- services métier,
- logique de base de données,
- authentification,
- intégration des données,
- traitements LLM / données.

### `frontend-v2/`
Interface utilisateur du projet. C’est le point d’entrée pour la consultation et l’exploitation des résultats.

### `dataviz/`
Scripts Python dédiés à la génération de graphiques et de statistiques à partir des données disponibles.

### `sql/`
Fichiers SQL de référence pour les requêtes sur les données.

### `requests/`
Contient des requêtes/utilisateurs/prompts utilisés pour piloter les traitements, les analyses ou les résultats attendus.

### `schema/`
Schémas documentés des jeux de données, utiles pour comprendre les colonnes, la structure et les règles métier des données.

### `uploads/`
Dossier où sont stockés les fichiers importés, y compris ceux produits par les utilisateurs.

### `outputs/`
Résultats générés par le système (graphiques, exports, documents, fichiers de sortie structurés).

### `deploy/`
Contient les fichiers et scripts liés au déploiement, la configuration d’environnement et les ressources associées.

## Flux applicatif typique

1. Un utilisateur accède au frontend.
2. Le frontend appelle l’API backend.
3. Le backend exploite les données et/ou les scripts SQL ou de visualisation.
4. Les résultats sont stockés dans `outputs/` ou dans des tables de données selon le cas.
5. L’utilisateur peut consulter les résultats dans l’interface.

## Développement

Pour un développement local efficace :

- modifier le backend dans `backend/`,
- modifier le frontend dans `frontend-v2/`,
- tester les requêtes SQL dans `sql/`,
- vérifier les schémas dans `schema/`,
- utiliser `uploads/` et `outputs/` pour les données de test et les exportations.

## Bonnes pratiques

- Ne pas committer les fichiers sensibles comme `.env` ou les données privées.
- Vérifier les dépendances avant un déploiement.
- Garder les requêtes SQL et les schémas synchronisés avec les données réelles.
- Préserver les dossiers `uploads/` et `outputs/` selon les besoins de production.

## Points d’entrée utiles

- Backend principal : `backend/main.py`
- Configuration Docker Compose : `docker-compose.yml`
- Interface frontend : `frontend-v2/`
- Définition de l’architecture : `ARCHITECTURE.md`
- Documentation fonctionnelle : `FONCTIONNALITES.md`

## Support

Pour toute question sur le projet ou son déploiement, il est recommandé de consulter :
- `ARCHITECTURE.md`
- `CONTEXT.md`
- `FONCTIONNALITES.md`
- la configuration Docker dans `docker-compose.yml`

## Licence

Consultez le fichier `LICENSE` pour les détails de la licence du projet.
