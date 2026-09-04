# CONTEXT.md — Documentation complète du projet AskData

> Document de référence destiné à la rédaction d'un rapport académique.
> Il décrit l'intégralité du projet : objectifs, architecture, technologies, fonctionnalités, base de données, API, algorithmes, décisions techniques et perspectives.

---

## Table des matières

1. [Objectif du projet](#1-objectif-du-projet)
2. [Problème auquel répond le projet](#2-problème-auquel-répond-le-projet)
3. [Besoins fonctionnels et non fonctionnels](#3-besoins-fonctionnels-et-non-fonctionnels)
4. [Architecture générale](#4-architecture-générale)
5. [Arborescence des dossiers](#5-arborescence-des-dossiers)
6. [Technologies utilisées et justifications](#6-technologies-utilisées-et-justifications)
7. [Fonctionnement global de l'application](#7-fonctionnement-global-de-lapplication)
8. [Rôle de chaque module important](#8-rôle-de-chaque-module-important)
9. [Description de la base de données](#9-description-de-la-base-de-données)
10. [API et responsabilités](#10-api-et-responsabilités)
11. [Principales fonctionnalités implémentées](#11-principales-fonctionnalités-implémentées)
12. [Scénario complet d'utilisation](#12-scénario-complet-dutilisation)
13. [Algorithmes et traitements importants](#13-algorithmes-et-traitements-importants)
14. [Décisions techniques](#14-décisions-techniques)
15. [Difficultés rencontrées et solutions apportées](#15-difficultés-rencontrées-et-solutions-apportées)
16. [Limites actuelles du projet](#16-limites-actuelles-du-projet)
17. [Pistes d'amélioration](#17-pistes-damélioration)
18. [Commandes pour lancer le projet](#18-commandes-pour-lancer-le-projet)

---

## 1. Objectif du projet

**AskData** (anciennement *Agentic Business Intelligence*) est une application web de Business Intelligence (BI) conversationnelle, conçue pour être déployée au sein d'une entreprise.

Son objectif principal est de permettre à tout utilisateur — sans compétence technique en SQL ou en data — de poser des questions sur ses données métier en langage naturel français, et d'obtenir automatiquement :

- une requête SQL générée et auditée ;
- les données tabulaires correspondantes (CSV) ;
- un graphique interactif (Plotly HTML) ;
- des indicateurs clés de performance (KPIs) calculés automatiquement ;
- un rapport d'insights et de recommandations business (Markdown) ;
- un export PDF complet de l'analyse.

L'application vise à démocratiser l'accès à la donnée en entreprise en éliminant la dépendance aux outils BI traditionnels coûteux (Power BI, Tableau, Looker), aux analystes intermédiaires, et aux cycles longs de production de rapports.

---

## 2. Problème auquel répond le projet

### Contexte

Dans la majorité des entreprises, la BI repose sur un modèle rigide :
1. Des bases de données SQL détenant les données opérationnelles.
2. Des outils BI (Power BI, Tableau, etc.) nécessitant des licences et des compétences spécialisées.
3. Des profils techniques (analystes, ingénieurs data) pour produire des rapports.
4. Des cycles longs entre la question métier et la réponse chiffrée.

### Problèmes identifiés

**Problèmes organisationnels :**
- Dépendance forte aux profils techniques rares.
- Délais importants entre la formulation d'un besoin et la production d'un rapport.
- Communication difficile entre les équipes métier et les équipes data.

**Problèmes techniques :**
- Dashboards figés, peu adaptables à des questions ad hoc.
- Coûts élevés de licences logicielles.
- Manque de transparence sur les calculs effectués.

**Problèmes d'accès :**
- Les PME et startups ne peuvent pas se permettre des outils BI complets.
- Les collaborateurs non techniques sont exclus de l'accès direct aux données.

### Solution proposée

AskData résout ce problème en positionnant un modèle de langage (LLM) comme intermédiaire intelligent entre l'utilisateur et la base de données :

```
Utilisateur (langage naturel) → LLM → SQL → Base de données → Résultats + Graphique + Insights
```

L'approche est entièrement transparente : le SQL généré est visible, téléchargeable et auditable. Aucune donnée n'est cachée dans une "boîte noire".

---

## 3. Besoins fonctionnels et non fonctionnels

### 3.1 Besoins fonctionnels

| ID | Besoin | Description |
|---|---|---|
| BF-01 | Analyse conversationnelle | L'utilisateur pose une question en français et obtient une analyse complète |
| BF-02 | Génération SQL | Le système génère automatiquement une requête SQL à partir de la question |
| BF-03 | Exécution SQL | La requête est exécutée sur la base configurée, les données extraites |
| BF-04 | Visualisation | Un graphique Plotly interactif est généré automatiquement |
| BF-05 | KPIs automatiques | Les métriques (total, moyenne, min, max) sont calculées sur les colonnes numériques |
| BF-06 | Rapport Insights | Un rapport en Markdown avec insights et recommandations est produit |
| BF-07 | Export PDF | L'utilisateur peut exporter l'analyse complète en PDF |
| BF-08 | Dashboard | Les graphiques et KPIs peuvent être épinglés dans un tableau de bord personnel |
| BF-09 | Chat IA | Un assistant conversationnel contextuel répond aux questions d'analyse |
| BF-10 | Authentification | Chaque utilisateur a un compte sécurisé avec session JWT |
| BF-11 | Gestion des utilisateurs | Un administrateur gère les comptes (créer, désactiver, supprimer) |
| BF-12 | Configuration LLM | L'administrateur configure les clés API LLM, les utilisateurs choisissent le provider |
| BF-13 | Configuration DB | Chaque utilisateur configure sa connexion à la base de données métier |
| BF-14 | Explorateur de schéma | L'utilisateur peut explorer les tables et colonnes de sa base |
| BF-15 | Historique | Les analyses précédentes sont conservées et réaccessibles |
| BF-16 | Export chat dans PDF | Les extraits de conversation Chat IA peuvent être inclus dans le PDF |
| BF-17 | Refresh KPI | Un KPI épinglé peut être rafraîchi sans appel LLM |
| BF-18 | Adminer | Interface web pour inspecter la base d'authentification |

### 3.2 Besoins non fonctionnels

| ID | Besoin | Description |
|---|---|---|
| BNF-01 | Sécurité | Communications chiffrées (HTTPS/TLS), tokens JWT, mots de passe hashés (bcrypt) |
| BNF-02 | Isolation des données | Chaque utilisateur ne voit que ses propres analyses, KPIs et dashboard |
| BNF-03 | Performance | La génération LLM est la seule étape lente ; le reste est quasi-instantané |
| BNF-04 | Portabilité | L'application tourne entièrement dans Docker, sur tout système d'exploitation |
| BNF-05 | Maintenabilité | Code structuré en modules distincts (backend/frontend/auth/repositories) |
| BNF-06 | Transparence | SQL généré toujours visible et téléchargeable |
| BNF-07 | Persistance | Les données utilisateurs (KPIs, dashboard) sont en base MySQL, survivent aux redémarrages |
| BNF-08 | Scalabilité horizontale | Architecture stateless (JWT) compatible avec plusieurs instances backend |
| BNF-09 | Accessibilité réseau | Déployable sur un réseau local d'entreprise sans infrastructure cloud |
| BNF-10 | Auditabilité | Tous les artefacts (SQL, CSV, rapport) sont conservés sur disque |

---

## 4. Architecture générale

### 4.1 Vue d'ensemble

L'application est entièrement conteneurisée avec Docker et composée de quatre services :

```
┌───────────────────────────────────────────────────────────────┐
│                    Réseau Docker : askdata-network             │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              Navigateur utilisateur                   │     │
│  │         https://localhost:3000 (HTTPS)                │     │
│  └───────────────────┬──────────────────────────────────┘     │
│                      │ HTTPS (TLS auto-signé)                  │
│  ┌───────────────────▼──────────────────────────────────┐     │
│  │                 SERVICE : frontend                    │     │
│  │       Nginx:alpine  (port 443 interne → 3000)        │     │
│  │   - Sert les fichiers statiques React compilés        │     │
│  │   - Proxifie /api/* → http://backend:8000            │     │
│  │   - Génère un certificat TLS auto-signé au build      │     │
│  └───────────────────┬──────────────────────────────────┘     │
│                      │ HTTP interne (réseau Docker)            │
│  ┌───────────────────▼──────────────────────────────────┐     │
│  │                 SERVICE : backend                     │     │
│  │        FastAPI / Uvicorn  (port 8000 interne)        │     │
│  │   - API REST complète                                 │     │
│  │   - Pipeline BI (6 étapes)                           │     │
│  │   - Auth JWT                                          │     │
│  │   - Connexion aux bases de données                   │     │
│  └──────────┬────────────────────┬───────────────────────┘     │
│             │                    │                             │
│  ┌──────────▼──────────┐  ┌──────▼──────────────────────┐    │
│  │  SERVICE : mysql-auth│  │  Base de données MÉTIER      │    │
│  │  MySQL 8.0 (interne) │  │  MySQL ou PostgreSQL          │    │
│  │  Base : askdata_auth │  │  (externe au Docker)          │    │
│  │  - users             │  │  host.docker.internal         │    │
│  │  - analyses          │  └──────────────────────────────┘    │
│  │  - kpis              │                                      │
│  │  - dashboard         │  ┌──────────────────────────────┐    │
│  │  - llm_config        │  │  SERVICE : adminer            │    │
│  └─────────────────────┘  │  Adminer (port 8080)          │    │
│                            │  Inspecte mysql-auth          │    │
│                            └──────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

### 4.2 Flux de données principal

```
1. Utilisateur saisit une question dans l'interface React
2. React envoie POST /api/pipeline/run avec JWT + paramètres
3. Nginx (frontend) reçoit la requête HTTPS et la proxifie vers backend:8000
4. FastAPI valide le JWT (middleware), récupère l'utilisateur
5. service.py orchestre le pipeline 6 étapes :
   a. generate_schema → lit le schéma de la base métier
   b. generate_sql    → appel LLM (Gemini ou Groq) → SQL
   c. execute_analysis → connexion DB métier → CSV + metadata
   d. generate_dataviz → appel LLM → script Python Plotly
   e. run_dataviz      → exécution du script → HTML
   f. generate_insights → appel LLM → Markdown insights
6. Résultat complet retourné à React en JSON
7. React affiche onglets Results / SQL / Chart / KPIs / Report
8. L'analyse est sauvegardée en base MySQL (table analyses)
```

### 4.3 Flux d'authentification

```
1. Utilisateur soumet email + mot de passe → POST /api/auth/login
2. Backend vérifie le hash bcrypt en base MySQL
3. Si OK : génération d'un JWT signé (HS256, expiration 8h)
4. Token stocké dans localStorage côté navigateur
5. Toutes les requêtes suivantes envoient Authorization: Bearer <token>
6. Middleware FastAPI vérifie la signature JWT à chaque requête
7. Si token expiré (401) : localStorage vidé, retour à la page login
```

---

## 5. Arborescence des dossiers

```
agentic-business-intelligence-main/
│
├── .env                          # Variables d'environnement (DB, JWT, admin, LLM)
├── .gitignore                    # Fichiers exclus du dépôt git
├── docker-compose.yml            # Orchestration des 4 services Docker
├── Dockerfile                    # Image Docker du backend Python
├── requirements.txt              # Dépendances Python
├── README.md                     # Documentation utilisateur
├── CONTEXT.md                    # Ce document
│
├── backend/                      # Application FastAPI (Python 3.12)
│   ├── __init__.py
│   ├── main.py                   # Point d'entrée FastAPI, toutes les routes HTTP
│   ├── service.py                # Orchestrateur du pipeline BI (6 étapes)
│   ├── db_config.py              # Singleton thread-safe config DB (runtime/db_config.json)
│   ├── llm_config.py             # Singleton thread-safe config LLM (runtime/llm_config.json)
│   │
│   ├── auth/                     # Module d'authentification
│   │   ├── __init__.py
│   │   ├── database.py           # Connexion MySQL auth, init tables, pool de connexions
│   │   ├── middleware.py         # Dépendances FastAPI : get_current_user, require_admin
│   │   ├── router.py             # Routes /api/auth/* + seeding admin initial
│   │   └── service.py            # Hash bcrypt, génération/vérification JWT
│   │
│   ├── llm/                      # Providers LLM
│   │   ├── __init__.py
│   │   ├── base.py               # Classe abstraite LLMProvider + GenerationResult
│   │   ├── factory.py            # Fabrique : get_provider("gemini"|"groq")
│   │   ├── gemini.py             # Provider Gemini (google-generativeai SDK)
│   │   └── groq.py               # Provider Groq (HTTP OpenAI-compatible)
│   │
│   ├── repositories/             # Accès données MySQL auth (par user_id)
│   │   ├── __init__.py
│   │   ├── analyses.py           # CRUD historique des analyses par utilisateur
│   │   ├── kpis.py               # CRUD KPIs épinglés par utilisateur
│   │   ├── dashboard.py          # CRUD graphiques épinglés par utilisateur
│   │   └── llm_config.py         # Lecture/écriture config LLM globale en base
│   │
│   ├── scripts/                  # Étapes du pipeline BI
│   │   ├── __init__.py
│   │   ├── schema.py             # Génération du schéma Markdown de la base
│   │   ├── generate_sql.py       # Génération SQL via LLM + prompt_template.txt
│   │   ├── run_analysis.py       # Exécution SQL → CSV + metadata.json
│   │   ├── generate_dataviz.py   # Génération script Plotly via LLM
│   │   ├── run_dataviz.py        # Exécution script Plotly → HTML
│   │   ├── generate_insights_actions.py  # Génération insights via LLM
│   │   ├── chat_analyst.py       # Prompt builder pour le mode Chat IA
│   │   ├── prompt_template.txt   # Prompt SQL (contexte schéma + question)
│   │   ├── prompt_template_dataviz.txt   # Prompt génération Plotly
│   │   └── prompt_template_insights.txt  # Prompt insights & recommandations
│   │
│   └── utils/                    # Utilitaires base de données
│       ├── __init__.py
│       ├── db_utils.py           # run_query(), get_connection() — MySQL + PostgreSQL
│       ├── db_discovery.py       # list_databases(), list_schemas()
│       └── schema_discovery.py   # Introspection des colonnes et types
│
├── frontend/                     # Application React (TypeScript + Vite)
│   ├── Dockerfile                # Build React → Nginx HTTPS (TLS auto-signé)
│   ├── package.json              # Dépendances npm
│   ├── tsconfig.json             # Config TypeScript
│   ├── vite.config.ts            # Config Vite + proxy /api → backend
│   ├── index.html                # Point d'entrée HTML
│   └── src/
│       ├── main.tsx              # Bootstrap React
│       ├── App.tsx               # Composant racine : routing, auth, état global
│       ├── types.ts              # Interfaces TypeScript (AppState, PipelineResult, KpiItem…)
│       ├── index.css             # Styles globaux Tailwind
│       ├── vite-env.d.ts         # Types d'environnement Vite
│       │
│       ├── components/           # Composants React
│       │   ├── Login.tsx         # Page de connexion (email + mot de passe)
│       │   ├── AdminPanel.tsx    # Panneau admin (gestion des utilisateurs)
│       │   ├── Sidebar.tsx       # Barre latérale (config DB, LLM, schéma, historique)
│       │   ├── ChatArea.tsx      # Zone principale d'affichage des analyses
│       │   ├── PipelineInput.tsx # Champ de saisie de question + bouton analyser
│       │   ├── ResultTabs.tsx    # Onglets Results / SQL / Chart / KPIs / Report
│       │   ├── Dashboard.tsx     # Tableau de bord (KPIs + graphiques épinglés)
│       │   ├── KpiCard.tsx       # Carte KPI individuelle (valeur, delta, refresh)
│       │   ├── QuickChat.tsx     # Interface Chat IA conversationnel
│       │   ├── SchemaExplorer.tsx # Explorateur de tables/colonnes
│       │   ├── DatabaseConfig.tsx # Formulaire de configuration DB
│       │   └── LLMModelConfig.tsx # Config LLM (admin : clés ; user : sélecteur provider)
│       │
│       └── lib/                  # Utilitaires et services frontend
│           ├── api.ts            # Client HTTP authentifié (apiFetch + toutes les fonctions API)
│           ├── auth.ts           # Gestion JWT localStorage (getToken, saveAuth, clearAuth)
│           ├── kpi.ts            # Utilitaires formatage (formatKpiValue, computeDelta)
│           ├── chatExport.ts     # Gestion localStorage messages Chat → PDF
│           ├── exportPdf.ts      # Génération et export PDF (capture Plotly + HTML)
│           └── utils.ts          # Utilitaire cn() pour Tailwind classes
│
├── runtime/                      # ⚠️ Gitignoré — configs persistées par le backend
│   ├── db_config.json            # Connexion DB active (host, port, user, password…)
│   └── llm_config.json           # Clés API LLM actives (Gemini, Groq)
│
├── requests/                     # ⚠️ Gitignoré — questions utilisateurs (.txt)
├── sql/                          # ⚠️ Gitignoré — requêtes SQL générées (.sql)
├── schema/                       # ⚠️ Gitignoré — schémas Markdown générés (.md)
├── dataviz/                      # ⚠️ Gitignoré — scripts Python Plotly (.py)
└── outputs/                      # ⚠️ Gitignoré — résultats par analyse
    └── <nom_analyse>/
        ├── <nom>.csv             # Données tabulaires
        ├── <nom>.html            # Graphique Plotly interactif
        ├── <nom>.md              # Rapport Insights & Actions
        ├── metadata.json         # Métadonnées techniques
        └── backend_context.json  # Contexte d'exécution (provider, DB, etc.)
```

---

## 6. Technologies utilisées et justifications

### 6.1 Backend

| Technologie | Version | Rôle | Justification |
|---|---|---|---|
| **Python** | 3.12 | Langage backend | Excellent support IA/Data (pandas, plotly, LLM SDKs) |
| **FastAPI** | 0.115 | Framework API REST | Async, validation automatique, documentation Swagger intégrée, performances proches de Node.js |
| **Uvicorn** | 0.34 | Serveur ASGI | Serveur de production léger recommandé pour FastAPI |
| **PyJWT** | 2.9 | Tokens JWT | Standard industrie pour les tokens stateless |
| **bcrypt** | 4.2 | Hash mots de passe | Algorithme de hachage sécurisé avec salt automatique |
| **mysql-connector-python** | 9.3 | Client MySQL | Driver officiel MySQL, pool de connexions intégré |
| **psycopg2-binary** | 2.9 | Client PostgreSQL | Driver PostgreSQL standard Python |
| **pandas** | 3.0 | Manipulation données | Traitement CSV, transformation données tabulaires |
| **plotly-express** | 0.4 | Visualisation | Graphiques interactifs HTML sans serveur |
| **google-generativeai** | ≥0.8 | SDK Gemini | SDK officiel Google pour Gemini 2.0 Flash |

### 6.2 Frontend

| Technologie | Version | Rôle | Justification |
|---|---|---|---|
| **React** | 18 | Framework UI | Composants réutilisables, gestion d'état déclarative |
| **TypeScript** | 5.x | Typage statique | Prévention d'erreurs à la compilation, meilleure maintenabilité |
| **Vite** | 5.x | Build tool | Build ultra-rapide, HMR en développement |
| **Tailwind CSS** | 3.x | Styles utilitaires | Développement rapide, cohérence visuelle, pas de CSS custom |
| **Lucide React** | — | Icônes | Bibliothèque d'icônes légère et cohérente |
| **react-markdown** | — | Rendu Markdown | Affichage des rapports Insights en HTML stylé |
| **motion** | — | Animations | Transitions fluides (apparition des résultats) |

### 6.3 Infrastructure

| Technologie | Rôle | Justification |
|---|---|---|
| **Docker** | Conteneurisation | Portabilité totale (Windows/macOS/Linux), isolation |
| **Docker Compose** | Orchestration multi-services | Gestion des 4 services avec un seul fichier |
| **Nginx:alpine** | Serveur web frontend | Léger, performant, proxy inverse, terminaison TLS |
| **MySQL 8.0** | Base d'authentification | Robuste, open-source, support Docker officiel |
| **Adminer** | Interface admin MySQL | Outil léger (~500 Ko), aucune installation requise |

### 6.4 Providers LLM

| Provider | Modèle | Avantage | Inconvénient |
|---|---|---|---|
| **Google Gemini** | gemini-2.0-flash | Qualité élevée, quota gratuit généreux | Nécessite une clé Google AI Studio |
| **Groq** | openai/gpt-oss-120b | Vitesse d'inférence très élevée (tokens/s) | Quota horaire limité en version gratuite |

Les deux providers implémentent la même interface (`LLMProvider.generate(prompt) → GenerationResult`), ce qui rend le changement de provider transparent pour le pipeline.

### 6.5 Sécurité

| Mécanisme | Technologie | Description |
|---|---|---|
| Transport | TLS 1.2/1.3 (Nginx) | Chiffrement HTTPS, certificat auto-signé généré au build |
| Authentification | JWT HS256 (PyJWT) | Token signé, stateless, expiration 8h |
| Mots de passe | bcrypt (4 rounds salt) | Hachage sécurisé, impossible à inverser |
| Autorisation | Middleware FastAPI | Vérification du rôle (admin/user) à chaque requête |

---

## 7. Fonctionnement global de l'application

### 7.1 Cycle de vie d'une session utilisateur

```
Ouverture navigateur https://localhost:3000
        │
        ▼
App.tsx vérifie localStorage["askdata_token"]
        │
        ├─ Token absent ou expiré → Page Login.tsx
        │         │
        │         ▼ POST /api/auth/login
        │         │
        │         ▼ Succès → saveAuth(token, user) → setAuthed(true)
        │
        └─ Token valide → Bootstrap
                  │
                  ▼ GET /api/config + GET /api/results (parallèle)
                  │
                  ▼ Sidebar affichée (DB, LLM, Schéma, Historique)
                  │
                  ▼ Utilisateur pose une question
                  │
                  ▼ POST /api/pipeline/run
                  │
                  ▼ Pipeline 6 étapes (backend)
                  │
                  ▼ Résultat affiché (Results / SQL / Chart / KPIs / Report)
```

### 7.2 État global React (AppState)

L'état de l'application est centralisé dans `App.tsx` via `useState<AppState>`. Les champs principaux sont :

```typescript
interface AppState {
  databases: string[];          // Bases disponibles
  schemas: string[];            // Schémas de la base sélectionnée
  providers: string[];          // Providers LLM disponibles
  selectedDatabase: string;     // Base active
  selectedSchema: string;       // Schéma actif
  selectedProvider: string;     // Provider LLM actif (persisté localStorage)
  overwriteExisting: boolean;   // Option écraser les résultats
  history: PipelineResultSummary[];  // Historique de session
  activeResultId: string | null;     // ID de l'analyse affichée
  activeResult: PipelineResult | null;  // Données complètes de l'analyse affichée
  isLoading: boolean;           // Pipeline en cours
  isBootstrapping: boolean;     // Chargement initial
  errorMessage: string | null;  // Erreur à afficher
  insertText: string | null;    // Texte inséré depuis l'explorateur de schéma
}
```

### 7.3 Stratégie de communication API

Toutes les requêtes HTTP passent par la fonction `apiFetch()` dans `lib/api.ts`. Cette fonction :
1. Récupère le token JWT depuis localStorage
2. Ajoute le header `Authorization: Bearer <token>`
3. Gère les erreurs HTTP (401 → logout automatique, autres → message d'erreur)
4. Parse la réponse JSON

Le frontend ne communique jamais directement avec le backend — il passe toujours par Nginx qui proxifie `/api/*` vers `http://backend:8000`. Cela évite tout problème CORS et centralise les accès.

---

## 8. Rôle de chaque module important

### 8.1 Backend

#### `backend/main.py`
Point d'entrée FastAPI. Responsabilités :
- Création de l'instance `FastAPI`
- Configuration du middleware CORS
- Événement de démarrage (`on_startup`) : init tables MySQL, seeding admin, sync config LLM
- Déclaration de toutes les routes HTTP (environ 30 endpoints)
- Injection de la dépendance `get_current_user` sur les routes protégées
- Routes spéciales : pipeline, KPIs, dashboard, chat, artifacts

#### `backend/service.py`
Orchestrateur du pipeline BI. Responsabilités :
- `run_pipeline()` : appelle les 6 étapes dans l'ordre, capture stdout/stderr de chaque étape
- `build_question_name()` : génère un identifiant unique pour chaque analyse (slugification + suffixes numériques)
- `capture_step()` : wrapper qui redirige stdout/stderr d'une fonction vers une chaîne (pour les logs)
- `load_result()` : lit tous les artefacts disque d'une analyse et les assemble en JSON
- `list_available_results()` : scanne le dossier `outputs/` pour lister les analyses disponibles
- `clear_history()` : supprime tous les artefacts disque

#### `backend/auth/database.py`
Gestionnaire de la base MySQL d'authentification. Responsabilités :
- Pool de connexions MySQL (`MySQLConnectionPool`, 5 connexions)
- `init_db()` : création des tables au démarrage avec retries (MySQL peut ne pas être prêt immédiatement)
- Toutes les tables sont créées en `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

#### `backend/auth/service.py`
Logique cryptographique. Responsabilités :
- `hash_password(plain)` → bcrypt hash
- `verify_password(plain, hashed)` → comparaison bcrypt constante en temps
- `create_token(user_id, email, role)` → JWT signé HS256 avec expiration
- `decode_token(token)` → vérification signature + extraction payload

#### `backend/auth/middleware.py`
Dépendances FastAPI injectables. Responsabilités :
- `get_current_user` : extrait le Bearer token du header, vérifie la signature JWT, retourne le payload
- `require_admin` : appelle `get_current_user` puis vérifie `role == "admin"`

#### `backend/auth/router.py`
Routes `/api/auth/*`. Responsabilités :
- `POST /api/auth/login` : vérification credentials, génération JWT
- `GET /api/auth/me` : retourne le profil de l'utilisateur connecté
- `GET/POST/PATCH/DELETE /api/auth/users` : CRUD utilisateurs (admin uniquement)
- `seed_admin()` : créé au démarrage si aucun admin n'existe (lit `ADMIN_EMAIL`/`ADMIN_PASSWORD`)

#### `backend/llm/base.py`
Contrat d'interface LLM. Définit :
- `class LLMProvider` (abstraite) avec méthode `generate(prompt) → GenerationResult`
- `class GenerationResult` : texte généré + métadonnées (provider, modèle, tokens)
- `class LLMProviderError` : exception pour les erreurs LLM

#### `backend/llm/gemini.py`
Implémentation Gemini. Responsabilités :
- Lit la clé API depuis `LLMConfigManager`
- Initialise le client `google.generativeai` avec le modèle `gemini-2.0-flash`
- Gère les erreurs d'API (quota, clé invalide, réseau)

#### `backend/llm/groq.py`
Implémentation Groq. Responsabilités :
- Utilise l'API HTTP OpenAI-compatible de Groq
- Ajoute un header `User-Agent` spécifique (requis par Cloudflare pour éviter le blocage)
- Modèle : `openai/gpt-oss-120b`
- URL configurable via `groq_api_url` (permet de pointer vers un endpoint custom)

#### `backend/repositories/`
Pattern Repository : toutes les interactions avec la base MySQL auth. Chaque repository :
- Ouvre une connexion depuis le pool
- Exécute la requête SQL
- Convertit les données MySQL (snake_case) en camelCase pour le frontend
- Ferme la connexion

Exemple de conversion :
```python
# MySQL retourne : {"question_name": "...", "chart_url": "..."}
# Le repository retourne : {"questionName": "...", "chartUrl": "..."}
```

#### `backend/scripts/chat_analyst.py`
Module du Chat IA. Responsabilités :
- `load_schema_markdown()` : charge le schéma de la base (fichier pré-généré ou génération dynamique depuis information_schema)
- `build_system_prompt()` : construit le prompt système avec contexte DB + schéma + règles strictes
- `build_messages()` : assemble l'historique de conversation pour l'appel LLM

### 8.2 Frontend

#### `App.tsx`
Composant racine. Responsabilités :
- État global `AppState` + `authed` (bool) + `currentUser`
- Bootstrap : chargement config + historique au démarrage
- Routing entre vues : Analyse / Chat IA / Dashboard / Admin
- Gestion de l'événement `auth:logout` (dispatch par `apiFetch` sur 401)
- Navbar avec onglets + avatar utilisateur + bouton logout

#### `components/Sidebar.tsx`
Barre latérale de configuration. Responsabilités :
- Section Config : `DatabaseConfig` + `LLMModelConfig`
- Section Cible : sélecteurs Base/Schéma (reset `activeResult` au changement)
- `SchemaExplorer` : explorateur de tables cliquable
- Toggle "Écraser les résultats existants"
- Historique avec vraies questions (pas les slugs techniques)

#### `components/ResultTabs.tsx`
Onglets du résultat. Responsabilités :
- **Results** : tableau des données + download CSV
- **SQL** : code SQL coloré + download
- **Chart** : iframe Plotly + bouton épingler dashboard
- **KPIs** : calcul automatique Total/Moy/Min/Max par colonne numérique + épinglage
- **Report** : rapport Markdown + export PDF (avec badge chat export)

#### `components/Dashboard.tsx`
Tableau de bord. Responsabilités :
- Charge les KPIs et graphiques depuis l'API (MySQL, par user)
- Section KPIs : grille de `KpiCard` avec refresh individuel
- Section graphiques : grille 12 colonnes avec drag & drop pour réorganiser
- Affichage graphiques via `<iframe src={buildArtifactUrl(item.chartUrl)}>` (sans JWT nécessaire)

#### `lib/auth.ts`
Gestion de l'authentification côté client. Responsabilités :
- `saveAuth(token, user)` : persistance dans localStorage
- `getToken()` : lecture du token
- `getUser()` : lecture du user avec typage `AuthUser`
- `clearAuth()` : suppression
- `isAuthenticated()` : vérifie la présence ET la non-expiration du token (décodage manuel base64)

#### `lib/exportPdf.ts`
Génération PDF. Responsabilités :
- `captureChart(chartHtml)` : crée une iframe cachée hors écran, attend que Plotly se charge (max 12s), capture en PNG via `Plotly.toImage()`
- `renderKpis(kpis)` : génère du HTML pour les KPIs du dashboard
- `renderChatMessages(messages)` : génère des bulles de conversation stylées
- `exportReportToPdf(result)` : assemble le PDF complet en HTML, ouvre dans une nouvelle fenêtre, déclenche `window.print()`

---

## 9. Description de la base de données

### 9.1 Base d'authentification (`askdata_auth`)

Cette base est hébergée dans le service Docker `mysql-auth` et gère tout ce qui est lié aux utilisateurs et à leurs données personnelles.

#### Table `users`

```sql
CREATE TABLE users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,         -- hash bcrypt
    role          ENUM('admin','user') NOT NULL DEFAULT 'user',
    is_active     TINYINT(1) NOT NULL DEFAULT 1, -- 0 = désactivé
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Contraintes :**
- `email` : clé unique — pas de doublon de compte
- `role` : ENUM strict — pas d'autre valeur possible
- `password_hash` : jamais le mot de passe en clair

#### Table `analyses`

```sql
CREATE TABLE analyses (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    question_name   VARCHAR(255) NOT NULL,       -- slug technique (identifiant artefacts)
    question_text   TEXT NOT NULL,               -- question en langage naturel
    database_name   VARCHAR(255),
    schema_name     VARCHAR(255),
    provider_name   VARCHAR(64),
    rows_returned   INT DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Rôle :** historique des analyses par utilisateur. Utilisée pour filtrer l'historique — seules les analyses appartenant à l'utilisateur connecté sont retournées. `ON DELETE CASCADE` : la suppression d'un utilisateur supprime son historique.

#### Table `kpis`

```sql
CREATE TABLE kpis (
    id              VARCHAR(64) NOT NULL PRIMARY KEY,  -- format: analyseName__column__metric
    user_id         INT NOT NULL,
    question_name   VARCHAR(255) NOT NULL,
    question_text   TEXT NOT NULL,
    column_name     VARCHAR(255),
    value           VARCHAR(255),      -- valeur formatée (ex: "142 500")
    raw_value       DOUBLE,            -- valeur numérique brute
    previous_value  DOUBLE,            -- valeur avant dernier refresh (pour delta %)
    database_name   VARCHAR(255),
    schema_name     VARCHAR(255),
    provider_name   VARCHAR(64),
    pinned_at       BIGINT,            -- timestamp Unix (ms)
    last_updated    BIGINT,            -- timestamp Unix (ms)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Rôle :** KPIs épinglés par utilisateur. L'ID composite (`analyseName__column__metric`) permet l'upsert sans doublon. `previous_value` stocke la valeur avant refresh pour calculer le delta %.

#### Table `dashboard`

```sql
CREATE TABLE dashboard (
    id              VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id         INT NOT NULL,
    question_name   VARCHAR(255) NOT NULL,
    question_text   TEXT,
    chart_url       VARCHAR(512),      -- chemin relatif vers l'artefact chart
    pinned_at       BIGINT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Rôle :** graphiques épinglés par utilisateur. Stocke l'URL de l'artefact (pas le HTML brut) pour éviter de stocker des fichiers de 3 Mo en base.

#### Table `llm_config`

```sql
CREATE TABLE llm_config (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    gemini_api_key  TEXT,              -- clé API Google Gemini
    groq_api_key    TEXT,              -- clé API Groq
    groq_api_url    VARCHAR(512),      -- URL custom Groq (optionnel)
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Rôle :** configuration LLM globale (une seule ligne). Configurée par l'admin, partagée pour tous les utilisateurs. Au démarrage Docker, le backend lit cette table et synchronise avec `runtime/llm_config.json` pour que le pipeline puisse accéder aux clés.

### 9.2 Diagramme de relations

```
users (1) ──────────────────── (N) analyses
  │                                (user_id FK)
  │
  ├─────────────────────────── (N) kpis
  │                                (user_id FK)
  │
  └─────────────────────────── (N) dashboard
                                   (user_id FK)

llm_config (table globale, 1 ligne, pas de FK)
```

### 9.3 Base de données métier (externe)

La base métier (MySQL ou PostgreSQL) est la base de l'entreprise contenant les données à analyser. Elle est externe au Docker et accessible via `host.docker.internal`. Le backend s'y connecte uniquement pour :
- Lister les bases disponibles (`SHOW DATABASES` ou `pg_catalog`)
- Lister les schémas
- Introspection via `information_schema.columns`
- Exécuter les requêtes SQL générées par le LLM

AskData ne modifie jamais la base métier — il effectue uniquement des `SELECT`.

---

## 10. API et responsabilités

### 10.1 Règles générales

- Toutes les routes requièrent `Authorization: Bearer <jwt>` sauf `/api/health`, `/api/auth/login`, et `GET /api/artifacts/*`
- Les réponses d'erreur suivent le format FastAPI standard : `{"detail": "message d'erreur"}`
- Le header `Content-Type: application/json` est attendu pour toutes les requêtes POST/PATCH

### 10.2 Routes d'authentification

| Méthode | Route | Auth | Body | Réponse | Description |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | Non | `{email, password}` | `{token, user: {id, email, role}}` | Connexion |
| GET | `/api/auth/me` | user | — | `{id, email, role}` | Profil connecté |
| GET | `/api/auth/users` | admin | — | `{users: [...]}` | Liste utilisateurs |
| POST | `/api/auth/users` | admin | `{email, password, role}` | `{id, email, role}` | Créer utilisateur |
| PATCH | `/api/auth/users/{id}` | admin | `{is_active?, role?}` | `{success: true}` | Modifier utilisateur |
| DELETE | `/api/auth/users/{id}` | admin | — | `{success: true}` | Supprimer utilisateur |

### 10.3 Routes de configuration

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Non | Santé : `{status: "ok"}` |
| GET | `/api/config` | user | Bases/schémas/providers disponibles |
| GET | `/api/schema/explore?database=X&schema=Y` | user | Tables et colonnes |
| GET | `/api/llm-config` | user | Admin : clés masquées ; User : providers disponibles |
| POST | `/api/llm-config/test` | admin | Tester une clé API (Gemini ou Groq) |
| POST | `/api/llm-config/save` | admin | Sauvegarder config LLM (MySQL + runtime) |
| GET | `/api/db-config` | user | Config DB actuelle (password masqué) |
| POST | `/api/db-config/connect` | user | Tester connexion TCP réelle + sauvegarder si OK |
| POST | `/api/db-config/test` | user | Tester connexion TCP uniquement |
| POST | `/api/db-config/save` | user | Sauvegarder config DB |

### 10.4 Routes pipeline et résultats

| Méthode | Route | Auth | Body/Params | Description |
|---|---|---|---|---|
| POST | `/api/pipeline/run` | user | `{questionText, databaseName, schemaName, providerName, overwriteExisting}` | Lance pipeline complet, sauvegarde analyse en base |
| GET | `/api/results` | user | — | Historique filtré par user (croisement base + disque) |
| GET | `/api/results/{name}` | user | — | Résultat complet (SQL, CSV, HTML, Markdown, metadata) |
| DELETE | `/api/history` | user | — | Supprime historique DB + artefacts disque |
| GET | `/api/artifacts/{name}/{type}` | Non | type: sql/csv/chart/report | Artefact fichier (pas d'auth car iframes) |

### 10.5 Routes dashboard utilisateur

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/user/kpis` | user | KPIs de l'utilisateur (camelCase) |
| POST | `/api/user/kpis` | user | Épingler un KPI (upsert) |
| DELETE | `/api/user/kpis/{id}` | user | Désépingler un KPI |
| GET | `/api/user/dashboard` | user | Graphiques épinglés (camelCase) |
| POST | `/api/user/dashboard` | user | Épingler un graphique |
| DELETE | `/api/user/dashboard/{id}` | user | Désépingler un graphique |
| POST | `/api/kpi/refresh/{name}` | user | Rejoue le SQL d'une analyse, retourne nouvelle valeur |

### 10.6 Route Chat IA

| Méthode | Route | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/api/chat/message` | user | `{message, database, schema, provider, history}` | Réponse du data analyst IA contextuel |

---

## 11. Principales fonctionnalités implémentées

### 11.1 Analyse conversationnelle (pipeline 6 étapes)

Pipeline complet déclenché par `POST /api/pipeline/run`. Chaque étape est capturée dans un buffer pour les logs. En cas d'échec d'une étape, `PipelineServiceError` est levée avec le message d'erreur détaillé.

### 11.2 Chat IA contextuel

Assistant conversationnel qui connaît le schéma de la base. Priorité de chargement du schéma :
1. Fichier `schema/<base>__<schema>_schema.md` (généré par le pipeline)
2. Génération dynamique depuis `information_schema.columns` si le fichier n'existe pas

Le prompt système force l'assistant à citer les vraies tables/colonnes dans ses réponses.

### 11.3 KPIs automatiques (onglet KPIs)

Pour chaque analyse, les colonnes numériques sont détectées automatiquement. Pour chaque colonne :
- Total, Moyenne, Minimum, Maximum calculés en JavaScript côté client
- Bouton Épingler par métrique → sauvegardé en base MySQL (`/api/user/kpis`)

### 11.4 Dashboard personnel

Deux sections :
- **KPIs** : cartes amber avec valeur, delta coloré (vert/rouge), bouton refresh
- **Graphiques** : grille Plotly via iframe, redimensionnable, drag & drop

Données chargées depuis MySQL auth par user_id — isolation complète.

### 11.5 Export PDF

Processus en plusieurs étapes :
1. Capture du graphique Plotly via iframe temporaire cachée (`position:fixed top:-9999px`)
2. Attente chargement Plotly (max 12 secondes)
3. Capture PNG via `Plotly.toImage(plotDiv, {format: "png", width: 800})`
4. Récupération KPIs depuis `/api/user/kpis`
5. Récupération messages Chat IA sélectionnés depuis localStorage
6. Assemblage HTML complet avec CSS inline
7. Ouverture dans nouvelle fenêtre + `window.print()` automatique

### 11.6 Système d'authentification

- Inscription : admin uniquement via panel Admin ou seeding `.env`
- Login : vérification bcrypt en base MySQL
- Token JWT : expiration 8h, non révocable (stateless)
- Auto-logout : sur 401 backend, dispatch `auth:logout` event → `setAuthed(false)` dans React
- Isolation : toutes les données (analyses, KPIs, dashboard) filtrées par `user_id`

### 11.7 Configuration LLM à deux niveaux

- **Admin** : voit les champs de clés API + bouton Tester & Enregistrer
- **User** : voit uniquement le toggle Gemini/Groq avec icône 🔒
- Persistance : MySQL (table `llm_config`) + synchronisation vers `runtime/llm_config.json` au démarrage

---

## 12. Scénario complet d'utilisation

### Scénario : Premier démarrage et analyse d'une base e-commerce

**Acteurs :** Administrateur (Alice), Utilisateur (Bob)

---

**Étape 1 — Démarrage (Alice)**

```bash
docker compose up -d --build
```

Le backend :
1. Attend que `mysql-auth` soit healthy (10 tentatives, délai 3s entre chaque)
2. Crée les tables `users`, `analyses`, `kpis`, `dashboard`, `llm_config`
3. Lit `ADMIN_EMAIL=alice@company.com` et `ADMIN_PASSWORD=Admin1234!` du `.env`
4. Crée le compte admin (hash bcrypt du mot de passe)
5. Synchronise la table `llm_config` vers `runtime/llm_config.json`

---

**Étape 2 — Connexion admin (Alice)**

Alice ouvre `https://localhost:3000`.
- La page login s'affiche (le token localStorage est absent)
- Alice saisit ses credentials → `POST /api/auth/login`
- Le backend vérifie le hash bcrypt → génère JWT avec `role: "admin"`
- `saveAuth(token, {id: 1, email: "alice@company.com", role: "admin"})` dans localStorage
- App rechargée → Bootstrap : `GET /api/config` + `GET /api/results`

---

**Étape 3 — Configuration LLM (Alice)**

Dans la sidebar, section Config → Modèle LLM :
- Alice sélectionne Groq, saisit sa clé `gsk_...`
- Clic "Tester & Enregistrer" → `POST /api/llm-config/test` (admin requis)
- Backend appelle l'API Groq avec un micro-prompt → succès
- `POST /api/llm-config/save` → sauvegarde en MySQL + `runtime/llm_config.json`

---

**Étape 4 — Création compte utilisateur (Alice)**

Alice clique sur le bouton "Admin" dans la navbar → `AdminPanel`.
- Clic "Nouvel utilisateur"
- Saisit `bob@company.com`, `password123`, rôle `user`
- `POST /api/auth/users` → insertion en base MySQL avec hash bcrypt

---

**Étape 5 — Connexion et configuration DB (Bob)**

Bob ouvre `https://localhost:3000`, se connecte.
- Son JWT contient `role: "user"` → pas de bouton Admin visible
- Dans la sidebar, section Config → Base de données :
  - Type : MySQL
  - Host : `host.docker.internal`
  - Port : 3306
  - User : `root`, Password : `xxx`
  - Database : `boutique_test`
- Clic "Connecter" → `POST /api/db-config/connect`
- Backend teste une vraie connexion TCP MySQL → succès
- Configuration sauvegardée dans `runtime/db_config.json`

---

**Étape 6 — Sélection de la base et schéma**

- Section Cible → Base : `boutique_test` (sélectionné)
- Section Schéma → Schéma : `boutique_test`
- La section Schéma affiche les tables : `clients`, `commandes`, `lignes_commandes`, `produits`
- Bob clique sur `commandes` → les colonnes s'affichent

---

**Étape 7 — Première analyse**

Bob tape dans le champ : *"Quels sont les 10 clients ayant passé le plus de commandes ?"*

`POST /api/pipeline/run` avec :
```json
{
  "questionText": "Quels sont les 10 clients ayant passé le plus de commandes ?",
  "databaseName": "boutique_test",
  "schemaName": "boutique_test",
  "providerName": "groq",
  "overwriteExisting": false
}
```

Pipeline exécuté :
1. `generate_schema()` → lit `information_schema.columns` → crée `schema/boutique_test__boutique_test_schema.md`
2. `generate_sql()` → LLM reçoit le schéma + la question → génère `sql/quels_sont_les_10_clients.sql`
3. `execute_analysis()` → exécute le SQL sur `boutique_test` → `outputs/quels.../quels....csv`
4. `generate_dataviz()` → LLM reçoit le CSV (premières lignes) → génère `dataviz/quels....py`
5. `run_dataviz()` → exécute le script Python → `outputs/quels.../quels....html`
6. `generate_insights()` → LLM analyse les données → `outputs/quels.../quels....md`

L'analyse est sauvegardée dans la table `analyses` avec `user_id = 2` (Bob).

---

**Étape 8 — Consultation des résultats**

Bob voit les 5 onglets :
- **Results** : tableau avec colonnes `client_id`, `nom`, `nombre_commandes`
- **SQL** : `SELECT c.client_id, c.nom, COUNT(*) FROM commandes... GROUP BY... ORDER BY... LIMIT 10`
- **Chart** : graphique barres horizontales Plotly (interactif)
- **KPIs** : colonne `nombre_commandes` → Total: 2843, Moy: 284, Min: 201, Max: 487 → Bob épingle "Max: 487"
- **Report** : insights sur la fidélisation client + recommandations

---

**Étape 9 — Épinglage et dashboard**

Bob clique "Épingler au tableau de bord" sur le graphique.
→ `POST /api/user/dashboard` avec `user_id: 2`

Bob clique "Épingler" sur le KPI Max.
→ `POST /api/user/kpis` avec `user_id: 2`

Bob navigue vers Dashboard → voit ses KPIs et graphiques.
Alice navigue vers Dashboard → voit son dashboard vide (isolation par user_id).

---

**Étape 10 — Chat IA**

Bob va dans l'onglet Chat IA :
> "Que penses-tu de la répartition des commandes entre mes clients ?"

`POST /api/chat/message` :
- Schéma chargé depuis `schema/boutique_test__boutique_test_schema.md`
- Prompt système : "Tu es un data analyst expert de boutique_test... citations obligatoires des vraies tables"
- Groq génère une réponse contextualisée avec références à `commandes.date_commande`, `clients.nom`, etc.

Bob sélectionne un message → "Ajouter au rapport"
Lors du prochain export PDF → le message est inclus dans la section "Discussion IA".

---

## 13. Algorithmes et traitements importants

### 13.1 Génération du nom d'artefact unique

```python
def build_question_name(question_text: str, requested_name: str, overwrite_existing: bool) -> str:
    # 1. Slugification : suppression caractères spéciaux, minuscules, underscores
    #    "Quels sont les clients ?" → "quels_sont_les_clients"
    # 2. Si le nom demandé existe déjà et overwrite=False :
    #    ajout suffixe numérique : "quels_sont_les_clients_2", "_3", etc.
    # 3. Nombre max de tentatives : 100 (au-delà → erreur)
```

### 13.2 Capture du graphique pour PDF

```
1. Créer une iframe hors-écran (top: -9999px)
2. Injecter le HTML Plotly via srcdoc (sandbox: allow-scripts allow-same-origin)
3. Attendre que Plotly soit disponible (max 50 tentatives × 100ms = 5s)
4. Attendre 300ms supplémentaires pour le rendu
5. Sélectionner .js-plotly-plot dans l'iframe
6. Appeler Plotly.toImage(div, {format: "png", width: 800, height: 420})
7. Timeout global : 12 secondes
8. Fallback si échec : iframe directe dans le PDF (graphique interactif)
9. Nettoyage : removeChild(iframe) dans tous les cas
```

### 13.3 Calcul des métriques KPI (frontend)

```typescript
function computeKpiMetrics(rows: Record<string, unknown>[]) {
  // 1. Identifier les colonnes numériques
  //    Pour chaque colonne : Number(valeur) → garder si !isNaN && isFinite
  // 2. Pour les colonnes numériques :
  //    - total = somme de toutes les valeurs
  //    - avg   = total / count
  //    - min   = Math.min(...values)
  //    - max   = Math.max(...values)
  // 3. Retourner un tableau de métriques par colonne
}
```

### 13.4 Synchronisation JWT côté client

```typescript
function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  // Décodage manuel du payload base64 (partie centrale du JWT)
  const payload = JSON.parse(atob(token.split(".")[1]));
  // exp est en secondes, Date.now() en millisecondes
  return payload.exp * 1000 > Date.now();
}
```

### 13.5 Initialisation MySQL avec retries

```python
def init_db(retries: int = 10, delay: float = 3.0) -> None:
    # Problème : mysql-auth peut ne pas être prêt quand backend démarre
    # Solution : boucle de retries avec délai
    for attempt in range(1, retries + 1):
        try:
            conn = get_connection()
            # Créer les tables si elles n'existent pas (CREATE TABLE IF NOT EXISTS)
            conn.commit()
            return  # Succès
        except Exception as exc:
            print(f"Tentative {attempt}/{retries}...")
            time.sleep(delay)
    raise RuntimeError("Impossible de se connecter à mysql-auth")
```

### 13.6 Conversion snake_case → camelCase dans les repositories

MySQL retourne les données en snake_case (noms de colonnes). Le frontend React utilise camelCase. La conversion est effectuée dans chaque repository :

```python
def get_kpis(user_id: int) -> list[dict]:
    rows = cursor.fetchall()
    return [
        {
            "questionName": r["question_name"],
            "columnName":   r["column_name"],
            "rawValue":     r["raw_value"],
            "previousValue": r["previous_value"],
            # etc.
        }
        for r in rows
    ]
```

---

## 14. Décisions techniques

### 14.1 JWT stateless (sans table sessions)

**Décision :** tokens JWT sans persistance en base.

**Justification :**
- Pas de requête SQL à chaque appel API (performance)
- Simplicité de l'architecture (pas de nettoyage de sessions expirées)
- Compatibilité avec plusieurs instances backend (scalabilité horizontale)

**Compromis accepté :** impossibilité de révoquer un token avant expiration. En contexte entreprise interne avec expiration 8h, c'est acceptable.

### 14.2 Stockage des artefacts sur disque (pas en base)

**Décision :** les fichiers SQL, CSV, HTML, Markdown sont stockés sur disque dans des dossiers nommés, pas en base de données.

**Justification :**
- Fichiers HTML Plotly volumineux (~3 Mo) → inadapté à MySQL TEXT
- Accès direct possible (download, iframe)
- Pattern éprouvé pour les systèmes de fichiers de résultats

**Conséquence :** les artefacts sont partagés entre tous les utilisateurs. L'historique en base MySQL filtre par `user_id`, mais un utilisateur qui connaît le nom d'une analyse peut accéder à ses artefacts.

### 14.3 Nginx comme proxy inverse

**Décision :** Nginx proxifie `/api/*` vers le backend. Le frontend ne connaît pas l'adresse du backend.

**Justification :**
- Élimine toute configuration CORS (même origine pour frontend et API)
- Permet de changer l'adresse du backend sans modifier le code frontend
- HTTPS centralisé sur Nginx (pas sur Uvicorn)

### 14.4 Séparation MySQL auth vs base métier

**Décision :** deux bases MySQL distinctes — une pour l'auth (interne Docker), une pour les données métier (externe).

**Justification :**
- Isolation totale entre les données d'authentification et les données business
- La base métier peut être MySQL ou PostgreSQL, sur n'importe quel serveur
- Pas de risque de pollution/modification de la base métier

### 14.5 Provider LLM configurable par l'admin uniquement

**Décision :** les clés API LLM sont configurées par l'admin et stockées en base. Les utilisateurs choisissent uniquement le provider (Gemini ou Groq), pas les clés.

**Justification :**
- En entreprise, les clés API sont des ressources partagées gérées par l'IT
- Évite que chaque utilisateur doive obtenir et gérer ses propres clés
- Contrôle centralisé des coûts API
- Sécurité : les utilisateurs ne voient jamais les clés API

### 14.6 ChatUrl vs ChartHtml dans le dashboard

**Décision :** le dashboard stocke l'URL de l'artefact chart (`/api/artifacts/xxx/chart`) plutôt que le HTML Plotly complet.

**Justification :**
- Un HTML Plotly pèse environ 3 Mo
- L'ancien localStorage (5 Mo max) saturait immédiatement
- Avec MySQL, 3 Mo par entrée × N graphiques serait excessif
- L'URL (~50 octets) est chargée à la demande via iframe

### 14.7 Calcul KPIs côté client

**Décision :** les métriques KPI (total, moy, min, max) sont calculées en JavaScript dans le navigateur, pas côté serveur.

**Justification :**
- Les données sont déjà disponibles dans `result.csvData`
- Évite un aller-retour API supplémentaire
- Le calcul est instantané pour des résultats < 10 000 lignes
- Flexible : fonctionne sans nouvelle route backend

---

## 15. Difficultés rencontrées et solutions apportées

### 15.1 Boucle infinie de refresh sur la page login

**Problème :** Au démarrage, `useEffect` bootstrapait l'app (appel API) même si l'utilisateur n'était pas connecté. L'API retournait 401 → `apiFetch` appelait `window.location.reload()` → boucle infinie.

**Solution :**
- Remplacer `window.location.reload()` par `window.dispatchEvent(new Event("auth:logout"))`
- Ajouter `if (!authed) return` dans le `useEffect` de bootstrap
- Écouter l'événement `auth:logout` dans `App.tsx` pour mettre à jour `setAuthed(false)`

### 15.2 Cache Docker invalidé de manière incorrecte

**Problème :** Les modifications du code Python n'étaient pas prises en compte lors du rebuild avec `--build` (sans `--no-cache`), car Docker cachait la couche COPY.

**Solution :** Utiliser systématiquement `docker compose build --no-cache backend` pour forcer le rebuild du backend. Documentation ajoutée dans le README.

### 15.3 Mismatch snake_case / camelCase MySQL → React

**Problème :** MySQL retourne `chart_url`, `question_name`, etc. mais le frontend attend `chartUrl`, `questionName`. Cela causait des graphiques vides et des KPIs non affichés.

**Solution :** Conversion explicite dans chaque repository Python (dictionnaire de renommage colonne par colonne).

### 15.4 Iframes sans authentification JWT

**Problème :** Les graphiques dans le dashboard sont chargés via `<iframe src="/api/artifacts/xxx/chart">`. Les iframes ne peuvent pas envoyer de headers JWT → 401.

**Solution :** Retirer le `Depends(get_current_user)` de la route `GET /api/artifacts/{name}/{type}`. Les URLs d'artefacts ne sont pas devinables (basées sur les noms des analyses), ce qui limite le risque.

### 15.5 localStorage plein (chartHtml ~3 Mo)

**Problème :** Épingler un graphique dans le dashboard stockait le HTML Plotly complet (~3 Mo) dans localStorage. La limite de 5 Mo était atteinte immédiatement avec 2 graphiques.

**Solution :** Stocker uniquement l'URL de l'artefact (`/api/artifacts/xxx/chart`, ~50 octets) et charger le graphique via iframe au moment de l'affichage. Migration vers MySQL a définitivement résolu le problème de limite.

### 15.6 Chat IA donnant des réponses génériques

**Problème :** Malgré le schéma chargé, le LLM donnait des réponses génériques sans citer les vraies tables.

**Solution :** Renforcement du prompt système avec des règles absolues :
- "BASE-TOI TOUJOURS sur les vraies tables et colonnes du schéma"
- "Quand tu suggères un KPI, cite TOUJOURS la table et la colonne concernées"
- "Ne cite JAMAIS des tables ou colonnes qui n'existent pas"

### 15.7 Renommage crok → groq (faute de frappe historique)

**Problème :** Le provider Groq était initialement nommé "crok" partout dans le code (faute de frappe). Migration difficile car implique backend, frontend, fichiers de config, variables d'environnement.

**Solution :** Renommage systématique avec recherche globale dans tous les fichiers. Avertissement documenté pour la migration des fichiers `runtime/llm_config.json` existants et du `localStorage`.

### 15.8 Premier admin créé avant que MySQL soit prêt

**Problème :** Le backend démarrait trop vite, avant que `mysql-auth` soit prêt à accepter des connexions.

**Solution :** 
- Ajout d'un `healthcheck` Docker sur `mysql-auth` (ping toutes les 10s, 5 retries)
- `depends_on` avec `condition: service_healthy` dans `docker-compose.yml`
- Mécanisme de retry dans `init_db()` (10 tentatives, 3s de délai)

---

## 16. Limites actuelles du projet

### 16.1 Artefacts disque partagés entre utilisateurs

Les fichiers générés (SQL, CSV, HTML, Markdown) sont dans des dossiers partagés sur le serveur. Si deux utilisateurs posent la même question avec le même slug, il y a collision. Seul l'historique en base est filtré par user — pas les fichiers eux-mêmes.

### 16.2 Pas de révocation de token JWT

Un token JWT reste valide jusqu'à expiration (8h par défaut) même si l'administrateur désactive le compte. Il faudrait une table de tokens révoqués (blacklist) pour une révocation immédiate.

### 16.3 Certificat TLS auto-signé

En développement/déploiement interne, le certificat TLS est auto-signé → avertissement navigateur. En production, un vrai certificat (Let's Encrypt) est requis.

### 16.4 Mot de passe DB transmis en clair dans le payload

La configuration DB est envoyée via HTTPS, donc chiffrée en transit. Mais elle est stockée en clair dans `runtime/db_config.json` sur le serveur. Un chiffrement au repos serait souhaitable.

### 16.5 Pipeline synchrone (bloquant)

Le pipeline 6 étapes est synchrone — FastAPI attend la fin complète avant de répondre. Pour des questions complexes ou une base lente, la requête peut durer 30-60 secondes sans retour à l'utilisateur. Une architecture événementielle (WebSockets ou SSE) permettrait d'afficher la progression étape par étape.

### 16.6 KPIs détectés uniquement sur colonnes numériques simples

La détection KPI se base sur `Number(valeur)` en JavaScript. Les colonnes de type string représentant des chiffres (ex: `"142 500"` avec espace) ne sont pas détectées. Les colonnes de date ne sont pas supportées.

### 16.7 Historique unique pour tous les fichiers disque

Si un utilisateur supprime l'historique (`DELETE /api/history`), les fichiers disque de toutes les analyses sont supprimés, même si d'autres utilisateurs y ont accès via leurs propres entrées en base.

### 16.8 Pas d'authentification multi-tenant

Une seule configuration DB est partagée par session utilisateur (`runtime/db_config.json`). Dans un contexte multi-utilisateurs concurrent, deux utilisateurs configurant des bases différentes en même temps peuvent se chevaucher.

---

## 17. Pistes d'amélioration

### 17.1 Haute priorité

| Amélioration | Description | Complexité |
|---|---|---|
| **Éditeur SQL** | Permettre de modifier le SQL généré avant exécution | Moyenne |
| **Progression pipeline** | WebSockets ou SSE pour afficher l'avancement étape par étape | Haute |
| **Config DB par utilisateur** | Chaque user a sa propre config DB en base MySQL | Moyenne |
| **Artefacts isolés par user** | Dossiers `outputs/<user_id>/<analyse>/` | Moyenne |

### 17.2 Fonctionnalités nouvelles

| Amélioration | Description | Complexité |
|---|---|---|
| **Authentification multi-facteurs** | TOTP (Google Authenticator) pour les admins | Haute |
| **Partage d'analyse** | Lien public ou protégé pour partager un rapport | Haute |
| **Export Excel** | `.xlsx` en plus du CSV et PDF | Faible |
| **Favoris** | Sauvegarder des questions fréquentes pour relance | Faible |
| **Refresh auto KPIs** | Cron interne pour rafraîchir les KPIs à intervalles | Moyenne |
| **Alertes KPI** | Notification email/webhook si un KPI dépasse un seuil | Haute |
| **Conversation multi-tour** | Garder le contexte du résultat précédent dans le prompt SQL | Moyenne |
| **Mémoire métier** | Contexte global (glossaire, règles métier) injecté dans tous les prompts | Moyenne |
| **Sélecteur de type de graphique** | Choisir bar/line/pie avant génération | Faible |
| **Feedback LLM** | Pouce haut/bas sur chaque analyse pour améliorer les prompts | Faible |

### 17.3 Infrastructure

| Amélioration | Description | Complexité |
|---|---|---|
| **Certificat TLS Let's Encrypt** | Automatisation via Certbot en production | Faible |
| **Chiffrement runtime/** | Clés DB et LLM chiffrées au repos (AES-256) | Moyenne |
| **Blacklist JWT** | Table Redis ou MySQL pour révoquer les tokens | Moyenne |
| **Support SQL Server** | Adapter `db_utils.py` pour SQL Server (pyodbc) | Haute |
| **Support BigQuery** | Connecteur Google BigQuery | Haute |
| **Rate limiting** | Limiter les appels LLM par utilisateur (quotas) | Moyenne |

---

## 18. Commandes pour lancer le projet

### 18.1 Prérequis

```bash
# Vérifier Docker
docker --version        # ≥ 24.x
docker compose version  # ≥ 2.x
```

### 18.2 Configuration initiale

```bash
# 1. Cloner le projet
git clone <url-du-repo>
cd agentic-business-intelligence-main

# 2. Vérifier et personnaliser le .env (obligatoire avant premier démarrage)
# Modifier au minimum : JWT_SECRET, ADMIN_PASSWORD, AUTH_DB_PASSWORD, DB_PASSWORD
nano .env   # ou éditeur de votre choix
```

### 18.3 Démarrage

```bash
# Premier démarrage (build complet)
docker compose up -d --build

# Vérifier que tout fonctionne
docker compose ps

# Voir les logs de démarrage
docker compose logs backend --tail=30
docker compose logs frontend --tail=10
```

**Accès :**
```
Application  : https://localhost:3000
Adminer      : http://localhost:8080
Backend API  : http://localhost:8009
```

> Le navigateur affiche un avertissement "Non sécurisé" → certificat auto-signé → cliquer "Continuer quand même".

### 18.4 Commandes de gestion courantes

```bash
# Arrêter tous les services
docker compose down

# Arrêter et supprimer les volumes (reset complet — perd les utilisateurs)
docker compose down -v

# Rebuild d'un seul service (plus rapide)
docker compose build --no-cache backend  && docker compose up -d
docker compose build --no-cache frontend && docker compose up -d

# Rebuild forcé complet
docker compose build --no-cache && docker compose up -d

# Voir les logs en temps réel
docker compose logs -f backend
docker compose logs -f frontend

# Voir les 50 dernières lignes de logs
docker compose logs backend --tail=50

# Redémarrer un service sans rebuild
docker compose restart backend
```

### 18.5 Développement local (sans Docker)

```bash
# Backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

# Frontend (dans un second terminal)
cd frontend
npm install
npm run dev    # Vite sur http://localhost:5173

# Vérification TypeScript
cd frontend && npx tsc --noEmit

# Build de production frontend
cd frontend && npm run build
```

### 18.6 Adminer — accès à la base auth

URL : `http://localhost:8080`

```
Système    : MySQL
Serveur    : mysql-auth
Utilisateur : root
Mot de passe : askdata_root_secret  (AUTH_DB_ROOT_PASSWORD dans .env)
Base       : askdata_auth
```

### 18.7 Reset du localStorage navigateur (si blocage)

```javascript
// Ouvrir la console du navigateur (F12) et exécuter :
localStorage.clear()
// Puis recharger la page
location.reload()
```

---

*Document généré le 27 juin 2026 — AskData v1.1 — Session Handoff #2*
*Ce document décrit l'état du projet après deux sessions de développement intensif couvrant : pipeline BI 6 étapes, authentification JWT multi-utilisateurs, dashboard personnel MySQL, KPIs automatiques, Chat IA contextuel, export PDF, configuration LLM à deux niveaux, et déploiement Docker complet.*
