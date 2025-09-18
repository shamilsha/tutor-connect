# Deploy Signaling Server to Azure
Write-Host "🚀 Deploying Signaling Server..." -ForegroundColor Green

cd signaling-server

# Compress files
Write-Host "📦 Compressing signaling server files..." -ForegroundColor Yellow
Compress-Archive -Path server.js,package.json,package-lock.json -DestinationPath signaling-server.zip -Force

# Deploy to Azure
Write-Host "☁️ Deploying to Azure..." -ForegroundColor Yellow
az webapp deployment source config-zip --resource-group tutor-cancen-rg --name tutor-cancen-signalling --src signaling-server.zip
az webapp config set --resource-group tutor-cancen-rg --name tutor-cancen-signalling --startup-file "npm install && node server.js"

# Test deployment
Write-Host "🧪 Testing signaling server..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
curl https://tutor-cancen-signalling-e7bcaybxd0dygeec.canadacentral-01.azurewebsites.net/health

Write-Host "✅ Signaling Server deployment completed!" -ForegroundColor Green
