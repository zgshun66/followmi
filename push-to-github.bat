@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   follow-mi  --^>  GitHub Pages
echo ============================================
echo.

set /p GHUSER=Your GitHub username: 
if "%GHUSER%"=="" (
  echo.
  echo No username entered. Aborted.
  pause
  exit /b 1
)

set REPO=followmi
set REMOTE=https://github.com/%GHUSER%/%REPO%.git

echo.
echo Remote: %REMOTE%
echo.

git remote remove origin >nul 2>&1
git remote add origin %REMOTE%
git push -u origin main

echo.
if errorlevel 1 (
  echo ------------------------------------------------------------
  echo Push FAILED. Read the messages above.
  echo Common causes:
  echo   - Repository "%REPO%" does not exist on your GitHub account.
  echo   - You cancelled the sign-in window.
  echo   - The remote repository is not empty (it must be brand new).
  echo ------------------------------------------------------------
) else (
  echo ------------------------------------------------------------
  echo Push OK.
  echo.
  echo Next step: open this page and set Source = GitHub Actions
  echo   https://github.com/%GHUSER%/%REPO%/settings/pages
  echo.
  echo Your site will be at:
  echo   https://%GHUSER%.github.io/%REPO%/
  echo ------------------------------------------------------------
)
echo.
pause
