@echo off
setlocal
cd /d "%~dp0"
title Qizhi Training Platform

set "QIZHI_PYTHON="
where python >nul 2>nul
if not errorlevel 1 set "QIZHI_PYTHON=python"
if not defined QIZHI_PYTHON if exist "D:\anaconda3\python.exe" set "QIZHI_PYTHON=D:\anaconda3\python.exe"

if not defined QIZHI_PYTHON (
  echo Python was not found.
  echo Install Python or edit this file with the correct python.exe path.
  echo.
  pause
  exit /b 1
)

echo Starting Qizhi Training Platform...
echo Keep this window open while using the website.
echo The newest page will open automatically in your browser.
echo.
set "QIZHI_OPEN_BROWSER=1"
"%QIZHI_PYTHON%" backend\server.py

set "QIZHI_EXIT=%ERRORLEVEL%"
echo.
echo The local service has stopped. Exit code: %QIZHI_EXIT%
echo Copy the message above when asking for help.
pause
exit /b %QIZHI_EXIT%
