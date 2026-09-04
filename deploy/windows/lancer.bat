@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."
title HakiData - Deploiement

echo.
echo  ==========================================
echo       HAKIDATA  -  Demarrage
echo  ==========================================
echo.

:: 1. Verifier Docker
echo [1/5] Verification de Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker Desktop n'est pas installe.
    echo Telechargez-le sur : https://www.docker.com/products/docker-desktop/
    echo Installez-le, demarrez-le, puis relancez ce script.
    pause & exit /b 1
)
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Docker Desktop n'est pas demarre.
    echo Lancez Docker Desktop depuis le menu Demarrer et reessayez.
    pause & exit /b 1
)
echo [OK] Docker est pret.

:: 2. Verifier / generer le .env
echo [2/5] Verification de la configuration...
if not exist ".env" (
    echo [INFO] Premiere installation - generation de la configuration...

    for /f %%i in ('powershell -Command "[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')"') do set JWT_SECRET=%%i
    for /f %%i in ('powershell -Command "[guid]::NewGuid().ToString('N')"') do set MYSQL_ROOT_PASSWORD=%%i
    for /f %%i in ('powershell -Command "[guid]::NewGuid().ToString('N')"') do set MYSQL_PASSWORD=%%i

    :: Cle Fernet (32 octets aleatoires en base64) pour chiffrer les mots de
    :: passe des bases metier. Sans elle, ils seraient stockes en clair.
    for /f %%i in ('powershell -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)"') do set DB_ENCRYPTION_KEY=%%i

    :: Note : !VAR! est indispensable ici — dans un bloc parenthese, %VAR%
    :: serait resolu avant l'execution des lignes ci-dessus, donc vide.
    :: Le mot de passe par defaut ne contient volontairement aucun '!' :
    :: l'expansion differee le supprimerait silencieusement a l'ecriture.
    (
        echo # HakiData - Configuration
        echo # NE PAS PARTAGER CE FICHIER
        echo.
        echo DOCKERHUB_USER=ibrahima123
        echo DOCKERHUB_TOKEN=
        echo.
        echo AUTH_DB_HOST=mysql-auth
        echo AUTH_DB_PORT=3306
        echo AUTH_DB_USER=hakidata
        echo AUTH_DB_NAME=hakidata_auth
        echo AUTH_DB_ROOT_PASSWORD=!MYSQL_ROOT_PASSWORD!
        echo AUTH_DB_PASSWORD=!MYSQL_PASSWORD!
        echo.
        echo JWT_SECRET=!JWT_SECRET!
        echo JWT_EXPIRE_SECONDS=28800
        echo.
        echo # Chiffrement des mots de passe des bases metier - A SAUVEGARDER
        echo # Si cette cle est perdue, les connexions devront etre ressaisies.
        echo DB_ENCRYPTION_KEY=!DB_ENCRYPTION_KEY!
        echo.
        echo ADMIN_EMAIL=admin@hakidata.local
        echo ADMIN_PASSWORD=HakiData2026
        echo.
        echo MAX_USERS=100
    ) > .env

    echo [OK] Fichier .env cree.
    echo.
    echo  --> Ouvrez le fichier .env avec le Bloc-notes
    echo  --> Renseignez la valeur de DOCKERHUB_TOKEN
    echo  --> Puis relancez ce script
    echo.
    pause & exit /b 0
)
echo [OK] Configuration trouvee.

:: Lire les variables depuis .env — expansion differee desactivee pour ne pas
:: perdre les '!' contenus dans les valeurs (mot de passe admin, jetons).
setlocal DisableDelayedExpansion
set "DB_ENCRYPTION_KEY="
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="DOCKERHUB_USER"     set "DOCKERHUB_USER=%%B"
    if "%%A"=="DOCKERHUB_TOKEN"    set "DOCKERHUB_TOKEN=%%B"
    if "%%A"=="ADMIN_EMAIL"        set "ADMIN_EMAIL=%%B"
    if "%%A"=="ADMIN_PASSWORD"     set "ADMIN_PASSWORD=%%B"
    if "%%A"=="DB_ENCRYPTION_KEY"  set "DB_ENCRYPTION_KEY=%%B"
)

setlocal EnableDelayedExpansion

:: Installations anterieures : le .env existe mais n'a pas la cle de
:: chiffrement. Sans elle, les mots de passe des bases metier sont stockes
:: en clair. On la genere et on l'ajoute au fichier existant.
:: (Expansion differee reactivee ici : une cle base64 ne contient jamais de '!')
if "!DB_ENCRYPTION_KEY!"=="" (
    echo [INFO] Cle de chiffrement absente - generation...
    for /f %%i in ('powershell -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)"') do set "DB_ENCRYPTION_KEY=%%i"
    (
        echo.
        echo # Chiffrement des mots de passe des bases metier - A SAUVEGARDER
        echo # Si cette cle est perdue, les connexions devront etre ressaisies.
        echo DB_ENCRYPTION_KEY=!DB_ENCRYPTION_KEY!
    ) >> .env
    echo [OK] Cle de chiffrement ajoutee au fichier .env
)

:: 3. Telechargement des images
:: On tente d'abord sans authentification : si les images sont publiques ou
:: deja presentes localement, un jeton Docker Hub expire ne bloque plus rien.
echo [3/5] Telechargement des images...
docker compose -f docker-compose.prod.yml pull >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] Telechargement anonyme impossible - connexion a Docker Hub...
    if "!DOCKERHUB_TOKEN!"=="" (
        echo [ERREUR] DOCKERHUB_TOKEN manquant dans le fichier .env
        echo Ouvrez .env avec le Bloc-notes et renseignez la valeur.
        pause & exit /b 1
    )
    :: Un jeton colle depuis une messagerie arrive souvent avec un espace en
    :: fin de ligne, ce qui fait echouer l'authentification sans rien indiquer.
    for /l %%i in (1,1,20) do (
        if "!DOCKERHUB_TOKEN:~-1!"==" " set "DOCKERHUB_TOKEN=!DOCKERHUB_TOKEN:~0,-1!"
        if "!DOCKERHUB_USER:~-1!"==" "  set "DOCKERHUB_USER=!DOCKERHUB_USER:~0,-1!"
    )

    echo !DOCKERHUB_TOKEN! | docker login -u !DOCKERHUB_USER! --password-stdin
    if !errorlevel! neq 0 (
        :: Diagnostic sans divulguer le jeton : sa longueur suffit a reperer
        :: une troncature ou des caracteres parasites ajoutes au copier-coller.
        set "TOK=!DOCKERHUB_TOKEN!"
        for /f %%i in ('powershell -Command "$env:TOK.Length"') do set "TOKLEN=%%i"
        echo.
        echo [ERREUR] Echec de la connexion Docker Hub.
        echo   Utilisateur lu : "!DOCKERHUB_USER!"
        echo   Jeton lu       : !TOKLEN! caracteres
        echo.
        echo   Si ce nombre ne correspond pas au jeton d'origine, il a ete
        echo   tronque ou altere lors du copier-coller. Recollez-le dans .env
        echo   sans espace avant ni apres.
        echo.
        echo   Sinon, testez directement :  docker logout
        echo                                docker login -u !DOCKERHUB_USER!
        echo.
        pause & exit /b 1
    )
    docker compose -f docker-compose.prod.yml pull
    if !errorlevel! neq 0 (
        echo [ATTENTION] Telechargement incomplet - tentative avec les images locales.
    )
)
echo [OK] Images pretes.

:: 4. Demarrer les services
echo [4/5] Demarrage des services...
echo.
docker compose -f docker-compose.prod.yml up -d
if !errorlevel! neq 0 (
    echo [ERREUR] Echec du demarrage.
    echo Si les images sont absentes, verifiez votre connexion internet
    echo et les identifiants Docker Hub dans le fichier .env
    pause & exit /b 1
)

:: 5. Attendre que le backend soit pret
echo [5/5] Attente des services...
set "BACKEND_HEALTHY=1"
set /a RETRY=0
:WAIT_LOOP
set /a RETRY+=1
if %RETRY% gtr 30 (
    set "BACKEND_HEALTHY=0"
    goto BACKEND_CHECK_DONE
)
timeout /t 3 /nobreak >nul
docker compose -f docker-compose.prod.yml exec -T backend python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" >nul 2>&1
if %errorlevel% neq 0 (
    echo Demarrage en cours... (%RETRY%/30)
    goto WAIT_LOOP
)

:BACKEND_CHECK_DONE
if "!BACKEND_HEALTHY!"=="0" (
    echo.
    echo  ==========================================
    echo       LE BACKEND N'A PAS DEMARRE
    echo  ==========================================
    echo.
    docker compose -f docker-compose.prod.yml logs backend --tail=50 > "%TEMP%\hakidata_backend_logs.txt" 2>nul
    findstr /C:"Access denied for user" "%TEMP%\hakidata_backend_logs.txt" >nul 2>&1
    if !errorlevel! equ 0 (
        echo [CAUSE PROBABLE] Le mot de passe MySQL dans .env ne correspond plus
        echo a celui deja enregistre dans la base de donnees existante.
        echo ^(Arrive si .env a ete supprime/regenere sans repartir d'une base vide.^)
        echo.
        echo Solutions :
        echo   (a) Repartir d'une base vide ^(efface les donnees existantes^) :
        echo         docker compose -f docker-compose.prod.yml down -v
        echo         puis relancez ce script.
        echo   (b) Conserver les donnees existantes : contactez le support avec
        echo       les logs ci-dessous.
    ) else (
        echo [ERREUR] Le backend n'a pas repondu apres 90 secondes.
        echo Consultez les logs complets avec :
        echo   docker compose -f docker-compose.prod.yml logs backend
    )
    echo.
    echo -- Derniers logs du backend --------------------------------
    type "%TEMP%\hakidata_backend_logs.txt" 2>nul
    echo -------------------------------------------------------------
    echo.
    pause & exit /b 1
)

:SHOW_URLS
echo.
echo  ==========================================
echo       HAKIDATA EST PRET !
echo.
echo   Interface : http://localhost:3000
echo   API       : http://localhost:8009/docs
echo.
echo   Email     : !ADMIN_EMAIL!
echo   Password  : !ADMIN_PASSWORD!
echo  ==========================================
echo.
echo Conservez le fichier .env en lieu sur.
echo.
timeout /t 2 /nobreak >nul
start http://localhost:3000
pause
