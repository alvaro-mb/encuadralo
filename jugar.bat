@echo off
rem Abre ¡Encuadralo! en el navegador con un servidor local.
cd /d "%~dp0"
where py >nul 2>nul && (py servidor.py %*) || (python servidor.py %*)
pause
