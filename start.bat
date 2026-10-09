@echo off
rem ============================================================================
rem  Paperwork Pilot - one-click start for Windows
rem  Double-click this file. It needs Docker Desktop to be installed and running.
rem  First run: creates .env with fresh random passwords, builds and starts
rem  Postgres + API + website, then opens http://localhost:8080
rem ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
title Paperwork Pilot

where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo Docker was not found on this computer.
  echo Install Docker Desktop from https://www.docker.com/products/docker-desktop/
  echo then double-click start.bat again.
  echo.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo.
  echo Docker is installed but not running.
  echo Open Docker Desktop, wait until it says it is running, then run start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo First run: creating .env with fresh random secrets...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-env.ps1"
  if errorlevel 1 (
    echo.
    echo Could not create .env. Copy .env.example to .env by hand and edit the passwords.
    echo.
    pause
    exit /b 1
  )
)

echo Building and starting Paperwork Pilot. The first run takes a few minutes...
docker compose up --build -d
if errorlevel 1 (
  echo.
  echo docker compose failed. Scroll up for the reason, or run:  docker compose logs
  echo.
  pause
  exit /b 1
)

set "WEB_PORT=8080"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /c:"WEB_PORT=" ".env"`) do set "WEB_PORT=%%B"
set "URL=http://localhost:%WEB_PORT%"

echo Waiting for the website at %URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='%URL%'; for($i=0;$i -lt 90;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 (
  echo.
  echo The site did not answer in time. Check the logs with:  docker compose logs
  echo.
  pause
  exit /b 1
)

echo.
echo ===========================================================
echo  Paperwork Pilot is running at %URL%
echo  Admin panel:  %URL%/admin
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /c:"ADMIN_PASSWORD=" ".env"`) do echo  Admin password (from .env):  %%B
echo  Stop it with stop.bat
echo ===========================================================
echo.
start "" "%URL%"
pause
endlocal
