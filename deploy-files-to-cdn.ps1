# Simple script to deploy files to Azure Static Web Apps CDN
# Run this after uploading files to sync them to the CDN

param(
    [string]$StaticWebAppName = "tutor-static",
    [string]$ResourceGroup = "tutor-cancen-rg"
)

Write-Host "=== Deploying Files to Azure Static Web Apps CDN ===" -ForegroundColor Green
Write-Host "Static Web App: $StaticWebAppName" -ForegroundColor Yellow
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Yellow

# Get the Static Web Apps URL
$staticWebAppUrl = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup --query "defaultHostname" -o tsv

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get Static Web Apps URL" -ForegroundColor Red
    exit 1
}

Write-Host "Static Web Apps URL: https://$staticWebAppUrl" -ForegroundColor Cyan

# Get deployment token
Write-Host "Getting deployment token..." -ForegroundColor Yellow
$deploymentToken = az staticwebapp secrets list --name $StaticWebAppName --resource-group $ResourceGroup --query "properties.deploymentToken" -o tsv

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get deployment token" -ForegroundColor Red
    exit 1
}

Write-Host "Deployment token obtained" -ForegroundColor Green

# Create a simple index.html for Static Web Apps
$indexContent = @"
<!DOCTYPE html>
<html>
<head>
    <title>Tutor Connect - File CDN</title>
</head>
<body>
    <h1>Tutor Connect File CDN</h1>
    <p>Files are served from this CDN for fast global access.</p>
    <p>CDN URL: https://$staticWebAppUrl</p>
</body>
</html>
"@

# Create temp directory for deployment
$tempDir = "temp-staticwebapps"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force

# Write index.html
$indexContent | Out-File -FilePath "$tempDir/index.html" -Encoding UTF8

# Copy any existing files from the backend
$backendFilesDir = "backend/tutor-connect/target/classes/staticwebapps"
if (Test-Path $backendFilesDir) {
    Write-Host "Copying files from backend..." -ForegroundColor Yellow
    Copy-Item -Path "$backendFilesDir/*" -Destination $tempDir -Recurse -Force
}

# Deploy to Static Web Apps using SWA CLI
Write-Host "Installing SWA CLI..." -ForegroundColor Yellow
npm install -g @azure/static-web-apps-cli

Write-Host "Deploying to Static Web Apps..." -ForegroundColor Yellow
swa deploy --deployment-token $deploymentToken --app-location $tempDir

if ($LASTEXITCODE -eq 0) {
    Write-Host "=== Deployment Successful ===" -ForegroundColor Green
    Write-Host "Files are now available on CDN at: https://$staticWebAppUrl" -ForegroundColor Cyan
    Write-Host "Your images and PDFs will now load much faster!" -ForegroundColor Green
} else {
    Write-Host "Deployment failed" -ForegroundColor Red
    exit 1
}

# Clean up
Remove-Item $tempDir -Recurse -Force
Write-Host "Temporary files cleaned up" -ForegroundColor Yellow
