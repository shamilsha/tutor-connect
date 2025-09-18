# Enable detailed logging for Azure Signaling Server
Write-Host "🔧 Enabling detailed logging for Azure Signaling Server..." -ForegroundColor Green

# Enable application logging
az webapp log config --resource-group tutor-cancen-rg --name tutor-cancen-signalling --application-logging filesystem --level verbose

# Enable web server logging
az webapp log config --resource-group tutor-cancen-rg --name tutor-cancen-signalling --web-server-logging filesystem

# Enable failed request tracing
az webapp log config --resource-group tutor-cancen-rg --name tutor-cancen-signalling --failed-request-tracing true

Write-Host "✅ Logging configuration updated!" -ForegroundColor Green
Write-Host "📥 To download logs: az webapp log download --resource-group tutor-cancen-rg --name tutor-cancen-signalling" -ForegroundColor Cyan
Write-Host "📺 To stream live logs: az webapp log tail --resource-group tutor-cancen-rg --name tutor-cancen-signalling" -ForegroundColor Cyan
