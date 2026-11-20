@echo off
REM Fold_ manual server launcher (C1)
REM This script ONLY starts the local server. It does NOT create any Windows
REM startup item, scheduled task, service, or registry entry.
cd /d "%~dp0.."
if not exist ".next" (
  echo No build found. Run: npm run build
  pause
  exit /b 1
)
echo Starting Fold_ on http://localhost:3000
echo Keep this window open. Closing it stops the scheduler too.
npm run start
