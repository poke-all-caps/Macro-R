@echo off
REM ──────────────────────────────────────────────────────────────────────────────
REM  build.bat — Build the Rewards Desk UI for standalone desktop use
REM  Run this from the PROJECT ROOT:
REM    scripts\desk\build.bat
REM
REM  Output:  dist-desk\  (at the project root)
REM  Then run the app:
REM    node scripts\desk\app-window.js
REM ──────────────────────────────────────────────────────────────────────────────

setlocal

REM Move to project root (two levels up from scripts\desk\)
cd /d "%~dp0..\.."

echo.
echo [build] Installing dependencies...
REM --no-frozen-lockfile lets pnpm add missing Windows-native binaries
REM (e.g. @rollup/rollup-win32-x64-msvc) that weren't in the Linux lockfile.
call pnpm install --no-frozen-lockfile
if %errorlevel% neq 0 (
  echo [build] pnpm install failed. Make sure pnpm is installed:
  echo         npm install -g pnpm
  exit /b 1
)

echo.
echo [build] Building Rewards Desk UI...
call pnpm run build:desk
if %errorlevel% neq 0 (
  echo [build] Build failed. See errors above.
  exit /b 1
)

echo.
echo [build] Done! Output written to dist-desk\
echo.
echo [build] To launch the desktop app:
echo         node scripts\desk\app-window.js
echo.

endlocal
