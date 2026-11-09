#!/usr/bin/env bash
# Abre ¡Cuéntalos! (contar objetos) en el navegador con un servidor local.
cd "$(dirname "$0")" && exec python3 servidor.py --contar "$@"
