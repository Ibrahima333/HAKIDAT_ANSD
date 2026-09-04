@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo.
echo  Arrêt de HakiData...
docker compose -f docker-compose.prod.yml down
echo  ✅ HakiData est arrêté. Les données sont conservées.
echo.
pause
