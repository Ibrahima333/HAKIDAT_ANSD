#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║          HAKIDATA  —  Sauvegarde des données             ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

[ ! -f ".env" ] && echo -e "  ${RED}[ERREUR]${NC} .env introuvable." && exit 1

AUTH_DB_NAME=$(grep '^AUTH_DB_NAME=' .env | cut -d '=' -f2)
AUTH_DB_ROOT_PASSWORD=$(grep '^AUTH_DB_ROOT_PASSWORD=' .env | cut -d '=' -f2)
AUTH_DB_NAME=${AUTH_DB_NAME:-hakidata_auth}

mkdir -p ./backups
FILENAME="hakidata_backup_$(date '+%Y-%m-%d_%H-%M-%S').sql"
FILEPATH="./backups/$FILENAME"

echo "  Sauvegarde en cours..."
docker compose -f docker-compose.prod.yml exec -T mysql-auth \
    mysqldump -u root -p"${AUTH_DB_ROOT_PASSWORD}" "${AUTH_DB_NAME}" > "$FILEPATH" 2>/dev/null

if [ $? -ne 0 ] || [ ! -s "$FILEPATH" ]; then
    rm -f "$FILEPATH"
    echo -e "  ${RED}[ERREUR]${NC} Sauvegarde échouée. Vérifiez que l'application est démarrée."
    exit 1
fi

echo -e "  ${GREEN}[OK]${NC} Sauvegarde créée : backups/${FILENAME}"
ls -1t ./backups/hakidata_backup_*.sql 2>/dev/null | tail -n +31 | xargs rm -f
echo -e "  ${YELLOW}[INFO]${NC} Conservation des 30 dernières sauvegardes."
echo ""
echo "  Pour restaurer : bash mac/restaurer.sh"
echo ""
