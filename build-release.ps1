# Build release zip with only .js files for Pengu Loader
param([string]$Version = "1.5.2")

$PluginName = "auto-champ-lock"
$ZipName = "$PluginName-$Version.zip"
$TempDir = $PluginName

if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir }
New-Item -ItemType Directory -Path $TempDir | Out-Null
Copy-Item index.js, models.js, config.js, actions.js $TempDir
Compress-Archive -Path $TempDir -DestinationPath $ZipName -Force
Remove-Item -Recurse -Force $TempDir

Write-Host "Created $ZipName"
Write-Host "Upload with: gh release upload v$Version $ZipName --clobber"
