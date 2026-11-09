"""Prepara las imágenes del juego «¡Cuéntalos!» a partir de FSC-147 (recuento de objetos).

FSC-147 (Ranjan et al., CVPR 2021) tiene 6146 imágenes con un punto por objeto y 3 cajas de ejemplo
(«exemplars») por imagen. Solo se usan clases que también existen en COCO, para poder comparar con YOLO11n.

La IA del juego es LOCA (Đukić et al., ICCV 2023), un modelo especializado en contar entrenado con FSC-147. Igual
que GeoCLIP en ¡Ubícalo!, se ejecuta aquí, sin conexión: el juego solo muestra su recuento y su tiempo. Por eso
solo se pueden usar imágenes de las particiones val y test (LOCA nunca las vio al entrenar), nunca de train.

Preparación (una sola vez):
  - Anotaciones: se descargan solas desde GitHub (cvlab-stonybrook/LearningToCountEverything).
  - Imágenes: descarga images_384_VarV2 desde el enlace de Google Drive del README de ese repositorio
    (o `gdown 1ymDYrGs9DSRicfZbSCDiOu0ikGDh5k6S`) y descomprímelo dentro de --fsc.

Dos pasos:
  1) python tools/preparar_conteo.py candidatos --fsc RUTA
     Filtra las imágenes por clase y nivel (fuera de train), les pasa YOLO y genera hojas de contacto en
     tools/.cache/conteo/<nivel>.jpg para elegirlas a ojo.
  2) python tools/preparar_conteo.py construir --fsc RUTA [--loca tools/.cache/loca/loca_1.onnx] [--hilos 4]
     Copia las imágenes de SELECCION a img/conteo/ y genera js/datos_conteo.js con el recuento real, una caja
     de ejemplo y los resultados de las IA: LOCA (recuento, un punto por objeto para la animación y el tiempo
     en CPU) y YOLO11n (recuento, para comparar). LOCA recibe la misma caja de ejemplo que ve el alumno.

Requiere: numpy, pillow, onnxruntime, models/yolo11n.onnx y el modelo LOCA exportado a ONNX con
tools/exportar_loca.py (no se incluye en el juego: pesa 137 MB y solo hace falta aquí).
"""
import argparse
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from preparar_datos import CONF_IA, NOMBRES_ES, Detector  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
URL_ANOT = "https://raw.githubusercontent.com/cvlab-stonybrook/LearningToCountEverything/master/data/"
ARCHIVOS_ANOT = ["annotation_FSC147_384.json", "ImageClasses_FSC147.txt", "Train_Test_Val_FSC_147.json"]
LOCA_ONNX = RAIZ / "tools" / ".cache" / "loca" / "loca_1.onnx"

# Niveles de dificultad por número de objetos reales.
NIVELES = {
    "facil": dict(nombre="FÁCIL", min=3, max=10),
    "medio": dict(nombre="MEDIO", min=11, max=30),
    "dificil": dict(nombre="DIFÍCIL", min=31, max=50),
    "extremo": dict(nombre="EXTREMO", min=100, max=400),
}

# Clase de FSC-147 → (clase COCO que busca YOLO, nombre en plural para el juego, emoji).
CLASES = {
    "apples": ("apple", "MANZANAS", "🍎"),
    "oranges": ("orange", "NARANJAS", "🍊"),
    "bananas": ("banana", "PLÁTANOS", "🍌"),
    "donuts tray": ("donut", "DÓNUTS", "🍩"),
    "geese": ("bird", "GANSOS", "🪿"),
    "pigeons": ("bird", "PALOMAS", "🐦"),
    "flamingos": ("bird", "FLAMENCOS", "🦩"),
    "birds": ("bird", "PÁJAROS", "🐦"),
    "seagulls": ("bird", "GAVIOTAS", "🐦"),
    "crows": ("bird", "CUERVOS", "🐦‍⬛"),
    "cranes": ("bird", "GRULLAS", "🐦"),
    "penguins": ("bird", "PINGÜINOS", "🐧"),
    "swans": ("bird", "CISNES", "🦢"),
    "sheep": ("sheep", "OVEJAS", "🐑"),
    "cows": ("cow", "VACAS", "🐄"),
    "horses": ("horse", "CABALLOS", "🐎"),
    "elephants": ("elephant", "ELEFANTES", "🐘"),
    "zebras": ("zebra", "CEBRAS", "🦓"),
    "people": ("person", "PERSONAS", "🧍"),
    "cars": ("car", "COCHES", "🚗"),
    "boats": ("boat", "BARCOS", "⛵"),
    "chairs": ("chair", "SILLAS", "🪑"),
    "books": ("book", "LIBROS", "📚"),
    "comic books": ("book", "CÓMICS", "📚"),
    "cups": ("cup", "TAZAS", "☕"),
    "bowls": ("bowl", "CUENCOS", "🥣"),
    "alcohol bottles": ("bottle", "BOTELLAS", "🍾"),
    "sauce bottles": ("bottle", "BOTELLAS", "🍾"),
    "bottles": ("bottle", "BOTELLAS", "🍾"),
    "balls": ("sports ball", "PELOTAS", "⚽"),
    "skateboard": ("skateboard", "MONOPATINES", "🛹"),
    "skis": ("skis", "ESQUÍS", "🎿"),
    "spoon": ("spoon", "CUCHARAS", "🥄"),
}

# Nombres femeninos (para escribir «todas las» en lugar de «todos los»).
FEMENINOS = {"MANZANAS", "NARANJAS", "PALOMAS", "GAVIOTAS", "GRULLAS", "OVEJAS", "VACAS", "CEBRAS", "PERSONAS",
             "SILLAS", "TAZAS", "BOTELLAS", "PELOTAS", "CUCHARAS"}

# Imágenes elegidas tras revisar las hojas de contacto (nombre de archivo de FSC-147 sin .jpg).
SELECCION = {
    "facil": ["962", "3758", "2411", "6274", "917", "4733", "4563", "774", "757"],
    "medio": ["5202", "4539", "1881", "6251", "7398", "615", "6742", "2406", "4493"],
    "dificil": ["7598", "5225", "7542", "6276", "6078", "7418", "2820", "604", "919"],
    "extremo": ["6809", "7371", "7615"],
}


# ---------------------------------------------------------------- datos

def cargar_fsc(fsc):
    fsc = Path(fsc)
    for nombre in ARCHIVOS_ANOT:
        ruta = fsc / nombre
        if not ruta.exists():
            print(f"Descargando {nombre}...")
            fsc.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(URL_ANOT + nombre, timeout=120) as r:
                ruta.write_bytes(r.read())
    anot = json.loads((fsc / "annotation_FSC147_384.json").read_text())
    clases = dict(l.rstrip("\n").split("\t") for l in (fsc / "ImageClasses_FSC147.txt").read_text().splitlines() if l.strip())
    carpeta = fsc / "images_384_VarV2"
    if not carpeta.is_dir():
        raise SystemExit(f"No encuentro {carpeta}: descarga y descomprime las imágenes de FSC-147 (ver la ayuda).")
    entreno = set(json.loads((fsc / "Train_Test_Val_FSC_147.json").read_text())["train"])
    return anot, clases, carpeta, entreno


def nivel_de(n):
    return next((k for k, v in NIVELES.items() if v["min"] <= n <= v["max"]), None)


def caja_ejemplo(a, img_w, img_h):
    """Primera caja de ejemplo de FSC-147, como [x, y, ancho, alto] dentro de la imagen."""
    pts = np.array(a["box_examples_coordinates"][0], dtype=float)
    x1, y1 = np.clip(pts.min(0), 0, [img_w, img_h])
    x2, y2 = np.clip(pts.max(0), 0, [img_w, img_h])
    return [round(float(x1), 1), round(float(y1), 1), round(float(x2 - x1), 1), round(float(y2 - y1), 1)]


class Loca:
    """LOCA (few-shot) exportado a ONNX con una caja de ejemplo: devuelve el mapa de densidad (suma = recuento)."""
    LADO = 512
    MEDIA = np.array([0.485, 0.456, 0.406], np.float32)[:, None, None]
    DESV = np.array([0.229, 0.224, 0.225], np.float32)[:, None, None]

    def __init__(self, ruta, hilos=4):
        import onnxruntime as ort
        if not Path(ruta).exists():
            raise SystemExit(f"No encuentro {ruta}: expórtalo con tools/exportar_loca.py (ver su ayuda).")
        opciones = ort.SessionOptions()
        opciones.intra_op_num_threads = hilos
        self.sesion = ort.InferenceSession(str(ruta), opciones, providers=["CPUExecutionProvider"])

    def densidad(self, img, ejemplo):
        """img: PIL; ejemplo: [x, y, ancho, alto] en píxeles de la imagen. Devuelve (densidad 512×512, ms)."""
        t0 = time.perf_counter()
        w, h = img.size
        x = np.asarray(img.convert("RGB").resize((self.LADO, self.LADO), Image.BILINEAR), np.float32).transpose(2, 0, 1) / 255
        x = ((x - self.MEDIA) / self.DESV)[None]
        ex, ey, ew, eh = ejemplo
        k = np.array([self.LADO / w, self.LADO / h, self.LADO / w, self.LADO / h], np.float32)
        cajas = (np.array([[[ex, ey, ex + ew, ey + eh]]], np.float32) * k)
        d = self.sesion.run(None, {"imagen": x, "cajas": cajas})[0][0, 0]
        return d, (time.perf_counter() - t0) * 1000


def puntos_densidad(d, n, ejemplo, w, h):
    """Un punto por objeto a partir del mapa de densidad: se toma el máximo, se borra un círculo del tamaño de
    medio objeto a su alrededor y se repite n veces. Solo sirve para la animación; el recuento es la suma."""
    lado = d.shape[0]
    radio = max(2.0, 0.4 * min(ejemplo[2] * lado / w, ejemplo[3] * lado / h))
    # Suavizado ligero (caja de 5×5) para que cada objeto tenga un único máximo.
    acum = np.pad(np.maximum(d, 0), 2).cumsum(0).cumsum(1)
    acum = np.pad(acum, ((1, 0), (1, 0)))
    suave = acum[5:, 5:] - acum[:-5, 5:] - acum[5:, :-5] + acum[:-5, :-5]
    yy, xx = np.mgrid[0:lado, 0:lado]
    puntos = []
    for _ in range(n):
        i = int(suave.argmax())
        y, x = divmod(i, lado)
        if suave[y, x] <= 0:
            break
        puntos.append([round((x + 0.5) * w / lado, 1), round((y + 0.5) * h / lado, 1)])
        suave[(xx - x) ** 2 + (yy - y) ** 2 <= radio ** 2] = 0
    return puntos


def recuento_ia(dets, clase_coco, nombres_yolo, conf=CONF_IA):
    return sum(1 for d in dets if d[1] >= conf and nombres_yolo[d[0]] == clase_coco)


# ---------------------------------------------------------------- paso 1: candidatos

def hoja_contacto(nivel, items, destino):
    ancho, cols, cab = 300, 6, 30
    miniaturas = []
    for it in items:
        img = Image.open(it["ruta"]).convert("RGB")
        dib = ImageDraw.Draw(img)
        x, y, w, h = it["ejemplo"]
        dib.rectangle([x, y, x + w, y + h], outline=(0, 255, 0), width=3)
        img.thumbnail((ancho, ancho))
        lienzo = Image.new("RGB", (ancho, ancho + cab), (20, 20, 20))
        lienzo.paste(img, (0, cab))
        d = ImageDraw.Draw(lienzo)
        d.text((4, 2), f"{it['id']} {it['clase']}", fill=(255, 255, 255))
        d.text((4, 15), f"real={it['n']}  IA={it['ia']}  {it['ancho']}x{it['alto']}", fill=(255, 220, 0))
        miniaturas.append(lienzo)
    filas = (len(miniaturas) + cols - 1) // cols
    hoja = Image.new("RGB", (cols * ancho, max(1, filas) * (ancho + cab)), (0, 0, 0))
    for k, m in enumerate(miniaturas):
        hoja.paste(m, ((k % cols) * ancho, (k // cols) * (ancho + cab)))
    destino.parent.mkdir(parents=True, exist_ok=True)
    hoja.save(destino, quality=88)


def cmd_candidatos(args):
    anot, clases, carpeta, entreno = cargar_fsc(args.fsc)
    nombres_yolo = json.loads((RAIZ / "js" / "datos.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip().rstrip(";"))["clases"]
    detector = Detector()
    por_nivel = {k: [] for k in NIVELES}
    for archivo, a in sorted(anot.items(), key=lambda kv: int(kv[0].split(".")[0])):
        clase = clases.get(archivo)
        nivel = nivel_de(len(a["points"]))
        if clase not in CLASES or nivel is None or archivo in entreno:
            continue
        ruta = carpeta / archivo
        img = Image.open(ruta)
        dets, _ = detector.detectar(img)
        por_nivel[nivel].append(dict(
            id=archivo[:-4], clase=clase, n=len(a["points"]), ruta=ruta, ancho=img.width, alto=img.height,
            ejemplo=caja_ejemplo(a, img.width, img.height), ia=recuento_ia(dets, CLASES[clase][0], nombres_yolo)))
    resumen = {}
    for nivel, items in por_nivel.items():
        items.sort(key=lambda it: (it["clase"], it["n"]))
        for parte in range(0, len(items), args.por_hoja):
            hoja_contacto(nivel, items[parte:parte + args.por_hoja], Path(args.cache) / f"{nivel}_{parte // args.por_hoja + 1}.jpg")
        resumen[nivel] = [{k: v for k, v in it.items() if k != "ruta"} for it in items]
        print(f"{nivel:<8} {len(items):4d} candidatas")
    (Path(args.cache) / "candidatos.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1))


# ---------------------------------------------------------------- paso 2: construir

def cmd_construir(args):
    import platform
    anot, clases, carpeta, entreno = cargar_fsc(args.fsc)
    nombres_yolo = json.loads((RAIZ / "js" / "datos.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip().rstrip(";"))["clases"]
    detector = Detector()
    loca = Loca(args.loca, args.hilos)
    destino = RAIZ / "img" / "conteo"
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)

    salida = []
    for nivel, ids in SELECCION.items():
        for im_id in ids:
            archivo = f"{im_id}.jpg"
            a, clase = anot[archivo], clases[archivo]
            n = len(a["points"])
            if clase not in CLASES or nivel_de(n) != nivel:
                raise SystemExit(f"La imagen {im_id} ({clase}, {n} objetos) no encaja en el nivel {nivel}")
            if archivo in entreno:
                raise SystemExit(f"La imagen {im_id} es de la partición train: LOCA la vio al entrenar")
            coco, nombre, emoji = CLASES[clase]
            ruta = carpeta / archivo
            img = Image.open(ruta).convert("RGB")
            ejemplo = caja_ejemplo(a, img.width, img.height)

            # LOCA: la misma caja de ejemplo que ve el alumno. Tiempo: mediana de 5 tras una de calentamiento.
            d, _ = loca.densidad(img, ejemplo)
            tiempos = [loca.densidad(img, ejemplo)[1] for _ in range(5)]
            conteo = float(d.sum())
            puntos_ia = puntos_densidad(d, int(round(conteo)), ejemplo, img.width, img.height)

            # YOLO11n, solo para comparar: cuántos objetos de la clase detecta.
            dets, _ = detector.detectar(img)
            yolo = recuento_ia(dets, coco, nombres_yolo)

            final = f"{nivel}_{coco.replace(' ', '')}_{im_id}.jpg"
            shutil.copy(ruta, destino / final)
            salida.append(dict(
                id=int(im_id), nivel=nivel, claseFSC=clase, clase=coco, nombre=nombre, emoji=emoji,
                articulo="las" if nombre in FEMENINOS else "los",
                archivo=f"img/conteo/{final}", ancho=img.width, alto=img.height, real=n,
                ejemplo=ejemplo, puntos=[[round(x, 1), round(y, 1)] for x, y in a["points"]],
                ia=dict(respuesta=int(round(conteo)), conteo=round(conteo, 1), ms=round(float(np.median(tiempos)), 1), puntos=puntos_ia),
                yolo=dict(respuesta=yolo),
            ))
            print(f"{nivel:<8} {im_id:>5}  {clase:<16} real={n:<4} LOCA={conteo:6.1f} ({np.median(tiempos):4.0f} ms)  YOLO={yolo}")

    try:
        cpu = next(l.split(":", 1)[1].strip() for l in open("/proc/cpuinfo") if l.startswith("model name"))
    except (OSError, StopIteration):
        cpu = platform.processor() or platform.machine()
    datos = dict(fuente="FSC-147", modelo="LOCA", dispositivoIA=f"CPU, {args.hilos} hilos ({cpu})",
                 niveles={k: v["nombre"] for k, v in NIVELES.items()}, imagenes=salida)
    js = ("// Generado por tools/preparar_conteo.py: no editar a mano.\n"
          "window.DATOS_CONTEO = " + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (RAIZ / "js" / "datos_conteo.js").write_text(js, encoding="utf-8")
    print(f"{len(salida)} imágenes -> js/datos_conteo.js")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("paso", choices=["candidatos", "construir"])
    p.add_argument("--fsc", default=str(RAIZ / "tools" / ".cache" / "fsc147"), help="carpeta con FSC-147")
    p.add_argument("--cache", default=str(RAIZ / "tools" / ".cache" / "conteo"))
    p.add_argument("--por-hoja", type=int, default=48)
    p.add_argument("--loca", default=str(LOCA_ONNX), help="modelo LOCA en ONNX (de tools/exportar_loca.py)")
    p.add_argument("--hilos", type=int, default=4, help="hilos de CPU para LOCA (y para medir su tiempo)")
    args = p.parse_args()
    {"candidatos": cmd_candidatos, "construir": cmd_construir}[args.paso](args)


if __name__ == "__main__":
    main()
