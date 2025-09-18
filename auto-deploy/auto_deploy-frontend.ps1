# Deploy Frontend to Azure
Write-Host "🚀 Deploying Frontend..." -ForegroundColor Green

cd frontend

# Build frontend
Write-Host "🔨 Building frontend..." -ForegroundColor Yellow
npm run build:versioned

# Deploy to Azure Static Web Apps
Write-Host "☁️ Deploying to Azure Static Web Apps..." -ForegroundColor Yellow
swa deploy --deployment-token 332ea4ac45c51a22d0e89c997e655d6fbfeff2cd35c712a89ad6737f3a1f214901-434cbdd2-0451-4c3a-985b-3f56ae83184500f27250ba06940f --app-location build

Write-Host "✅ Frontend deployment completed!" -ForegroundColor Green
Write-Host "🌐 Test the site: https://thankful-water-0ba06940f-preview.eastus2.1.azurestaticapps.net" -ForegroundColor Cyan
