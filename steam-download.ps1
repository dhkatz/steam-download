# GitHub action powershell script to setup SteamCMD and download a game

Write-Output ""
Write-Output "#################################"
Write-Output "#     Downloading SteamCMD      #"
Write-Output "#################################"
Write-Output ""

# Download SteamCMD
$SteamCMDUrl = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
$SteamCMDPath = "$PWD\steamcmd"

if (!(Test-Path "$SteamCMDPath\steamcmd.exe")) {
    New-Item -ItemType Directory -Force -Path $SteamCMDPath

    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $SteamCMDUrl -OutFile "$SteamCMDPath\steamcmd.zip"
    Expand-Archive -Path "$SteamCMDPath\steamcmd.zip" -DestinationPath $SteamCMDPath
}

$LoginMethod = "anonymous"

# If STEAM_TOTP is set, use it to login, else use anonymous login
if ($env:STEAM_VDF) {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#     Using SteamGuard VDF      #"
    Write-Output "#################################"
    Write-Output ""

    $SteamGuardVDFPath = "$SteamCMDPath\config"
    New-Item -ItemType Directory -Force -Path $SteamGuardVDFPath
    $DecodedVDF = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:STEAM_VDF))
    $DecodedVDF | Out-File "$SteamGuardVDFPath\config.vdf" -Encoding utf8

    $LoginMethod = "vdf"
} elseif ($env:STEAM_TOTP) {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#     Using SteamGuard TOTP     #"
    Write-Output "#################################"
    Write-Output ""

    $LoginMethod = "totp"
} else {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#     Using Anonymous Login     #"
    Write-Output "#################################"
    Write-Output ""
}

# Test login

Write-Output ""
Write-Output "#################################"
Write-Output "#       Testing Steam Login     #"
Write-Output "#################################"
Write-Output ""

$SteamCMDPath = "$PWD\steamcmd"
$SteamCMDExe = "$SteamCMDPath\steamcmd.exe"
$SteamUsername = $env:STEAM_USERNAME ?? "anonymous"
$SteamPassword = $env:STEAM_PASSWORD ?? ""

if ($LoginMethod -eq "vdf") {
    $SteamCMDArgs = @(
        "+@ShutdownOnFailedCommand 1"
        "+login $SteamUsername"
        "+quit"
    )
} elseif ($LoginMethod -eq "totp") {
    $SteamCMDArgs = @(
        "+@ShutdownOnFailedCommand 1"
        "+set_steam_guard_code $env:STEAM_TOTP"
        "+login `"$SteamUsername`" `"$SteamPassword`""
        "+quit"
    )
} else {
    $SteamCMDArgs = @(
        "+@ShutdownOnFailedCommand 1"
        "+login $SteamUsername"
        "+quit"
    )
}

# Run SteamCMD, hide output
& $SteamCMDExe $SteamCMDArgs

# If the exit code is 0, the login was successful
if ($LASTEXITCODE -eq 0) {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#       Steam Login Success     #"
    Write-Output "#################################"
    Write-Output ""
} else {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#       Steam Login Failed      #"
    Write-Output "#################################"
    Write-Output ""
    exit $LASTEXITCODE
}

# Download game

Write-Output ""
Write-Output "#################################"
Write-Output "#       Downloading Game        #"
Write-Output "#################################"

$SteamCMDPath = "$PWD\steamcmd"
$SteamCMDExe = "$SteamCMDPath\steamcmd.exe"
$SteamUsername = $env:STEAM_USERNAME ?? "anonymous"

$SteamAppId = $env:STEAM_APP_ID ?? $env:STEAM_APPID ?? ""
$SteamGamePath = $env:STEAM_GAME_PATH ?? "$PWD\game"

if ($SteamAppId -eq "") {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#     Steam App ID not set      #"
    Write-Output "#################################"
    Write-Output ""
    exit 1
}

$SteamCMDArgs = @(
    "+@ShutdownOnFailedCommand 1"
    "+force_install_dir $SteamGamePath"
    "+login $SteamUsername"
    "+app_update $SteamAppId validate"
    "+quit"
)

# Run SteamCMD, show output
& $SteamCMDExe $SteamCMDArgs

# If the exit code is 0, the download was successful
if ($LASTEXITCODE -eq 0) {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#       Download Success        #"
    Write-Output "#################################"
    Write-Output ""
} else {
    Write-Output ""
    Write-Output "#################################"
    Write-Output "#       Download Failed         #"
    Write-Output "#################################"
    Write-Output ""
    Write-Output "Exit code: $LASTEXITCODE"
    exit $LASTEXITCODE
}
