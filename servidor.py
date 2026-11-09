"""Servidor local para jugar a ¡Encuádralo!

Uso:  python3 servidor.py [puerto] [--contar | --ubicar] [--sin-navegador]      (puerto por defecto: 8000)

  --contar         abre directamente «¡Cuéntalos!» (contar.html) en lugar de «¡Encuádralo!»
  --ubicar         abre directamente «¡Ubícalo!» (ubicar.html)
  --sin-navegador  no abre el navegador

Sirve los tres juegos con las cabeceras COOP/COEP para que la IA pueda usar varios hilos
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
        ".pmtiles": "application/octet-stream",
        ".pbf": "application/x-protobuf",
    }

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    # Peticiones parciales («Range: bytes=inicio-fin»): el mapa de ¡Ubícalo! (mapas/alicante.pmtiles) pide solo
    # los trozos que necesita, así que cada alumno descarga unos pocos MB en vez del archivo entero.
    def send_head(self):
        rango = self.headers.get("Range", "")
        ruta = self.translate_path(self.path)
        if not rango.startswith("bytes=") or "," in rango or not os.path.isfile(ruta):
            return super().send_head()
        tam = os.path.getsize(ruta)
        ini_txt, _, fin_txt = rango[6:].strip().partition("-")
        try:
            if ini_txt:
                ini, fin = int(ini_txt), min(int(fin_txt) if fin_txt else tam - 1, tam - 1)
            else:                                   # «bytes=-N»: los últimos N bytes
                ini, fin = max(0, tam - int(fin_txt)), tam - 1
        except ValueError:
            return super().send_head()
        if ini > fin or ini >= tam:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{tam}")
            self.end_headers()
            return None
        f = open(ruta, "rb")
        f.seek(ini)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(ruta))
        self.send_header("Content-Range", f"bytes {ini}-{fin}/{tam}")
        self.send_header("Content-Length", str(fin - ini + 1))
        self.end_headers()
        self._restante = fin - ini + 1
        return f

    def copyfile(self, origen, destino):
        restante = getattr(self, "_restante", None)
        if restante is None:
            return super().copyfile(origen, destino)
        self._restante = None
        while restante > 0:
            trozo = origen.read(min(64 * 1024, restante))
            if not trozo:
                break
            destino.write(trozo)
            restante -= len(trozo)

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
    numeros = [a for a in sys.argv[1:] if a.isdigit()]
    puerto = int(numeros[0]) if numeros else 8000
    pagina, nombre = (("contar.html", "¡Cuéntalos!") if "--contar" in sys.argv
                      else ("ubicar.html", "¡Ubícalo!") if "--ubicar" in sys.argv
                      else ("", "¡Encuádralo!"))
    servidor = http.server.ThreadingHTTPServer(("0.0.0.0", puerto), partial(Manejador, directory=RAIZ))
    url = f"http://localhost:{puerto}/{pagina}"
    print(f"{nombre} está en marcha")
    print(f"  En este ordenador: {url}")
    if ip := ip_local():
        print(f"  En la red:         http://{ip}:{puerto}/{pagina}")
    print("  (desde el inicio de cada juego se puede cambiar a los otros)")
    print("Pulsa Ctrl+C para cerrar.")
    if "--sin-navegador" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor cerrado.")


if __name__ == "__main__":
    main()
