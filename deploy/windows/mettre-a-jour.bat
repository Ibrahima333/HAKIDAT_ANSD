@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."
title HakiData - Mise a jour

echo.
echo  ==========================================
echo       HAKIDATA  -  Mise a jour
echo  ==========================================
echo.

:: Verifier Docker
echo [1/4] Verification de Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker Desktop n'est pas installe.
    pause & exit /b 1
)
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker Desktop n'est pas demarre.
    echo Lancez Docker Desktop depuis le menu Demarrer et reessayez.
    pause & exit /b 1
)
echo [OK] Docker est pret.

:: Verifier .env
echo [2/4] Verification de la configuration...
if not exist ".env" (
    echo [ERREUR] Fichier .env introuvable.
    echo Lancez d'abord lancer.bat pour configurer l'application.
    pause & exit /b 1
)
echo [OK] Configuration trouvee.

:: Lire les variables depuis .env
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="DOCKERHUB_USER"  set DOCKERHUB_USER=%%B
    if "%%A"=="DOCKERHUB_TOKEN" set DOCKERHUB_TOKEN=%%B
)

if "!DOCKERHUB_TOKEN!"=="" (
    echo [ERREUR] DOCKERHUB_TOKEN manquant dans le fichier .env
    pause & exit /b 1
)

:: Connexion Docker Hub
echo [3/4] Connexion a Docker Hub...
echo !DOCKERHUB_TOKEN! | docker login -u !DOCKERHUB_USER! --password-stdin
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de la connexion Docker Hub.
    pause & exit /b 1
)
echo [OK] Connecte a Docker Hub.

:: Telecharger et redemarrer
echo [4/4] Telechargement de la nouvelle version et redemarrage...
echo (1 a 3 minutes selon votre connexion internet)
echo.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de la mise a jour.
    pause & exit /b 1
)

echo.
echo  ==========================================
echo       HAKIDATA EST A JOUR !
echo.
echo   Interface : http://localhost:3000
echo  ==========================================
echo.
timeout /t 2 /nobreak >nul
start http://localhost:3000
pause
