#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║          HAKIDATA  —  Mise à jour                        ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

[ ! -f ".env" ] && echo -e "  ${RED}[ERREUR]${NC} .env introuvable. Lancez d'abord lancer.sh" && exit 1

DOCKERHUB_USER=$(grep '^DOCKERHUB_USER=' .env | cut -d '=' -f2)
DOCKERHUB_TOKEN=$(grep '^DOCKERHUB_TOKEN=' .env | cut -d '=' -f2)

[ -z "$DOCKERHUB_TOKEN" ] && echo -e "  ${RED}[ERREUR]${NC} DOCKERHUB_TOKEN manquant dans .env" && exit 1

echo "  [1/3] Connexion à Docker Hub..."
echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin || exit 1

echo "  [2/3] Téléchargement de la nouvelle version..."
docker compose -f docker-compose.prod.yml pull || exit 1

echo "  [3/3] Redémarrage des services..."
docker compose -f docker-compose.prod.yml up -d || exit 1

echo ""
echo -e "  ${GREEN}✅ HakiData est à jour et redémarré !${NC}"
echo "  🌐  http://localhost:3000"
echo ""
