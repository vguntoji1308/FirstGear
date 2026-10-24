param(
  [string]$SdkPath = $env:ANDROID_HOME,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\mobile\android\build')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'mobile\android'
if (!$SdkPath -or !(Test-Path -LiteralPath $SdkPath)) { throw 'Set ANDROID_HOME to an installed Android SDK.' }
$tools = Get-ChildItem (Join-Path $SdkPath 'build-tools') -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
$platform = Get-ChildItem (Join-Path $SdkPath 'platforms') -Directory |
  Where-Object { $_.Name -match '^android-\d+$' } | Sort-Object { [int]($_.Name -replace 'android-', '') } -Descending | Select-Object -First 1
if (!$tools -or !$platform) { throw 'Install Android SDK build-tools and an Android platform (API 35 or newer).' }
$androidJar = Join-Path $platform.FullName 'android.jar'
foreach ($command in @('javac', 'java', 'jar', 'keytool')) {
  if (!(Get-Command $command -ErrorAction SilentlyContinue)) { throw "Install a JDK and put $command on PATH." }
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
$classes = Join-Path $output 'classes'
$dex = Join-Path $output 'dex'
New-Item -ItemType Directory -Force -Path $output,$classes,$dex | Out-Null
function Invoke-Checked {
  param([string]$Executable, [string[]]$Arguments)
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}
$resources = Join-Path $output 'resources.zip'
$unsigned = Join-Path $output 'unsigned.apk'
$aligned = Join-Path $output 'aligned.apk'
$apk = Join-Path $output 'FirstGear-preview.apk'
Invoke-Checked (Join-Path $tools.FullName 'aapt2.exe') @('compile', '--dir', (Join-Path $source 'res'), '-o', $resources)
Invoke-Checked (Join-Path $tools.FullName 'aapt2.exe') @('link', '-o', $unsigned, '-I', $androidJar, '--manifest', (Join-Path $source 'AndroidManifest.xml'), $resources)
Invoke-Checked 'javac' @('--release', '8', '-classpath', $androidJar, '-d', $classes, (Join-Path $source 'src\com\myfirstgear\preview\MainActivity.java'))
$classFiles = @(Get-ChildItem $classes -Filter '*.class' -Recurse | ForEach-Object { $_.FullName })
Invoke-Checked 'java' (@('-cp', (Join-Path $tools.FullName 'lib\d8.jar'), 'com.android.tools.r8.D8', '--lib', $androidJar, '--min-api', '26', '--output', $dex) + $classFiles)
Invoke-Checked 'jar' @('uf', $unsigned, '-C', $dex, 'classes.dex')
Invoke-Checked (Join-Path $tools.FullName 'zipalign.exe') @('-f', '4', $unsigned, $aligned)
$keyDirectory = Join-Path $env:USERPROFILE '.android'
$keystore = Join-Path $keyDirectory 'debug.keystore'
if (!(Test-Path -LiteralPath $keystore)) {
  New-Item -ItemType Directory -Force -Path $keyDirectory | Out-Null
  Invoke-Checked 'keytool' @('-genkeypair', '-keystore', $keystore, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey', '-dname', 'CN=Android Debug,O=Android,C=US', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000')
}
Invoke-Checked 'java' @('-jar', (Join-Path $tools.FullName 'lib\apksigner.jar'), 'sign', '--ks', $keystore, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--ks-key-alias', 'androiddebugkey', '--out', $apk, $aligned)
Invoke-Checked 'java' @('-jar', (Join-Path $tools.FullName 'lib\apksigner.jar'), 'verify', '--verbose', $apk)
Write-Output "Debug APK: $apk"
