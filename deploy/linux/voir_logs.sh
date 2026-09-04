#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo ""
echo "  1) Backend   2) Frontend   3) MySQL   4) Backup   5) Tout   6) Quitter"
echo ""
read -p "  Votre choix : " CHOIX
case $CHOIX in
    1) docker compose -f docker-compose.prod.yml logs --tail=100 -f backend ;;
    2) docker compose -f docker-compose.prod.yml logs --tail=100 -f frontend ;;
    3) docker compose -f docker-compose.prod.yml logs --tail=100 -f mysql-auth ;;
    4) docker compose -f docker-compose.prod.yml logs --tail=100 -f backup ;;
    5) docker compose -f docker-compose.prod.yml logs --tail=50 -f ;;
    *) exit 0 ;;
esac
