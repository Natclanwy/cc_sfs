# Build script for cc_sfs firmware
# Sets firmware version and chip family before building

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "esp32-s3-dev",
    
    [Parameter(Mandatory=$false)]
    [string]$Version = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$BuildWeb = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$Upload = $false
)

# Get version from FIRMWARE_VERSION.txt if not specified
if ([string]::IsNullOrEmpty($Version)) {
    if (Test-Path "FIRMWARE_VERSION.txt") {
        $Version = (Get-Content "FIRMWARE_VERSION.txt" -Raw).Trim()
        Write-Host "Using version from FIRMWARE_VERSION.txt: $Version" -ForegroundColor Green
    } else {
        $Version = "dev"
        Write-Host "No version specified, using: $Version" -ForegroundColor Yellow
    }
}

# Determine chip family from environment name
$ChipFamily = switch -Regex ($Environment) {
    "esp32-s3" { "ESP32-S3" }
    "seeed_xiao_esp32s3" { "ESP32-S3" }
    "esp32-dev" { "ESP32" }
    "esp32-build" { "ESP32" }
    default { "Unknown" }
}

Write-Host "`nBuild Configuration:" -ForegroundColor Cyan
Write-Host "  Environment: $Environment"
Write-Host "  Version: $Version"
Write-Host "  Chip Family: $ChipFamily"
Write-Host ""

# Build web assets if requested
if ($BuildWeb) {
    Write-Host "Building web assets..." -ForegroundColor Cyan
    Push-Location webui
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    } finally {
        Pop-Location
    }
    Write-Host "Web assets built successfully`n" -ForegroundColor Green
}

# Set environment variables for the build
$env:FIRMWARE_VERSION = $Version
$env:CHIP_FAMILY = $ChipFamily

# Build firmware
Write-Host "Building firmware..." -ForegroundColor Cyan
if ($Upload) {
    pio run -e $Environment -t upload
} else {
    pio run -e $Environment
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBuild completed successfully!" -ForegroundColor Green
    Write-Host "Firmware version: $Version" -ForegroundColor Green
    Write-Host "Chip family: $ChipFamily" -ForegroundColor Green
} else {
    Write-Host "`nBuild failed!" -ForegroundColor Red
    exit 1
}
