#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo ""
echo "  Arrêt de HakiData..."
docker compose -f docker-compose.prod.yml down
echo "  ✅ HakiData est arrêté. Les données sont conservées."
echo ""
