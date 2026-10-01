@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "LOG=%~dp0push-log.txt"
set "OUT=%~dp0push-out.txt"
break > "%LOG%"
break > "%OUT%"

echo ============================================
echo    follow-mi   --^>   GitHub Pages
echo ============================================
echo.

rem ------------------------------------------------------------------
rem  STEP 1 / locate git  (this machine may have no system-wide git)
rem ------------------------------------------------------------------
set "GITEXE="
for /f "delims=" %%i in ('where git 2^>nul') do if not defined GITEXE set "GITEXE=%%i"

if defined GITEXE (
  echo [1/4] git found on PATH
  call :log "[1/4] git on PATH: !GITEXE!"
) else (
  echo [1/4] git is not on PATH - searching portable copies ...
  call :log "[1/4] git not on PATH, searching ..."
  for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\PortableGit\versions\*") do (
    if not defined GITEXE if exist "%%~fd\cmd\git.exe" set "GITEXE=%%~fd\cmd\git.exe"
  )
  for /d %%d in ("%LOCALAPPDATA%\Programs\Git\*") do (
    if not defined GITEXE if exist "%%~fd\cmd\git.exe" set "GITEXE=%%~fd\cmd\git.exe"
  )
  if defined GITEXE (
    echo        found: !GITEXE!
    call :log "[1/4] portable git: !GITEXE!"
  )
)

rem 注意：这两行必须放在括号块之外，路径里的 (x86) 会提前闭合 if 块
if not defined GITEXE if exist "C:\Program Files\Git\cmd\git.exe" set "GITEXE=C:\Program Files\Git\cmd\git.exe"
if not defined GITEXE if exist "C:\Program Files (x86)\Git\cmd\git.exe" set "GITEXE=C:\Program Files (x86)\Git\cmd\git.exe"

if not defined GITEXE (
  echo.
  echo   [ERROR] git was not found on this computer.
  echo   Please install Git for Windows first:
  echo     https://git-scm.com/download/win
  echo.
  call :log "[ERROR] git not found"
  goto :ending
)

for %%g in ("!GITEXE!") do set "GITHD=%%~dpg"
set "PATH=!GITHD!;!GITHD!..\mingw64\bin;%PATH%"

set "GITVER="
"!GITEXE!" --version > "%OUT%" 2>&1
for /f "usebackq delims=" %%v in ("%OUT%") do if not defined GITVER set "GITVER=%%v"
echo        !GITVER!
call :log "[1/4] !GITVER!"

rem ------------------------------------------------------------------
rem  STEP 2 / ask for the GitHub username
rem ------------------------------------------------------------------
echo.
set "GHUSER="
set /p "GHUSER=[2/4] Your GitHub username: "
if "!GHUSER!"=="" (
  echo.
  echo   [ERROR] No username entered. Nothing was done.
  call :log "[ERROR] empty username"
  goto :ending
)

set "REPO=followmi"
set "REMOTE=https://github.com/!GHUSER!/!REPO!.git"
call :log "[2/4] remote = !REMOTE!"

rem ------------------------------------------------------------------
rem  STEP 3 / point the local repo at GitHub
rem ------------------------------------------------------------------
echo.
echo [3/4] remote will be: !REMOTE!
"!GITEXE!" remote remove origin >nul 2>&1
"!GITEXE!" remote add origin "!REMOTE!"
call :log "[3/4] origin set"

rem ------------------------------------------------------------------
rem  STEP 4 / push  (a sign-in window should pop up here)
rem ------------------------------------------------------------------
echo.
echo [4/4] pushing ...  a sign-in window should appear shortly.
echo       If a browser/GCM window opens, finish the login there.
echo.

set "GCM_INTERACTIVE=always"
set "GIT_TERMINAL_PROMPT=1"

"!GITEXE!" push -u origin main > "%OUT%" 2>&1
set "RC=!errorlevel!"

if not "!RC!"=="0" (
  echo.
  echo       Push was rejected - retrying with --force ...
  echo       (normal when the local history has been rewritten)
  echo.
  call :log "[4/4] rejected, retrying with --force"
  "!GITEXE!" push -u origin main --force >> "%OUT%" 2>&1
  set "RC=!errorlevel!"
)

type "%OUT%"
type "%OUT%" >> "%LOG%"
call :log "[4/4] push exit code = !RC!"

echo.
if "!RC!"=="0" goto :pushok

echo ------------------------------------------------------------
echo   Push FAILED   (exit code !RC!)
echo ------------------------------------------------------------
echo.
echo   Common causes:
echo     - The repo "!REPO!" does not exist yet on GitHub, or its name
echo       is spelled differently. Create it (public, empty) first:
echo       https://github.com/new
echo     - You closed the sign-in window.
echo     - The repo is not empty (it must be a brand new one).
echo.
call :log "[FAIL] push failed, rc = !RC!"

echo   Fallback: push with an access token (no pop-up needed).
echo   Create one at https://github.com/settings/tokens
echo     - "Generate new token (classic)", scope: repo
echo.
set "TRY="
set /p "TRY=Retry with a token now? (y/N): "
if /i not "!TRY!"=="y" goto :ending
call :tokenpush
goto :ending

:pushok
echo ------------------------------------------------------------
echo   Push OK
echo ------------------------------------------------------------
echo.
echo   Next step - set the publishing source, one click:
echo     https://github.com/!GHUSER!/!REPO!/settings/pages
echo     Build and deployment  -^>  Source  -^>  GitHub Actions
echo.
echo   Your site will be at:
echo     https://!GHUSER!.github.io/!REPO!/
echo     (the first build takes 1-2 minutes)
echo.
call :log "[OK] push succeeded"

:ending
echo.
echo ------------------------------------------------------------
echo   Log saved to: %LOG%
echo ------------------------------------------------------------
echo.
pause
endlocal
exit /b


rem ==================================================================
rem  helper: push using a personal access token (in case no pop-up)
rem ==================================================================
:tokenpush
set "TOK="
set /p "TOK=Paste your token, then press Enter: "
if "!TOK!"=="" (
  echo   Cancelled.
  exit /b 1
)
call :log "[tok] retrying with token"
"!GITEXE!" remote set-url origin "https://!TOK!@github.com/!GHUSER!/!REPO!.git"
"!GITEXE!" push -u origin main > "%OUT%" 2>&1
set "RC2=!errorlevel!"
if not "!RC2!"=="0" (
  "!GITEXE!" push -u origin main --force >> "%OUT%" 2>&1
  set "RC2=!errorlevel!"
)
"!GITEXE!" remote set-url origin "!REMOTE!"
type "%OUT%"
type "%OUT%" >> "%LOG%"
echo.
if "!RC2!"=="0" (
  echo   Push OK with token
  echo.
  echo   Next step: https://github.com/!GHUSER!/!REPO!/settings/pages
  call :log "[tok] push OK"
) else (
  echo   Push FAILED again - exit !RC2! - see the log.
  call :log "[tok] push failed rc=!RC2!"
)
exit /b 0


rem ==================================================================
rem  helper: append a line to the log file
rem ==================================================================
:log
>> "%LOG%" echo(%~1
exit /b 0
