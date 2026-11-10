"""Prepara los datos del juego «¡Ubícalo!» (adivinar dónde se hizo una foto, en la provincia de Alicante).

Cuatro pasos, que se pueden repetir por separado. Cada uno guarda su resultado en tools/.cache/ubicar/ y al final
regenera js/mapa_alicante.js y js/datos_ubicar.js con lo que haya disponible:

  1) python tools/preparar_ubicar.py mapa
     Descarga de OpenStreetMap (Overpass) el contorno de la provincia, sus municipios, las provincias vecinas,
     autopistas y autovías y los nombres de ciudades y pueblos, y los simplifica para dibujarlos sin internet.
     Requiere solo la biblioteca estándar.

  1b) python tools/preparar_ubicar.py teselas [--fecha AAAAMMDD] [--pmtiles RUTA]
     Recorta la provincia del mapa mundial de OpenStreetMap que Protomaps publica cada día
     (https://build.protomaps.com) y lo guarda en mapas/alicante.pmtiles (zoom 0–14, unos 42 MB), junto con las
     tipografías y los iconos del estilo. Es el mapa completo que ve el alumno; el del paso 1 queda como respaldo
     si el juego se abre sin servidor. Requiere la herramienta «pmtiles» (https://github.com/protomaps/go-pmtiles).
     El servidor tiene que admitir peticiones parciales (HTTP Range): servidor.py, GitHub Pages y casi todos los
     alojamientos web lo hacen.

  2) python tools/preparar_ubicar.py fotos
     Descarga de Wikimedia Commons las fotos de SELECCION, las reduce a 1600 px, les quita los metadatos EXIF
     (que incluyen las coordenadas GPS) y guarda autor, licencia y enlace. Requiere pillow.

  3) python tools/preparar_ubicar.py ia
     Pasa GeoCLIP (Vivanco et al., NeurIPS 2023) por cada foto, sin conexión, y guarda sus predicciones.
     Requiere torch y el paquete geoclip (pip install geoclip). Usa la GPU si la hay.
  4) python tools/preparar_ubicar.py tiempo [--hilos 4]
     Mide el tiempo de GeoCLIP en CPU, para que sea comparable a un ordenador del aula. Conviene ejecutarlo con el
     ordenador libre de otras tareas pesadas.
     Se guardan dos predicciones:
       - «provincia»: GeoCLIP elige solo entre los puntos de su galería que caen dentro de la provincia (unos 100),
         es decir, juega con la misma pista que el alumno (sabe que la foto es de la provincia de Alicante).
         Ojo: no sirve una rejilla uniforme de puntos. La galería de GeoCLIP sale de los sitios donde se hacen
         fotos, y en una rejilla los puntos de zonas vacías del interior reciben puntuaciones altas sin motivo.
         Con una rejilla de 1 km, la distancia media sube de 13 a 30 km.
       - «mundo»: la predicción normal de GeoCLIP, entre 100.000 puntos de todo el planeta.

Los datos de OpenStreetMap tienen licencia ODbL (© colaboradores de OpenStreetMap).
"""
import argparse
import io
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "tools" / ".cache" / "ubicar"
UA = {"User-Agent": "EncuadraloTaller/1.0 (juego educativo; https://github.com/)"}
OVERPASS = "https://overpass-api.de/api/interpreter"
PROVINCIA = 349012                      # relación de OSM «Alacant / Alicante»
CAJA_VECINAS = (37.75, -1.45, 39.05, 0.35)   # sur, oeste, norte, este (para dibujar las provincias vecinas)

# Fotos del juego: archivo de Wikimedia Commons → nombre del lugar (solo se revela después de cada ronda) y dificultad.
# Coordenadas: las de la cámara que figuran en Commons, comprobadas a mano frente al título y la imagen.
SELECCION = [
    ("File:Alicante - panoramio (8).jpg", "Explanada de España y castillo de Santa Bárbara (Alicante)", "facil"),
    ("File:® ELCHE HUERTO DEL CURA (AL ATARDECER) - panoramio (6).jpg", "Huerto del Cura, en el Palmeral (Elche)", "medio"),
    ("File:Santa Pola. Castillo. Plaza 1.JPG", "Plaza del castillo-fortaleza (Santa Pola)", "medio"),
    ("File:Faro de Santa Pola.jpg", "Faro del cabo de Santa Pola", "medio"),
    ("File:Isla de Tabarca - panoramio.jpg", "Isla de Tabarca (Alicante)", "dificil"),
]
LADO_FOTO = 1600


# ---------------------------------------------------------------- utilidades

def pedir(url, datos=None, intentos=3):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, data=datos, headers=UA)
            with urllib.request.urlopen(req, timeout=240) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == intentos - 1:
                raise
            print(f"  reintento tras error: {e}")
            time.sleep(10 * (i + 1))


def overpass(consulta):
    print("  Overpass:", " ".join(consulta.split())[:90], "…")
    datos = urllib.parse.urlencode({"data": f"[out:json][timeout:180];{consulta}"}).encode()
    return json.loads(pedir(OVERPASS, datos))["elements"]


def simplificar(puntos, tol_m):
    """Douglas-Peucker en metros (proyección local equirectangular)."""
    if len(puntos) < 3:
        return puntos
    lat0 = math.radians(puntos[0][1])
    kx, ky = 111320 * math.cos(lat0), 110540
    xy = [(p[0] * kx, p[1] * ky) for p in puntos]
    guardar = [False] * len(puntos)
    guardar[0] = guardar[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        a, b = pila.pop()
        (ax, ay), (bx, by) = xy[a], xy[b]
        dx, dy = bx - ax, by - ay
        largo = math.hypot(dx, dy)
        peor, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / largo if largo else math.hypot(px - ax, py - ay)
            if d > peor:
                peor, idx = d, i
        if peor > tol_m:
            guardar[idx] = True
            pila += [(a, idx), (idx, b)]
    return [p for p, g in zip(puntos, guardar) if g]


def unir_anillos(tramos):
    """Une los tramos (listas de [lon, lat]) de un multipolígono en anillos cerrados."""
    tramos = [t[:] for t in tramos if len(t) > 1]
    anillos = []
    while tramos:
        anillo = tramos.pop()
        cambiado = True
        while anillo[0] != anillo[-1] and cambiado:
            cambiado = False
            for i, t in enumerate(tramos):
                if t[0] == anillo[-1]:
                    anillo += t[1:]
                elif t[-1] == anillo[-1]:
                    anillo += t[::-1][1:]
                elif t[-1] == anillo[0]:
                    anillo = t + anillo[1:]
                elif t[0] == anillo[0]:
                    anillo = t[::-1] + anillo[1:]
                else:
                    continue
                tramos.pop(i)
                cambiado = True
                break
        if len(anillo) >= 4:
            anillos.append(anillo)
    return anillos


def anillos_relacion(rel, rol="outer"):
    tramos = [[[round(p["lon"], 5), round(p["lat"], 5)] for p in m["geometry"]]
              for m in rel.get("members", []) if m["type"] == "way" and m.get("role", "outer") in (rol, "") and "geometry" in m]
    return unir_anillos(tramos)


def redondear(anillo, dec=4):
    out = []
    for lon, lat in anillo:
        p = [round(lon, dec), round(lat, dec)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def validos(anillos):
    """Descarta los anillos que se quedan sin superficie al simplificar (islotes diminutos)."""
    return [a for a in anillos if len(a) >= 4]


def dentro(lon, lat, anillos):
    """Punto en polígono (regla par-impar) sobre todos los anillos exteriores."""
    c = False
    for an in anillos:
        for (x1, y1), (x2, y2) in zip(an, an[1:]):
            if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                c = not c
    return c


def leer(nombre, defecto=None):
    ruta = CACHE / nombre
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else defecto


def guardar(nombre, datos):
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / nombre).write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------- paso 1: mapa

def cmd_mapa(args):
    prov = overpass(f"relation({PROVINCIA});out geom;")[0]
    provincia = validos(redondear(simplificar(a, 60)) for a in anillos_relacion(prov))
    print(f"  provincia: {len(provincia)} anillos, {sum(map(len, provincia))} puntos")

    s, o, n, e = CAJA_VECINAS
    vecinas = []
    for rel in overpass(f'relation["boundary"="administrative"]["admin_level"="6"]({s},{o},{n},{e});out geom;'):
        if rel["id"] == PROVINCIA:
            continue
        vecinas += validos(redondear(simplificar(a, 250), 3) for a in anillos_relacion(rel))
    print(f"  provincias vecinas: {len(vecinas)} anillos")

    municipios = []
    area = 3600000000 + PROVINCIA
    for rel in overpass(f'area({area})->.a;relation["boundary"="administrative"]["admin_level"="8"](area.a);out geom;'):
        ine = rel.get("tags", {}).get("ine:municipio", "")
        if not ine.startswith("03"):
            continue
        anillos = validos(redondear(simplificar(a, 80)) for a in anillos_relacion(rel))
        municipios.append({"nombre": rel["tags"].get("name", ""), "anillos": anillos})
    print(f"  municipios: {len(municipios)}")

    carreteras = []
    for way in overpass(f'area({area})->.a;way["highway"~"^(motorway|trunk)$"](area.a);out geom;'):
        pts = redondear(simplificar([[p["lon"], p["lat"]] for p in way["geometry"]], 60))
        if len(pts) > 1:
            carreteras.append({"ref": way.get("tags", {}).get("ref", ""), "puntos": pts})
    carreteras = fusionar_lineas(carreteras)
    print(f"  carreteras: {len(carreteras)} tramos")

    poblaciones = []
    for nodo in overpass(f'area({area})->.a;node["place"~"^(city|town|village)$"](area.a);out;'):
        t = nodo.get("tags", {})
        pob = int(re.sub(r"\D", "", t.get("population", "0")) or 0)
        if t.get("place") == "village" and pob < 2500 and t.get("name") not in ("Tabarca", "Nova Tabarca"):
            continue
        poblaciones.append({"nombre": t.get("name:es") or t.get("name", ""), "lon": round(nodo["lon"], 4),
                            "lat": round(nodo["lat"], 4), "tipo": t["place"], "poblacion": pob})
    poblaciones.sort(key=lambda p: -p["poblacion"])
    print(f"  poblaciones: {len(poblaciones)}")

    guardar("mapa.json", dict(provincia=provincia, vecinas=vecinas, municipios=municipios,
                              carreteras=carreteras, poblaciones=poblaciones))
    escribir_js()


def fusionar_lineas(lineas):
    """Une tramos de carretera consecutivos con la misma referencia (menos trazos que dibujar)."""
    por_ref = {}
    for l in lineas:
        por_ref.setdefault(l["ref"], []).append(l["puntos"])
    salida = []
    for ref, tramos in por_ref.items():
        while tramos:
            linea = tramos.pop()
            cambiado = True
            while cambiado:
                cambiado = False
                for i, t in enumerate(tramos):
                    if t[0] == linea[-1]:
                        linea += t[1:]
                    elif t[-1] == linea[0]:
                        linea = t + linea[1:]
                    else:
                        continue
                    tramos.pop(i)
                    cambiado = True
                    break
            salida.append({"ref": ref, "puntos": linea})
    return salida


# ---------------------------------------------------------------- paso 1b: teselas de Protomaps

CAJA_TESELAS = "-1.20,37.80,0.32,38.98"     # oeste, sur, este, norte
ACTIVOS = "https://raw.githubusercontent.com/protomaps/basemaps-assets/main"
FUENTES = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"]
RANGOS = ["0-255", "256-511", "512-767", "8192-8447", "11520-11775", "65024-65279"]   # los que pide el mapa de Alicante


def cmd_teselas(args):
    import datetime
    import shutil
    import subprocess
    exe = args.pmtiles or shutil.which("pmtiles")
    if not exe:
        raise SystemExit("No encuentro la herramienta «pmtiles»: descárgala de https://github.com/protomaps/go-pmtiles/releases")
    fecha = args.fecha or (datetime.date.today() - datetime.timedelta(days=1)).strftime("%Y%m%d")
    destino = RAIZ / "mapas"
    destino.mkdir(exist_ok=True)
    subprocess.run([exe, "extract", f"https://build.protomaps.com/{fecha}.pmtiles", str(destino / "alicante.pmtiles"),
                    f"--bbox={CAJA_TESELAS}", "--maxzoom=14"], check=True)
    for fuente in FUENTES:
        (destino / "fuentes" / fuente).mkdir(parents=True, exist_ok=True)
        for rango in RANGOS:
            url = f"{ACTIVOS}/fonts/{urllib.parse.quote(fuente)}/{rango}.pbf"
            (destino / "fuentes" / fuente / f"{rango}.pbf").write_bytes(pedir(url))
    (destino / "fuentes" / "OFL.txt").write_bytes(pedir(f"{ACTIVOS}/fonts/OFL.txt"))
    (destino / "iconos").mkdir(exist_ok=True)
    for nombre in ["light.json", "light.png", "light@2x.json", "light@2x.png"]:
        (destino / "iconos" / nombre).write_bytes(pedir(f"{ACTIVOS}/sprites/v4/{nombre}"))
    (destino / "iconos" / "LICENSE.md").write_bytes(pedir("https://raw.githubusercontent.com/tangrams/icons/master/LICENSE.md"))
    print(f"  mapas/alicante.pmtiles ({(destino / 'alicante.pmtiles').stat().st_size / 1e6:.0f} MB), tipografías e iconos listos")


# ---------------------------------------------------------------- paso 2: fotos

def commons(titulos):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(dict(
        action="query", titles="|".join(titulos), prop="imageinfo|coordinates", iiprop="url|size|extmetadata",
        coprop="type", coprimary="all", format="json"))
    paginas = json.loads(pedir(url))["query"]["pages"].values()
    return {p["title"]: p for p in paginas}


def limpiar_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def cmd_fotos(args):
    from PIL import Image, ImageOps
    destino = RAIZ / "img" / "ubicar"
    destino.mkdir(parents=True, exist_ok=True)
    info = commons([t for t, _, _ in SELECCION])
    fotos = []
    for n, (titulo, lugar, nivel) in enumerate(SELECCION, 1):
        p = info.get(titulo.replace("_", " "))
        if not p or "imageinfo" not in p:
            raise SystemExit(f"No encuentro {titulo} en Commons")
        ii, meta = p["imageinfo"][0], p["imageinfo"][0]["extmetadata"]
        coords = [c for c in p.get("coordinates", []) if c.get("type") == "camera"] or p.get("coordinates", [])
        if not coords:
            raise SystemExit(f"{titulo} no tiene coordenadas")
        print(f"  {n}. {titulo}")
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(pedir(ii["url"])))).convert("RGB")
        img.thumbnail((LADO_FOTO, LADO_FOTO), Image.LANCZOS)
        archivo = f"img/ubicar/foto_{n}.jpg"          # nombre neutro: no revela el lugar
        img.save(RAIZ / archivo, quality=86, optimize=True, progressive=True)   # sin exif=: se descartan los metadatos
        fotos.append(dict(
            id=n, nivel=nivel, lugar=lugar, archivo=archivo, ancho=img.width, alto=img.height,
            lat=round(coords[0]["lat"], 6), lon=round(coords[0]["lon"], 6),
            autor=limpiar_html(meta.get("Artist", {}).get("value")) or "desconocido",
            licencia=meta.get("LicenseShortName", {}).get("value", ""),
            urlLicencia=meta.get("LicenseUrl", {}).get("value", ""),
            fuente=ii["descriptionurl"], titulo=titulo[5:],
        ))
    guardar("fotos.json", fotos)
    escribir_js()


# ---------------------------------------------------------------- paso 3: GeoCLIP

def galeria_provincia(galeria):
    """Puntos de la galería de GeoCLIP ([lat, lon]) que caen dentro de la provincia."""
    mapa = leer("mapa.json")
    if not mapa:
        raise SystemExit("Ejecuta antes el paso «mapa»: hace falta el contorno de la provincia.")
    dentro_prov = [i for i, (lat, lon) in enumerate(galeria.tolist()) if dentro(lon, lat, mapa["provincia"])]
    return galeria[dentro_prov]


def cargar_geoclip(disp):
    from geoclip import GeoCLIP
    return GeoCLIP().to(disp).eval()


def cmd_ia(args):
    """Predicciones de GeoCLIP (en GPU si la hay: el resultado es el mismo que en CPU)."""
    import torch
    fotos = leer("fotos.json")
    if not fotos:
        raise SystemExit("Ejecuta antes el paso «fotos».")

    def predecir(modelo, ruta, galeria, k=5):
        # La galería (puntos candidatos, en [lat, lon]) tiene que estar en el mismo dispositivo que el modelo.
        modelo.gps_gallery = galeria.to(modelo.logit_scale.device)
        gps, prob = modelo.predict(str(ruta), top_k=k)
        return [[round(float(a), 5), round(float(b), 5), round(float(c), 4)] for (a, b), c in zip(gps.tolist(), prob.tolist())]

    modelo = cargar_geoclip("cuda" if torch.cuda.is_available() else "cpu")
    mundo = modelo.gps_gallery.clone().cpu()
    provincia = galeria_provincia(mundo)
    print(f"  galería: {len(mundo)} puntos en el mundo, {len(provincia)} dentro de la provincia")
    anterior = (leer("ia.json") or {}).get("predicciones", {})
    salida = {}
    with torch.no_grad():
        for f in fotos:
            ruta = RAIZ / f["archivo"]
            prov, mun = predecir(modelo, ruta, provincia), predecir(modelo, ruta, mundo)
            salida[str(f["id"])] = {"provincia": prov, "mundo": mun, "ms": anterior.get(str(f["id"]), {}).get("ms")}
            print(f"  foto {f['id']}: provincia {distancia_km(f['lat'], f['lon'], prov[0][0], prov[0][1]):6.1f} km · "
                  f"mundo {distancia_km(f['lat'], f['lon'], mun[0][0], mun[0][1]):7.1f} km   ({f['lugar']})")
    ia = leer("ia.json") or {}
    guardar("ia.json", {**ia, "puntosProvincia": len(provincia), "predicciones": salida})
    print("  (el tiempo de cada foto se mide aparte con el paso «tiempo», con la CPU libre)")
    escribir_js()


def cmd_tiempo(args):
    """Tiempo de GeoCLIP en CPU, como en un ordenador del aula: mediana de 5 ejecuciones tras una de calentamiento.
    Conviene ejecutarlo con el ordenador sin otras tareas pesadas."""
    import platform
    import torch
    ia = leer("ia.json")
    if not ia:
        raise SystemExit("Ejecuta antes el paso «ia».")
    torch.set_num_threads(args.hilos)
    modelo = cargar_geoclip("cpu")
    modelo.gps_gallery = galeria_provincia(modelo.gps_gallery.clone())
    with torch.no_grad():
        for f in leer("fotos.json"):
            ruta = str(RAIZ / f["archivo"])
            modelo.predict(ruta, top_k=1)
            t = []
            for _ in range(5):
                t0 = time.perf_counter()
                modelo.predict(ruta, top_k=1)
                t.append(time.perf_counter() - t0)
            ia["predicciones"][str(f["id"])]["ms"] = round(sorted(t)[2] * 1000, 1)
            print(f"  foto {f['id']}: {sorted(t)[2] * 1000:.0f} ms")
    nombre = platform.processor() or platform.machine()
    try:
        nombre = next(l.split(":", 1)[1].strip() for l in open("/proc/cpuinfo") if l.startswith("model name"))
    except (OSError, StopIteration):
        pass
    ia["dispositivo"] = f"CPU, {args.hilos} hilos ({nombre})"
    guardar("ia.json", ia)
    escribir_js()


def distancia_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    f1, f2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((f2 - f1) / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- salida

def escribir_js():
    mapa, fotos, ia = leer("mapa.json"), leer("fotos.json", []), leer("ia.json")
    if mapa:
        js = ("// Generado por tools/preparar_ubicar.py a partir de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL).\n"
              "window.MAPA_ALICANTE = " + json.dumps(mapa, ensure_ascii=False, separators=(",", ":")) + ";\n")
        (RAIZ / "js" / "mapa_alicante.js").write_text(js, encoding="utf-8")
        print(f"  js/mapa_alicante.js: {len(js) / 1024:.0f} KB")
    imagenes = []
    for f in fotos:
        pred = (ia or {}).get("predicciones", {}).get(str(f["id"]))
        imagenes.append({**f, "ia": pred})
    datos = dict(modelo="GeoCLIP", dispositivoIA=(ia or {}).get("dispositivo", ""),
                 puntosProvincia=(ia or {}).get("puntosProvincia"), imagenes=imagenes)
    js = ("// Generado por tools/preparar_ubicar.py: no editar a mano.\n"
          "window.DATOS_UBICAR = " + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (RAIZ / "js" / "datos_ubicar.js").write_text(js, encoding="utf-8")
    sin_ia = sum(1 for im in imagenes if not im["ia"])
    print(f"  js/datos_ubicar.js: {len(imagenes)} fotos" + (f" ({sin_ia} sin predicción de la IA)" if sin_ia else ""))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("paso", choices=["mapa", "teselas", "fotos", "ia", "tiempo", "js"])
    p.add_argument("--fecha", help="compilación de Protomaps (AAAAMMDD) para el paso «teselas»; por defecto, la de ayer")
    p.add_argument("--pmtiles", help="ruta de la herramienta pmtiles, si no está en el PATH")
    p.add_argument("--hilos", type=int, default=4, help="hilos de CPU para medir el tiempo de GeoCLIP")
    args = p.parse_args()
    {"mapa": cmd_mapa, "teselas": cmd_teselas, "fotos": cmd_fotos, "ia": cmd_ia, "tiempo": cmd_tiempo, "js": lambda a: escribir_js()}[args.paso](args)


if __name__ == "__main__":
    main()
