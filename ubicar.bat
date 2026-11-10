@echo off
rem Abre Ubicalo! (adivinar donde se hizo una foto) en el navegador con un servidor local.
cd /d "%~dp0"
where py >nul 2>nul && (py servidor.py --ubicar %*) || (python servidor.py --ubicar %*)
pause
