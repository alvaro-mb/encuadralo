@echo off
rem Abre ¡Cuentalos! (contar objetos) en el navegador con un servidor local.
cd /d "%~dp0"
where py >nul 2>nul && (py servidor.py --contar %*) || (python servidor.py --contar %*)
pause
