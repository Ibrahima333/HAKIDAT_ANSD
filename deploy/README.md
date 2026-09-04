# HakiData — BI Conversationnelle

> Posez vos questions métier en français. Obtenez du SQL, des graphiques et des insights en quelques secondes.

**HakiData** est une application de **Business Intelligence conversationnelle** déployable en entreprise. Elle permet à chaque collaborateur de poser des questions sur ses données sans écrire une seule ligne de SQL, depuis un navigateur web sécurisé.

> Vous cherchez une présentation simple des fonctionnalités, sans jargon technique ? Voir [FONCTIONNALITES.md](FONCTIONNALITES.md).

---

## Sommaire

1. [Présentation](#1-présentation)
2. [Architecture](#2-architecture)
3. [Prérequis](#3-prérequis)
4. [Installation](#4-installation)
5. [Configuration](#5-configuration)
6. [Démarrage](#6-démarrage)
7. [Fonctionnalités](#7-fonctionnalités)
8. [Authentification et gestion des utilisateurs](#8-authentification-et-gestion-des-utilisateurs)
9. [Pipeline d'analyse](#9-pipeline-danalyse)
10. [API backend](#10-api-backend)
11. [Déploiement en réseau local](#11-déploiement-en-réseau-local)
12. [CI/CD avec Jenkins](#12-cicd-avec-jenkins)
13. [Résolution de problèmes](#13-résolution-de-problèmes)

---

## 1. Présentation

HakiData transforme une base de données SQL en assistant analytique conversationnel :

```
Question en français
      ↓
Génération SQL automatique (LLM)
      ↓
Exécution sur votre base de données
      ↓
Graphique Plotly interactif
      ↓
Insights & recommandations business
```

**Ce que vous obtenez pour chaque question :**
- Le SQL généré (auditable, téléchargeable)
- Les données en tableau et CSV
- Un graphique interactif HTML (avec sélecteur de style : Standard / Sombre / Satellite)
- Des KPIs calculés automatiquement (total, moyenne, min, max)
- Un rapport Markdown avec insights et recommandations
- Export PDF complet (graphique + rapport + extraits de chat)

**Sans :** écrire du code, configurer un outil BI, payer des licences.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Réseau Docker : hakidata-network         │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   Frontend   │    │   Backend    │                   │
│  │ React + Vite │───▶│   FastAPI    │                   │
│  │    Nginx     │    │  Python 3.12 │                   │
│  │  Port 3000   │    │  Port 8000   │                   │
│  └──────────────┘    └──────┬───────┘                   │
│                             │                           │
│                    ┌────────┴────────┐                  │
│                    │                │                   │
│             ┌──────▼──────┐  ┌──────▼──────┐           │
│             │  mysql-auth │  │ Votre base  │           │
│             │  MySQL 8.0  │  │ MySQL / PG  │           │
│             │  (interne)  │  │  (externe)  │           │
│             └─────────────┘  └─────────────┘           │
│                                                         │
│  ┌──────────────┐                                       │
│  │   Adminer    │  ← Interface web mysql-auth           │
│  │  Port 8080   │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### Services Docker

| Service | Rôle | Port exposé |
|---|---|---|
| `frontend` | Interface React + Nginx HTTP | 3000 |
| `backend` | API FastAPI + pipeline BI | 8009 (debug) |
| `mysql-auth` | Base utilisateurs, KPIs, dashboard | interne uniquement |
| `adminer` | Interface web pour mysql-auth | 8080 |

### Stack technique

| Couche | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, Python 3.12, Uvicorn |
| Base auth | MySQL 8.0 (Docker interne) |
| Base métier | MySQL 8.x ou PostgreSQL (externe) |
| LLM | Gemini 2.0 Flash (Google) ou Groq llama-3.3-70b |
| Graphiques | Plotly (Python + HTML interactif) |
| Auth | JWT (PyJWT) + bcrypt |
| Conteneurisation | Docker + Docker Compose |

---

## 3. Prérequis

- **Docker Desktop** 4.x+ (Windows / macOS / Linux)
- **Docker Compose** v2+ (inclus dans Docker Desktop)
- Une base de données **MySQL 8.x** ou **PostgreSQL** accessible (votre base métier)
- Une clé API **Gemini** (Google) ou **Groq**

### Obtenir une clé API

**Gemini** (recommandé, gratuit) :
→ [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

**Groq** (gratuit, très rapide) :
→ [https://console.groq.com/keys](https://console.groq.com/keys)

---

## 4. Installation

```bash
# Cloner le projet
git clone <url-du-repo>
cd agentic-business-intelligence-main

# Vérifier que Docker est lancé
docker --version
docker compose version
```

---

## 5. Configuration

### 5.1 Fichier `.env`

Le fichier `.env` à la racine du projet contient toutes les variables de configuration. **Modifiez les valeurs sensibles avant le premier démarrage.**

```env
# ── Base de données métier (votre base existante) ─────────────────────────────
DB_TYPE=mysql                        # mysql ou postgresql
DB_HOST=host.docker.internal         # hôte de votre base (depuis Docker)
DB_PORT=3306                         # 3306 MySQL, 5432 PostgreSQL
DB_USER=root                         # utilisateur
DB_PASSWORD=votre_mot_de_passe       # mot de passe

# ── Base MySQL interne (authentification HakiData) ────────────────────────────
AUTH_DB_HOST=mysql-auth              # nom du service Docker (ne pas changer)
AUTH_DB_PORT=3306
AUTH_DB_USER=hakidata
AUTH_DB_PASSWORD=hakidata_secret     # mot de passe utilisateur hakidata
AUTH_DB_ROOT_PASSWORD=hakidata_root_secret  # mot de passe root MySQL
AUTH_DB_NAME=hakidata_auth

# ── JWT (authentification) ────────────────────────────────────────────────────
JWT_SECRET=changez_cette_valeur_en_production   # ⚠️ IMPORTANT : changer en prod
JWT_EXPIRE_SECONDS=28800             # durée de session (8h par défaut)

# ── Compte administrateur initial ────────────────────────────────────────────
ADMIN_EMAIL=admin@hakidata.local     # email du premier admin
ADMIN_PASSWORD=Admin1234!            # ⚠️ changer avant mise en production

# ── Clés LLM (fallback si non configurées via l'interface) ───────────────────
GEMINI_API_KEY=votre_cle_gemini
GROQ_API_KEY=votre_cle_groq          # commence par gsk_...

# ── Frontend ──────────────────────────────────────────────────────────────────
FRONTEND_ORIGIN=http://localhost:3000
```

### 5.2 Variables critiques à modifier

| Variable | Pourquoi la changer |
|---|---|
| `JWT_SECRET` | Sécurité des tokens — doit être unique et long |
| `AUTH_DB_PASSWORD` | Mot de passe de la base auth |
| `AUTH_DB_ROOT_PASSWORD` | Mot de passe root MySQL |
| `ADMIN_PASSWORD` | Mot de passe du premier compte admin |
| `DB_PASSWORD` | Mot de passe de votre base métier |

---

## 6. Démarrage

### Premier démarrage

```bash
# Construction et démarrage de tous les services
docker compose up -d --build

# Vérifier que tout tourne
docker compose ps
```

**Au premier démarrage, le backend :**
1. Attend que `mysql-auth` soit prêt (healthcheck automatique)
2. Crée les tables `users`, `analyses`, `kpis`, `dashboard`, `llm_config`, `alerts`, `db_connections`, `user_db_access`
3. Crée le compte admin depuis `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env`

### Accès

| Service | URL |
|---|---|
| **Application** | http://localhost:3000 |
| **Adminer** (base auth) | http://localhost:8080 |
| **Backend** (debug) | http://localhost:8009 |

### Connexion initiale

```
Email        : admin@hakidata.local   (valeur de ADMIN_EMAIL dans .env)
Mot de passe : Admin1234!             (valeur de ADMIN_PASSWORD dans .env)
```

### Commandes utiles

```bash
# Démarrer
docker compose up -d

# Arrêter
docker compose down

# Rebuild complet (après modification de code)
docker compose build --no-cache && docker compose up -d

# Rebuild d'un seul service
docker compose build --no-cache frontend && docker compose up -d
docker compose build --no-cache backend  && docker compose up -d

# Voir les logs
docker compose logs backend --tail=50
docker compose logs frontend --tail=20

# Reset complet (supprime la base auth — perd les utilisateurs)
docker compose down -v
docker compose up -d --build
```

---

## 7. Fonctionnalités

### 7.1 Analyse conversationnelle

L'onglet principal. Posez une question en français, le pipeline complet s'exécute automatiquement.

**Exemple :**
> "Quels sont les 5 clients ayant généré le plus de chiffre d'affaires ce trimestre ?"

**Résultat :**
- Onglet **Results** — tableau des données + téléchargement CSV
- Onglet **SQL** — requête générée (auditable, téléchargeable)
- Onglet **Chart** — graphique Plotly interactif avec sélecteur Standard / Sombre / Satellite pour les cartes géographiques
- Onglet **KPIs** — métriques automatiques (Total, Moyenne, Min, Max), chaque valeur épinglable au dashboard
- Onglet **Report** — insights & recommandations en Markdown + export PDF

**Validation automatique :** les questions trop courtes ou incohérentes sont rejetées avant le lancement du pipeline.

**Timer d'exécution :** un chrono s'affiche pendant l'analyse et indique la durée totale après.

**Bouton annuler :** un bouton ◼ rouge permet d'interrompre une analyse en cours.

**Option "Écraser les résultats existants" :** si activée, relancer la même question écrase les anciens artefacts.

### 7.2 Chat IA

Un assistant conversationnel qui connaît le schéma de votre base. Il répond à des questions d'analyse business, identifie des tendances, formule des recommandations.

- Historique de conversation maintenu dans la session
- Bouton **"Ajouter au rapport"** sur chaque message pour l'inclure dans le PDF
- Contextualisation automatique sur le schéma de la base sélectionnée

### 7.3 Dashboard

Tableau de bord personnalisé par utilisateur (stocké en base MySQL).

**Graphiques épinglés :**
- Chaque graphique de l'onglet Chart peut être épinglé
- Affichage en grille, redimensionnable (demi/pleine largeur)
- Réorganisable par drag & drop

**KPIs épinglés :**
- Cartes affichant valeur + delta % (comparaison avec valeur précédente)
- Bouton Rafraîchir → rejoue le SQL sans appel LLM
- Couleur verte/rouge selon l'évolution

### 7.4 Export PDF

Depuis l'onglet Report, le PDF inclut :
- En-tête avec question, base, provider, date
- Métriques (lignes, colonnes, temps d'exécution)
- KPIs épinglés dans le dashboard
- Graphique (capture PNG ou fallback interactif)
- Insights & recommandations
- Extraits de Chat IA sélectionnés (si des messages ont été ajoutés au rapport)

### 7.5 Explorateur de schéma

Dans la sidebar, section **Schéma** : liste toutes les tables et colonnes de la base sélectionnée. Cliquer sur une colonne l'insère dans le champ de question.

### 7.6 Import CSV / Excel

Importez un fichier CSV ou Excel (max. **50 Mo**, imposé par nginx via `client_max_body_size`) directement depuis la sidebar. Il devient une base de données SQLite interrogeable comme une base classique.

> Les alertes (7.7) ne sont pas disponibles sur ces fichiers : un import CSV/Excel est statique, contrairement à une vraie connexion base de données que le scheduler peut réinterroger périodiquement.

### 7.7 Alertes

Surveillance automatique d'un KPI avec notification par e-mail quand un seuil est franchi.

- **Création** : choix du KPI, d'un opérateur (`<`, `>`, `<=`, `>=`, `=`), d'un seuil, d'un email destinataire et d'un intervalle de vérification
- **Scheduler** : tourne toutes les 5 minutes en arrière-plan (`utils/alert_scheduler.py`), mais respecte l'intervalle propre à chaque alerte
- **Niveaux de sévérité**, calculés sur l'écart relatif au seuil (`gap / threshold`) :

  | Niveau | Condition | Libellé |
  |---|---|---|
  | 0 | Normal | — |
  | 1 | Seuil franchi | ⚠️ Seuil dépassé |
  | 2 | Écart ≥ 50 % | 🔶 Situation aggravée |
  | 3 | Écart ≥ 100 % | 🚨 Niveau critique |

- **Notifications edge-triggered** : un email n'est envoyé qu'au **changement** de niveau (escalade ou résolution), jamais à chaque cycle de vérification — évite le spam
- **Retour à la normale** : email de résolution dédié quand l'alerte repasse au niveau 0
- **Restriction** : indisponibles pour les KPIs issus d'un import CSV/Excel (voir 7.6)

> Le scheduler tourne dans le conteneur Docker : si la machine hôte se met en veille, la vérification s'interrompt jusqu'au réveil.

---

## 8. Authentification et gestion des utilisateurs

### Architecture auth

- **JWT stateless** — token signé (HS256), expiration 8h par défaut
- **Deux rôles** : `admin` et `user`
- **Stockage** : table `users` dans `mysql-auth` (Docker interne)

### Comptes et isolation

Chaque utilisateur possède ses propres :
- Historique d'analyses
- KPIs épinglés
- Dashboard

Les données ne sont **jamais** visibles entre utilisateurs.

### Panel Admin

Accessible depuis la navbar (bouton **Admin**, visible uniquement pour les admins).

| Action | Description |
|---|---|
| Voir tous les comptes | Liste avec rôle, statut, date de création |
| Créer un compte | Email + mot de passe + rôle |
| Réinitialiser le mot de passe | L'admin définit un nouveau mot de passe pour un utilisateur |
| Désactiver / Réactiver | Bloque l'accès sans supprimer les données |
| Supprimer | Suppression définitive avec toutes les données |
| Audit | Historique de toutes les actions (conservé 30 jours) |

> Seul l'admin peut créer des comptes — il n'y a pas d'inscription ouverte.

> La suppression de tout l'historique est réservée aux admins et requiert de saisir le mot `supprimer` pour confirmer.

### Configuration LLM

**Admin uniquement :**
- Configure les clés API Gemini et/ou Groq via la sidebar
- Les clés sont testées avant sauvegarde
- Stockées en base MySQL + fichier runtime (persistant entre redémarrages)

**Utilisateurs :**
- Voient uniquement un sélecteur Gemini / Groq
- Ne peuvent ni voir ni modifier les clés API

### Adminer — Inspecter la base auth

Accès : [http://localhost:8080](http://localhost:8080)

```
Serveur      : mysql-auth
Utilisateur  : root
Mot de passe : hakidata_root_secret  (valeur de AUTH_DB_ROOT_PASSWORD)
Base         : hakidata_auth
```

Tables disponibles : `users`, `analyses`, `kpis`, `dashboard`, `llm_config`, `audit_logs`

---

## 9. Pipeline d'analyse

Le pipeline exécute 6 étapes séquentielles pour chaque question :

### Étape 1 — Génération du schéma
```
scripts/schema.py
→ schema/<base>__<schema>_schema.md
```

### Étape 2 — Génération SQL
```
scripts/generate_sql.py  +  prompt_template.txt
→ sql/<nom_question>.sql
```

> Seuls les `SELECT` sont autorisés — toute tentative d'écriture (INSERT, UPDATE, DELETE…) est bloquée.

### Étape 3 — Exécution SQL
```
utils/db_utils.py
→ outputs/<nom>/<nom>.csv  +  metadata.json
```

### Étape 4 — Génération dataviz
```
scripts/generate_dataviz.py  +  prompt_template_dataviz.txt
→ dataviz/<nom>.py
```

> Les questions géographiques génèrent automatiquement une carte interactive (`px.scatter_mapbox`) avec sélecteur Standard / Sombre / Satellite.

### Étape 5 — Exécution dataviz
```
scripts/run_dataviz.py
→ outputs/<nom>/<nom>.html
```

### Étape 6 — Génération insights
```
scripts/generate_insights_actions.py  +  prompt_template_insights.txt
→ outputs/<nom>/<nom>.md
```

### Artefacts produits

```
outputs/<nom_question>/
├── <nom>.csv             — données brutes
├── <nom>.html            — graphique Plotly interactif
├── <nom>.md              — insights & recommandations
├── metadata.json         — infos techniques
└── backend_context.json  — contexte d'exécution (provider, temps…)

sql/
└── <nom>.sql             — requête SQL générée

schema/
└── <base>__<schema>_schema.md  — schéma documenté
```

> Tous ces dossiers sont montés en volume Docker — ils persistent entre les redémarrages.

---

## 10. API backend

Toutes les routes (sauf `/api/health` et `/api/auth/login`) requièrent un token JWT :
```
Authorization: Bearer <token>
```

### Auth

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Connexion, retourne JWT |
| GET | `/api/auth/me` | user | Profil de l'utilisateur connecté |
| GET | `/api/auth/users` | admin | Liste tous les utilisateurs |
| POST | `/api/auth/users` | admin | Créer un utilisateur |
| PATCH | `/api/auth/users/{id}` | admin | Modifier rôle ou statut |
| DELETE | `/api/auth/users/{id}` | admin | Supprimer un utilisateur |
| POST | `/api/auth/users/{id}/reset-password` | admin | Réinitialiser le mot de passe |

### Pipeline et résultats

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/pipeline/validate` | user | Valider une question avant exécution |
| POST | `/api/pipeline/run` | user | Lancer le pipeline complet |
| GET | `/api/results` | user | Historique des analyses |
| GET | `/api/results/{nom}` | user | Résultat complet |
| DELETE | `/api/results/{nom}` | user | Supprimer une analyse |
| DELETE | `/api/history` | admin | Supprimer tout l'historique |
| GET | `/api/artifacts/{nom}/{type}` | — | Artefact (sql, csv, chart, report) |

### Dashboard utilisateur

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/user/kpis` | KPIs épinglés |
| POST | `/api/user/kpis` | Épingler un KPI |
| DELETE | `/api/user/kpis/{id}` | Désépingler un KPI |
| GET | `/api/user/dashboard` | Graphiques épinglés |
| POST | `/api/user/dashboard` | Épingler un graphique |
| DELETE | `/api/user/dashboard/{id}` | Désépingler un graphique |
| POST | `/api/kpi/refresh/{nom}` | Rafraîchir un KPI sans LLM |

---

## 11. Déploiement en réseau local

Pour rendre l'application accessible depuis les autres postes de l'entreprise :

### Étape 1 — Trouver l'IP du serveur

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I

# Windows
ipconfig   # → chercher "Adresse IPv4"
```

### Étape 2 — Ouvrir le firewall

Autoriser le port **3000** (et **8080** pour Adminer si besoin).

### Étape 3 — Démarrer

```bash
docker compose up -d
```

### Accès depuis les autres postes

```
http://192.168.1.XX:3000
```

### Avec un nom de domaine interne

Si le réseau d'entreprise dispose d'un DNS interne (Active Directory), demander à l'administrateur réseau de créer :

```
hakidata.entreprise.local → 192.168.1.XX
```

Accès via : `http://hakidata.entreprise.local:3000`

---

## 12. CI/CD avec Jenkins

Un `Jenkinsfile` est fourni à la racine du projet. Il automatise le build et le push des images Docker sur DockerHub à chaque push Git.

### Configuration requise

1. **Modifier le Jenkinsfile** — remplacer `ton-username-dockerhub` par votre username DockerHub
2. **Ajouter un credential Jenkins** :
   - Type : *Username with password*
   - ID : `dockerhub-credentials`
   - Username / Password : vos identifiants DockerHub
3. **Créer un pipeline Jenkins** :
   - Source : *Pipeline script from SCM*
   - SCM : Git → URL du repo, branche `*/main`
   - Script Path : `Jenkinsfile`
4. **Configurer un webhook** dans votre repo Git :
   - URL : `http://JENKINS:8080/github-webhook/`
   - Événement : *push*

### Images publiées

| Image | Tag |
|---|---|
| `{user}/hakidata-backend` | `:latest` + `:{numéro-build}` |
| `{user}/hakidata-frontend` | `:latest` + `:{numéro-build}` |

---

## 13. Résolution de problèmes

### L'application affiche "Internal Server Error" au démarrage

```bash
docker compose logs backend --tail=30
```

Cause fréquente : `mysql-auth` n'est pas encore prêt. Attendre 10-15 secondes et recharger.

### "Access denied for user 'hakidata'"

Le volume MySQL a été créé avec une ancienne configuration. Solution :

```bash
docker compose down -v   # ⚠️ supprime les données de la base auth
docker compose up -d --build
```

### Le backend tourne encore avec l'ancien code

```bash
docker compose build --no-cache backend
docker compose up -d
```

### La page de login boucle (refresh infini)

Vider le localStorage du navigateur :
```javascript
// Console navigateur (F12)
localStorage.clear()
```

### Les graphiques n'apparaissent pas dans le dashboard

Vérifier que les volumes `outputs/` sont bien montés et que la route `/api/artifacts` est accessible.

### Changer le mot de passe admin

Via le Panel Admin → bouton de réinitialisation. Ou directement dans Adminer :
```sql
-- Le hash doit être généré avec bcrypt
UPDATE users SET password_hash = '...' WHERE email = 'admin@hakidata.local';
```

### Connexion à une base sur la machine hôte

Depuis Docker, utiliser `host.docker.internal` comme hôte (pas `localhost`) :

```
Host : host.docker.internal
Port : 3306 (MySQL) ou 5432 (PostgreSQL)
```

---

## Licence

MIT — usage libre, modification autorisée, redistribution autorisée avec attribution.
