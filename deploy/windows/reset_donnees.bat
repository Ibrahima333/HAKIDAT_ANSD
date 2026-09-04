@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo.
echo  ⚠️  ATTENTION : Supprime TOUTES les données (utilisateurs, historique).
echo.
set /p CONFIRM=Tapez OUI pour confirmer :
if /i not "%CONFIRM%"=="OUI" ( echo  Annulé. & pause & exit /b 0 )
docker compose -f docker-compose.prod.yml down -v
echo.
echo  ✅ Réinitialisation terminée. Relancez lancer.bat.
pause
