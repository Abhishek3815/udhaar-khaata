$distPath = (Resolve-Path "dist").Path
$zipPath = Join-Path (Get-Location) "dukaan-live-server.zip"

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipArchive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

$files = Get-ChildItem -Path $distPath -Recurse -File

foreach ($file in $files) {
    # Get relative path and ensure FORWARD SLASHES (Linux cPanel standard)
    $relativePath = $file.FullName.Substring($distPath.Length + 1)
    $normalizedPath = $relativePath.Replace("\", "/")
    
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $file.FullName, $normalizedPath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}

$zipArchive.Dispose()
Write-Host "✅ dukaan-live-server.zip created with Linux/cPanel forward slashes (/)"
