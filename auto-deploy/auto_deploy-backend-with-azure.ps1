# Deploy Backend with Azure Blob Storage Support
Write-Host "Deploying Backend with Azure Blob Storage..." -ForegroundColor Green

cd backend/tutor-connect

# Build the application with new Azure dependencies
Write-Host "Building backend with Azure Blob Storage dependencies..." -ForegroundColor Yellow
mvn clean package -DskipTests

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Deploy to Azure
Write-Host "Deploying to Azure..." -ForegroundColor Yellow
az webapp deploy --resource-group tutor-cancen-rg --name tutor-cancen-backend --src-path target/tutor-connect-0.0.1-SNAPSHOT.jar --type jar

# Sync files to frontend for CDN deployment
Write-Host "Syncing files to frontend for CDN..." -ForegroundColor Yellow
cd ../..
.\sync-files-to-cdn.ps1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

# Test the deployment
Write-Host "Testing backend deployment..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Test health endpoint
Write-Host "Testing health endpoint..." -ForegroundColor Cyan
curl https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net/api/users/health

# Test file upload health endpoint
Write-Host "Testing file upload health endpoint..." -ForegroundColor Cyan
curl https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net/api/files/health

Write-Host "Backend deployment completed!" -ForegroundColor Green
Write-Host "Don't forget to set Azure Storage environment variables in Azure Portal!" -ForegroundColor Yellow
