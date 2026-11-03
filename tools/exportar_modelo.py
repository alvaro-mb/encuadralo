"""Exporta YOLO11n (preentrenado en COCO) a ONNX para usarlo en el navegador.

Requiere: pip install ultralytics onnx onnxslim
Uso:      python tools/exportar_modelo.py
Salida:   models/yolo11n.onnx  (entrada 1x3x640x640, salida 1x84x8400)
"""
import shutil
from pathlib import Path

from ultralytics import YOLO

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "models" / "yolo11n.onnx"


def main():
    modelo = YOLO("yolo11n.pt")
    ruta = modelo.export(format="onnx", imgsz=640, opset=12, simplify=True, dynamic=False)
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(ruta, DESTINO)
    print(f"Modelo exportado a {DESTINO}")


if __name__ == "__main__":
    main()
