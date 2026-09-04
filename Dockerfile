# ── Dockerfile backend Python (Agentic BI) ────────────────────────────────────
# Ce fichier construit uniquement l'image du backend FastAPI.
# Le frontend React est géré séparément dans frontend/Dockerfile.
# ─────────────────────────────────────────────────────────────────────────────

# Image de base : Python 3.12 slim (Debian Bookworm)
FROM python:3.12.3-slim-bookworm

# Désactivation des prompts interactifs apt
ENV DEBIAN_FRONTEND=noninteractive

# Installation des dépendances système nécessaires :
# - build-essential : compilation de certaines extensions Python (psycopg2…)
# - postgresql-client : outils CLI PostgreSQL (pg_dump, psql…)
# - default-mysql-client : outils CLI MySQL
# - curl : utilitaire réseau pour les healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    postgresql-client \
    default-mysql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Répertoire de travail de l'application
WORKDIR /app

# Installation des dépendances Python
# Copie séparée pour profiter du cache Docker (ne re-exécute que si requirements change)
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copie du code source backend
COPY backend/ ./backend/

# Port exposé par le serveur uvicorn (mappé via docker-compose)
EXPOSE 8000

# Démarrage du serveur FastAPI avec uvicorn
# --host 0.0.0.0 : écoute sur toutes les interfaces réseau du conteneur
# --port 8000    : port interne du conteneur
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
