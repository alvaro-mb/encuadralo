"""Exporta LOCA (Đukić et al., ICCV 2023) a ONNX para tools/preparar_conteo.py.

LOCA es un modelo para contar objetos de cualquier tipo a partir de unas cajas de ejemplo, entrenado con FSC-147.
El juego no lo ejecuta: sus recuentos se calculan sin conexión con preparar_conteo.py y se guardan en
js/datos_conteo.js. Este script solo hace falta para volver a calcularlos.

Preparación:
  git clone https://github.com/djukicn/loca           (código, licencia MIT)
  pesos «few-shot» del README de ese repositorio       (loca_few_shot.pt, 148 MB)
  pip install torch torchvision onnx onnxruntime

Uso:
  python tools/exportar_loca.py --repo RUTA/loca --pesos RUTA/loca_few_shot.pt [--ejemplos 1]

Genera tools/.cache/loca/loca_<ejemplos>.onnx (137 MB) y comprueba que da lo mismo que PyTorch.
  Entradas: imagen [1,3,512,512] (RGB normalizado ImageNet), cajas [1,K,4] (x1,y1,x2,y2 en píxeles de 512).
  Salida:   densidad [1,1,512,512]; el recuento es su suma.
Con 3 ejemplos reproduce el error del artículo en FSC-147: MAE 10,2 (val) y 10,7 (test).

Dos cambios respecto al código original, solo para poder exportar (el resultado es el mismo):
  - la correlación con los prototipos (un conv2d con pesos calculados durante la inferencia, que el exportador
    no admite) se hace con 9 desplazamientos y una suma ponderada;
  - la codificación posicional convierte la máscara a float antes de CumSum (ONNX no lo admite con booleanos).
"""
import argparse
import sys
from pathlib import Path

import torch
from torch import nn

RAIZ = Path(__file__).resolve().parent.parent


def preparar_repo(repo):
    sys.path.insert(0, str(Path(repo).resolve()))
    import models.backbone as bb
    import models.positional_encoding as pe

    # No descargar pesos de ImageNet/SwAV: el archivo de LOCA ya trae toda la red.
    original = bb.Backbone.__init__

    def iniciar(self, name, pretrained, dilation, reduction, swav, requires_grad):
        original(self, name, False, dilation, reduction, False, requires_grad)
    bb.Backbone.__init__ = iniciar

    def codificar_1d(self, mask, dim):
        temp = torch.arange(self.emb_dim // 2).float().to(mask.device)
        temp = self.temperature ** (2 * (temp.div(2, rounding_mode="floor")) / self.emb_dim)
        enc = (~mask).float().cumsum(dim).unsqueeze(-1) / temp
        return torch.stack([enc[..., 0::2].sin(), enc[..., 1::2].cos()], dim=-1).flatten(-2)
    pe.PositionalEncodingsFixed._1d_pos_enc = codificar_1d

    from models.loca import LOCA
    return LOCA


def construir(LOCA, pesos, k):
    m = LOCA(image_size=512, num_encoder_layers=3, num_ope_iterative_steps=3, num_objects=k, emb_dim=256,
             num_heads=8, kernel_dim=3, backbone_name="resnet50", swav_backbone=True, train_backbone=False,
             reduction=8, dropout=0.0, layer_norm_eps=1e-5, mlp_factor=8, norm_first=True,
             activation=nn.GELU, norm=True, zero_shot=False)
    sd = torch.load(pesos, map_location="cpu", weights_only=True)["model"]   # solo tensores: carga segura
    m.load_state_dict({k.replace("module.", ""): v for k, v in sd.items()}, strict=True)
    return m.eval()


class Envoltorio(nn.Module):
    """Mismo cálculo que LOCA.forward (lote de 1), con la correlación exportable. Solo la última cabeza de
    regresión: las auxiliares solo sirven para entrenar."""

    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, imagen, cajas):
        m = self.m
        k, kd, E = m.num_objects, m.kernel_dim, m.emb_dim
        src = m.input_proj(m.backbone(imagen))
        _, _, h, w = src.shape
        pos = m.pos_emb(1, h, w, src.device).flatten(2).permute(2, 0, 1)
        src = src.flatten(2).permute(2, 0, 1)
        f = m.encoder(src, pos, src_key_padding_mask=None, src_mask=None) if m.num_encoder_layers > 0 else src
        f_e = f.permute(1, 2, 0).reshape(1, E, h, w)
        proto = m.ope(f_e, pos, cajas)[-1].reshape(k, kd * kd, E).permute(0, 2, 1)   # [k, E, kd²]
        p = kd // 2
        fp = nn.functional.pad(f_e[0], (p, p, p, p))
        despl = torch.stack([fp[:, i:i + h, j:j + w] for i in range(kd) for j in range(kd)])  # [kd², E, h, w]
        resp = torch.einsum("kes,sehw->kehw", proto, despl).max(dim=0, keepdim=True)[0]
        return m.regression_head(resp)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--repo", required=True, help="carpeta del repositorio djukicn/loca")
    p.add_argument("--pesos", required=True, help="loca_few_shot.pt")
    p.add_argument("--ejemplos", type=int, default=1, help="cajas de ejemplo (el juego usa 1)")
    args = p.parse_args()

    import numpy as np
    import onnxruntime as ort
    original = construir(preparar_repo(args.repo), args.pesos, args.ejemplos)
    m = Envoltorio(original)
    x = torch.randn(1, 3, 512, 512)
    b = torch.tensor([[[100., 120., 140., 170.], [300., 300., 330., 350.], [10., 400., 60., 440.]][:args.ejemplos]])
    with torch.no_grad():
        ref = original(x, b)[0].numpy()
    salida = RAIZ / "tools" / ".cache" / "loca" / f"loca_{args.ejemplos}.onnx"
    salida.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(m, (x, b), salida, input_names=["imagen", "cajas"], output_names=["densidad"],
                      opset_version=17, dynamo=False, do_constant_folding=True)
    out = ort.InferenceSession(str(salida), providers=["CPUExecutionProvider"]).run(None, {"imagen": x.numpy(), "cajas": b.numpy()})[0]
    print(f"{salida} ({salida.stat().st_size / 1e6:.0f} MB): suma PyTorch {ref.sum():.3f}, ONNX {out.sum():.3f}, "
          f"diferencia máxima {np.abs(ref - out).max():.1e}")


if __name__ == "__main__":
    main()
