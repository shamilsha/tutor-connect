# Quick commands to get Azure Signaling Server logs
Write-Host "🔍 Azure Signaling Server Log Commands" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

Write-Host "`n📥 Download all logs:" -ForegroundColor Yellow
Write-Host "az webapp log download --resource-group tutor-cancen-rg --name tutor-cancen-signalling" -ForegroundColor Cyan

Write-Host "`n📺 Stream live logs:" -ForegroundColor Yellow
Write-Host "az webapp log tail --resource-group tutor-cancen-rg --name tutor-cancen-signalling" -ForegroundColor Cyan

Write-Host "`n🧪 Test server health:" -ForegroundColor Yellow
Write-Host "curl https://tutor-cancen-signalling-e7bcaybxd0dygeec.canadacentral-01.azurewebsites.net/health" -ForegroundColor Cyan

Write-Host "`n🌐 Open in browser:" -ForegroundColor Yellow
Write-Host "https://portal.azure.com -> App Services -> tutor-cancen-signalling -> Log stream" -ForegroundColor Cyan

Write-Host "`n📊 View metrics:" -ForegroundColor Yellow
Write-Host "https://portal.azure.com -> App Services -> tutor-cancen-signalling -> Metrics" -ForegroundColor Cyan

Write-Host "`n🔧 Enable verbose logging:" -ForegroundColor Yellow
Write-Host "az webapp log config --resource-group tutor-cancen-rg --name tutor-cancen-signalling --application-logging filesystem --level verbose" -ForegroundColor Cyan
