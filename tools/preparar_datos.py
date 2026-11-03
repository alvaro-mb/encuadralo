"""Prepara las imágenes del juego a partir de COCO val2017 (imágenes etiquetadas por personas).

Dos pasos:
  1) python tools/preparar_datos.py candidatos
     Filtra imágenes de COCO adecuadas para cada grupo de objetos, las descarga, pasa YOLO
     y genera hojas de contacto (cache/candidatos/<grupo>.jpg) para elegirlas a ojo.
  2) python tools/preparar_datos.py construir
     Copia las imágenes de SELECCION a img/ y genera js/datos.js con las etiquetas reales,
     las detecciones de YOLO precalculadas (respaldo si el navegador no puede ejecutar la IA)
     y los créditos de cada foto.

Requiere: numpy, pillow, onnxruntime y models/yolo11n.onnx (ver exportar_modelo.py).
"""
import argparse
import io
import json
import random
import shutil
import time
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
MODELO = RAIZ / "models" / "yolo11n.onnx"
URL_ANOTACIONES = "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"
URL_IMAGEN = "http://images.cocodataset.org/val2017/{:012d}.jpg"

TAM = 640           # entrada de la red
CONF_MIN = 0.25     # detecciones que se guardan (el juego aplica su propio umbral)
CONF_IA = 0.35      # umbral con el que juega la IA (se guarda en datos.js y lo lee js/config.js)
IOU_NMS = 0.5
IOU_ACIERTO = 0.5

# Grupos de objetos que se piden en el juego. "clases" son nombres COCO.
GRUPOS = {
    "pelotas": dict(nombre="PELOTAS Y BALONES", articulo="todas las", emoji="⚽",
                    clases=["sports ball"], pista="Balones, pelotas de tenis, de béisbol... ¡todas cuentan!",
                    min_lado=22, min_area=0.002, max_n=3),
    "coches": dict(nombre="COCHES", articulo="todos los", emoji="🚗",
                   clases=["car"], pista="Solo coches: ni camiones, ni autobuses, ni motos.",
                   min_lado=34, min_area=0.006, max_n=5),
    "personas": dict(nombre="PERSONAS", articulo="todas las", emoji="🧍",
                     clases=["person"], pista="Encuadra a cada persona entera: de la cabeza a los pies (lo que se vea).",
                     min_lado=40, min_area=0.012, max_n=5),
    "animales": dict(nombre="ANIMALES", articulo="todos los", emoji="🐾",
                     clases=["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"],
                     pista="Cualquier animal cuenta. ¡Una caja por animal!",
                     min_lado=36, min_area=0.01, max_n=5),
    "tazas": dict(nombre="TAZAS Y VASOS", articulo="todas las", emoji="☕",
                  clases=["cup"], pista="Tazas, vasos y copas. Las botellas NO cuentan.",
                  min_lado=30, min_area=0.004, max_n=4),
    "bicicletas": dict(nombre="BICICLETAS", articulo="todas las", emoji="🚲",
                       clases=["bicycle"], pista="Encuadra la bici completa, de rueda a rueda.",
                       min_lado=40, min_area=0.01, max_n=4),
    "paraguas": dict(nombre="PARAGUAS", articulo="todos los", emoji="☂️",
                     clases=["umbrella"], pista="Abiertos o cerrados, ¡todos cuentan!",
                     min_lado=36, min_area=0.008, max_n=4),
    "ositos": dict(nombre="OSITOS DE PELUCHE", articulo="todos los", emoji="🧸",
                   clases=["teddy bear"], pista="Peluches de todo tipo. Ajusta bien la caja a cada uno.",
                   min_lado=36, min_area=0.01, max_n=4),
}

# Imágenes elegidas tras revisar las hojas de contacto (2 por grupo: el juego elige una al azar).
SELECCION = {
    "pelotas": [60102, 370375],
    "coches": [157928, 498286],
    "personas": [170613, 473219],
    "animales": [504439, 214753],
    "tazas": [183965, 256518],
    "bicicletas": [426166, 291634],
    "paraguas": [232563, 301867],
    "ositos": [211120, 82180],
}

NOMBRES_ES = [
    "persona", "bicicleta", "coche", "moto", "avión", "autobús", "tren", "camión", "barco", "semáforo",
    "boca de incendios", "señal de stop", "parquímetro", "banco", "pájaro", "gato", "perro", "caballo",
    "oveja", "vaca", "elefante", "oso", "cebra", "jirafa", "mochila", "paraguas", "bolso", "corbata",
    "maleta", "frisbee", "esquís", "snowboard", "pelota", "cometa", "bate", "guante de béisbol",
    "monopatín", "tabla de surf", "raqueta", "botella", "copa de vino", "taza", "tenedor", "cuchillo",
    "cuchara", "cuenco", "plátano", "manzana", "sándwich", "naranja", "brócoli", "zanahoria",
    "perrito caliente", "pizza", "dónut", "tarta", "silla", "sofá", "planta", "cama", "mesa", "váter",
    "televisión", "portátil", "ratón", "mando", "teclado", "móvil", "microondas", "horno", "tostadora",
    "fregadero", "nevera", "libro", "reloj", "jarrón", "tijeras", "osito de peluche", "secador",
    "cepillo de dientes",
]


# ---------------------------------------------------------------- utilidades

def descargar(url, destino):
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    for intento in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                destino.write_bytes(r.read())
            return destino
        except OSError:
            if intento == 3:
                raise
            time.sleep(2 * (intento + 1))


def cargar_coco(cache):
    json_path = cache / "instances_val2017.json"
    if not json_path.exists():
        print("Descargando anotaciones de COCO (~250 MB)...")
        zip_path = descargar(URL_ANOTACIONES, cache / "annotations_trainval2017.zip")
        with zipfile.ZipFile(zip_path) as z:
            json_path.write_bytes(z.read("annotations/instances_val2017.json"))
    return json.loads(json_path.read_text())


def iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def emparejar(pred, gt, umbral=IOU_ACIERTO):
    """Emparejamiento voraz por IoU (el mismo que usa el juego)."""
    pares = sorted(((iou(p, g), i, j) for i, p in enumerate(pred) for j, g in enumerate(gt)), reverse=True)
    usados_p, usados_g, aciertos = set(), set(), []
    for v, i, j in pares:
        if v < umbral:
            break
        if i in usados_p or j in usados_g:
            continue
        usados_p.add(i)
        usados_g.add(j)
        aciertos.append((i, j, v))
    return aciertos


# ---------------------------------------------------------------- YOLO

class Detector:
    def __init__(self):
        self.sesion = ort.InferenceSession(str(MODELO), providers=["CPUExecutionProvider"])
        self.entrada = self.sesion.get_inputs()[0].name
        self.sesion.run(None, {self.entrada: np.zeros((1, 3, TAM, TAM), np.float32)})

    def detectar(self, img):
        t0 = time.perf_counter()
        w, h = img.size
        s = min(TAM / w, TAM / h)
        nw, nh = round(w * s), round(h * s)
        dx, dy = (TAM - nw) // 2, (TAM - nh) // 2
        lienzo = Image.new("RGB", (TAM, TAM), (114, 114, 114))
        lienzo.paste(img.convert("RGB").resize((nw, nh), Image.BILINEAR), (dx, dy))
        x = np.asarray(lienzo, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        salida = self.sesion.run(None, {self.entrada: x})[0][0]  # (84, 8400)
        dets = postprocesar(salida, s, dx, dy, w, h)
        return dets, (time.perf_counter() - t0) * 1000


def postprocesar(salida, s, dx, dy, w, h):
    puntos = salida[4:]
    clases = puntos.argmax(0)
    confs = puntos.max(0)
    idx = np.where(confs >= CONF_MIN)[0]
    idx = idx[np.argsort(-confs[idx])]
    elegidas = []
    for i in idx:
        cx, cy, bw, bh = (float(v) for v in salida[:4, i])
        caja = [cx - bw / 2, cy - bh / 2, bw, bh]
        if any(c == clases[i] and iou(caja, k) > IOU_NMS for c, _, k in elegidas):
            continue
        elegidas.append((clases[i], confs[i], caja))
    dets = []
    for c, conf, (x, y, bw, bh) in elegidas:
        x1 = max(0.0, (x - dx) / s)
        y1 = max(0.0, (y - dy) / s)
        x2 = min(float(w), (x + bw - dx) / s)
        y2 = min(float(h), (y + bh - dy) / s)
        dets.append([int(c), round(float(conf), 3), round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)])
    return dets


# ---------------------------------------------------------------- paso 1: candidatos

def preparar_indices(coco):
    nombres = {c["id"]: c["name"] for c in coco["categories"]}
    imagenes = {im["id"]: im for im in coco["images"]}
    anots = {}
    for a in coco["annotations"]:
        anots.setdefault(a["image_id"], []).append(a)
    return nombres, imagenes, anots


def objetivos(grupo, im, anots_img, nombres):
    """Devuelve las anotaciones objetivo si la imagen sirve para el grupo, o None."""
    cfg = GRUPOS[grupo]
    obj = [a for a in anots_img if nombres[a["category_id"]] in cfg["clases"]]
    if not (1 <= len(obj) <= cfg["max_n"]) or any(a["iscrowd"] for a in obj):
        return None
    area_img = im["width"] * im["height"]
    for a in obj:
        x, y, w, h = a["bbox"]
        if min(w, h) < cfg["min_lado"] or w * h < cfg["min_area"] * area_img:
            return None
    for i in range(len(obj)):
        for j in range(i + 1, len(obj)):
            if iou(obj[i]["bbox"], obj[j]["bbox"]) > 0.35:
                return None
    return obj


def evaluar_ia(dets, gt, grupo, nombres_yolo):
    clases = GRUPOS[grupo]["clases"]
    pred = [d[2:] for d in dets if d[1] >= CONF_IA and nombres_yolo[d[0]] in clases]
    aciertos = emparejar(pred, gt)
    sospechosas = [d for d in dets if nombres_yolo[d[0]] in clases and d[1] >= 0.35
                   and max((iou(d[2:], g) for g in gt), default=0) < 0.3]
    return dict(tp=len(aciertos), fp=len(pred) - len(aciertos), fn=len(gt) - len(aciertos),
                iou=round(float(np.mean([v for _, _, v in aciertos])), 3) if aciertos else 0.0,
                sospechosas=len(sospechosas))


def hoja_contacto(grupo, items, cache, nombres_yolo):
    ancho, cols = 360, 5
    miniaturas = []
    for it in items:
        img = Image.open(cache / "img" / f"{it['id']}.jpg").convert("RGB")
        dib = ImageDraw.Draw(img)
        for g in it["gt"]:
            dib.rectangle([g[0], g[1], g[0] + g[2], g[1] + g[3]], outline=(0, 255, 0), width=4)
        for d in it["dets"]:
            if d[1] >= CONF_MIN and nombres_yolo[d[0]] in GRUPOS[grupo]["clases"]:
                color = (255, 40, 40) if d[1] >= CONF_IA else (255, 170, 0)
                dib.rectangle([d[2], d[3], d[2] + d[4], d[3] + d[5]], outline=color, width=2)
        e = it["eval"]
        txt = f"{it['id']} n={len(it['gt'])} tp{e['tp']} fp{e['fp']} fn{e['fn']} iou{e['iou']:.2f} sos{e['sospechosas']}"
        img.thumbnail((ancho, ancho))
        lienzo = Image.new("RGB", (ancho, ancho + 22), (20, 20, 20))
        lienzo.paste(img, (0, 22))
        ImageDraw.Draw(lienzo).text((4, 4), txt, fill=(255, 255, 255))
        miniaturas.append(lienzo)
    filas = (len(miniaturas) + cols - 1) // cols
    hoja = Image.new("RGB", (cols * ancho, max(1, filas) * (ancho + 22)), (0, 0, 0))
    for k, m in enumerate(miniaturas):
        hoja.paste(m, ((k % cols) * ancho, (k // cols) * (ancho + 22)))
    destino = cache / "candidatos" / f"{grupo}.jpg"
    destino.parent.mkdir(parents=True, exist_ok=True)
    hoja.save(destino, quality=85)
    return destino


def cmd_candidatos(args):
    cache = Path(args.cache)
    coco = cargar_coco(cache)
    nombres, imagenes, anots = preparar_indices(coco)
    nombres_yolo = [c["name"] for c in sorted(coco["categories"], key=lambda c: c["id"])]
    detector = Detector()
    rng = random.Random(args.semilla)
    resumen = {}
    grupos = args.grupos.split(",") if args.grupos else list(GRUPOS)
    for grupo in grupos:
        validas = []
        for im_id, im in imagenes.items():
            obj = objetivos(grupo, im, anots.get(im_id, []), nombres)
            if obj:
                validas.append((im_id, obj))
        rng.shuffle(validas)
        items = []
        for im_id, obj in validas[: args.por_grupo]:
            ruta = descargar(URL_IMAGEN.format(im_id), cache / "img" / f"{im_id}.jpg")
            dets, _ = detector.detectar(Image.open(ruta))
            gt = [a["bbox"] for a in obj]
            items.append(dict(id=im_id, gt=gt, dets=dets, eval=evaluar_ia(dets, gt, grupo, nombres_yolo)))
        items.sort(key=lambda it: (it["eval"]["sospechosas"] > 0, -it["eval"]["fn"]))
        hoja = hoja_contacto(grupo, items, cache, nombres_yolo)
        resumen[grupo] = items
        print(f"{grupo:<11} {len(validas):4d} válidas, {len(items)} revisadas -> {hoja}")
    (cache / "candidatos.json").write_text(json.dumps(resumen))


# ---------------------------------------------------------------- paso 2: construir

def cmd_construir(args):
    cache = Path(args.cache)
    coco = cargar_coco(cache)
    nombres, imagenes, anots = preparar_indices(coco)
    nombres_yolo = [c["name"] for c in sorted(coco["categories"], key=lambda c: c["id"])]
    licencias = {l["id"]: l for l in coco["licenses"]}
    detector = Detector()
    destino_img = RAIZ / "img"
    destino_img.mkdir(exist_ok=True)

    salida = []
    for grupo, ids in SELECCION.items():
        for im_id in ids:
            im = imagenes[im_id]
            obj = objetivos(grupo, im, anots.get(im_id, []), nombres)
            if obj is None:
                raise SystemExit(f"La imagen {im_id} no cumple los requisitos del grupo {grupo}")
            ruta = descargar(URL_IMAGEN.format(im_id), cache / "img" / f"{im_id}.jpg")
            archivo = f"{grupo}_{im_id}.jpg"
            shutil.copy(ruta, destino_img / archivo)
            img = Image.open(ruta)
            dets, _ = detector.detectar(img)
            tiempos = [detector.detectar(img)[1] for _ in range(5)]
            lic = licencias[im["license"]]
            salida.append(dict(
                id=im_id, grupo=grupo, archivo=f"img/{archivo}", ancho=im["width"], alto=im["height"],
                gt=[[round(v, 1) for v in a["bbox"]] for a in obj],
                ia=dict(ms=round(float(np.median(tiempos)), 1), detecciones=dets),
                credito=dict(licencia=lic["name"], licenciaUrl=lic["url"], foto=im.get("flickr_url", "")),
            ))
            e = evaluar_ia(dets, [a["bbox"] for a in obj], grupo, nombres_yolo)
            print(f"{grupo:<11} {im_id:>7}  n={len(obj)}  IA: tp{e['tp']} fp{e['fp']} fn{e['fn']} iou{e['iou']:.2f}")

    grupos_js = {k: {c: v[c] for c in ("nombre", "articulo", "emoji", "clases", "pista")} for k, v in GRUPOS.items()}
    datos = dict(fuente="COCO val2017", modelo="YOLO11n", confIA=CONF_IA,
                 clases=nombres_yolo, clasesES=NOMBRES_ES, grupos=grupos_js, imagenes=salida)
    js = ("// Generado por tools/preparar_datos.py: no editar a mano.\n"
          "window.DATOS_JUEGO = " + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (RAIZ / "js" / "datos.js").write_text(js, encoding="utf-8")
    print(f"{len(salida)} imágenes -> js/datos.js")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("paso", choices=["candidatos", "construir"])
    p.add_argument("--cache", default=str(RAIZ / "tools" / ".cache"))
    p.add_argument("--por-grupo", type=int, default=30)
    p.add_argument("--grupos", default="", help="lista separada por comas (por defecto, todos)")
    p.add_argument("--semilla", type=int, default=7)
    args = p.parse_args()
    {"candidatos": cmd_candidatos, "construir": cmd_construir}[args.paso](args)


if __name__ == "__main__":
    main()
