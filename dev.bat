@echo off
rem ============================================================================
rem  Paperwork Pilot - developer mode for Windows (hot reload)
rem  Needs Node.js 22+ and Docker Desktop. Postgres runs in Docker, the API and
rem  website run on your machine:  web http://localhost:5173   api http://localhost:4000
rem ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
title Paperwork Pilot - dev

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or newer from https://nodejs.org/ and run dev.bat again.
  pause
  exit /b 1
)
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker was not found. Install Docker Desktop, start it, and run dev.bat again.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop and run dev.bat again.
  pause
  exit /b 1
)

if not exist ".env" (
  echo First run: creating .env with fresh random secrets...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-env.ps1"
  if errorlevel 1 (
    echo Could not create .env.
    pause
    exit /b 1
  )
)

echo Starting the database...
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db
if errorlevel 1 (
  echo Could not start the database. If it says a port is not available, change DB_PORT in .env
  echo and the port in DATABASE_URL to the same unused number, for example 5433. Or run:  docker compose logs db
  pause
  exit /b 1
)

echo Installing packages...
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail

echo Preparing the database...
call npm run db:generate
if errorlevel 1 goto :fail
call npm run db:deploy
if errorlevel 1 goto :fail
call npm run db:seed
if errorlevel 1 goto :fail

echo.
echo Website: http://localhost:5173    API: http://localhost:4000    Stop with Ctrl+C
echo.
call npm run dev
goto :eof

:fail
echo.
echo A step failed. Scroll up for the reason.
pause
exit /b 1
