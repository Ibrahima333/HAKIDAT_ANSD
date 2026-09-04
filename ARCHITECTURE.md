# ARCHITECTURE.md — Description architecturale détaillée d'AskData

> Ce document décrit en profondeur chaque dossier, module, classe, API et interaction du projet AskData. Il est destiné à la rédaction d'un rapport académique et peut être lu sans accès au code source.

---

## Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Description des dossiers](#2-description-des-dossiers)
3. [Modules backend — détail complet](#3-modules-backend--détail-complet)
4. [Modules frontend — détail complet](#4-modules-frontend--détail-complet)
5. [Classes importantes](#5-classes-importantes)
6. [Description complète des API](#6-description-complète-des-api)
7. [Interactions frontend ↔ backend ↔ base de données](#7-interactions-frontend--backend--base-de-données)
8. [Flux de données détaillés](#8-flux-de-données-détaillés)
9. [Configuration et démarrage](#9-configuration-et-démarrage)

---

## 1. Vue d'ensemble de l'architecture

### 1.1 Paradigme architectural

AskData suit une architecture **3-tiers classique** étendue par un quatrième niveau — le modèle de langage :

```
Niveau 1 : Présentation   → React (SPA, TypeScript)
Niveau 2 : Application    → FastAPI (Python 3.12, REST)
Niveau 3 : Données        → MySQL (auth + données utilisateurs)
Niveau 4 : IA             → Gemini / Groq (LLM externe)
```

La communication entre niveaux est strictement unidirectionnelle et toujours initiée par le niveau supérieur :
- Le frontend appelle le backend via HTTP/HTTPS
- Le backend appelle la base de données via TCP
- Le backend appelle les LLM via HTTPS

### 1.2 Architecture physique (Docker Compose)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Hôte (machine de l'entreprise)                    │
│                                                                     │
│  Port 3000 ──────────────────────────────────────────────────────┐  │
│  Port 3080 (redirect HTTP→HTTPS) ────────────────────────────────┤  │
│                                                              ↕    │  │
│              ┌─────────────────────────────────────┐         │    │  │
│              │     SERVICE : frontend               │←────────┘    │  │
│              │  Image: nginx:alpine                 │              │  │
│              │  Nginx écoute sur :443 (TLS)         │              │  │
│              │  - Sert /usr/share/nginx/html (SPA)  │              │  │
│              │  - Proxy /api/* → backend:8000        │              │  │
│              └──────────────┬──────────────────────┘              │  │
│                             │ HTTP (réseau interne Docker)          │  │
│              ┌──────────────▼──────────────────────┐              │  │
│              │     SERVICE : backend                │              │  │
│              │  Image: python:3.12-slim             │              │  │
│              │  Uvicorn écoute sur :8000            │←── Port 8009 │  │
│              │  - FastAPI (routes REST)              │   (debug)   │  │
│              │  - Pipeline BI (6 étapes)             │              │  │
│              │  - Auth JWT                           │              │  │
│              └───────┬──────────────┬───────────────┘              │  │
│                      │              │                               │  │
│    ┌─────────────────▼──┐    ┌──────▼────────────────────────┐    │  │
│    │ SERVICE: mysql-auth │    │  Base métier (EXTERNE)         │    │  │
│    │ Image: mysql:8.0    │    │  MySQL/PostgreSQL               │    │  │
│    │ Port interne: 3306  │    │  host.docker.internal:3306     │    │  │
│    │ Volume: mysql_auth  │    │  (base de l'entreprise)        │    │  │
│    └────────────────────┘    └────────────────────────────────┘    │  │
│                                                                     │  │
│    ┌─────────────────────────────┐                                  │  │
│    │ SERVICE: adminer            │ ←──────────────── Port 8080     │  │
│    │ Image: adminer:latest       │                                  │  │
│    │ Interface web mysql-auth    │                                  │  │
│    └─────────────────────────────┘                                  │  │
│                                                                     │  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Réseau Docker

Tous les services partagent le réseau bridge `askdata-network`. Ce réseau permet :
- Au frontend (Nginx) d'appeler `http://backend:8000` par son nom de service
- Au backend d'appeler `mysql-auth:3306` par son nom de service
- À Adminer d'accéder à `mysql-auth:3306`

Le navigateur ne peut jamais accéder directement au backend — il passe obligatoirement par Nginx.

### 1.4 Volumes Docker

| Volume | Monté sur | Contenu | Survit au `down` |
|---|---|---|---|
| `mysql_auth_data` | `/var/lib/mysql` (mysql-auth) | Données utilisateurs, KPIs, dashboard | Oui (volume nommé) |
| `./requests` | `/app/requests` (backend) | Questions utilisateurs (.txt) | Oui (bind mount) |
| `./sql` | `/app/sql` (backend) | Requêtes SQL générées (.sql) | Oui |
| `./schema` | `/app/schema` (backend) | Schémas Markdown (.md) | Oui |
| `./dataviz` | `/app/dataviz` (backend) | Scripts Python Plotly (.py) | Oui |
| `./outputs` | `/app/outputs` (backend) | CSV, HTML, Markdown par analyse | Oui |
| `./runtime` | `/app/runtime` (backend) | Configs JSON (DB, LLM) | Oui |

---

## 2. Description des dossiers

### 2.1 Racine du projet

```
agentic-business-intelligence-main/
```

**Rôle :** racine du dépôt. Contient les fichiers de configuration globale et les points d'entrée Docker.

| Fichier | Rôle |
|---|---|
| `.env` | Variables d'environnement : credentials DB, JWT secret, admin initial, clés LLM |
| `docker-compose.yml` | Orchestration des 4 services Docker (réseau, volumes, dépendances, healthchecks) |
| `Dockerfile` | Image Docker du backend Python (python:3.12-slim + dépendances système) |
| `requirements.txt` | Dépendances Python (FastAPI, bcrypt, PyJWT, mysql-connector, pandas, plotly, etc.) |
| `README.md` | Documentation utilisateur (installation, usage, déploiement) |
| `CONTEXT.md` | Documentation académique complète du projet |
| `ARCHITECTURE.md` | Ce document — description architecturale |

---

### 2.2 `backend/`

```
backend/
```

**Rôle :** application Python FastAPI. Contient toute la logique métier, le pipeline BI, l'authentification et les accès aux données.

#### `backend/__init__.py`
Fichier vide marquant `backend` comme package Python. Permet les imports relatifs entre modules.

#### `backend/main.py`
**Point d'entrée de l'application FastAPI.** C'est le fichier chargé par Uvicorn au démarrage.

Responsabilités :
- Création de l'instance `FastAPI` avec titre et version
- Configuration du middleware CORS (`CORSMiddleware`) avec les origines autorisées
- Déclaration de l'événement `startup` (init DB, seeding admin, sync LLM config)
- Inclusion du router d'authentification (`auth_router`)
- Déclaration de toutes les routes HTTP (~30 endpoints)
- Injection des dépendances `get_current_user` et `require_admin` sur les routes protégées

Structure des imports critiques :
```python
from backend.auth.database   import init_db
from backend.auth.middleware  import get_current_user, require_admin
from backend.auth.router      import router as auth_router, seed_admin
from backend.repositories     import analyses, kpis, dashboard, llm_config
from backend.service          import run_pipeline, load_result, ...
```

#### `backend/service.py`
**Orchestrateur du pipeline BI.** Module le plus complexe du backend.

Responsabilités :
- `run_pipeline()` : coordonne les 6 étapes dans l'ordre, passe les artefacts d'une étape à l'autre
- `capture_step()` : exécute une étape et capture stdout/stderr dans une chaîne de caractères. En cas d'erreur, lève `PipelineServiceError` avec le contexte complet
- `build_question_name()` : génère un identifiant unique sans collision (slugification + suffixe numérique)
- `load_result()` : lit tous les artefacts disque d'une analyse et les assemble en dict JSON
- `list_available_results()` : scanne `outputs/` et retourne la liste des analyses disponibles
- `clear_history()` : supprime les fichiers disque de toutes les analyses
- `get_artifact_path()` : résout le chemin disque d'un artefact (sql, csv, chart, report)
- `default_cors_origins()` : construit dynamiquement la liste des origines CORS autorisées

Constantes :
```python
REQUESTS_DIR = Path("requests")   # questions .txt
SQL_DIR      = Path("sql")        # requêtes .sql
DATAVIZ_DIR  = Path("dataviz")    # scripts Python .py
OUTPUTS_DIR  = Path("outputs")    # CSV, HTML, MD, metadata
PROVIDERS    = ["gemini", "groq"] # providers LLM supportés
```

#### `backend/db_config.py`
**Singleton thread-safe de configuration DB.**

Gère la config de la base métier (MySQL ou PostgreSQL de l'entreprise). Priorité :
1. Fichier `runtime/db_config.json` (sauvegardé par le frontend)
2. Variables d'environnement (`DB_HOST`, `DB_PORT`, etc.)
3. Valeurs par défaut

La classe `DatabaseConfigManager` utilise un verrou `threading.Lock` pour garantir la cohérence en accès concurrent.

#### `backend/llm_config.py`
**Singleton thread-safe de configuration LLM.**

Même pattern que `db_config.py` pour les clés API LLM. Expose :
- `get_api_key("gemini")` / `get_api_key("groq")`
- `get_api_url("groq")` (URL base Groq configurable)
- `get_masked()` : retourne la config avec les clés masquées (`********`)
- `last_test()` / `record_test()` : historique du dernier test de connexion

---

### 2.3 `backend/auth/`

```
backend/auth/
```

**Rôle :** module d'authentification complet — connexion MySQL interne, hash passwords, JWT, middleware, routes, seeding.

#### `backend/auth/database.py`
**Gestionnaire de la base MySQL d'authentification.**

- Pool de connexions `MySQLConnectionPool` (5 connexions max) vers `mysql-auth`
- `init_db()` : crée les 5 tables avec `CREATE TABLE IF NOT EXISTS` et mécanisme de retry (10 tentatives × 3s)
- `get_connection()` : retourne une connexion depuis le pool
- Configuration lue depuis les variables d'environnement `AUTH_DB_*`

#### `backend/auth/service.py`
**Cryptographie et tokens.**

```python
hash_password(plain: str) → str
# Utilise bcrypt.hashpw avec gensalt() — salt unique par mot de passe

verify_password(plain: str, hashed: str) → bool
# Utilise bcrypt.checkpw — temps constant (résistant aux attaques temporelles)

create_token(user_id: int, email: str, role: str) → str
# Payload JWT : {sub: user_id, email, role, exp: now + expire_seconds}
# Signé avec HS256 et JWT_SECRET

decode_token(token: str) → dict
# Lève jwt.ExpiredSignatureError ou jwt.InvalidTokenError si invalide
```

#### `backend/auth/middleware.py`
**Dépendances FastAPI injectables.**

```python
get_current_user(credentials: HTTPAuthorizationCredentials) → dict
# 1. Extrait le token Bearer du header Authorization
# 2. Appelle decode_token()
# 3. Retourne le payload {sub, email, role}
# 4. Lève HTTP 401 si absent, expiré ou invalide

require_admin(current_user: dict) → dict
# Appelle get_current_user() puis vérifie role == "admin"
# Lève HTTP 403 si l'utilisateur n'est pas admin
```

Ces fonctions s'utilisent comme paramètres de route FastAPI :
```python
@app.get("/route-protegee")
def route(current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
```

#### `backend/auth/router.py`
**Toutes les routes `/api/auth/*`.**

Routes exposées :
- `POST /api/auth/login` : vérifie credentials → JWT
- `GET /api/auth/me` : profil connecté
- `GET /api/auth/users` : liste (admin)
- `POST /api/auth/users` : créer utilisateur (admin)
- `PATCH /api/auth/users/{id}` : modifier rôle/statut (admin)
- `DELETE /api/auth/users/{id}` : supprimer (admin)
- `seed_admin()` : fonction (pas une route) appelée au startup

---

### 2.4 `backend/llm/`

```
backend/llm/
```

**Rôle :** abstraction des providers LLM. Implémente le patron de conception **Strategy** — chaque provider est interchangeable derrière une interface commune.

#### `backend/llm/base.py`
**Contrat d'interface (classes abstraites et dataclasses).**

```
GenerationResult (dataclass)
├── text: str              — texte généré
├── provider_name: str     — provider utilisé
├── requested_provider: str
└── warnings: list[str]

LLMProvider (ABC)
└── generate(prompt: str) → GenerationResult  [abstractmethod]

LLMProviderError (RuntimeError)
```

#### `backend/llm/gemini.py`
**Implémentation Google Gemini.**

Utilise le SDK officiel `google-generativeai`. Modèle : `gemini-2.0-flash`. La clé API est lue depuis `LLMConfigManager` à chaque appel (permet la mise à jour sans redémarrage).

```python
class GeminiProvider(LLMProvider):
    name = "gemini"
    def generate(self, prompt: str) → GenerationResult:
        api_key = LLMConfigManager.instance().get_api_key("gemini")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        return GenerationResult(text=response.text, provider_name="gemini")
```

#### `backend/llm/groq.py`
**Implémentation Groq (interface OpenAI-compatible).**

Utilise `urllib` natif (sans bibliothèque HTTP externe) pour appeler l'API Groq. Format de requête identique à l'API OpenAI (`/chat/completions`). Température basse (0.2) pour des réponses déterministes.

Particularité : nécessite un header `User-Agent` pour contourner la protection Cloudflare de Groq.

```python
payload = {
    "model": "openai/gpt-oss-120b",
    "messages": [{"role": "user", "content": prompt}],
    "temperature": 0.2,
}
headers = {
    "Authorization": f"Bearer {api_key}",
    "User-Agent": "Mozilla/5.0 (compatible; AgenticBI/1.0)",
}
```

#### `backend/llm/factory.py`
**Fabrique de providers (patron Factory).**

```python
get_provider(provider_name: str) → LLMProvider
# "gemini" → GeminiProvider()
# "groq"   → GroqProvider()
# autre/None → GeminiProvider() (défaut)

generate_with_fallback(prompt, provider_name) → GenerationResult
# Alias de get_provider().generate() sans fallback silencieux
# Si le provider échoue → LLMProviderError propagée directement
```

---

### 2.5 `backend/repositories/`

```
backend/repositories/
```

**Rôle :** couche d'accès aux données MySQL auth. Implémente le patron **Repository** — isole toute interaction SQL derrière des fonctions Python typées.

Chaque repository :
1. Ouvre une connexion depuis le pool (`get_connection()`)
2. Exécute la requête SQL
3. **Convertit les clés snake_case MySQL en camelCase** pour le frontend
4. Ferme la connexion systématiquement

#### `backend/repositories/analyses.py`

```python
save_analysis(user_id: int, data: dict) → None
# INSERT avec ON DUPLICATE KEY UPDATE (upsert par question_name + user_id)
# Champs : question_name, question_text, database_name, schema_name, provider_name, rows_returned

list_analyses(user_id: int) → list[dict]
# SELECT ORDER BY created_at DESC WHERE user_id = ?
# Retourne : questionName, questionText, databaseName, schemaName, providerName, created_at

delete_analyses(user_id: int) → None
# DELETE WHERE user_id = ?
```

#### `backend/repositories/kpis.py`

```python
get_kpis(user_id: int) → list[dict]
# SELECT * WHERE user_id = ? ORDER BY pinned_at DESC
# Conversion : question_name→questionName, raw_value→rawValue, etc.

upsert_kpi(user_id: int, kpi: dict) → None
# INSERT ... ON DUPLICATE KEY UPDATE value, raw_value, previous_value, last_updated
# L'ID composite (analyseName__column__metric) garantit l'unicité

delete_kpi(user_id: int, kpi_id: str) → None
# DELETE WHERE id = ? AND user_id = ? (vérification double pour sécurité)

clear_kpis(user_id: int) → None
# DELETE WHERE user_id = ?
```

#### `backend/repositories/dashboard.py`

```python
get_dashboard(user_id: int) → list[dict]
# SELECT * WHERE user_id = ? ORDER BY pinned_at DESC
# Conversion : question_name→questionName, chart_url→chartUrl, pinned_at→pinnedAt

upsert_chart(user_id: int, item: dict) → None
# INSERT ... ON DUPLICATE KEY UPDATE chart_url, pinned_at

delete_chart(user_id: int, chart_id: str) → None
clear_dashboard(user_id: int) → None
```

#### `backend/repositories/llm_config.py`

```python
get_llm_config() → dict
# SELECT gemini_api_key, groq_api_key, groq_api_url LIMIT 1
# Retourne {} si aucune config en base

save_llm_config(gemini_api_key, groq_api_key, groq_api_url) → None
# Si aucune ligne : INSERT ; sinon : UPDATE
# Garantit qu'il n'y a qu'une seule ligne (config globale)

get_available_providers() → list[str]
# Retourne ["gemini", "groq"] selon les clés présentes
# Utilisé par le frontend pour le sélecteur de provider (users non-admin)
```

---

### 2.6 `backend/scripts/`

```
backend/scripts/
```

**Rôle :** scripts du pipeline BI. Chaque script est appelé par `service.py` et peut aussi être exécuté en ligne de commande.

#### `backend/scripts/schema.py`
**Étape 1 du pipeline : génération du schéma Markdown.**

Interroge `information_schema.columns` et produit un fichier Markdown lisible par le LLM :
```markdown
## Table : commandes
- id (int) PK
- client_id (int) FK
- date_commande (datetime)
- montant_total (decimal)
```

Le schéma est stocké dans `schema/<base>__<schema>_schema.md`. Ce fichier est la "carte" de la base que le LLM utilisera pour toutes les étapes suivantes.

#### `backend/scripts/generate_sql.py`
**Étape 2 du pipeline : génération SQL via LLM.**

Processus :
1. Lit la question depuis `requests/<nom>.txt`
2. Charge le schéma depuis `schema/<base>__<schema>_schema.md`
3. Remplace les variables dans `prompt_template.txt` :
   - `{{SQL_DIALECT}}` → "MySQL" ou "PostgreSQL"
   - `{{SCHEMA}}` → contenu du schéma
   - `{{QUESTION}}` → question de l'utilisateur
   - `{{SQL_PATH}}` → chemin du fichier SQL à générer
4. Appelle `generate_with_fallback(prompt, provider_name)`
5. Nettoie le SQL généré (`_clean_sql()`) : supprime les balises markdown ` ```sql ... ``` `
6. Écrit le SQL dans `sql/<nom>.sql`

#### `backend/scripts/prompt_template.txt`
**Prompt maître pour la génération SQL.**

Structure :
```
RÔLE      : expert data senior SQL et BI
CONTEXTE  : analystes non techniques
OBJECTIF  : requête SQL exacte répondant à la question
ENTRÉES   : schéma de la base + question métier
RÈGLES    : dialecte strict, alias métier, commentaires --, pas de SELECT *
SORTIE    : UNIQUEMENT du SQL, aucune explication
```

Le prompt est délibérément strict et sans ambiguïté pour minimiser les hallucinations.

#### `backend/scripts/run_analysis.py`
**Étape 3 du pipeline : exécution SQL.**

1. Lit le SQL depuis `sql/<nom>.sql`
2. Appelle `run_query(sql, database_name)` dans `db_utils.py`
3. Convertit les résultats en DataFrame pandas
4. Exporte en CSV : `outputs/<nom>/<nom>.csv`
5. Sauvegarde les métadonnées en JSON : `outputs/<nom>/metadata.json`

Métadonnées sauvegardées :
```json
{
  "question": "...",
  "rows_returned": 42,
  "columns": [{"name": "client_id", "type": "int"}, ...],
  "database": "boutique_test",
  "schema": "boutique_test",
  "execution_time_ms": 127,
  "query_hash": "abc123..."
}
```

#### `backend/scripts/generate_dataviz.py`
**Étape 4 du pipeline : génération du script Plotly.**

Le LLM reçoit un prompt (`prompt_template_dataviz.txt`) contenant :
- La question originale
- Les premières lignes du CSV
- Les noms et types de colonnes

Il génère un script Python Plotly qui :
- Lit le CSV
- Choisit le type de graphique adapté (bar, line, scatter, pie, etc.)
- Configure les axes, couleurs, titre
- Exporte en HTML

#### `backend/scripts/run_dataviz.py`
**Étape 5 du pipeline : exécution du script Plotly.**

Exécute le script Python généré dans un sous-processus contrôlé. Le graphique HTML résultant est stocké dans `outputs/<nom>/<nom>.html`.

#### `backend/scripts/generate_insights_actions.py`
**Étape 6 du pipeline : génération des insights.**

Le LLM reçoit le CSV (données) + la question + les métadonnées et produit un rapport Markdown structuré :
- Résumé des résultats
- Insights clés (patterns, anomalies, tendances)
- Recommandations business actionnables

#### `backend/scripts/chat_analyst.py`
**Module du Chat IA conversationnel.**

```python
load_schema_markdown(database: str, schema: str) → str
# Priorité 1 : fichier schema/<base>__<schema>_schema.md (si pipeline déjà lancé)
# Priorité 2 : génération dynamique depuis information_schema.columns
# Retourne "" si aucune info disponible

build_system_prompt(database, schema, schema_markdown) → str
# Construit le prompt système avec :
# - Identité : "Tu es un data analyst senior expert de <base>"
# - Contexte DB : nom de la base et du schéma
# - Schéma complet des tables/colonnes
# - Règles absolues (citer les vraies tables, jamais de SQL, toujours en français)

build_messages(system_prompt, history, user_message) → list[dict]
# Format OpenAI/Groq : [{role: "system", content: ...}, {role: "user"/"assistant", ...}]
# Limite l'historique aux 20 derniers messages pour éviter le dépassement de contexte
```

---

### 2.7 `backend/utils/`

```
backend/utils/
```

**Rôle :** utilitaires bas niveau pour la connexion et l'introspection des bases de données.

#### `backend/utils/db_utils.py`
**Couche d'abstraction SQL (MySQL + PostgreSQL).**

```python
_db_type() → str
# Retourne "mysql" ou "postgresql" depuis DatabaseConfigManager ou $DB_TYPE

get_connection(database_name: str) → connexion
# MySQL  : mysql.connector.connect(host, port, database, user, password)
# PostgreSQL : psycopg2.connect(host, port, dbname, user, password)
# La connexion est ouverte à chaque appel et fermée après usage

run_query(sql, database_name, params=None) → (columns, rows)
# 1. get_connection(database_name)
# 2. cursor.execute(sql, params)
# 3. cursor.description → noms des colonnes
# 4. cursor.fetchall() → liste de tuples
# 5. conn.close() dans tous les cas (try/finally)
```

#### `backend/utils/db_discovery.py`
**Découverte automatique des bases et schémas.**

```python
list_databases() → list[str]
# MySQL    : SHOW DATABASES (exclut les bases système)
# PostgreSQL : pg_catalog.pg_database (exclut template*)

list_schemas(database_name: str) → list[str]
# MySQL    : schémas = bases (pas de schémas imbriqués)
# PostgreSQL : information_schema.schemata (exclut pg_catalog, information_schema)
```

#### `backend/utils/schema_discovery.py`
**Introspection des colonnes par table.**

Interroge `information_schema.columns` pour obtenir le type, la nullabilité et la contrainte (PK/FK) de chaque colonne. Utilisé par `schema.py` pour générer le fichier Markdown et par `/api/schema/explore`.

---

### 2.8 `frontend/`

```
frontend/
```

**Rôle :** application React (Single Page Application). Compile en fichiers statiques HTML/CSS/JS servis par Nginx.

#### `frontend/Dockerfile`
**Build multi-stage.**

Stage 1 (Node.js builder) :
1. `npm ci` — installation des dépendances depuis `package-lock.json` (reproductible)
2. `VITE_API_BASE_URL="" npm run build` — compilation TypeScript + bundling Vite
3. Résultat dans `/app/frontend/dist`

Stage 2 (Nginx:alpine) :
1. Copie `dist/` dans `/usr/share/nginx/html`
2. `openssl req` — génère un certificat TLS auto-signé RSA-2048 (valable 10 ans)
3. Configure Nginx : HTTPS sur 443, proxy `/api/*` → `http://backend:8000`, redirect 80→443

Sécurités Nginx configurées :
- `ssl_protocols TLSv1.2 TLSv1.3` (SSLv3 et TLS 1.0/1.1 désactivés)
- `ssl_ciphers HIGH:!aNULL:!MD5` (chiffrements faibles exclus)
- `add_header Strict-Transport-Security "max-age=31536000"` (HSTS)
- `add_header X-Frame-Options SAMEORIGIN` (protection clickjacking)
- `add_header X-Content-Type-Options nosniff` (protection MIME sniffing)

#### `frontend/vite.config.ts`
**Configuration du bundler.**

En développement local (`npm run dev`) :
- Proxy `/api/*` → `http://127.0.0.1:8000` (Vite dev server)

En production (Docker) :
- `VITE_API_BASE_URL=""` → URLs relatives `/api/...`
- Nginx intercepte et proxifie vers le backend

---

### 2.9 `frontend/src/`

```
frontend/src/
```

**Rôle :** code source React de l'application.

#### `frontend/src/types.ts`
**Contrats TypeScript — source de vérité des structures de données.**

Interfaces principales :
```typescript
PipelineResultSummary   // Résumé d'une analyse (historique)
PipelineResult          // Résultat complet (SQL, CSV, HTML, Markdown, metadata)
ArtifactUrls            // URLs des artefacts (sql, csv, chart, report, logs)
DashboardItem           // Graphique épinglé (chartUrl, questionName, pinnedAt)
KpiItem                 // KPI épinglé (valeur, rawValue, previousValue, delta)
AppState                // État global React (bases, schemas, provider, historique, résultat actif)
```

---

### 2.10 `frontend/src/components/`

```
frontend/src/components/
```

**Rôle :** composants React réutilisables. Chacun a une responsabilité unique.

---

### 2.11 `frontend/src/lib/`

```
frontend/src/lib/
```

**Rôle :** bibliothèques utilitaires non-UI (accès API, auth, export, formatage).

---

## 3. Modules backend — détail complet

### 3.1 Cycle de vie au démarrage

```python
@app.on_event("startup")
def on_startup():
    # 1. init_db() : init MySQL auth avec retries
    # 2. seed_admin() : créer admin depuis .env si aucun admin
    # 3. Sync LLM config MySQL → runtime/llm_config.json
```

Ordre d'exécution détaillé :
1. Docker démarre `mysql-auth` → healthcheck toutes les 10s
2. Docker démarre `backend` quand mysql-auth est `healthy`
3. Uvicorn charge `backend/main.py`
4. FastAPI instancie l'application
5. L'événement `startup` s'exécute :
   - `init_db()` : se connecte au pool, crée les 5 tables
   - `seed_admin()` : lit `ADMIN_EMAIL` et `ADMIN_PASSWORD`, hash le password, INSERT si 0 admins
   - Sync LLM : lit `llm_config` MySQL, écrit dans `runtime/llm_config.json`

### 3.2 Traitement d'une requête HTTP typique

```
Requête HTTP → Nginx (TLS terminé)
    → Uvicorn (ASGI)
        → FastAPI Router (sélection de route)
            → Dépendances (get_current_user si protégée)
                → Vérification JWT (decode_token)
                → Extraction user_id et role
            → Fonction de route (handler)
                → Logique métier / accès données
            → Sérialisation JSON
        → Réponse HTTP
```

### 3.3 Gestion des erreurs

| Situation | Code HTTP | Levée par |
|---|---|---|
| Token absent | 401 | `get_current_user` |
| Token expiré | 401 | `get_current_user` |
| Token invalide | 401 | `get_current_user` |
| Rôle insuffisant | 403 | `require_admin` |
| Ressource introuvable | 404 | `PipelineServiceError` |
| Données invalides | 400 | Handlers explicites |
| Erreur pipeline | 400 | `PipelineServiceError` |
| Erreur serveur | 500 | Exception non capturée |

---

## 4. Modules frontend — détail complet

### 4.1 Composants — hiérarchie et responsabilités

```
App.tsx                              # Composant racine
├── Login.tsx                        # Affiché si non authentifié
└── [Authenticated]
    ├── Sidebar.tsx                  # Panneau gauche (config + historique)
    │   ├── DatabaseConfig.tsx       # Formulaire connexion DB
    │   ├── LLMModelConfig.tsx       # Config LLM (admin: clés / user: toggle)
    │   └── SchemaExplorer.tsx       # Explorateur tables/colonnes
    └── main (zone droite)
        ├── [nav] Onglets (Analyse / Chat IA / Dashboard / Admin)
        ├── [Analyse] ChatArea.tsx   # Affichage résultat actif
        │   └── ResultTabs.tsx       # Onglets Results/SQL/Chart/KPIs/Report
        ├── [Chat IA] QuickChat.tsx  # Interface conversationnelle
        ├── [Dashboard] Dashboard.tsx # KPIs + graphiques épinglés
        │   └── KpiCard.tsx          # Carte KPI individuelle
        └── [Admin] AdminPanel.tsx   # Gestion utilisateurs
```

### 4.2 Composants — description détaillée

#### `App.tsx` — Composant racine

**État géré :**
- `authed: boolean` — si l'utilisateur est authentifié (depuis isAuthenticated())
- `currentUser: AuthUser | null` — email, rôle de l'utilisateur connecté
- `view: "chat" | "quickchat" | "dashboard" | "admin"` — vue active
- `state: AppState` — état global complet (bases, historique, résultat actif, etc.)

**Effets (`useEffect`) :**
- Au montage : écoute l'événement `auth:logout` (déclenché sur 401 par `apiFetch`)
- Sur `authed=true` : bootstrap (fetchConfig + fetchHistory en parallèle)
- Sur `state.selectedDatabase` : rechargement des schémas disponibles
- Sur `state.activeResultId` : chargement du résultat complet depuis l'API

**Handlers :**
- `handleLogout()` : clearAuth() + setAuthed(false) + setCurrentUser(null)
- `handleClearHistory()` : DELETE /api/history + réinitialisation état local
- `refreshConfiguration()` : recharge config et historique

#### `Sidebar.tsx` — Barre latérale

**Rôle :** interface de configuration de l'environnement d'analyse.

Sections :
1. **Logo + titre AskData** (SVG inline)
2. **Config** : `DatabaseConfig` + `LLMModelConfig` + bouton Refresh
3. **Cible** (visible si DB connectée) :
   - Sélecteur de base de données (`GET /api/config`)
   - Sélecteur de schéma (rechargé à chaque changement de base)
   - `SchemaExplorer` (chargé depuis `/api/schema/explore`)
   - Toggle "Écraser les résultats existants"
4. **Historique** :
   - Bouton "Effacer" (avec confirmation)
   - Liste des analyses triées par date (vraie question, pas le slug)

Comportement clé : changer de base ou de schéma remet `activeResultId` et `activeResult` à `null` → affichage de l'écran d'accueil.

#### `ChatArea.tsx` — Zone principale

**Rôle :** affichage du résultat actif et écran d'accueil.

États gérés :
- `state.isBootstrapping = true` → spinner de chargement
- `state.activeResultId && !activeResult` → "Chargement du résultat…"
- `!activeResult` → écran d'accueil guidé (3 étapes)
- `activeResult` → badge "Analyse sur X via Y" + `ResultTabs`

L'écran d'accueil varie selon la progression :
- DB non connectée → "Connectez votre base de données"
- DB connectée, LLM non configuré → "Configurez votre modèle LLM"
- Tout configuré → "Posez une question"

#### `PipelineInput.tsx` — Champ de saisie

**Rôle :** zone de saisie de question + soumission du pipeline.

Fonctionnalités :
- Textarea avec placeholder contextuel (nom de la base active)
- Raccourci clavier `⌘+Entrée` / `Ctrl+Entrée`
- Injecte le texte depuis `state.insertText` (clic sur colonne dans SchemaExplorer)
- Affiche le spinner pendant l'exécution du pipeline
- Gère les erreurs inline (toast rouge)
- Badge affichant base/schéma active

Au submit :
```typescript
const result = await runPipeline({
  questionText: question,
  artifactName: "",
  databaseName: state.selectedDatabase,
  schemaName: state.selectedSchema,
  providerName: state.selectedProvider,
  overwriteExisting: state.overwriteExisting,
});
// Met à jour history, activeResultId, activeResult dans le state
```

#### `ResultTabs.tsx` — Onglets du résultat

**Rôle :** affichage multi-onglets du résultat d'une analyse.

Type TabType : `"results" | "sql" | "chart" | "kpis" | "report"`

États locaux :
- `activeTab` : onglet actif
- `pinned` : graphique épinglé au dashboard
- `pinnedKpis` : map `{column__metric → boolean}` pour les KPIs épinglés
- `chatExportCount` : nombre de messages Chat sélectionnés

Logique KPI :
```typescript
function computeKpiMetrics(rows) {
  // Pour chaque colonne dont Number(val) est valide :
  // calcule total, avg, min, max sur toutes les lignes
}
```

#### `Dashboard.tsx` — Tableau de bord

**Rôle :** affichage des graphiques et KPIs épinglés par l'utilisateur.

Chargement :
```typescript
useEffect(() => {
  fetchUserDashboard().then(d => setItems(d.dashboard));
  fetchUserKpis().then(d => setKpis(d.kpis));
}, []);
```

Organisation visuelle :
1. Section KPIs : grille 4 colonnes de `KpiCard`
2. Section Graphiques : grille 12 colonnes avec items demi/pleine largeur
3. Drag & drop : réorganisation des graphiques par glisser-déposer

#### `KpiCard.tsx` — Carte KPI

**Rôle :** affichage d'un KPI épinglé avec refresh et delta.

Fonctionnalités :
- Affichage valeur formatée (fr-FR : "142 500")
- Delta % coloré (vert si positive, rouge si négative)
- Bouton Rafraîchir → `POST /api/kpi/refresh/{questionName}` → rejoue le SQL
- Mise à jour via `pinUserKpi()` avec nouvelles valeurs
- Bouton Supprimer → `DELETE /api/user/kpis/{id}`
- Horodatage du dernier refresh

#### `LLMModelConfig.tsx` — Configuration LLM

**Rôle :** interface de configuration LLM différente selon le rôle.

**Vue Admin :**
- Sélecteur Gemini/Groq
- Champ mot de passe pour la clé API
- Si clé déjà configurée : badge vert "Clé configurée" + bouton "Modifier"
- Bouton "Tester & Enregistrer" → test API + save en MySQL

**Vue User :**
- Sélecteur Gemini/Groq uniquement (providers disponibles depuis `/api/llm-config`)
- Icône 🔒 + message "Configuré par l'administrateur"

**Chargement au montage :**
```typescript
const cfg = await fetchLlmConfig();
if (isAdmin) {
  // Détecte si clé présente (valeur masquée "****")
  setGeminiConfigured(Boolean(cfg.config?.gemini_api_key));
} else {
  setAvailableProviders(cfg.availableProviders ?? []);
}
```

#### `QuickChat.tsx` — Chat IA

**Rôle :** interface conversationnelle avec le data analyst IA.

Gestion de l'historique local :
```typescript
const history = messages.map(m => ({ role: m.role, content: m.content }));
const data = await apiFetch("/api/chat/message", {
  method: "POST",
  body: JSON.stringify({ message: trimmed, database, schema, provider, history }),
});
```

Fonctionnalités supplémentaires :
- Bouton "Ajouter au rapport" au survol de chaque message
- Bandeau de sélection avec compteur
- `toggleChatMessage()` dans `chatExport.ts` → localStorage

#### `AdminPanel.tsx` — Panneau d'administration

**Rôle :** gestion des comptes utilisateurs (visible admin uniquement).

Opérations :
- `GET /api/auth/users` → liste avec rôle, statut, date de création
- `POST /api/auth/users` → formulaire inline (email + password + rôle)
- `PATCH /api/auth/users/{id}` → toggle actif/désactivé
- `DELETE /api/auth/users/{id}` → avec confirmation `window.confirm()`

#### `SchemaExplorer.tsx` — Explorateur de schéma

**Rôle :** navigation dans les tables et colonnes de la base active.

Comportement :
- Charge depuis `GET /api/schema/explore?database=X&schema=Y`
- Liste dépliable par table (chevron)
- Clic sur table/colonne → insère le nom dans le champ de question
- Icônes PK (clé jaune) et FK (lien) sur les colonnes

### 4.3 Bibliothèques `lib/`

#### `lib/api.ts` — Client HTTP

**Fonction centrale `apiFetch<T>(path, init)`:**
1. Lit le token depuis `getToken()`
2. Ajoute `Authorization: Bearer <token>` dans les headers
3. Appelle `fetch(buildUrl(path), mergedInit)`
4. Si 401 : `clearAuth()` + `window.dispatchEvent(new Event("auth:logout"))`
5. Si autre erreur : parse le JSON `{detail: "..."}` et lève `Error(message)`
6. Retourne `response.json()`

Toutes les fonctions API exportées :
- `fetchConfig()`, `fetchHistory()`, `fetchResult()`
- `runPipeline()`, `clearHistory()`
- `fetchDbConfig()`, `testDbConfig()`, `saveDbConfig()`, `connectDbConfig()`
- `fetchLlmConfig()`, `testLlmConfig()`, `saveLlmConfig()`
- `fetchUserKpis()`, `pinUserKpi()`, `unpinUserKpi()`
- `fetchUserDashboard()`, `pinUserChart()`, `unpinUserChart()`
- `refreshKpi()`, `apiFetch()` (export direct)

#### `lib/auth.ts` — Gestion JWT client

```typescript
const TOKEN_KEY = "askdata_token";
const USER_KEY  = "askdata_user";

saveAuth(token, user)    // localStorage.setItem × 2
getToken()               // localStorage.getItem(TOKEN_KEY)
getUser() → AuthUser     // JSON.parse(localStorage.getItem(USER_KEY))
clearAuth()              // localStorage.removeItem × 2

isAuthenticated() → bool
// 1. Récupère le token
// 2. Décode le payload (base64 → JSON)
// 3. Vérifie exp * 1000 > Date.now()
// → Pas de requête réseau, 100% local
```

#### `lib/exportPdf.ts` — Génération PDF

Processus complet :
1. `captureChart(chartHtml)` : iframe cachée → Plotly.toImage() → base64 PNG
2. `fetchUserKpis()` : récupère les KPIs du dashboard en base MySQL
3. `getChatExport()` : récupère les messages Chat sélectionnés (localStorage)
4. `renderKpis(kpis)` : génère HTML des cartes KPI
5. `renderChatMessages(messages)` : génère HTML des bulles de conversation
6. Assemblage HTML complet avec CSS inline
7. `new Blob([html], {type: "text/html"})` → `URL.createObjectURL(blob)`
8. `window.open(url, "_blank")` → nouvelle fenêtre
9. Écoute `afterprint` → `URL.revokeObjectURL(url)` (nettoyage mémoire)

#### `lib/kpi.ts` — Utilitaires KPI

```typescript
formatKpiValue(raw: unknown) → { formatted: string, numeric: number | null }
// Utilise Intl.NumberFormat("fr-FR") : 142500 → "142 500"
// Si NaN → retourne la valeur sous forme de string

computeDelta(current, previous) → number | null
// ((current - previous) / |previous|) × 100
// Retourne null si previous = 0 ou null
```

#### `lib/chatExport.ts` — Sélection Chat → PDF

Stockage dans `localStorage["askdata_chat_export"]` :
```typescript
toggleChatMessage(msg)      // Ajoute ou supprime un message
getChatExport() → messages  // Liste des messages sélectionnés
isChatMessageSelected(id)   // Boolean
clearChatExport()           // Vide la sélection (appelé après export PDF)
getChatExportCount()        // Nombre de messages sélectionnés
```

---

## 5. Classes importantes

### 5.1 Diagramme UML simplifié

```
┌────────────────────────────────────────────────────────────────────┐
│                         BACKEND CLASSES                            │
│                                                                    │
│  LLMProvider (ABC)                                                 │
│  ├── name: str                                                     │
│  └── generate(prompt: str) → GenerationResult  [abstract]         │
│       │                                                            │
│       ├── GeminiProvider  (name="gemini")                          │
│       │   └── Utilise google-generativeai SDK                      │
│       └── GroqProvider    (name="groq")                            │
│           └── Utilise urllib HTTP (OpenAI-compatible)              │
│                                                                    │
│  GenerationResult (dataclass)                                      │
│  ├── text: str                                                     │
│  ├── provider_name: str                                            │
│  └── warnings: list[str]                                           │
│                                                                    │
│  LLMConfig (dataclass)                                             │
│  ├── gemini_api_key: str                                           │
│  ├── groq_api_key: str                                             │
│  ├── groq_api_url: str                                             │
│  └── masked() → dict                                               │
│                                                                    │
│  LLMConfigManager (Singleton, thread-safe)                         │
│  ├── _instance: LLMConfigManager                                   │
│  ├── _lock: threading.Lock                                         │
│  ├── instance() → LLMConfigManager  [classmethod]                  │
│  ├── get() → LLMConfig                                             │
│  ├── get_masked() → dict                                           │
│  ├── get_api_key(provider) → str                                   │
│  └── update(payload, persist) → LLMConfig                          │
│                                                                    │
│  DatabaseConfig (dataclass)                                        │
│  ├── db_type: str  ("postgresql" | "mysql")                        │
│  ├── host, port, user, password, database, schema                  │
│  └── masked() → dict                                               │
│                                                                    │
│  DatabaseConfigManager (Singleton, thread-safe)                    │
│  └── [même pattern que LLMConfigManager]                           │
│                                                                    │
│  PipelineServiceError (RuntimeError)                               │
│  └── Levée par service.py quand une étape du pipeline échoue       │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 Description détaillée des classes

#### `LLMProvider` (ABC)
Classe abstraite définissant le contrat de tout provider LLM.

```python
class LLMProvider(ABC):
    name = "base"

    @abstractmethod
    def generate(self, prompt: str) -> GenerationResult:
        ...
```

Avantage : `service.py` et `chat_analyst.py` appellent `provider.generate(prompt)` sans connaître l'implémentation concrète. L'ajout d'un nouveau provider (ex: OpenAI, Anthropic) nécessite uniquement une nouvelle sous-classe.

#### `GeminiProvider`
```python
class GeminiProvider(LLMProvider):
    name = "gemini"

    def generate(self, prompt):
        api_key = LLMConfigManager.instance().get_api_key("gemini")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        return GenerationResult(text=response.text, provider_name="gemini")
```

Spécificité : reconfigure le SDK à chaque appel pour prendre en compte les changements de clé API sans redémarrage.

#### `GroqProvider`
```python
class GroqProvider(LLMProvider):
    name = "groq"

    def generate(self, prompt):
        payload = {
            "model": "openai/gpt-oss-120b",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        }
        # urllib.request avec timeout 120s
        # Header User-Agent obligatoire (Cloudflare protection)
```

Spécificité : utilise `urllib` natif (pas de dépendance `httpx`/`requests`). URL configurable pour les déploiements avec proxy.

#### `LLMConfigManager` (Singleton)
```python
class LLMConfigManager:
    _instance: LLMConfigManager = None
    _lock: threading.Lock = threading.Lock()

    @classmethod
    def instance(cls) -> LLMConfigManager:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
```

Pattern **Double-Checked Locking** pour la thread-safety en Python. Garantit qu'une seule instance existe même sous charge concurrente (plusieurs requêtes FastAPI simultanées).

#### `DatabaseConfig` (dataclass)
```python
@dataclass
class DatabaseConfig:
    db_type:  str = "postgresql"
    host:     str = "localhost"
    port:     int = 5432
    user:     str = "postgres"
    password: str = ""
    database: str = ""
    schema:   str = "public"
    extra:    dict = field(default_factory=dict)

    def masked(self) -> dict:
        data = asdict(self)
        if data.get("password"):
            data["password"] = "********"
        return data
```

La méthode `masked()` garantit que le mot de passe n'est jamais exposé dans les réponses API.

#### `PipelineServiceError`
```python
class PipelineServiceError(RuntimeError):
    """Levée quand le pipeline ne peut pas terminer une étape."""
```

Utilisée par `service.py` pour distinguer les erreurs métier (mauvais SQL, LLM qui échoue) des erreurs système (500). Capturée dans `main.py` et transformée en `HTTP 400`.

---

## 6. Description complète des API

### 6.1 Conventions

**Base URL :** `https://localhost:3000/api/` (via Nginx proxy)

**Headers obligatoires (routes protégées) :**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json
```

**Format d'erreur :**
```json
{"detail": "Message d'erreur lisible"}
```

**Codes de réponse utilisés :**
- `200 OK` — succès
- `204 No Content` — succès sans corps de réponse
- `400 Bad Request` — données invalides ou erreur pipeline
- `401 Unauthorized` — token absent, expiré ou invalide
- `403 Forbidden` — rôle insuffisant (admin requis)
- `404 Not Found` — ressource introuvable
- `409 Conflict` — email déjà utilisé
- `500 Internal Server Error` — erreur non capturée

---

### 6.2 Routes d'authentification

#### `POST /api/auth/login`
```
Auth requise : Non
Body :
{
  "email": "alice@company.com",
  "password": "Admin1234!"
}

Réponse 200 :
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "email": "alice@company.com",
    "role": "admin"
  }
}

Erreurs :
- 400 : email ou password manquant
- 401 : credentials incorrects ou compte désactivé
```

Traitement :
1. Recherche `WHERE email = ? AND is_active = 1`
2. `bcrypt.checkpw(password, user.password_hash)`
3. `jwt.encode({sub, email, role, exp}, JWT_SECRET, HS256)`

#### `GET /api/auth/me`
```
Auth requise : user
Réponse 200 :
{
  "id": 2,
  "email": "bob@company.com",
  "role": "user"
}
```

#### `GET /api/auth/users`
```
Auth requise : admin
Réponse 200 :
{
  "users": [
    {
      "id": 1,
      "email": "alice@company.com",
      "role": "admin",
      "is_active": 1,
      "created_at": "2026-06-27 10:00:00"
    },
    ...
  ]
}
```

#### `POST /api/auth/users`
```
Auth requise : admin
Body :
{
  "email": "carol@company.com",
  "password": "password123",
  "role": "user"
}

Réponse 200 :
{
  "id": 3,
  "email": "carol@company.com",
  "role": "user",
  "is_active": true
}

Erreurs :
- 400 : email ou password manquant, password < 6 chars, role invalide
- 409 : email déjà utilisé
```

#### `PATCH /api/auth/users/{id}`
```
Auth requise : admin
Body (champs modifiables) :
{
  "is_active": 0,   // désactiver
  "role": "admin"   // changer le rôle
}

Réponse 200 : {"success": true}
```

#### `DELETE /api/auth/users/{id}`
```
Auth requise : admin
Contrainte : impossible de supprimer son propre compte

Réponse 200 : {"success": true}
Erreur 400 : tentative d'auto-suppression
```

---

### 6.3 Routes de configuration

#### `GET /api/health`
```
Auth requise : Non
Réponse 200 : {"status": "ok"}
```

#### `GET /api/config?databaseName=X`
```
Auth requise : user
Réponse 200 :
{
  "databases": ["boutique_test", "askdata_auth"],
  "schemas": ["boutique_test"],
  "providers": ["gemini", "groq"],
  "selectedDatabase": "boutique_test",
  "selectedSchema": "boutique_test",
  "selectedProvider": "groq"
}
```

#### `GET /api/schema/explore?database=X&schema=Y`
```
Auth requise : user
Réponse 200 :
{
  "database": "boutique_test",
  "schema": "boutique_test",
  "tables": [
    {
      "name": "commandes",
      "columns": [
        {"name": "id", "type": "int", "nullable": false, "key": "PRI"},
        {"name": "client_id", "type": "int", "nullable": false, "key": "MUL"},
        {"name": "montant", "type": "decimal(10,2)", "nullable": true, "key": ""}
      ]
    },
    ...
  ]
}
```

#### `GET /api/llm-config`
```
Auth requise : user
Réponse 200 (admin) :
{
  "config": {
    "gemini_api_key": "********",
    "groq_api_key": "********",
    "groq_api_url": ""
  },
  "lastTest": {"success": true, "message": "Connexion Groq réussie"},
  "isAdmin": true
}

Réponse 200 (user) :
{
  "availableProviders": ["gemini", "groq"],
  "isAdmin": false
}
```

#### `POST /api/llm-config/test`
```
Auth requise : admin
Body :
{
  "groq_api_key": "gsk_...",
  "groq_api_url": ""   // optionnel
}
// OU
{
  "gemini_api_key": "AIza..."
}

Réponse 200 :
{
  "success": true,
  "message": "Connexion Groq réussie ✓",
  "lastTest": {"success": true, "message": "...", "timestamp": "..."}
}
```

#### `POST /api/llm-config/save`
```
Auth requise : admin
Body : même que /test

Réponse 200 :
{
  "success": true,
  "message": "LLM configuration saved"
}

Effets secondaires :
1. LLMConfigManager.update(payload, persist=True)   → runtime/llm_config.json
2. llm_config_repo.save_llm_config(...)             → MySQL table llm_config
```

#### `GET /api/db-config`
```
Auth requise : user
Réponse 200 :
{
  "config": {
    "db_type": "mysql",
    "host": "host.docker.internal",
    "port": 3306,
    "user": "root",
    "password": "********",
    "database": "boutique_test",
    "schema": "boutique_test"
  },
  "lastTest": {"success": true, "message": "Connexion MySQL reussie"},
  "supportedTypes": ["postgresql", "mysql"]
}
```

#### `POST /api/db-config/connect`
```
Auth requise : user
Body :
{
  "db_type": "mysql",
  "host": "host.docker.internal",
  "port": 3306,
  "user": "root",
  "password": "secret",
  "database": "boutique_test",
  "schema": ""
}

Réponse 200 :
{
  "connection": {"success": true, "message": "Connexion MySQL reussie"},
  "config": {...},
  "lastTest": {...}
}

Traitement :
1. _test_db_connection() : vraie connexion TCP (pas juste validation de format)
2. Si OK → DatabaseConfigManager.update(payload, persist=True)
3. Sauvegarde dans runtime/db_config.json
```

---

### 6.4 Routes pipeline et résultats

#### `POST /api/pipeline/run`
```
Auth requise : user
Body :
{
  "questionText": "Quels sont les 5 clients avec le plus de commandes ?",
  "artifactName": "",              // optionnel, slug personnalisé
  "databaseName": "boutique_test",
  "schemaName": "boutique_test",
  "providerName": "groq",
  "overwriteExisting": false
}

Réponse 200 (après ~10-60s selon la complexité) :
{
  "id": "quels_sont_les_5_clients",
  "questionName": "quels_sont_les_5_clients",
  "questionText": "Quels sont les 5 clients avec le plus de commandes ?",
  "databaseName": "boutique_test",
  "schemaName": "boutique_test",
  "providerName": "groq",
  "timestamp": 1719475200000,
  "sql": "SELECT c.id, c.nom, COUNT(*) AS nb_commandes ...",
  "csvData": [
    {"id": 2, "nom": "Sory Keita", "nb_commandes": 15},
    ...
  ],
  "metadata": {
    "rows_returned": 5,
    "columns": [
      {"name": "id", "type": "BIGINT"},
      {"name": "nom", "type": "VARCHAR"},
      {"name": "nb_commandes", "type": "BIGINT"}
    ],
    "execution_time_ms": 234
  },
  "report": "# Analyse des clients les plus actifs\n\n## Insights...",
  "chartHtml": "<!DOCTYPE html>...",
  "artifactUrls": {
    "sql": "/api/artifacts/quels_sont_les_5_clients/sql",
    "csv": "/api/artifacts/quels_sont_les_5_clients/csv",
    "chart": "/api/artifacts/quels_sont_les_5_clients/chart",
    "report": "/api/artifacts/quels_sont_les_5_clients/report"
  }
}

Effets secondaires :
- Crée requests/<nom>.txt
- Crée sql/<nom>.sql
- Crée schema/<base>__<schema>_schema.md (si inexistant)
- Crée dataviz/<nom>.py
- Crée outputs/<nom>/<nom>.csv, .html, .md, metadata.json
- INSERT dans table analyses (MySQL auth)
```

#### `GET /api/results`
```
Auth requise : user
Réponse 200 :
{
  "history": [
    {
      "id": "quels_sont_les_5_clients",
      "questionName": "quels_sont_les_5_clients",
      "questionText": "Quels sont les 5 clients avec le plus de commandes ?",
      "databaseName": "boutique_test",
      "schemaName": "boutique_test",
      "providerName": "groq",
      "timestamp": 1719475200000
    },
    ...
  ]
}

Logique de filtrage :
1. list_analyses(user_id)         → analyses en base pour cet utilisateur
2. list_available_results()       → analyses sur disque (tous utilisateurs)
3. Intersection : retourne uniquement les analyses de l'utilisateur
   qui ont encore leurs artefacts sur disque
4. Si 0 analyses en base : retourne tout le disque (première connexion)
```

#### `GET /api/results/{question_name}`
```
Auth requise : user
Paramètre : question_name = slug (ex: "quels_sont_les_5_clients")

Réponse 200 : PipelineResult complet (même format que /pipeline/run)

Traitement :
- Lit requests/<nom>.txt, sql/<nom>.sql
- Lit outputs/<nom>/<nom>.csv → parse CSV en list[dict]
- Lit outputs/<nom>/<nom>.html → chartHtml
- Lit outputs/<nom>/<nom>.md → report
- Lit outputs/<nom>/metadata.json → metadata
- Construit les artifactUrls
```

#### `DELETE /api/history`
```
Auth requise : user

Effets :
1. analyses_repo.delete_analyses(user_id)   → supprime en base MySQL
2. clear_history()                           → supprime fichiers disque

Note : supprime TOUS les fichiers disque (partagés entre users)
```

#### `GET /api/artifacts/{question_name}/{artifact_type}`
```
Auth requise : Non (iframes ne peuvent pas envoyer de JWT)
Types : "sql" | "csv" | "chart" | "report" | "metadata" | "logs"

Réponse :
- sql    : text/plain (Content-Disposition: attachment)
- csv    : text/csv (Content-Disposition: attachment)
- chart  : text/html SANS Content-Disposition (inline pour iframes)
- report : text/markdown (Content-Disposition: attachment)
- metadata : application/json (inline)

Note critique :
Le type "chart" est retourné SANS filename pour éviter que le navigateur
force le téléchargement au lieu d'afficher le HTML dans l'iframe.
```

---

### 6.5 Routes dashboard utilisateur

#### `GET /api/user/kpis`
```
Auth requise : user
Réponse 200 :
{
  "kpis": [
    {
      "id": "quels_sont_les_5_clients__nb_commandes__max",
      "questionName": "quels_sont_les_5_clients",
      "questionText": "Maximum de nb_commandes — Quels sont les 5 clients...",
      "columnName": "Maximum · nb_commandes",
      "value": "15",
      "rawValue": 15,
      "previousValue": null,
      "database": "boutique_test",
      "schema": "boutique_test",
      "provider": "groq",
      "pinnedAt": 1719475200000,
      "lastUpdated": 1719475200000
    }
  ]
}
```

#### `POST /api/user/kpis`
```
Auth requise : user
Body : KpiItem (avec camelCase)
Réponse 200 : {"kpis": [...]}  ← liste mise à jour
```

#### `DELETE /api/user/kpis/{kpi_id}`
```
Auth requise : user
Réponse 200 : {"kpis": [...]}  ← liste mise à jour
```

#### `POST /api/kpi/refresh/{question_name}`
```
Auth requise : user
Paramètre : question_name = slug de l'analyse

Traitement :
1. Lit sql/<question_name>.sql (doit exister)
2. Récupère database depuis DatabaseConfigManager
3. run_query(sql, database) → colonnes + valeurs
4. Retourne première ligne

Réponse 200 :
{
  "columns": ["nb_commandes"],
  "values": {"nb_commandes": 18},
  "rowCount": 1
}

Erreurs :
- 404 : fichier SQL introuvable (analyse supprimée)
- 400 : base de données non configurée
- 500 : erreur SQL
```

---

### 6.6 Route Chat IA

#### `POST /api/chat/message`
```
Auth requise : user
Body :
{
  "message": "Quelle est la tendance des ventes ce mois-ci ?",
  "database": "boutique_test",
  "schema": "boutique_test",
  "provider": "groq",
  "history": [
    {"role": "user", "content": "Bonjour"},
    {"role": "assistant", "content": "Bonjour ! Je suis votre data analyst..."}
  ]
}

Traitement :
1. load_schema_markdown(database, schema)
   → priorité fichier, sinon dynamique depuis information_schema
2. build_system_prompt(database, schema, schema_md)
3. build_messages(system_prompt, history[-20:], message)
4. get_provider(provider).generate(full_prompt)

Réponse 200 :
{
  "response": "D'après la table `commandes` et la colonne `date_commande`..."
}
```

---

## 7. Interactions frontend ↔ backend ↔ base de données

### 7.1 Diagramme de séquence — Login

```
Navigateur         Nginx              FastAPI            MySQL (auth)
    │                │                  │                    │
    │─POST /api/auth/login─────────────▶│                    │
    │                │                  │─SELECT user────────▶│
    │                │                  │◀── user row ────────│
    │                │                  │─bcrypt.checkpw()    │
    │                │                  │─jwt.encode()        │
    │◀─── {token, user} ───────────────│                    │
    │                                   │                    │
    │─localStorage.setItem(token)       │                    │
    │─setAuthed(true)                   │                    │
```

### 7.2 Diagramme de séquence — Bootstrap

```
App.tsx              FastAPI              MySQL (auth)       Disque
  │                    │                     │                │
  │─GET /api/config────▶│                    │                │
  │─GET /api/results───▶│─list_analyses()───▶│                │
  │                     │◀─ user analyses ───│                │
  │                     │─list_available_results()────────────▶│
  │                     │◀──── dossiers outputs/ ─────────────│
  │                     │─(intersection des deux)              │
  │◀─ config ──────────│                    │                │
  │◀─ history ─────────│                    │                │
  │                                          │                │
  │─setState (databases, schemas, history)   │                │
```

### 7.3 Diagramme de séquence — Pipeline complet

```
PipelineInput    FastAPI         LLM (Groq)      MySQL métier      Disque
    │               │               │                │               │
    │─POST /pipeline/run────────────▶│               │               │
    │               │               │               │               │
    │               │─ step 1 : generate_schema ─────────────────────▶│
    │               │               │               │─ information_schema
    │               │               │               │◀─ colonnes     │
    │               │               │               │               │─schema.md
    │               │               │               │               │
    │               │─ step 2 : generate_sql ────────▶               │
    │               │               │─ API call     │               │
    │               │               │◀─ SQL text    │               │
    │               │                               │               │─sql.sql
    │               │               │               │               │
    │               │─ step 3 : execute_analysis ────────────────────▶│
    │               │               │               │─ run_query()  │
    │               │               │               │◀─ rows        │
    │               │               │               │               │─.csv
    │               │               │               │               │─metadata.json
    │               │               │               │               │
    │               │─ step 4 : generate_dataviz ────▶               │
    │               │               │─ API call     │               │
    │               │               │◀─ Python code │               │
    │               │                               │               │─dataviz.py
    │               │               │               │               │
    │               │─ step 5 : run_dataviz ────────────────────────▶│
    │               │               │               │               │─.html
    │               │               │               │               │
    │               │─ step 6 : generate_insights ───▶               │
    │               │               │─ API call     │               │
    │               │               │◀─ Markdown    │               │
    │               │                               │               │─.md
    │               │               │               │               │
    │               │─ save_analysis(user_id) ──────────────────────▶│ MySQL auth
    │               │               │               │               │
    │◀─ PipelineResult (JSON complet)│               │               │
```

### 7.4 Diagramme de séquence — Dashboard

```
Dashboard.tsx         FastAPI              MySQL (auth)
    │                   │                     │
    │─GET /user/kpis────▶│─get_kpis(user_id)──▶│
    │                   │◀── kpis rows ────────│
    │                   │── conversion snake→camel
    │◀── {kpis: [...]} ─│                     │
    │                   │                     │
    │─GET /user/dashboard▶│─get_dashboard()────▶│
    │                   │◀── dashboard rows ───│
    │◀── {dashboard: []}─│                     │
    │                   │                     │
    │─[Render KpiCard]  │                     │
    │─[Render iframe src=/api/artifacts/xxx/chart]
    │   ↑ No JWT needed — public route        │
```

### 7.5 Diagramme de séquence — Export PDF

```
ResultTabs           exportPdf.ts          FastAPI           localStorage
    │                    │                   │                   │
    │─handleExportPdf()──▶│                  │                   │
    │                    │─captureChart()    │                   │
    │                    │  (iframe cachée → Plotly.toImage)     │
    │                    │─fetchUserKpis()──▶│                   │
    │                    │◀── {kpis: [...]}──│                   │
    │                    │─getChatExport() ──────────────────────▶│
    │                    │◀── messages ──────────────────────────│
    │                    │─renderKpis(kpis)  │                   │
    │                    │─renderChatMessages(msgs)               │
    │                    │─assembleHTML()    │                   │
    │                    │─window.open(blobUrl)                  │
    │                    │─window.print()    │                   │
    │                    │─clearChatExport() ────────────────────▶│
    │◀───────────────────│                  │                   │
```

### 7.6 Interaction Auth — Expiration de token

```
apiFetch()            App.tsx              localStorage
    │                   │                     │
    │─fetch(...) → 401  │                     │
    │─clearAuth() ──────────────────────────▶│ remove token + user
    │─dispatchEvent("auth:logout")──────────▶│
    │                   │◀── event handler    │
    │                   │─setAuthed(false)    │
    │                   │─setCurrentUser(null)│
    │                   │─[render Login.tsx]  │
    │─throw Error("Session expirée")          │
```

---

## 8. Flux de données détaillés

### 8.1 Flux de la configuration LLM (admin → utilisateurs)

```
Admin configure clé Groq
        │
        ▼ POST /api/llm-config/save (require_admin)
        │
        ├── LLMConfigManager.update() → runtime/llm_config.json
        └── llm_config_repo.save_llm_config() → MySQL table llm_config
              │
              ▼ (au prochain démarrage Docker)
              │
        on_startup() :
              │
              ├── llm_config_repo.get_llm_config() ← MySQL
              └── LLMConfigManager.update() → runtime/llm_config.json
                        │
                        ▼ (pendant le pipeline)
                        │
                  LLMConfigManager.instance().get_api_key("groq")
                  GroqProvider.generate(prompt)
```

### 8.2 Flux de l'isolation des données utilisateur

```
Bob (user_id=2) se connecte
        │
        ▼ GET /api/results
        │
        ├── list_analyses(user_id=2)    → [quels_sont_les_5_clients, ...]
        ├── list_available_results()     → [quels..., les_ventes_par_mois, ...]
        └── intersection → seulement les analyses de Bob qui existent sur disque
        
Alice (user_id=1) se connecte
        │
        ▼ GET /api/results
        │
        ├── list_analyses(user_id=1)    → [top_produits, ...]
        └── ← ne voit JAMAIS les analyses de Bob
```

### 8.3 Flux du schéma pour le Chat IA

```
POST /api/chat/message {database: "boutique_test", ...}
        │
        ▼ load_schema_markdown("boutique_test", "boutique_test")
        │
        ├── Cherche schema/boutique_test__boutique_test_schema.md
        │     └── Si trouvé → retourne le contenu (cache fichier)
        │
        └── Si absent → génération dynamique :
              │
              ▼ run_query(
                  "SELECT table_name, column_name, column_type..."
                  "FROM information_schema.columns WHERE table_schema = %s",
                  "boutique_test", ("boutique_test",)
                )
              │
              ▼ Construction Markdown :
                ## Base : boutique_test
                ### commandes
                  - id (int) PK
                  - client_id (int)
                  ...
```

---

## 9. Configuration et démarrage

### 9.1 Variables d'environnement critiques

| Variable | Utilisée par | Description |
|---|---|---|
| `JWT_SECRET` | `backend/auth/service.py` | Clé de signature JWT (HS256) — DOIT être unique et secrète |
| `JWT_EXPIRE_SECONDS` | `backend/auth/service.py` | Durée de validité du token (défaut: 28800 = 8h) |
| `AUTH_DB_HOST` | `backend/auth/database.py` | Hôte MySQL auth (défaut: "mysql-auth") |
| `AUTH_DB_PORT` | `backend/auth/database.py` | Port MySQL auth (défaut: 3306) |
| `AUTH_DB_USER` | `backend/auth/database.py` | User MySQL auth (défaut: "askdata") |
| `AUTH_DB_PASSWORD` | `backend/auth/database.py` | Password MySQL auth |
| `AUTH_DB_ROOT_PASSWORD` | `docker-compose.yml` | Root password MySQL (pour Adminer) |
| `AUTH_DB_NAME` | `backend/auth/database.py` | Nom de la base auth (défaut: "askdata_auth") |
| `ADMIN_EMAIL` | `backend/auth/router.py:seed_admin()` | Email du premier admin |
| `ADMIN_PASSWORD` | `backend/auth/router.py:seed_admin()` | Password du premier admin |
| `GEMINI_API_KEY` | `backend/llm_config.py` | Clé API Gemini (fallback si non configurée via UI) |
| `GROQ_API_KEY` | `backend/llm_config.py` | Clé API Groq (fallback) |
| `FRONTEND_ORIGIN` | `backend/service.py` | Origine CORS autorisée |
| `DB_TYPE` | `backend/utils/db_utils.py` | Type base métier (fallback si pas de runtime config) |
| `DB_HOST` | `backend/utils/db_utils.py` | Hôte base métier (fallback) |

### 9.2 Ordre de démarrage Docker

```
1. mysql-auth démarre
   └── healthcheck: mysqladmin ping toutes les 10s
   
2. backend démarre (dépend de mysql-auth: healthy)
   └── on_startup():
       ├── init_db() avec 10 retries × 3s
       ├── seed_admin()
       └── sync llm_config MySQL → runtime/

3. adminer démarre (dépend de mysql-auth: healthy)

4. frontend démarre (dépend de backend)
   └── Nginx sert les fichiers statiques
   └── Nginx proxy /api/* → backend:8000
```

### 9.3 Fichiers de configuration runtime

Ces fichiers sont créés au runtime par le backend et non versionné (`.gitignore`) :

**`runtime/db_config.json`**
```json
{
  "db_type": "mysql",
  "host": "host.docker.internal",
  "port": 3306,
  "user": "root",
  "password": "secret",
  "database": "boutique_test",
  "schema": "boutique_test",
  "extra": {}
}
```

**`runtime/llm_config.json`**
```json
{
  "gemini_api_key": "AIza...",
  "groq_api_key": "gsk_...",
  "groq_api_url": "",
  "extra": {}
}
```

Ces fichiers sont la source de vérité runtime pour le pipeline. Ils sont également synchronisés avec la base MySQL pour la persistance entre redémarrages.

---

*Document généré le 27 juin 2026 — AskData v1.1*
*Architecture décrite après 2 sessions de développement : pipeline BI 6 étapes, auth JWT, MySQL auth, repositories, LLM providers (Gemini/Groq), dashboard, KPIs, Chat IA, export PDF, déploiement Docker 4 services.*
