# Sync files from backend to frontend for CDN deployment
Write-Host "Syncing files from backend to frontend for CDN deployment..." -ForegroundColor Green

# Get backend files directory
$backendFilesDir = "backend/tutor-connect/target/staticwebapps"
$frontendPublicDir = "frontend/public"

# Create public directory if it doesn't exist
if (!(Test-Path $frontendPublicDir)) {
    New-Item -ItemType Directory -Path $frontendPublicDir -Force
    Write-Host "Created frontend public directory: $frontendPublicDir" -ForegroundColor Yellow
}

# Check if backend target directory exists
if (!(Test-Path "backend/tutor-connect/target")) {
    Write-Host "Backend target directory not found. Building backend first..." -ForegroundColor Yellow
    cd backend/tutor-connect
    mvn clean package -DskipTests
    cd ../..
}

# Copy files from backend to frontend public directory
if (Test-Path $backendFilesDir) {
    Write-Host "Copying files from $backendFilesDir to $frontendPublicDir" -ForegroundColor Yellow
    
    # Copy all files except directories
    Get-ChildItem -Path $backendFilesDir -File | ForEach-Object {
        $sourceFile = $_.FullName
        $destFile = Join-Path $frontendPublicDir $_.Name
        
        Copy-Item -Path $sourceFile -Destination $destFile -Force
        Write-Host "Copied: $($_.Name)" -ForegroundColor Green
    }
    
    Write-Host "Files synced successfully!" -ForegroundColor Green
    Write-Host "Next: Deploy frontend to sync files to CDN" -ForegroundColor Cyan
} else {
    Write-Host "Backend files directory not found: $backendFilesDir" -ForegroundColor Red
    Write-Host "No files to sync. Upload a file first to test the CDN sync." -ForegroundColor Yellow
    Write-Host "The directory will be created when a file is uploaded to the backend." -ForegroundColor Yellow
}
