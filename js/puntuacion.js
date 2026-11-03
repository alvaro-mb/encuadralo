// IoU, emparejamiento de cajas y cálculo de puntos. Las cajas son [x, y, ancho, alto] en píxeles de la imagen.
const Puntuacion = (() => {
  function iou(a, b) {
    const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    const inter = iw * ih;
    const union = a[2] * a[3] + b[2] * b[3] - inter;
    return union > 0 ? inter / union : 0;
  }

  // Emparejamiento voraz: primero las parejas con mayor IoU. Cada caja y cada objeto se usan una sola vez.
  function emparejar(pred, gt, umbral) {
    const pares = [];
    pred.forEach((p, i) => gt.forEach((g, j) => {
      const v = iou(p, g);
      if (v >= umbral) pares.push([v, i, j]);
    }));
    pares.sort((x, y) => y[0] - x[0]);
    const usadasP = new Set(), usadasG = new Set(), aciertos = [];
    for (const [v, i, j] of pares) {
      if (usadasP.has(i) || usadasG.has(j)) continue;
      usadasP.add(i);
      usadasG.add(j);
      aciertos.push({ p: i, g: j, iou: v });
    }
    return {
      aciertos,
      fp: pred.map((_, i) => i).filter(i => !usadasP.has(i)),
      fn: gt.map((_, j) => j).filter(j => !usadasG.has(j)),
    };
  }

  function calcular(pred, gt, segundos, limite) {
    const C = window.CONFIG;
    const { aciertos, fp, fn } = emparejar(pred, gt, C.iouAcierto);
    aciertos.forEach(a => { a.puntos = Math.round(a.iou * C.puntosPorIoU); });
    const puntosAciertos = aciertos.reduce((s, a) => s + a.puntos, 0);
    const penalFP = fp.length * C.penalizacionFP;
    const penalFN = fn.length * C.penalizacionFN;
    const fraccion = gt.length ? aciertos.length / gt.length : 0;
    const bonus = Math.round(C.bonusTiempoMax * Math.max(0, 1 - segundos / limite) * fraccion);
    const bruto = puntosAciertos - penalFP - penalFN + bonus;
    return {
      aciertos, fp, fn, puntosAciertos, penalFP, penalFN, bonus, bruto,
      total: Math.max(0, bruto),
      iouMedio: aciertos.length ? aciertos.reduce((s, a) => s + a.iou, 0) / aciertos.length : 0,
      segundos, nGT: gt.length, nPred: pred.length,
    };
  }

  return { iou, emparejar, calcular };
})();
