@echo off
setlocal
cd /d "%~dp0"
title Build Qizhi Portable Package
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\build_portable.ps1" %*
set "QIZHI_BUILD_EXIT=%ERRORLEVEL%"
echo.
if "%QIZHI_BUILD_EXIT%"=="0" (
  echo Build completed. See the release folder.
) else (
  echo Build failed. Exit code: %QIZHI_BUILD_EXIT%
)
pause
exit /b %QIZHI_BUILD_EXIT%
