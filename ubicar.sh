#!/usr/bin/env bash
# Abre ¡Ubícalo! (adivinar dónde se hizo una foto) en el navegador con un servidor local.
cd "$(dirname "$0")" && exec python3 servidor.py --ubicar "$@"
