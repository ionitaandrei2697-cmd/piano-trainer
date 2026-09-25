@echo off
title Piano Trainer
rem  Starts Piano Trainer at http://127.0.0.1:8765 using PowerShell, which every
rem  Windows PC already has - nothing is installed. Close this window to stop it.
rem  Keep the port number the same: the browser remembers your saved pieces,
rem  fingerings and practice log per address.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 8765
if errorlevel 1 pause
