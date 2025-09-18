# Deploy Both Signaling Server and Frontend Simultaneously
Write-Host "🚀 Starting simultaneous deployment of Signaling Server and Frontend..." -ForegroundColor Green

# Start both deployments in parallel
Write-Host "🔄 Starting parallel deployments..." -ForegroundColor Yellow

# Start signaling server deployment in background
$signalingJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & ".\deploy-signaling.ps1"
}

# Start frontend deployment in background  
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & ".\deploy-frontend.ps1"
}

# Wait for both jobs to complete
Write-Host "⏳ Waiting for deployments to complete..." -ForegroundColor Yellow
Wait-Job $signalingJob, $frontendJob

# Get results
$signalingResult = Receive-Job $signalingJob
$frontendResult = Receive-Job $frontendJob

# Clean up jobs
Remove-Job $signalingJob, $frontendJob

# Display results
Write-Host "📊 Deployment Results:" -ForegroundColor Green
Write-Host "Signaling Server: $signalingResult" -ForegroundColor Cyan
Write-Host "Frontend: $frontendResult" -ForegroundColor Cyan

Write-Host "✅ All deployments completed!" -ForegroundColor Green
