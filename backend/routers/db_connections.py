"""Routes admin pour la gestion des connexions aux bases métier.

L'administrateur enregistre une ou plusieurs bases par serveur, puis attribue
l'accès utilisateur par utilisateur. Aucun accès n'est donné par défaut.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth.middleware import require_admin
from backend.db_config import get_registry
from backend.repositories import db_connections as repo

router = APIRouter(prefix="/api/admin/db-connections", tags=["db-connections"])

SUPPORTED_TYPES = ("mysql", "postgresql")


class ServerCredentials(BaseModel):
    db_type:  str
    host:     str
    port:     int
    user:     str
    password: str


class ConnectionsCreate(ServerCredentials):
    databases: list[str]
    schema_name: Optional[str] = ""


class AccessUpdate(BaseModel):
    user_ids: list[int]


def _connect_server(creds: ServerCredentials, database: str):
    """Ouvre une connexion directe au serveur (hors registre et hors pool)."""
    db_type = creds.db_type.lower()
    if db_type == "mysql":
        import mysql.connector
        return mysql.connector.connect(
            host=creds.host, port=creds.port, user=creds.user,
            password=creds.password, database=database, connect_timeout=8,
        )
    import psycopg2
    return psycopg2.connect(
        host=creds.host, port=creds.port, user=creds.user,
        password=creds.password, dbname=database, connect_timeout=8,
    )


def _friendly_error(exc: Exception, creds: ServerCredentials) -> str:
    msg = str(exc)
    if "Access denied" in msg or "authentification" in msg or "password authentication" in msg:
        return f"Accès refusé pour l'utilisateur « {creds.user} » — vérifiez le mot de passe."
    if "Can't connect" in msg or "Connection refused" in msg or "could not connect" in msg:
        return f"Impossible de joindre le serveur {creds.host}:{creds.port}."
    if "timeout" in msg.lower():
        return f"Délai dépassé en joignant {creds.host}:{creds.port}."
    return msg[:300]


@router.post("/discover")
def discover_databases(creds: ServerCredentials, _: dict = Depends(require_admin)) -> dict:
    """Teste les credentials et retourne les bases disponibles sur le serveur."""
    db_type = creds.db_type.lower()
    if db_type not in SUPPORTED_TYPES:
        raise HTTPException(400, f"Type non supporté : {creds.db_type}")
    if not creds.host or not creds.user:
        raise HTTPException(400, "Hôte et utilisateur sont obligatoires.")

    if db_type == "mysql":
        bootstrap_db = "information_schema"
        sql = """
            SELECT schema_name FROM information_schema.schemata
            WHERE schema_name NOT IN
                ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY schema_name
        """
    else:
        bootstrap_db = "postgres"
        sql = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"

    try:
        conn = _connect_server(creds, bootstrap_db)
    except Exception as exc:
        raise HTTPException(400, _friendly_error(exc, creds)) from exc

    try:
        cur = conn.cursor()
        cur.execute(sql)
        databases = [row[0] for row in cur.fetchall()]
        cur.close()
    except Exception as exc:
        raise HTTPException(400, f"Lecture de la liste des bases impossible : {exc}") from exc
    finally:
        conn.close()

    registered = {c["name"] for c in repo.list_connections()}
    return {
        "databases":  databases,
        "registered": sorted(registered & set(databases)),
    }


@router.get("")
def list_connections(_: dict = Depends(require_admin)) -> dict:
    """Liste les connexions enregistrées avec les utilisateurs autorisés."""
    access = repo.get_access_map()
    connections = repo.list_connections()
    for c in connections:
        c["userIds"] = access.get(c["id"], [])
    return {"connections": connections}


@router.post("", status_code=201)
def create_connections(body: ConnectionsCreate, _: dict = Depends(require_admin)) -> dict:
    """Enregistre les bases sélectionnées après vérification de chaque connexion."""
    if body.db_type.lower() not in SUPPORTED_TYPES:
        raise HTTPException(400, f"Type non supporté : {body.db_type}")
    if not body.databases:
        raise HTTPException(400, "Aucune base sélectionnée.")

    creds = ServerCredentials(
        db_type=body.db_type, host=body.host, port=body.port,
        user=body.user, password=body.password,
    )
    created: list[str] = []
    failed: list[dict] = []

    for database in body.databases:
        try:
            _connect_server(creds, database).close()
        except Exception as exc:
            failed.append({"database": database, "error": _friendly_error(exc, creds)})
            continue
        try:
            repo.create_connection({
                "name":     database,
                "db_type":  body.db_type,
                "host":     body.host,
                "port":     body.port,
                "user":     body.user,
                "password": body.password,
                "schema":   body.schema_name or "",
            })
            created.append(database)
        except ValueError as exc:
            failed.append({"database": database, "error": str(exc)})

    get_registry().invalidate()
    return {"created": created, "failed": failed}


@router.delete("/{connection_id}")
def delete_connection(connection_id: int, _: dict = Depends(require_admin)) -> dict:
    repo.delete_connection(connection_id)
    get_registry().invalidate()
    return {"status": "deleted"}


@router.put("/{connection_id}/access")
def set_access(connection_id: int, body: AccessUpdate, _: dict = Depends(require_admin)) -> dict:
    """Remplace la liste des utilisateurs ayant accès à cette base."""
    repo.set_access(connection_id, body.user_ids)
    return {"status": "updated", "userIds": body.user_ids}
