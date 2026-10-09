@echo off
rem Stops Paperwork Pilot. Your data is kept. To wipe the database too, run:
rem   docker compose down -v
setlocal EnableExtensions
cd /d "%~dp0"
title Paperwork Pilot - stopping
docker compose down
echo.
echo Stopped. Run start.bat to start again. Your data is kept.
pause
endlocal
