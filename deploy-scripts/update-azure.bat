@echo off
REM Azure Deployment Update Script for Windows
REM Use this script to quickly update your Azure deployment after making changes

setlocal enabledelayedexpansion

echo 🚀 Starting Azure deployment update...

REM Configuration
set RESOURCE_GROUP=tutor-connect-rg
set BACKEND_APP=tutor-connect-backend
set SIGNALING_APP=tutor-connect-signaling
set FRONTEND_APP=tutor-connect-frontend

REM Check if Azure CLI is installed
az --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Azure CLI is not installed. Please install it first.
    exit /b 1
)

REM Check if logged in to Azure
az account show >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not logged in to Azure. Please run 'az login' first.
    exit /b 1
)

REM Function to update backend
:update_backend
if "%1"=="backend" goto :do_backend
if "%1"=="all" goto :do_backend
goto :eof

:do_backend
echo [INFO] Updating Spring Boot backend...
cd backend\tutor-connect

echo [INFO] Building Spring Boot application...
call mvn clean package -DskipTests

if errorlevel 1 (
    echo [ERROR] Backend build failed!
    exit /b 1
)

echo [INFO] Build successful. Deploying to Azure...
az webapp deployment source config-zip --resource-group %RESOURCE_GROUP% --name %BACKEND_APP% --src target\tutor-connect-0.0.1-SNAPSHOT.jar

if errorlevel 1 (
    echo [ERROR] Backend deployment failed!
    exit /b 1
)

echo [INFO] Backend deployment completed!
cd ..\..

REM Function to update signaling server
:update_signaling
if "%1"=="signaling" goto :do_signaling
if "%1"=="all" goto :do_signaling
goto :eof

:do_signaling
echo [INFO] Updating Node.js signaling server...
cd signaling-server

echo [INFO] Installing dependencies...
call npm install

echo [INFO] Creating deployment package...
powershell -Command "Compress-Archive -Path * -DestinationPath signaling-deploy.zip -Force"

echo [INFO] Deploying signaling server to Azure...
az webapp deployment source config-zip --resource-group %RESOURCE_GROUP% --name %SIGNALING_APP% --src signaling-deploy.zip

if errorlevel 1 (
    echo [ERROR] Signaling server deployment failed!
    exit /b 1
)

REM Clean up
del signaling-deploy.zip

echo [INFO] Signaling server deployment completed!
cd ..

REM Function to update frontend
:update_frontend
if "%1"=="frontend" goto :do_frontend
if "%1"=="all" goto :do_frontend
goto :eof

:do_frontend
echo [INFO] Updating React frontend...
cd frontend

echo [INFO] Installing frontend dependencies...
call npm install

echo [INFO] Building React application...
call npm run build

if errorlevel 1 (
    echo [ERROR] Frontend build failed!
    exit /b 1
)

echo [INFO] Frontend build successful. Deploying to Azure...
echo [WARNING] Frontend updates require a Git push to trigger deployment.
echo [WARNING] Please commit and push your changes to the connected repository.
echo [INFO] Or use the Azure portal to upload the build folder manually.

cd ..

REM Function to restart services
:restart_services
if "%1"=="restart" goto :do_restart
if "%1"=="all" goto :do_restart
goto :eof

:do_restart
echo [INFO] Restarting Azure services...

az webapp restart --name %BACKEND_APP% --resource-group %RESOURCE_GROUP%
az webapp restart --name %SIGNALING_APP% --resource-group %RESOURCE_GROUP%

echo [INFO] Services restarted!

REM Function to check deployment status
:check_status
if "%1"=="status" goto :do_status
goto :eof

:do_status
echo [INFO] Checking deployment status...

echo Backend status:
az webapp show --name %BACKEND_APP% --resource-group %RESOURCE_GROUP% --query "state" -o tsv

echo Signaling server status:
az webapp show --name %SIGNALING_APP% --resource-group %RESOURCE_GROUP% --query "state" -o tsv

echo Frontend status:
az staticwebapp show --name %FRONTEND_APP% --resource-group %RESOURCE_GROUP% --query "defaultHostname" -o tsv

REM Main script logic
if "%1"=="" (
    call :update_backend all
    call :update_signaling all
    call :update_frontend all
    call :restart_services all
) else if "%1"=="backend" (
    call :update_backend backend
) else if "%1"=="signaling" (
    call :update_signaling signaling
) else if "%1"=="frontend" (
    call :update_frontend frontend
) else if "%1"=="restart" (
    call :restart_services restart
) else if "%1"=="status" (
    call :check_status status
) else if "%1"=="all" (
    call :update_backend all
    call :update_signaling all
    call :update_frontend all
    call :restart_services all
) else (
    echo Usage: %0 {backend^|signaling^|frontend^|restart^|status^|all}
    echo   backend   - Update only the Spring Boot backend
    echo   signaling - Update only the Node.js signaling server
    echo   frontend  - Update only the React frontend
    echo   restart   - Restart all services
    echo   status    - Check deployment status
    echo   all       - Update all components (default)
    exit /b 1
)

echo [INFO] Deployment update completed successfully! 🎉
echo [INFO] Your app URLs:
echo   Frontend: https://%FRONTEND_APP%.azurestaticapps.net
echo   Backend: https://%BACKEND_APP%.azurewebsites.net
echo   Signaling: wss://%SIGNALING_APP%.azurewebsites.net

