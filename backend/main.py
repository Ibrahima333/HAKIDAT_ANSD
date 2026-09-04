"""Point d'entrée FastAPI pour l'application HakiData.

Ce module définit toutes les routes HTTP exposées par le backend :
- Configuration base de données et LLM (lecture, test, sauvegarde)
- Lancement du pipeline d'analyse (SQL → CSV → DataViz → Insights)
- Récupération des résultats et artefacts
"""

from __future__ import annotations

import json as _json
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse

# Gestionnaires de configuration DB et LLM
from backend.db_config import DatabaseConfigManager
from backend.llm_config import LLMConfigManager

# Fonctions métier du service pipeline
from backend.service import (
    PipelineServiceError,
    clear_history,
    default_cors_origins,
    delete_result,
    get_artifact_path,
    get_config,
    list_available_results,
    load_result,
    regen_dataviz,
    refresh_pinned_chart,
    generate_report,
    run_pipeline,
    validate_question,
)

# Auth
from backend.auth.database import init_db
from backend.auth.middleware import get_current_user, require_admin
from backend.auth.router import router as auth_router, seed_admin
from backend.repositories import analyses as analyses_repo
from backend.repositories import kpis as kpis_repo
from backend.repositories import dashboard as dashboard_repo
from backend.repositories import llm_config as llm_config_repo
from backend.repositories import audit as audit_repo
from backend.repositories import uploads as uploads_repo
from backend.repositories import db_connections as db_connections_repo
from backend.routers.alerts import router as alerts_router
from backend.routers.db_connections import router as db_connections_router
from backend.utils.alert_scheduler import start as start_alert_scheduler
from backend.utils import anads as anads_client


# ── Création de l'application FastAPI ────────────────────────────────────────
app = FastAPI(
    title="Agentic BI API",
    version="0.1.0",
    description="Backend API pour le frontend React Agentic BI.",
)

# Middleware CORS : autorise le frontend (React dev + prod) à appeler l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=default_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def migrate_legacy_db_config() -> None:
    """Reprend l'ancienne configuration DB unique comme première connexion.

    Ne s'exécute qu'une fois : dès qu'une connexion existe, la table est la
    source de vérité. Les utilisateurs déjà en place conservent leur accès pour
    ne pas interrompre un déploiement existant ; les nouveaux comptes partent
    sans aucun accès.
    """
    try:
        if db_connections_repo.list_connections():
            return
        cfg = DatabaseConfigManager.instance().get()
        if cfg.db_type not in ("mysql", "postgresql") or not cfg.database or not cfg.host:
            return
        connection_id = db_connections_repo.create_connection({
            "name":     cfg.database,
            "db_type":  cfg.db_type,
            "host":     cfg.host,
            "port":     cfg.port,
            "user":     cfg.user,
            "password": cfg.password,
            "schema":   cfg.schema,
        })
        db_connections_repo.grant_all_users(connection_id)
        print(f"[db] Configuration existante migrée en connexion : {cfg.database}")
    except Exception as exc:
        print(f"[db] Migration de la configuration existante ignorée : {exc}")


# ── Initialisation auth au démarrage ─────────────────────────────────────────
@app.on_event("startup")
def on_startup() -> None:
    init_db()
    seed_admin()
    start_alert_scheduler()
    # Synchroniser la config LLM depuis MySQL → fichier runtime
    try:
        db_cfg = llm_config_repo.get_llm_config()
        if db_cfg:
            LLMConfigManager.instance().update({
                k: v for k, v in db_cfg.items() if v
            }, persist=True)
            print("[llm] Config LLM synchronisée depuis MySQL.")
    except Exception as exc:
        print(f"[llm] Sync MySQL→runtime ignorée : {exc}")

    migrate_legacy_db_config()

# ── Router auth ───────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(alerts_router)
app.include_router(db_connections_router)


# ── Contrôle d'accès aux bases ────────────────────────────────────────────────
def accessible_databases(user: dict) -> list[str]:
    """Bases visibles par cet utilisateur : ses bases autorisées + ses fichiers importés.

    Un admin voit toutes les bases enregistrées.
    """
    from backend.db_config import get_registry

    if user.get("role") == "admin":
        names = get_registry().names()
    else:
        names = db_connections_repo.accessible_names(user["sub"])

    for row in uploads_repo.list_user_uploads(user["sub"]):
        name = row["db_name"]
        if name not in names and (Path("uploads") / f"{name}.db").exists():
            names.append(name)
    return names


def assert_db_access(user: dict, database_name: str) -> None:
    """Refuse l'accès si l'utilisateur n'est pas autorisé sur cette base."""
    if not database_name:
        raise HTTPException(status_code=400, detail="Aucune base de données spécifiée.")
    if database_name not in accessible_databases(user):
        raise HTTPException(
            status_code=403,
            detail=f"Vous n'avez pas accès à la base « {database_name} ». "
                   "Contactez un administrateur.",
        )


# ── Route de santé ────────────────────────────────────────────────────────────
@app.get("/api/health")
def health() -> dict[str, str]:
    """Vérifie que le serveur est opérationnel."""
    return {"status": "ok"}


# ── Routes de configuration ───────────────────────────────────────────────────
@app.get("/api/config")
def config(
    database_name: str | None = Query(default=None, alias="databaseName"),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Retourne les bases autorisées pour l'utilisateur, ses schémas et les providers."""
    try:
        return get_config(database_name, accessible_databases(current_user))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/databases")
def databases(current_user: dict = Depends(get_current_user)) -> dict:
    """Liste les bases de données autorisées pour l'utilisateur."""
    return {"databases": accessible_databases(current_user)}


@app.get("/api/databases/{database_name}/schemas")
def schemas(database_name: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Liste les schémas disponibles dans une base de données donnée."""
    assert_db_access(current_user, database_name)
    try:
        config_data = get_config(database_name, accessible_databases(current_user))
        return {"schemas": config_data["schemas"]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/schema/explore")
def schema_explore(
    database: str = Query(...),
    schema: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Retourne la liste des tables et leurs colonnes pour l'explorateur de schéma.

    Chaque table contient : nom, nombre de colonnes, et la liste des colonnes
    avec leur type, nullabilité et clé (PK/FK).
    """
    from backend.utils.db_utils import run_query, _db_type

    assert_db_access(current_user, database)
    db_type = _db_type(database)
    # PostgreSQL stocke les noms de schéma en minuscules dans information_schema
    if db_type not in ("mysql", "sqlite") and schema:
        schema = schema.lower()
    target = schema if schema else database

    try:
        if db_type == "sqlite":
            # SQLite : sqlite_master + PRAGMA table_info
            import sqlite3
            from pathlib import Path as _Path
            db_path = _Path("uploads") / f"{database}.db"
            if not db_path.exists():
                raise FileNotFoundError(f"Fichier SQLite introuvable : {database}.db")
            conn = sqlite3.connect(str(db_path))
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            table_names = [r[0] for r in cur.fetchall()]
            tables: dict = {}
            for tname in table_names:
                cur.execute(f"PRAGMA table_info(\"{tname}\")")
                pragma_rows = cur.fetchall()
                tables[tname] = [
                    {
                        "name": r[1],
                        "type": str(r[2]).upper() or "TEXT",
                        "nullable": r[3] == 0,
                        "key": "PRI" if r[5] else "",
                    }
                    for r in pragma_rows
                ]
            conn.close()

        elif db_type == "mysql":
            # MySQL : information_schema
            _, rows = run_query(
                """
                SELECT table_name, column_name, column_type, is_nullable, column_key
                FROM information_schema.columns
                WHERE table_schema = %s
                ORDER BY table_name, ordinal_position
                """,
                target, (target,)
            )
            tables = {}
            for table_name, col_name, col_type, nullable, col_key in rows:
                if table_name not in tables:
                    tables[table_name] = []
                tables[table_name].append({
                    "name": col_name,
                    "type": str(col_type),
                    "nullable": nullable == "YES",
                    "key": str(col_key) if col_key else "",
                })

        else:
            # PostgreSQL — requête sans JOIN pour éviter les doublons de colonnes
            _, rows = run_query(
                """
                SELECT
                    c.table_name,
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    COALESCE((
                        SELECT CASE tc.constraint_type
                                   WHEN 'PRIMARY KEY' THEN 'PRI'
                                   WHEN 'FOREIGN KEY' THEN 'MUL'
                                   ELSE '' END
                        FROM information_schema.key_column_usage kcu
                        JOIN information_schema.table_constraints tc
                          ON kcu.constraint_name = tc.constraint_name
                         AND kcu.table_schema    = tc.constraint_schema
                        WHERE kcu.table_name   = c.table_name
                          AND kcu.column_name  = c.column_name
                          AND kcu.table_schema = c.table_schema
                        ORDER BY tc.constraint_type
                        LIMIT 1
                    ), '') AS column_key
                FROM information_schema.columns c
                WHERE c.table_schema = %s
                ORDER BY c.table_name, c.ordinal_position
                """,
                database, (schema or "public",)
            )
            tables = {}
            for row in rows:
                if len(row) < 5:
                    continue
                table_name, col_name, col_type, nullable, col_key = row[0], row[1], row[2], row[3], row[4]
                if table_name not in tables:
                    tables[table_name] = []
                tables[table_name].append({
                    "name": col_name,
                    "type": str(col_type),
                    "nullable": nullable == "YES",
                    "key": str(col_key) if col_key else "",
                })

        return {
            "database": database,
            "schema": target,
            "tables": [
                {"name": t, "columns": cols}
                for t, cols in sorted(tables.items())
            ]
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/providers")
def providers() -> dict:
    """Retourne la liste des providers LLM supportés."""
    return {"providers": ["gemini", "groq", "claude"]}


# ── Routes de configuration LLM ──────────────────────────────────────────────
@app.get("/api/llm-config")
def llm_config_get(current_user: dict = Depends(get_current_user)) -> dict:
    """Retourne la config LLM.
    - Admin : clés masquées + lastTest
    - User  : uniquement la liste des providers disponibles
    """
    if current_user.get("role") == "admin":
        mgr = LLMConfigManager.instance()
        return {"config": mgr.get_masked(), "lastTest": mgr.last_test(), "isAdmin": True}
    # Pour les users : juste les providers disponibles (pas les clés)
    return {
        "availableProviders": llm_config_repo.get_available_providers(),
        "isAdmin": False,
    }


def _test_gemini_key(api_key: str) -> tuple[bool, str]:
    """Teste la validité d'une clé API Gemini via une requête légère."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}&pageSize=1"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                return True, "Connexion Gemini réussie"
            return False, f"Gemini a répondu avec le statut {resp.status}"
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            return False, "Clé API Gemini invalide (400)"
        if exc.code == 403:
            return False, "Clé API Gemini refusée (403)"
        return False, f"Erreur Gemini HTTP {exc.code}: {exc.reason}"
    except urllib.error.URLError as exc:
        return False, f"Impossible de joindre Gemini: {exc.reason}"


def _test_groq_key(api_key: str, api_url: str = "") -> tuple[bool, str]:
    """Teste la connexion Groq avec un micro appel de complétion."""
    if not api_key:
        return False, "Clé API Groq manquante"

    # Import local : évite de charger toute la pile LLM (dont Gemini) au démarrage
    from backend.llm.groq import GROQ_DEFAULT_MODEL

    # URL de base configurable, Groq par défaut
    base_url = api_url.rstrip("/") if api_url else "https://api.groq.com/openai/v1"
    endpoint = base_url + "/chat/completions"

    # Requête minimale pour valider la clé sans consommer de tokens
    payload = _json.dumps({
        "model": GROQ_DEFAULT_MODEL,
        "messages": [{"role": "user", "content": "Reply with just: ok"}],
        "max_tokens": 5,
    }).encode()

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; AgenticBI/1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return True, "Connexion Groq réussie ✓"
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        try:
            detail = _json.loads(body).get("error", {}).get("message", body)
        except Exception:
            detail = body[:200]
        if exc.code == 401:
            return False, f"Clé API Groq invalide : {detail}"
        if exc.code == 403:
            return False, f"Accès refusé (403) — vérifiez votre compte Groq : {detail}"
        if exc.code == 429:
            return False, "Limite de requêtes atteinte (429) — réessayez dans quelques secondes"
        return False, f"Erreur Groq HTTP {exc.code} : {detail}"
    except urllib.error.URLError as exc:
        return False, f"Impossible de joindre Groq : {exc.reason}"


def _test_claude_key(api_key: str) -> tuple[bool, str]:
    """Teste la connexion Claude avec un micro appel."""
    if not api_key:
        return False, "Clé API Claude manquante"
    payload = _json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 5,
        "messages": [{"role": "user", "content": "Reply with just: ok"}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return True, "Connexion Claude réussie ✓"
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        try:
            detail = _json.loads(body).get("error", {}).get("message", body)
        except Exception:
            detail = body[:200]
        if exc.code == 401:
            return False, f"Clé API Claude invalide : {detail}"
        if exc.code == 403:
            return False, f"Accès refusé (403) — vérifiez votre compte Anthropic : {detail}"
        if exc.code == 429:
            return False, "Limite de requêtes Claude atteinte — réessayez dans quelques secondes"
        return False, f"Erreur Claude HTTP {exc.code} : {detail}"
    except urllib.error.URLError as exc:
        return False, f"Impossible de joindre Claude : {exc.reason}"


@app.post("/api/llm-config/test")
def llm_config_test(payload: dict, _: dict = Depends(require_admin)) -> dict:
    """Teste la clé API Gemini ou Groq fournie dans le payload. Admin uniquement."""
    mgr = LLMConfigManager.instance()
    try:
        gemini_key = str(payload.get("gemini_api_key", "") or "")
        groq_key = str(payload.get("groq_api_key", "") or "")
        claude_key = str(payload.get("claude_api_key", "") or "")

        # Test de la clé Gemini en priorité
        if gemini_key:
            ok, msg = _test_gemini_key(gemini_key)
            if ok:
                mgr.update({"gemini_api_key": gemini_key}, persist=False)
            mgr.record_test(ok, msg)
            return {"success": ok, "message": msg, "lastTest": mgr.last_test()}

        # Sinon test de la clé Groq
        if groq_key:
            groq_url = str(payload.get("groq_api_url", "") or "")
            ok, msg = _test_groq_key(groq_key, groq_url)
            if ok:
                mgr.update({"groq_api_key": groq_key, "groq_api_url": groq_url}, persist=False)
            mgr.record_test(ok, msg)
            return {"success": ok, "message": msg, "lastTest": mgr.last_test()}

        # Sinon test de la clé Claude
        if claude_key:
            ok, msg = _test_claude_key(claude_key)
            if ok:
                mgr.update({"claude_api_key": claude_key}, persist=False)
            mgr.record_test(ok, msg)
            return {"success": ok, "message": msg, "lastTest": mgr.last_test()}

        raise HTTPException(status_code=400, detail="Clé API manquante")

    except HTTPException:
        raise
    except Exception as exc:
        mgr.record_test(False, str(exc))
        return {"success": False, "message": str(exc), "lastTest": mgr.last_test()}


@app.post("/api/llm-config/save")
def llm_config_save(payload: dict, _: dict = Depends(require_admin)) -> dict:
    """Persiste la configuration LLM en base MySQL + fichier runtime. Admin uniquement."""
    mgr = LLMConfigManager.instance()
    try:
        mgr.update(payload, persist=True)
        # Sauvegarder aussi en MySQL pour persistance partagée
        # Passer uniquement les clés présentes dans le payload
        # Le repository fait un update partiel — les clés absentes restent intactes
        llm_config_repo.save_llm_config(
            gemini_api_key=str(payload.get("gemini_api_key") or ""),
            groq_api_key=str(payload.get("groq_api_key") or ""),
            groq_api_url=str(payload.get("groq_api_url") or ""),
            claude_api_key=str(payload.get("claude_api_key") or ""),
        )
        # Synchroniser LLMConfigManager avec la config complète en base
        full_cfg = llm_config_repo.get_llm_config()
        if full_cfg:
            mgr.update({k: v for k, v in full_cfg.items() if v}, persist=True)
        mgr.record_test(True, "LLM configuration saved")
        return {"success": True, "message": "LLM configuration saved", "lastTest": mgr.last_test()}
    except Exception as exc:
        mgr.record_test(False, str(exc))
        return {"success": False, "message": str(exc), "lastTest": mgr.last_test()}


# ── Routes historique et résultats ────────────────────────────────────────────
@app.get("/api/results")
def results(current_user: dict = Depends(get_current_user)) -> dict:
    """Liste les résultats d'analyse de l'utilisateur connecté."""
    try:
        user_id = current_user["sub"]
        # Fichiers disque disponibles (source de vérité pour les artefacts)
        disk_results = {r["id"]: r for r in list_available_results()}
        db_history   = analyses_repo.list_analyses(user_id)

        # Priorité : résultats en base liés à ce user, complétés par les infos disque
        seen = set()
        history = []
        for r in db_history:
            name = r["question_name"]
            if name in disk_results and name not in seen:
                seen.add(name)
                history.append(disk_results[name])

        return {"history": history}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/history")
@app.delete("/api/history")
def delete_history(current_user: dict = Depends(get_current_user)) -> dict[str, str]:
    """Supprime l'historique d'analyses de l'utilisateur connecté."""
    try:
        analyses_repo.delete_analyses(current_user["sub"])
        return clear_history()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/api/results/{question_name}")
def delete_one_result(question_name: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Supprime une analyse spécifique par son nom."""
    try:
        result = delete_result(question_name)   # fichiers disque d'abord
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    try:
        analyses_repo.delete_analysis(current_user["sub"], question_name)   # puis DB
    except Exception:
        pass   # la suppression DB est best-effort : les fichiers sont déjà partis
    return result


@app.get("/api/results/{question_name}")
def result_detail(question_name: str, _: dict = Depends(get_current_user)) -> dict:
    """Retourne le détail complet d'un résultat d'analyse."""
    try:
        return load_result(question_name)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── KPIs par user ─────────────────────────────────────────────────────────────

@app.get("/api/user/kpis")
def get_user_kpis(current_user: dict = Depends(get_current_user)) -> dict:
    return {"kpis": kpis_repo.get_kpis(current_user["sub"])}


@app.post("/api/user/kpis")
def pin_kpi(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    kpis_repo.upsert_kpi(current_user["sub"], payload)
    return {"kpis": kpis_repo.get_kpis(current_user["sub"])}


@app.delete("/api/user/kpis/{kpi_id}")
def unpin_kpi(kpi_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    kpis_repo.delete_kpi(current_user["sub"], kpi_id)
    return {"kpis": kpis_repo.get_kpis(current_user["sub"])}


# ── Dashboard par user ────────────────────────────────────────────────────────

@app.get("/api/user/dashboard")
def get_user_dashboard(current_user: dict = Depends(get_current_user)) -> dict:
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


@app.post("/api/user/dashboard")
def pin_chart(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    dashboard_repo.upsert_chart(current_user["sub"], payload)
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


@app.delete("/api/user/dashboard/{chart_id}")
def unpin_chart(chart_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    dashboard_repo.delete_chart(current_user["sub"], chart_id)
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


@app.get("/api/user/dashboard/{chart_id}/chart")
def get_pinned_chart_html(chart_id: str):
    """Sert le snapshot HTML figé au moment de l'épinglage — public, comme
    /api/artifacts/..., car chargé directement dans le `src` d'une iframe qui
    ne peut pas transmettre de jeton d'authentification."""
    html = dashboard_repo.get_chart_html(chart_id)
    if html is None:
        raise HTTPException(status_code=404, detail="Graphique introuvable.")
    return HTMLResponse(html)


@app.post("/api/user/dashboard/{chart_id}/watch")
def watch_chart(chart_id: str, payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    """Active/désactive le rafraîchissement automatique d'un graphique épinglé.

    Opt-in par graphique plutôt que global — évite de surcharger le serveur
    (ré-exécution SQL + subprocess de rendu) pour des graphiques que
    personne ne consulte activement.
    """
    chart = dashboard_repo.get_chart(current_user["sub"], chart_id)
    if chart is None:
        raise HTTPException(status_code=404, detail="Graphique introuvable.")
    watched = bool(payload.get("watched", False))
    if watched and not chart.get("sqlQuery"):
        raise HTTPException(
            status_code=400,
            detail="Ce graphique n'a pas de requête SQL sauvegardée. Désépinglez-le et réépinglez-le depuis l'onglet Analyse."
        )
    dashboard_repo.set_watched(current_user["sub"], chart_id, watched)
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


@app.post("/api/user/dashboard/{chart_id}/refresh")
def refresh_chart(chart_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Ré-exécute la requête SQL d'un graphique surveillé et régénère son HTML."""
    import time as _time

    chart = dashboard_repo.get_chart(current_user["sub"], chart_id)
    if chart is None:
        raise HTTPException(status_code=404, detail="Graphique introuvable.")
    sql = (chart.get("sqlQuery") or "").strip()
    db_name = chart.get("databaseName") or ""
    if not sql:
        raise HTTPException(
            status_code=400,
            detail="Ce graphique n'a pas de requête SQL sauvegardée. Désépinglez-le et réépinglez-le depuis l'onglet Analyse."
        )
    assert_db_access(current_user, db_name)
    try:
        html = refresh_pinned_chart(chart["questionName"], db_name, sql)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    # Met à jour le snapshot épinglé — c'est le seul cas où le dashboard doit
    # refléter la régénération : l'utilisateur a explicitement activé la
    # surveillance de ce graphique précis.
    dashboard_repo.update_chart_html(current_user["sub"], chart_id, html)
    dashboard_repo.touch_pinned_at(current_user["sub"], chart_id, int(_time.time() * 1000))
    return {"dashboard": dashboard_repo.get_dashboard(current_user["sub"])}


# ── Validation de question ────────────────────────────────────────────────────
@app.post("/api/pipeline/regen_viz")
def pipeline_regen_viz(payload: dict, _: dict = Depends(get_current_user)) -> dict:
    """Régénère uniquement la dataviz d'une analyse avec un type de graphique forcé."""
    question_name = str(payload.get("questionName", "")).strip()
    chart_type = str(payload.get("chartType", "")).strip()
    provider_name = str(payload.get("providerName", "gemini")).strip()
    if not question_name or not chart_type:
        raise HTTPException(status_code=422, detail="questionName et chartType sont obligatoires.")
    try:
        return regen_dataviz(question_name, chart_type, provider_name)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/pipeline/generate_report")
def pipeline_generate_report(payload: dict, _: dict = Depends(get_current_user)) -> dict:
    """Génère le rapport Insights & Actions d'une analyse existante, à la
    demande — non généré automatiquement à chaque question (économie de quota LLM)."""
    question_name = str(payload.get("questionName", "")).strip()
    provider_name = str(payload.get("providerName", "gemini")).strip()
    if not question_name:
        raise HTTPException(status_code=422, detail="questionName est obligatoire.")
    try:
        return generate_report(question_name, provider_name)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/pipeline/validate")
def pipeline_validate(payload: dict, _: dict = Depends(get_current_user)) -> dict:
    """Valide heuristiquement une question avant de lancer le pipeline."""
    question_text = str(payload.get("questionText", "")).strip()
    return validate_question(question_text)


# ── Route principale : lancement du pipeline d'analyse ───────────────────────
@app.post("/api/pipeline/run")
def pipeline_run(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    """Lance le pipeline complet : génération SQL → exécution → dataviz → insights."""
    # Validation préalable de la question
    question_text = str(payload.get("questionText", "")).strip()
    validation = validate_question(question_text)
    if not validation["valid"]:
        raise HTTPException(status_code=422, detail=validation["reason"])
    assert_db_access(current_user, str(payload.get("databaseName", "")))
    try:
        result = run_pipeline(
            question_text=str(payload.get("questionText", "")).strip(),
            artifact_name=str(payload.get("artifactName", "")),
            database_name=str(payload.get("databaseName", "")),
            schema_name=str(payload.get("schemaName", "")),
            provider_name=str(payload.get("providerName", "gemini")),
            overwrite_existing=bool(payload.get("overwriteExisting", False)),
        )
        rows = result.get("metadata", {}).get("rows_returned", 0)
        try:
            analyses_repo.save_analysis(current_user["sub"], {
                "questionName": result.get("questionName", ""),
                "questionText": str(payload.get("questionText", "")),
                "databaseName": str(payload.get("databaseName", "")),
                "schemaName":   str(payload.get("schemaName", "")),
                "providerName": str(payload.get("providerName", "")),
                "rowsReturned": rows,
            })
        except Exception:
            pass
        try:
            audit_repo.log_action(current_user["sub"], current_user.get("email", ""), {
                "question_text": str(payload.get("questionText", "")),
                "database_name": str(payload.get("databaseName", "")),
                "schema_name":   str(payload.get("schemaName", "")),
                "rows_returned": rows,
                "status": "success",
            })
        except Exception:
            pass
        return result
    except PipelineServiceError as exc:
        try:
            audit_repo.log_action(current_user["sub"], current_user.get("email", ""), {
                "question_text": str(payload.get("questionText", "")),
                "database_name": str(payload.get("databaseName", "")),
                "status": "error",
                "error_message": str(exc),
            })
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Route de téléchargement d'artefacts ──────────────────────────────────────
@app.get("/api/artifacts/{question_name}/{artifact_type}")
def artifact(question_name: str, artifact_type: str):
    """Sert un artefact généré (sql, csv, metadata, chart, report, logs)."""
    try:
        artifact_path, media_type = get_artifact_path(question_name, artifact_type)
    except PipelineServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Les logs sont lus depuis le résultat en mémoire
    if artifact_type == "logs":
        result = load_result(question_name)
        return PlainTextResponse(result["logs"], media_type=media_type)

    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail=f"Artefact introuvable : {artifact_path}")

    # Les métadonnées sont retournées en JSON structuré
    if artifact_type == "metadata":
        result = load_result(question_name)
        return JSONResponse(result["metadata"])

    # Le graphique HTML doit être servi en inline pour s'afficher dans une iframe
    # (Content-Disposition: attachment forcerait le téléchargement)
    if artifact_type == "chart":
        return FileResponse(artifact_path, media_type=media_type)

    # Les autres artefacts (sql, csv, report) sont téléchargeables directement
    return FileResponse(artifact_path, media_type=media_type, filename=artifact_path.name)


# ── KPIs ──────────────────────────────────────────────────────────────────────

@app.post("/api/kpi/refresh/{kpi_id}")
def kpi_refresh(
    kpi_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Ré-exécute le SQL stocké dans le KPI et retourne la valeur mise à jour.

    Lit sql_query depuis la table kpis (source de vérité) — pas de fichier disque.
    """
    from pathlib import Path
    from backend.utils.db_utils import run_query
    from backend.repositories.kpis import get_kpi_by_id

    kpi = get_kpi_by_id(kpi_id)
    if kpi is None:
        raise HTTPException(status_code=404, detail="KPI introuvable.")

    sql = (kpi.get("sql_query") or "").strip()
    if not sql:
        raise HTTPException(
            status_code=400,
            detail="Ce KPI n'a pas de requête SQL sauvegardée. Désépinglez-le et réépinglez-le depuis l'onglet Analyse."
        )

    if kpi.get("user_id") != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Ce KPI ne vous appartient pas.")

    db_name = kpi.get("database_name") or ""
    assert_db_access(current_user, db_name)

    # Auto-détection SQLite
    sqlite_path = Path("uploads") / f"{db_name}.db"
    if sqlite_path.exists():
        import sqlite3
        try:
            conn = sqlite3.connect(str(sqlite_path))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(sql.replace("%s", "?"))
            col_names = [d[0] for d in cur.description] if cur.description else []
            rows = [tuple(row) for row in cur.fetchall()]
            conn.close()
            columns = col_names
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Erreur SQL SQLite : {exc}") from exc
    else:
        try:
            columns, rows = run_query(sql, db_name)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Erreur SQL : {exc}") from exc

    if not rows:
        return {"columns": columns, "values": {}, "rows": [], "rowCount": 0}

    all_rows = [dict(zip(columns, r)) for r in rows]
    return {
        "columns": list(columns),
        "values": all_rows[0],
        # Lignes complètes : nécessaires pour recalculer un agrégat (Max/Min/Total/Moyenne)
        # sur un KPI dérivé d'un résultat multi-lignes — voir lib/kpi.ts côté frontend.
        "rows": all_rows,
        "rowCount": len(rows),
    }



# ── Mode Chat Analytique ──────────────────────────────────────────────────────

@app.post("/api/chat/message")
def chat_message(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    """Endpoint du chat analytique conversationnel.

    Reçoit un message utilisateur + historique de conversation,
    retourne une réponse du data analyst IA sans générer de SQL.

    Body attendu :
        message  : str  — dernier message de l'utilisateur
        database : str  — base de données active
        schema   : str  — schéma actif
        provider : str  — provider LLM ("gemini" ou "groq")
        history  : list — [{ role: "user"|"assistant", content: str }, ...]
    """
    from backend.scripts.chat_analyst import (
        build_messages,
        build_system_prompt,
        load_schema_markdown,
    )

    message  = str(payload.get("message", "")).strip()
    database = str(payload.get("database", "")).strip()
    schema   = str(payload.get("schema", "")).strip()
    provider = str(payload.get("provider", "gemini")).strip()
    history  = payload.get("history", [])

    if not message:
        raise HTTPException(status_code=400, detail="Message vide")
    assert_db_access(current_user, database)

    # Chargement du schéma (fichier existant ou vide)
    schema_md = load_schema_markdown(database, schema)

    # Construction du prompt
    system_prompt = build_system_prompt(database, schema, schema_md)
    messages = build_messages(system_prompt, history, message)

    # Appel LLM — on passe directement les messages au provider
    try:
        from backend.llm.factory import get_provider
        prov = get_provider(provider)

        # Construire un prompt texte à partir des messages
        # (nos providers utilisent une API texte simple)
        full_prompt = "\n\n".join(
            f"[{m['role'].upper()}]\n{m['content']}"
            for m in messages
        )
        result = prov.generate(full_prompt)
        response_text = result.text.strip()

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"response": response_text}



# ── Helpers partagés CSV / Excel / URL ───────────────────────────────────────

import re as _re
import io as _io
import sqlite3 as _sqlite3
import pandas as _pd

_UPLOADS_DIR = Path("uploads")
_CURRENCY_RE = _re.compile(r"[€$£¥₹\s]")
_THOUSAND_RE = _re.compile(r"(?<=\d)[.\s ](?=\d{3}(?:[^\d]|$))")


def _try_numeric(series):
    if series.dtype != object:
        return series
    cleaned = (
        series.astype(str)
        .str.strip()
        .str.replace(_CURRENCY_RE, "", regex=True)
        .str.replace(_THOUSAND_RE, "", regex=True)
        .str.replace(",", ".", regex=False)
    )
    converted = _pd.to_numeric(cleaned, errors="coerce")
    non_null = converted.notna().sum()
    if len(series.dropna()) > 0 and non_null / len(series.dropna()) >= 0.6:
        return converted
    return series


def _contents_to_df(contents: bytes, ext: str):
    if ext == ".csv":
        sample = contents[:4096].decode("utf-8", errors="replace")
        sep = ";" if sample.count(";") > sample.count(",") else ","
        return _pd.read_csv(_io.BytesIO(contents), sep=sep)
    else:
        raw = _pd.read_excel(_io.BytesIO(contents), header=None)
        non_null_counts = raw.notna().sum(axis=1)
        search_range = min(20, len(raw))
        header_row = int(non_null_counts.iloc[:search_range].idxmax())
        return _pd.read_excel(_io.BytesIO(contents), header=header_row, skiprows=[])


def _df_to_sqlite(df, db_name: str) -> dict:
    df.columns = [
        _re.sub(r"[^a-zA-Z0-9_]", "_", str(c)).strip("_") or f"col_{i}"
        for i, c in enumerate(df.columns)
    ]
    for col in df.columns:
        df[col] = _try_numeric(df[col])
    _UPLOADS_DIR.mkdir(exist_ok=True)
    db_path = _UPLOADS_DIR / f"{db_name}.db"
    conn = _sqlite3.connect(str(db_path))
    df.to_sql(db_name, conn, if_exists="replace", index=False)
    conn.close()
    return {"name": db_name, "table": db_name, "rows": len(df), "columns": list(df.columns)}


def _slug(name: str, fallback: str = "upload") -> str:
    return _re.sub(r"[^a-zA-Z0-9_]", "_", name).strip("_") or fallback


# ── Import CSV / Excel ────────────────────────────────────────────────────────

def _user_db_name(user_id: int, slug: str) -> str:
    """Nom interne unique par user : u{user_id}_{slug}"""
    return f"u{user_id}_{slug}"


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Importe un fichier CSV ou Excel et le convertit en base SQLite locale."""
    user_id = current_user["sub"]
    filename = file.filename or "fichier"
    ext = Path(filename).suffix.lower()
    if ext not in {".csv", ".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Format non supporté. Utilisez .csv, .xlsx ou .xls.")
    display_name = _slug(Path(filename).stem)
    db_name = _user_db_name(user_id, display_name)
    contents = await file.read()
    try:
        df = _contents_to_df(contents, ext)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Impossible de lire le fichier : {exc}")
    if df.empty:
        raise HTTPException(status_code=422, detail="Le fichier ne contient aucune donnée.")
    try:
        result = _df_to_sqlite(df, db_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création de la base : {exc}")
    uploads_repo.register_upload(user_id, db_name, display_name)
    return {**result, "name": db_name, "display_name": display_name, "filename": filename}


@app.post("/api/import-url")
def import_from_url(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    """Importe un CSV/Excel depuis une URL ou un Google Sheets public."""
    import urllib.request as _urllib_req
    import re as _re2

    raw_url = str(payload.get("url", "")).strip()
    if not raw_url:
        raise HTTPException(status_code=400, detail="URL manquante.")

    # ── Transformation Google Sheets ─────────────────────────────────────────
    gs_match = _re2.search(r"docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)", raw_url)
    if gs_match:
        sheet_id = gs_match.group(1)
        gid_match = _re2.search(r"[#&?]gid=(\d+)", raw_url)
        gid = gid_match.group(1) if gid_match else "0"
        fetch_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
        ext = ".csv"
        custom_name = str(payload.get("name", "")).strip()
        display_name = _slug(custom_name) if custom_name else _slug(f"gsheet_{sheet_id[:12]}")
        source_label = "Google Sheets"
    else:
        fetch_url = raw_url
        url_path = raw_url.split("?")[0].rstrip("/")
        ext = Path(url_path).suffix.lower()
        if ext not in {".csv", ".xlsx", ".xls"}:
            ext = ".csv"
        custom_name = str(payload.get("name", "")).strip()
        display_name = _slug(custom_name) if custom_name else _slug(Path(url_path).stem or "import")
        source_label = raw_url

    user_id = current_user["sub"]
    db_name = _user_db_name(user_id, display_name)

    # ── Téléchargement ───────────────────────────────────────────────────────
    try:
        req = _urllib_req.Request(fetch_url, headers={"User-Agent": "HakiData/1.0"})
        with _urllib_req.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "")
            contents = resp.read()
            if ext == ".csv" and "spreadsheet" in content_type:
                ext = ".xlsx"
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Impossible de télécharger l'URL : {exc}")

    if len(contents) == 0:
        raise HTTPException(status_code=422, detail="Le fichier téléchargé est vide.")

    try:
        df = _contents_to_df(contents, ext)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Impossible de lire le fichier : {exc}")

    if df.empty:
        raise HTTPException(status_code=422, detail="Le fichier ne contient aucune donnée.")

    try:
        result = _df_to_sqlite(df, db_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création de la base : {exc}")

    uploads_repo.register_upload(user_id, db_name, display_name)
    return {**result, "name": db_name, "display_name": display_name, "filename": source_label}


@app.get("/api/anads/search")
def anads_search(
    q: str = "",
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Cherche des enquêtes dans le catalogue ANADS de l'ANSD (aperçu, sans import)."""
    try:
        rows, found = anads_client.search(q, limit=limit)
    except anads_client.AnadsError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"rows": rows, "found": found, "query": q}


@app.post("/api/import-anads")
def import_from_anads(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    """Importe le catalogue ANADS (métadonnées des enquêtes) comme base interrogeable.

    Ce sont les fiches descriptives qui sont importées, pas les microdonnées :
    la majorité des enquêtes de l'ANSD sont sous licence et leur accès se demande.
    """
    query = str(payload.get("query", "")).strip()
    limit = int(payload.get("limit") or anads_client.MAX_ROWS)
    custom_name = str(payload.get("name", "")).strip()
    display_name = _slug(custom_name) if custom_name else _slug(
        f"anads_{query}" if query else "anads_catalogue", "anads"
    )

    try:
        df, meta = anads_client.catalog_dataframe(query, limit=limit)
    except anads_client.AnadsError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Catalogue ANADS illisible : {exc}")

    user_id = current_user["sub"]
    db_name = _user_db_name(user_id, display_name)
    try:
        result = _df_to_sqlite(df, db_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création de la base : {exc}")

    uploads_repo.register_upload(user_id, db_name, display_name)
    return {
        **result,
        "name": db_name,
        "display_name": display_name,
        "filename": meta["source"],
        "source": "anads",
        "found": meta["found"],
    }


@app.get("/api/anads/fiche/{idno}")
def anads_fiche(idno: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Fiche descriptive d'une enquête : métadonnées, condition d'accès, fichiers disponibles.

    Étapes du parcours ANADS couvertes par cette route : choix de l'enquête
    (l'utilisateur a déjà l'identifiant via /api/anads/search) puis vérification
    des conditions d'accès, affichées avant toute tentative de récupération.
    """
    try:
        fiche = anads_client.get_fiche(idno)
        resources = anads_client.list_resources(idno)
    except anads_client.AnadsError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"fiche": fiche, "resources": resources}


@app.post("/api/import-anads-microdata")
def import_anads_microdata(payload: dict, current_user: dict = Depends(get_current_user)) -> dict:
    """Importe les microdonnées d'une enquête ANADS comme base interrogeable.

    Refuse explicitement (403) les enquêtes dont la condition d'accès n'autorise
    pas une récupération automatique — sous licence, accès distant, données non
    disponibles — plutôt que de tenter un téléchargement voué à l'échec ou pire,
    d'importer une réponse d'erreur du serveur comme si c'était de la donnée.
    """
    idno = str(payload.get("idno", "")).strip()
    if not idno:
        raise HTTPException(status_code=400, detail="Identifiant d'enquête (idno) manquant.")
    resource_id = str(payload.get("resource_id", "")).strip()
    custom_name = str(payload.get("name", "")).strip()

    try:
        df, meta = anads_client.fetch_microdata(idno, resource_id=resource_id)
    except anads_client.AnadsAccessError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except anads_client.AnadsError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Microdonnées illisibles : {exc}")

    display_name = _slug(custom_name) if custom_name else _slug(meta["idno"], "anads_microdata")
    user_id = current_user["sub"]
    db_name = _user_db_name(user_id, display_name)
    try:
        result = _df_to_sqlite(df, db_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création de la base : {exc}")

    uploads_repo.register_upload(user_id, db_name, display_name)
    return {
        **result,
        "name": db_name,
        "display_name": display_name,
        "filename": f"{meta['titre']} — {meta['filename']}",
        "source": "anads-microdata",
        "idno": meta["idno"],
        "access_label": meta["access_label"],
    }


@app.get("/api/uploads")
def list_uploads(current_user: dict = Depends(get_current_user)) -> dict:
    """Liste les fichiers CSV/Excel appartenant à l'utilisateur connecté."""
    import sqlite3 as _sq3
    user_id = current_user["sub"]
    owned = uploads_repo.list_user_uploads(user_id)
    _UPLOADS_DIR.mkdir(exist_ok=True)
    files = []
    for rec in owned:
        db_path = _UPLOADS_DIR / f"{rec['db_name']}.db"
        if not db_path.exists():
            continue
        info: dict = {
            "name": rec["db_name"],
            "display_name": rec["display_name"],
            "size_kb": round(db_path.stat().st_size / 1024, 1),
        }
        try:
            conn = _sq3.connect(str(db_path))
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            info["tables"] = [t[0] for t in tables]
            info["rows"] = conn.execute(f"SELECT COUNT(*) FROM \"{info['tables'][0]}\"").fetchone()[0] if info["tables"] else 0
            conn.close()
        except Exception:
            info["tables"] = []
            info["rows"] = 0
        files.append(info)
    return {"uploads": files}


@app.delete("/api/uploads/{name}")
def delete_upload(name: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Supprime un fichier importé (seulement si l'utilisateur en est propriétaire)."""
    user_id = current_user["sub"]
    if not uploads_repo.owns_upload(user_id, name):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    db_path = _UPLOADS_DIR / f"{name}.db"
    if db_path.exists():
        db_path.unlink()
    uploads_repo.delete_upload(user_id, name)
    return {"deleted": name}


# ── Audit log (admin uniquement) ──────────────────────────────────────────────
@app.get("/api/admin/audit")
def get_audit_logs(
    limit: int = Query(default=200, le=1000),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Retourne les logs d'audit (admin uniquement)."""
    logs = audit_repo.list_logs(limit=limit)
    return {"logs": logs}
