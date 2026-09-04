#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║          HAKIDATA  —  Restauration des données           ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

[ ! -f ".env" ] && echo -e "  ${RED}[ERREUR]${NC} .env introuvable." && exit 1

AUTH_DB_NAME=$(grep '^AUTH_DB_NAME=' .env | cut -d '=' -f2)
AUTH_DB_ROOT_PASSWORD=$(grep '^AUTH_DB_ROOT_PASSWORD=' .env | cut -d '=' -f2)
AUTH_DB_NAME=${AUTH_DB_NAME:-hakidata_auth}

if [ -z "$1" ]; then
    echo "  Sauvegardes disponibles :"
    echo ""
    BACKUPS=($(ls -1t ./backups/hakidata_backup_*.sql 2>/dev/null))
    if [ ${#BACKUPS[@]} -eq 0 ]; then
        echo -e "  ${RED}[ERREUR]${NC} Aucune sauvegarde trouvée dans backups/"
        exit 1
    fi
    for i in "${!BACKUPS[@]}"; do
        SIZE=$(du -sh "${BACKUPS[$i]}" 2>/dev/null | cut -f1)
        echo "    [$((i+1))] ${BACKUPS[$i]##*/}  ($SIZE)"
    done
    echo ""
    read -p "  Numéro de la sauvegarde à restaurer : " CHOICE
    if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt ${#BACKUPS[@]} ]; then
        echo "  Choix invalide. Annulation."
        exit 1
    fi
    FILEPATH="${BACKUPS[$((CHOICE-1))]}"
else
    FILEPATH="$1"
fi

[ ! -f "$FILEPATH" ] && echo -e "  ${RED}[ERREUR]${NC} Fichier introuvable : $FILEPATH" && exit 1

echo -e "  ${YELLOW}[ATTENTION]${NC} Cette opération va écraser toutes les données actuelles."
read -p "  Continuer ? (oui/non) : " CONFIRM
[ "$CONFIRM" != "oui" ] && echo "  Restauration annulée." && exit 0

echo "  Restauration en cours..."
docker compose -f docker-compose.prod.yml exec -T mysql-auth \
    mysql -u root -p"${AUTH_DB_ROOT_PASSWORD}" "${AUTH_DB_NAME}" < "$FILEPATH"

if [ $? -ne 0 ]; then
    echo -e "  ${RED}[ERREUR]${NC} Restauration échouée."
    exit 1
fi

docker compose -f docker-compose.prod.yml restart backend
echo -e "  ${GREEN}[OK]${NC} Données restaurées avec succès."
echo ""
