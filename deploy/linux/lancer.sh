#!/bin/bash

# ════════════════════════════════════════════════════════════
#   HAKIDATA — Démarrage (Linux — Ubuntu / Debian)
# ════════════════════════════════════════════════════════════

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║          HAKIDATA  —  Démarrage de l'application         ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Vérifier / installer Docker ──────────────────────────
echo "  [1/5] Vérification de Docker..."

if ! command -v docker &> /dev/null; then
    echo -e "  ${YELLOW}[INFO]${NC} Docker absent — installation en cours..."

    if ! command -v apt-get &> /dev/null; then
        echo -e "  ${RED}[ERREUR]${NC} Ce script supporte uniquement Ubuntu / Debian."
        echo "  Installez Docker manuellement : https://docs.docker.com/engine/install/"
        exit 1
    fi

    sudo apt-get update -qq
    sudo apt-get install -y -qq ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null \
        || curl -fsSL https://download.docker.com/linux/debian/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    DISTRO=$(. /etc/os-release && echo "$ID")
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/${DISTRO} \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker "$USER"
    sudo systemctl enable docker
    sudo systemctl start docker

    echo -e "  ${GREEN}[OK]${NC} Docker installé."
    exec newgrp docker <<EOF
bash "$(realpath "$0")"
EOF
    exit 0
fi

if ! docker info &> /dev/null; then
    echo -e "  ${YELLOW}[INFO]${NC} Docker arrêté — démarrage..."
    sudo systemctl start docker
    sleep 2
    if ! docker info &> /dev/null; then
        echo -e "  ${RED}[ERREUR]${NC} Impossible de démarrer Docker."
        exit 1
    fi
fi

sudo systemctl enable docker &>/dev/null
echo -e "  ${GREEN}[OK]${NC} Docker est prêt."

# ── 2. Vérifier / générer le .env ───────────────────────────
echo "  [2/5] Vérification de la configuration..."
if [ ! -f ".env" ]; then
    echo -e "  ${YELLOW}[INFO]${NC} Première installation — génération de la configuration..."

    DB_ENCRYPTION_KEY=$(docker run --rm python:3.11-slim \
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null) \
        || DB_ENCRYPTION_KEY=$(openssl rand -base64 32)

    JWT_SECRET=$(openssl rand -hex 32)
    MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)
    MYSQL_PASSWORD=$(openssl rand -hex 16)

    cat > .env <<EOF
# ── HakiData — Configuration générée le $(date '+%Y-%m-%d %H:%M:%S') ──
# ⚠ NE PAS PARTAGER CE FICHIER

DOCKERHUB_USER=ibrahima123
DOCKERHUB_TOKEN=

AUTH_DB_HOST=mysql-auth
AUTH_DB_PORT=3306
AUTH_DB_USER=hakidata
AUTH_DB_NAME=hakidata_auth
AUTH_DB_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
AUTH_DB_PASSWORD=${MYSQL_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRE_SECONDS=28800

DB_ENCRYPTION_KEY=${DB_ENCRYPTION_KEY}

ADMIN_EMAIL=admin@hakidata.local
ADMIN_PASSWORD=HakiData2026

MAX_USERS=100
EOF

    echo -e "  ${GREEN}[OK]${NC} Fichier .env créé."
    echo -e "  ${YELLOW}[INFO]${NC} Renseignez DOCKERHUB_TOKEN dans .env :"
    echo "    nano .env"
    echo "  Puis relancez ce script."
    exit 0
fi
echo -e "  ${GREEN}[OK]${NC} Configuration trouvée."

DOCKERHUB_USER=$(grep '^DOCKERHUB_USER=' .env | cut -d '=' -f2)
DOCKERHUB_TOKEN=$(grep '^DOCKERHUB_TOKEN=' .env | cut -d '=' -f2)
[ -z "$DOCKERHUB_TOKEN" ] && echo -e "  ${RED}[ERREUR]${NC} DOCKERHUB_TOKEN manquant dans .env" && exit 1

# ── 3. Connexion Docker Hub ──────────────────────────────────
echo "  [3/5] Connexion à Docker Hub..."
echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin || exit 1
echo -e "  ${GREEN}[OK]${NC} Connecté."

# ── 4. Démarrer les services ─────────────────────────────────
echo "  [4/5] Téléchargement et démarrage..."
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d || exit 1

# ── 5. Attendre le backend ───────────────────────────────────
echo "  [5/5] Attente que les services soient prêts..."
RETRY=0
BACKEND_HEALTHY=1
until docker compose -f docker-compose.prod.yml exec -T backend \
    python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" &>/dev/null; do
    RETRY=$((RETRY+1))
    if [ $RETRY -gt 30 ]; then
        BACKEND_HEALTHY=0
        break
    fi
    echo "  Démarrage en cours... ($RETRY/30)"
    sleep 3
done

# ── Échec : ne jamais afficher "PRÊT" si le backend n'a pas répondu ──
if [ "$BACKEND_HEALTHY" -eq 0 ]; then
    echo ""
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║   ❌  LE BACKEND N'A PAS DÉMARRÉ                          ║"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo ""
    BACKEND_LOGS=$(docker compose -f docker-compose.prod.yml logs backend --tail=50 2>/dev/null)
    if echo "$BACKEND_LOGS" | grep -q "Access denied for user"; then
        echo -e "  ${RED}[CAUSE PROBABLE]${NC} Le mot de passe MySQL dans .env ne correspond plus"
        echo "  à celui déjà enregistré dans la base de données existante."
        echo "  (Arrive si .env a été supprimé/régénéré sans repartir d'une base vide.)"
        echo ""
        echo "  Solutions :"
        echo "    (a) Repartir d'une base vide (⚠ efface les données existantes) :"
        echo "          docker compose -f docker-compose.prod.yml down -v"
        echo "          puis relancez ce script."
        echo "    (b) Conserver les données existantes : contactez le support avec"
        echo "        les logs ci-dessous."
    else
        echo -e "  ${RED}[ERREUR]${NC} Le backend n'a pas répondu après 90 secondes."
        echo "  Consultez les logs complets avec :"
        echo "    docker compose -f docker-compose.prod.yml logs backend"
    fi
    echo ""
    echo "  ── Derniers logs du backend ────────────────────────────────"
    echo "$BACKEND_LOGS" | tail -15
    echo "  ─────────────────────────────────────────────────────────────"
    echo ""
    exit 1
fi

ADMIN_EMAIL=$(grep '^ADMIN_EMAIL=' .env | cut -d '=' -f2)
ADMIN_PASSWORD=$(grep '^ADMIN_PASSWORD=' .env | cut -d '=' -f2)

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║   ✅  HAKIDATA EST PRÊT !                                ║"
echo "  ║                                                          ║"
echo "  ║   🌐  Interface :  http://localhost:3000                ║"
echo "  ║   🔧  API :        http://localhost:8009/docs           ║"
echo "  ║                                                          ║"
echo "  ║   📧  Email :      ${ADMIN_EMAIL}              ║"
echo "  ║   🔑  Mot de passe : ${ADMIN_PASSWORD}                          ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
echo -e "  ${YELLOW}⚠ Conservez le fichier .env en lieu sûr.${NC}"
echo ""
xdg-open http://localhost:3000 &>/dev/null || true
