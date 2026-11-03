#!/usr/bin/env bash
# Abre ¡Encuádralo! en el navegador con un servidor local.
cd "$(dirname "$0")" && exec python3 servidor.py "$@"
