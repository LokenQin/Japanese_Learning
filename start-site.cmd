@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
)

if not exist ".env" (
  echo Missing .env configuration.
  echo Copy .env.example to .env and fill in the MySQL connection first.
  pause
  exit /b 1
)

start "Kotoba Server" /min cmd /c "npm run dev"

echo Waiting for API and cloud database...
for /L %%i in (1,1,15) do (
  powershell -NoProfile -Command "try { Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
  if not errorlevel 1 goto :ready
  timeout /t 2 /nobreak >nul
)

echo.
echo API failed to become ready. Check the Kotoba Server window for details.
pause
exit /b 1

:ready
start "" "http://127.0.0.1:5173"
exit /b 0

:error
echo.
echo Failed to install dependencies. Check Node.js and npm, then try again.
pause
exit /b 1
