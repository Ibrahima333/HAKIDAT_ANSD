@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo.
echo  1. Backend   2. Frontend   3. MySQL   4. Tout   5. Quitter
echo.
set /p CHOIX=Votre choix :
if "%CHOIX%"=="1" docker compose -f docker-compose.prod.yml logs --tail=100 -f backend
if "%CHOIX%"=="2" docker compose -f docker-compose.prod.yml logs --tail=100 -f frontend
if "%CHOIX%"=="3" docker compose -f docker-compose.prod.yml logs --tail=100 -f mysql-auth
if "%CHOIX%"=="4" docker compose -f docker-compose.prod.yml logs --tail=50 -f
pause
