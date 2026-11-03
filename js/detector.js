// YOLO11n ejecutándose en el navegador con ONNX Runtime Web (WebAssembly).
// Si no se puede (página abierta sin servidor, navegador antiguo...), usa las detecciones pregrabadas de datos.js.
const Detector = (() => {
  const TAM = 640;
  let sesion = null;
  let listo = Promise.resolve();
  const api = { modo: 'cargando', descripcion: '' };
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = TAM;

  async function descargar(url, alProgresar) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} al descargar ${url}`);
    const total = Number(resp.headers.get('Content-Length')) || 0;
    if (!resp.body || !total) return new Uint8Array(await resp.arrayBuffer());
    const lector = resp.body.getReader(), trozos = [];
    let recibido = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value);
      recibido += value.length;
      alProgresar(Math.min(1, recibido / total));
    }
    const datos = new Uint8Array(recibido);
    let pos = 0;
    for (const t of trozos) { datos.set(t, pos); pos += t.length; }
    return datos;
  }

  api.iniciar = function (alProgresar = () => {}) {
    listo = (async () => {
      if (location.protocol === 'file:') throw new Error('página abierta sin servidor');
      if (typeof ort === 'undefined') throw new Error('ONNX Runtime no disponible');
      const hilos = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
      ort.env.wasm.numThreads = hilos;
      const modelo = await descargar(window.CONFIG.modelo, alProgresar);
      alProgresar(1);
      sesion = await ort.InferenceSession.create(modelo, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      // La primera ejecución es más lenta: la hacemos ya para que el tiempo medido en el juego sea el real.
      const vacio = new ort.Tensor('float32', new Float32Array(3 * TAM * TAM), [1, 3, TAM, TAM]);
      await sesion.run({ [sesion.inputNames[0]]: vacio });
      api.modo = 'real';
      api.descripcion = `WebAssembly · ${hilos} ${hilos > 1 ? 'hilos' : 'hilo'}`;
    })().catch(err => {
      console.warn('IA en modo pregrabado:', err);
      api.modo = 'pregrabado';
      api.descripcion = 'resultados pregrabados';
    });
    return listo;
  };

  // Mismo preprocesado que Ultralytics: letterbox a 640×640 con relleno gris (114), RGB normalizado a [0, 1].
  function preprocesar(img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(TAM / w, TAM / h);
    const nw = Math.round(w * s), nh = Math.round(h * s);
    const dx = Math.floor((TAM - nw) / 2), dy = Math.floor((TAM - nh) / 2);
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, TAM, TAM);
    ctx.drawImage(img, dx, dy, nw, nh);
    const px = ctx.getImageData(0, 0, TAM, TAM).data;
    const area = TAM * TAM, entrada = new Float32Array(3 * area);
    for (let i = 0, j = 0; i < area; i++, j += 4) {
      entrada[i] = px[j] / 255;
      entrada[i + area] = px[j + 1] / 255;
      entrada[i + 2 * area] = px[j + 2] / 255;
    }
    return { entrada, s, dx, dy, w, h };
  }

  // Salida de YOLO11: [1, 84, 8400] → por cada ancla: cx, cy, ancho, alto y 80 puntuaciones de clase.
  function postprocesar(datos, { s, dx, dy, w, h }) {
    const N = datos.length / 84, confMin = 0.25, candidatas = [];
    for (let i = 0; i < N; i++) {
      let mejor = 0, clase = -1;
      for (let c = 0; c < 80; c++) {
        const v = datos[(4 + c) * N + i];
        if (v > mejor) { mejor = v; clase = c; }
      }
      if (mejor < confMin) continue;
      const bw = datos[2 * N + i], bh = datos[3 * N + i];
      candidatas.push({ clase, conf: mejor, caja: [datos[i] - bw / 2, datos[N + i] - bh / 2, bw, bh] });
    }
    candidatas.sort((a, b) => b.conf - a.conf);
    const elegidas = [];
    for (const c of candidatas) {
      if (elegidas.some(e => e.clase === c.clase && Puntuacion.iou(e.caja, c.caja) > window.CONFIG.iouNMS)) continue;
      elegidas.push(c);
    }
    return elegidas.map(({ clase, conf, caja: [x, y, bw, bh] }) => {
      const x1 = Math.max(0, (x - dx) / s), y1 = Math.max(0, (y - dy) / s);
      const x2 = Math.min(w, (x + bw - dx) / s), y2 = Math.min(h, (y + bh - dy) / s);
      return [clase, conf, x1, y1, x2 - x1, y2 - y1];
    });
  }

  // Devuelve { detecciones: [[clase, conf, x, y, ancho, alto], ...], ms, real }
  api.detectar = async function (img, respaldo) {
    await listo;
    if (api.modo === 'real') {
      try {
        const t0 = performance.now();
        const pre = preprocesar(img);
        const tensor = new ort.Tensor('float32', pre.entrada, [1, 3, TAM, TAM]);
        const salida = await sesion.run({ [sesion.inputNames[0]]: tensor });
        const detecciones = postprocesar(salida[sesion.outputNames[0]].data, pre);
        return { detecciones, ms: performance.now() - t0, real: true };
      } catch (err) {
        console.warn('Fallo en la inferencia, uso el resultado pregrabado:', err);
      }
    }
    return { detecciones: respaldo.detecciones, ms: respaldo.ms, real: false };
  };

  return api;
})();
