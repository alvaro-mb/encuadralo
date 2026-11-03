"""Servidor local para jugar a ¡Encuádralo!

Uso:  python3 servidor.py [puerto]      (por defecto, 8000)

Sirve el juego con las cabeceras COOP/COEP para que la IA pueda usar varios hilos
y abre el navegador. Los alumnos de la misma red pueden entrar con la dirección «En la red»
(en ese caso la IA funciona igual, pero con un solo hilo).
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser
from functools import partial

RAIZ = os.path.dirname(os.path.abspath(__file__))


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".onnx": "application/octet-stream",
        ".woff2": "font/woff2",
    }

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()

    def log_message(self, formato, *args):
        pass  # sin ruido en la consola


def ip_local():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    servidor = http.server.ThreadingHTTPServer(("0.0.0.0", puerto), partial(Manejador, directory=RAIZ))
    url = f"http://localhost:{puerto}/"
    print("¡Encuádralo! está en marcha")
    print(f"  En este ordenador: {url}")
    if ip := ip_local():
        print(f"  En la red:         http://{ip}:{puerto}/")
    print("Pulsa Ctrl+C para cerrar.")
    if "--sin-navegador" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor cerrado.")


if __name__ == "__main__":
    main()
