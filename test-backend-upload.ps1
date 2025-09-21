# Test backend file upload
Write-Host "Testing backend file upload..." -ForegroundColor Green

# Create a test image file
$testImagePath = "test-image.jpg"
$testImageContent = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
[System.Convert]::FromBase64String($testImageContent) | Set-Content -Path $testImagePath -Encoding Byte

Write-Host "Created test image: $testImagePath" -ForegroundColor Yellow

# Test upload to backend
$backendUrl = "https://tutor-cancen-backend-bxepcjdqeca7f6bk.canadacentral-01.azurewebsites.net"
$uploadUrl = "$backendUrl/api/files/upload"

Write-Host "Testing upload to: $uploadUrl" -ForegroundColor Yellow

try {
    # Create multipart form data for file upload
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $fileBytes = [System.IO.File]::ReadAllBytes($testImagePath)
    $fileContent = [System.Text.Encoding]::GetEncoding('UTF-8').GetString($fileBytes)
    
    $bodyLines = (
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"test-image.jpg`"",
        "Content-Type: image/jpeg",
        "",
        $fileContent,
        "--$boundary--",
        ""
    ) -join $LF
    
    $response = Invoke-WebRequest -Uri $uploadUrl -Method Post -Body $bodyLines -ContentType "multipart/form-data; boundary=$boundary"
    
    Write-Host "Upload successful!" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor Cyan
    
    # Check if file was synced
    Write-Host "Checking if file was synced to backend..." -ForegroundColor Yellow
    $backendFilesDir = "backend/tutor-connect/target/staticwebapps"
    if (Test-Path $backendFilesDir) {
        Write-Host "Backend files directory found: $backendFilesDir" -ForegroundColor Green
        Get-ChildItem -Path $backendFilesDir | ForEach-Object {
            Write-Host "Found file: $($_.Name)" -ForegroundColor Green
        }
    } else {
        Write-Host "Backend files directory not found: $backendFilesDir" -ForegroundColor Red
    }
    
} catch {
    Write-Host "Upload failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Clean up test file
    if (Test-Path $testImagePath) {
        Remove-Item $testImagePath
        Write-Host "Cleaned up test file" -ForegroundColor Yellow
    }
}
