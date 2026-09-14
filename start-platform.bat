@echo off
setlocal
cd /d "%~dp0"
title Qizhi Training Platform
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-platform.ps1"
set "QIZHI_EXIT=%ERRORLEVEL%"
exit /b %QIZHI_EXIT%
