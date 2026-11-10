// Mapa de la provincia de Alicante para «¡Ubícalo!», sin internet. Dos motores con la misma interfaz:
//  - MapaOSM: mapa completo de OpenStreetMap (teselas de Protomaps en mapas/alicante.pmtiles) dibujado con MapLibre GL.
//  - MapaSimple: mapa simplificado dibujado en un <canvas> (js/mapa_alicante.js). Se usa si MapLibre no puede
//    funcionar: página abierta sin servidor (file://) o navegador sin WebGL.
// Arrastrar para mover, rueda o pellizco para acercar, clic para poner la chincheta (si el mapa es interactivo).
//
// Uso:  await Mapa.preparar();  const m = Mapa.crear(div, { interactivo, alPulsar });
//       m.verTodo() · m.encuadrar([[lon, lat], …], minKm) · m.zoom(factor) · m.bloquear(bool)
//       m.poner({ pines: [{ tipo, lonlat, escala }], lineas: [{ de, a, color, progreso, texto }] })
const Mapa = (() => {
  const M = window.MAPA_ALICANTE;
  const COLORES = {
    mar: '#a9d3ee', vecinas: '#e4e1d6', bordeVecinas: '#b9b4a6', tierra: '#fbf7e9', municipio: 'rgba(110, 90, 150, .28)',
    carretera: '#f08a3c', carreteraBorde: '#fff', borde: '#46178f', texto: '#1c1033',
  };
  const PINES = {
    jugador: { color: '#1368ce', icono: '🧑‍🎓' },
    ia: { color: '#0b8f94', icono: '🤖' },
    real: { color: '#e21b3c', icono: '📷' },
  };

  // Proyección equirectangular centrada en la provincia (a esta escala, la deformación es despreciable).
  const todos = M.provincia.flat();
  const lonMin = Math.min(...todos.map(p => p[0])), lonMax = Math.max(...todos.map(p => p[0]));
  const latMin = Math.min(...todos.map(p => p[1])), latMax = Math.max(...todos.map(p => p[1]));
  const lon0 = (lonMin + lonMax) / 2, lat0 = (latMin + latMax) / 2, kx = Math.cos(lat0 * Math.PI / 180);
  const KM_GRADO = 111.2;   // km por grado de latitud
  const aMundo = (lon, lat) => [(lon - lon0) * kx, lat0 - lat];
  const aLonLat = (x, y) => [x / kx + lon0, lat0 - y];
  const LIMITES = { x0: (lonMin - lon0) * kx, x1: (lonMax - lon0) * kx, y0: lat0 - latMax, y1: lat0 - latMin };

  function trayecto(anillos, cerrar = true) {
    const p = new Path2D();
    for (const an of anillos) {
      an.forEach(([lon, lat], i) => { const [x, y] = aMundo(lon, lat); i ? p.lineTo(x, y) : p.moveTo(x, y); });
      if (cerrar) p.closePath();
    }
    return p;
  }
  const CAPAS = {
    vecinas: trayecto(M.vecinas),
    provincia: trayecto(M.provincia),
    municipios: trayecto(M.municipios.flatMap(m => m.anillos)),
    carreteras: trayecto(M.carreteras.map(c => c.puntos), false),
  };

  // Distancia sobre la esfera (fórmula del semiverseno), en km.
  function distanciaKm([lon1, lat1], [lon2, lat2]) {
    const r = Math.PI / 180, R = 6371.0088;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Población más cercana a un punto (para decir «cerca de Elche»).
  function cercaDe(punto) {
    let mejor = null, dMin = Infinity;
    for (const p of M.poblaciones) {
      const d = distanciaKm(punto, [p.lon, p.lat]);
      if (d < dMin) { dMin = d; mejor = p; }
    }
    return { nombre: mejor?.nombre ?? '', km: dMin };
  }

  class MapaSimple {
    constructor(canvas, contenedor, { interactivo = false, alPulsar = () => {} } = {}) {
      Object.assign(this, { canvas, contenedor, interactivo, alPulsar, ctx: canvas.getContext('2d'), pines: [], lineas: [], activo: interactivo });
      this.punteros = new Map();
      this.vista = null;
      new ResizeObserver(() => this.redimensionar()).observe(contenedor);
      if (interactivo) this.escuchar();
      this.redimensionar();
    }

    // ---------------------------------------------------------------- vista
    redimensionar() {
      // Tamaño de maquetación (sin transformaciones CSS: las pantallas entran con un scale() animado).
      const r = { width: this.contenedor.clientWidth, height: this.contenedor.clientHeight };
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const anterior = this.tam;
      this.tam = { w: r.width, h: r.height, dpr };
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.canvas.style.width = r.width + 'px';
      this.canvas.style.height = r.height + 'px';
      if (!this.vista || !anterior) this.verTodo();
      else { this.limitarVista(); this.pintar(); }
    }

    escalaMinima() {
      const { w, h } = this.tam;
      return Math.min(w / (LIMITES.x1 - LIMITES.x0), h / (LIMITES.y1 - LIMITES.y0)) * 0.92;
    }

    // Encuadra la provincia entera.
    verTodo() {
      if (!this.tam) return;
      this.vista = { cx: (LIMITES.x0 + LIMITES.x1) / 2, cy: (LIMITES.y0 + LIMITES.y1) / 2, esc: this.escalaMinima() };
      this.pintar();
    }

    // Encuadra unos puntos [lon, lat] con un margen y un tamaño mínimo (en km).
    encuadrar(puntos, minKm = 8) {
      if (!this.tam || !puntos.length) return this.verTodo();
      const xy = puntos.map(([lon, lat]) => aMundo(lon, lat));
      let x0 = Math.min(...xy.map(p => p[0])), x1 = Math.max(...xy.map(p => p[0]));
      let y0 = Math.min(...xy.map(p => p[1])), y1 = Math.max(...xy.map(p => p[1]));
      const min = minKm / KM_GRADO;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const ancho = Math.max(x1 - x0, min) * 1.5, alto = Math.max(y1 - y0, min) * 1.5;
      this.vista = { cx, cy, esc: Math.min(this.tam.w / ancho, this.tam.h / alto) };
      this.limitarVista();
      this.pintar();
    }

    limitarVista() {
      const v = this.vista, min = this.escalaMinima();
      v.esc = Math.min(Math.max(v.esc, min), min * 60);
      v.cx = Math.min(Math.max(v.cx, LIMITES.x0), LIMITES.x1);
      v.cy = Math.min(Math.max(v.cy, LIMITES.y0), LIMITES.y1);
    }

    aPantalla(lon, lat) {
      const [x, y] = aMundo(lon, lat), v = this.vista;
      return [(x - v.cx) * v.esc + this.tam.w / 2, (y - v.cy) * v.esc + this.tam.h / 2];
    }

    desdePantalla(px, py) {
      const v = this.vista;
      return aLonLat((px - this.tam.w / 2) / v.esc + v.cx, (py - this.tam.h / 2) / v.esc + v.cy);
    }

    zoom(factor, px = this.tam.w / 2, py = this.tam.h / 2) {
      const v = this.vista;
      const mx = (px - this.tam.w / 2) / v.esc + v.cx, my = (py - this.tam.h / 2) / v.esc + v.cy;
      v.esc *= factor;
      this.limitarVista();
      v.cx = mx - (px - this.tam.w / 2) / v.esc;
      v.cy = my - (py - this.tam.h / 2) / v.esc;
      this.limitarVista();
      this.pintar();
    }

    // ---------------------------------------------------------------- interacción
    escuchar() {
      const c = this.canvas;
      const local = e => {
        const r = c.getBoundingClientRect();   // corrige un posible scale() de la pantalla
        return [(e.clientX - r.left) * (this.tam.w / r.width), (e.clientY - r.top) * (this.tam.h / r.height)];
      };
      c.addEventListener('pointerdown', e => {
        c.setPointerCapture(e.pointerId);
        this.punteros.set(e.pointerId, local(e));
        this.arrastre = { inicio: local(e), movido: false, vista: { ...this.vista } };
        if (this.punteros.size === 2) {
          const [a, b] = [...this.punteros.values()];
          this.pellizco = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), esc: this.vista.esc };
        }
      });
      c.addEventListener('pointermove', e => {
        if (!this.punteros.has(e.pointerId)) return;
        const p = local(e);
        this.punteros.set(e.pointerId, p);
        if (this.punteros.size === 2 && this.pellizco) {
          const [a, b] = [...this.punteros.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          this.zoom(this.pellizco.esc * (d / this.pellizco.d) / this.vista.esc, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          this.arrastre.movido = true;
          return;
        }
        const ar = this.arrastre, dx = p[0] - ar.inicio[0], dy = p[1] - ar.inicio[1];
        if (!ar.movido && Math.hypot(dx, dy) < (e.pointerType === 'mouse' ? 4 : 10)) return;
        ar.movido = true;
        c.style.cursor = 'grabbing';
        this.vista.cx = ar.vista.cx - dx / this.vista.esc;
        this.vista.cy = ar.vista.cy - dy / this.vista.esc;
        this.limitarVista();
        this.pintar();
      });
      const soltar = e => {
        if (!this.punteros.has(e.pointerId)) return;
        this.punteros.delete(e.pointerId);
        if (this.punteros.size < 2) this.pellizco = null;
        c.style.cursor = this.activo ? 'crosshair' : 'grab';
        if (e.type === 'pointerup' && this.punteros.size === 0 && !this.arrastre?.movido && this.activo && e.button === 0) {
          this.alPulsar(this.desdePantalla(...local(e)));
        }
      };
      c.addEventListener('pointerup', soltar);
      c.addEventListener('pointercancel', soltar);
      c.addEventListener('wheel', e => {
        e.preventDefault();
        this.zoom(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), ...local(e));
      }, { passive: false });
      c.addEventListener('dblclick', e => e.preventDefault());
      c.style.cursor = 'crosshair';
    }

    bloquear(bloqueado) {
      this.activo = !bloqueado;
      this.canvas.style.cursor = this.activo ? 'crosshair' : 'grab';
    }

    // ---------------------------------------------------------------- contenido
    // pines: [{ tipo: 'jugador' | 'ia' | 'real', lonlat: [lon, lat], escala }]
    // lineas: [{ de: [lon, lat], a: [lon, lat], color, progreso (0–1), texto }]
    poner({ pines, lineas } = {}) {
      if (pines) this.pines = pines;
      if (lineas) this.lineas = lineas;
      this.pintar();
    }

    // ---------------------------------------------------------------- dibujo
    pintar() {
      if (!this.tam || !this.vista) return;
      const { ctx } = this, { w, h, dpr } = this.tam, v = this.vista;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORES.mar;
      ctx.fillRect(0, 0, w, h);

      // Capas geográficas en coordenadas del mundo (grosores divididos por la escala para que sean fijos en pantalla).
      ctx.setTransform(dpr * v.esc, 0, 0, dpr * v.esc, dpr * (w / 2 - v.cx * v.esc), dpr * (h / 2 - v.cy * v.esc));
      const px = n => n / v.esc;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.fillStyle = COLORES.vecinas;
      ctx.fill(CAPAS.vecinas, 'evenodd');
      ctx.strokeStyle = COLORES.bordeVecinas;
      ctx.lineWidth = px(1);
      ctx.stroke(CAPAS.vecinas);
      ctx.fillStyle = COLORES.tierra;
      ctx.fill(CAPAS.provincia, 'evenodd');
      const relativa = v.esc / this.escalaMinima();
      ctx.strokeStyle = COLORES.municipio;
      ctx.lineWidth = px(relativa > 2.5 ? 1.1 : 0.7);
      ctx.stroke(CAPAS.municipios);
      ctx.strokeStyle = COLORES.carreteraBorde;
      ctx.lineWidth = px(relativa > 3 ? 4.5 : 3);
      ctx.stroke(CAPAS.carreteras);
      ctx.strokeStyle = COLORES.carretera;
      ctx.lineWidth = px(relativa > 3 ? 2.5 : 1.6);
      ctx.stroke(CAPAS.carreteras);
      ctx.strokeStyle = COLORES.borde;
      ctx.lineWidth = px(2.2);
      ctx.stroke(CAPAS.provincia);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.pintarNombres(relativa);
      this.pintarEscala();
      for (const l of this.lineas) this.pintarLinea(l);
      for (const p of this.pines) this.pintarPin(p);
    }

    // Nombres de poblaciones: más cuanto más cerca, sin que se solapen.
    pintarNombres(relativa) {
      const { ctx } = this, ocupado = [];
      const minPob = relativa < 1.5 ? 40000 : relativa < 3 ? 12000 : relativa < 6 ? 4000 : 0;
      for (const p of M.poblaciones) {
        if (p.poblacion < minPob && !(p.tipo === 'city' && relativa >= 1)) continue;
        const [x, y] = this.aPantalla(p.lon, p.lat);
        if (x < -40 || y < -20 || x > this.tam.w + 40 || y > this.tam.h + 20) continue;
        const grande = p.poblacion >= 100000;
        ctx.font = `${grande ? 800 : 700} ${grande ? 13 : 11}px Montserrat, system-ui, sans-serif`;
        const ancho = ctx.measureText(p.nombre).width;
        const caja = [x + 5, y - 8, x + 9 + ancho, y + 7];
        if (ocupado.some(o => caja[0] < o[2] && caja[2] > o[0] && caja[1] < o[3] && caja[3] > o[1])) continue;
        ocupado.push(caja);
        ctx.beginPath();
        ctx.arc(x, y, grande ? 3.5 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = COLORES.texto;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, .9)';
        ctx.textBaseline = 'middle';
        ctx.strokeText(p.nombre, x + 7, y);
        ctx.fillStyle = COLORES.texto;
        ctx.fillText(p.nombre, x + 7, y);
      }
    }

    // Barra de escala (1, 2, 5, 10, 20 o 50 km) abajo a la izquierda.
    pintarEscala() {
      const { ctx } = this, pxKm = this.vista.esc / KM_GRADO;
      const km = [1, 2, 5, 10, 20, 50].find(k => k * pxKm >= 60) ?? 50;
      const largo = km * pxKm, x = 12, y = this.tam.h - 14;
      ctx.fillStyle = 'rgba(255, 255, 255, .85)';
      ctx.fillRect(x - 6, y - 18, largo + 12, 26);
      ctx.strokeStyle = COLORES.texto;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + largo, y); ctx.lineTo(x + largo, y - 5);
      ctx.stroke();
      ctx.fillStyle = COLORES.texto;
      ctx.font = '700 11px Montserrat, system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${km} km`, x + 2, y - 6);
    }

    pintarLinea({ de, a, color = '#1c1033', progreso = 1, texto = '' }) {
      if (progreso <= 0) return;
      const { ctx } = this;
      const [x1, y1] = this.aPantalla(...de), [x2, y2] = this.aPantalla(...a);
      const xf = x1 + (x2 - x1) * progreso, yf = y1 + (y2 - y1) * progreso;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.setLineDash([9, 7]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 255, 255, .85)';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xf, yf); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xf, yf); ctx.stroke();
      if (texto && progreso >= 1) {
        ctx.setLineDash([]);
        ctx.font = '800 13px Montserrat, system-ui, sans-serif';
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ancho = ctx.measureText(texto).width + 14;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(mx - ancho / 2, my - 12, ancho, 24, 12);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texto, mx, my + 0.5);
      }
      ctx.restore();
    }

    // Chincheta con forma de gota y un icono dentro; la punta señala el lugar.
    pintarPin({ tipo, lonlat, escala = 1 }) {
      if (escala <= 0) return;
      const { ctx } = this, estilo = PINES[tipo], [x, y] = this.aPantalla(...lonlat);
      const r = 15 * escala, alto = 2.6 * r;
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.45, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, .3)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-r * 0.35, -r * 0.9, -r, -alto + r * 1.15, -r, -alto + r);
      ctx.arc(0, -alto + r, r, Math.PI, 0);
      ctx.bezierCurveTo(r, -alto + r * 1.15, r * 0.35, -r * 0.9, 0, 0);
      ctx.fillStyle = estilo.color;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.font = `${r * 1.05}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(estilo.icono, 0, -alto + r + 1);
      ctx.restore();
    }
  }

  // ================================================================== MapLibre + Protomaps
  const BASE = new URL('.', location.href).href;
  const LIMITES_LONLAT = [[lonMin - 0.25, latMin - 0.18], [lonMax + 0.25, latMax + 0.18]];
  const ATRIBUCION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ' +
    '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';
  let gl = null;   // maplibregl, si se ha podido cargar

  function crearEstilo() {
    // Fuera de la provincia, un velo blanco; el contorno, en morado (igual que el mapa simplificado).
    const velo = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-5, 35], [4, 35], [4, 42], [-5, 42], [-5, 35]], ...M.provincia] } };
    const contorno = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: M.provincia } };
    return {
      version: 8,
      glyphs: BASE + 'mapas/fuentes/{fontstack}/{range}.pbf',
      sprite: BASE + 'mapas/iconos/light',
      sources: {
        protomaps: { type: 'vector', url: 'pmtiles://' + BASE + 'mapas/alicante.pmtiles', attribution: ATRIBUCION },
        velo: { type: 'geojson', data: velo },
        contorno: { type: 'geojson', data: contorno },
        lineas: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [
        ...basemaps.layers('protomaps', basemaps.namedFlavor('light'), { lang: 'es' }),
        // El contorno está simplificado (≈60 m): de cerca no coincide con la costa, así que se desvanece al acercar.
        { id: 'velo', type: 'fill', source: 'velo',
          paint: { 'fill-color': '#ffffff', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.45, 12, 0] } },
        { id: 'contorno', type: 'line', source: 'contorno',
          paint: { 'line-color': COLORES.borde, 'line-width': 2.2, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.85, 12, 0] } },
        { id: 'lineas-borde', type: 'line', source: 'lineas', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.85 } },
        { id: 'lineas', type: 'line', source: 'lineas', layout: { 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.6] } },
      ],
    };
  }

  // Chincheta con forma de gota (misma silueta que en el lienzo), como marcador HTML de MapLibre.
  function elementoPin(tipo) {
    const { color, icono } = PINES[tipo];
    const el = document.createElement('div');
    el.className = 'pin-mapa';
    el.innerHTML = `<div class="pin-cuerpo"><svg viewBox="0 0 34 46" width="34" height="46" aria-hidden="true">` +
      `<ellipse cx="17" cy="44" rx="7" ry="2.6" fill="rgba(0,0,0,.3)"/>` +
      `<path d="M17 44C13 34 2 27 2 17a15 15 0 0 1 30 0c0 10-11 17-15 27z" fill="${color}" stroke="#fff" stroke-width="2.5"/></svg>` +
      `<span>${icono}</span></div>`;
    return el;
  }

  class MapaOSM {
    constructor(contenedor, { interactivo = false, alPulsar = () => {} } = {}) {
      Object.assign(this, { contenedor, interactivo, alPulsar, activo: interactivo, marcadores: [], etiquetas: [] });
      this.mapa = new gl.Map({
        container: contenedor, style: crearEstilo(), bounds: LIMITES_LONLAT, maxBounds: LIMITES_LONLAT,
        minZoom: 6, maxZoom: 17, interactive: interactivo, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        attributionControl: { compact: true }, fadeDuration: 0,
      });
      if (interactivo) {
        this.mapa.touchZoomRotate.disableRotation();
        this.mapa.keyboard.disableRotation();
        this.mapa.on('click', e => { if (this.activo) this.alPulsar([e.lngLat.lng, e.lngLat.lat]); });
        this.mapa.getCanvas().style.cursor = 'crosshair';
      }
      this.listo = new Promise(ok => this.mapa.once('load', ok));
      new ResizeObserver(() => this.mapa.resize()).observe(contenedor);
    }

    verTodo() {
      this.mapa.resize();
      this.mapa.fitBounds([[lonMin, latMin], [lonMax, latMax]], { padding: 10, duration: 0 });
    }

    // Encuadra unos puntos [lon, lat] con margen, abarcando al menos minKm.
    encuadrar(puntos, minKm = 8) {
      if (!puntos.length) return this.verTodo();
      this.mapa.resize();
      const lons = puntos.map(p => p[0]), lats = puntos.map(p => p[1]);
      const cLon = (Math.min(...lons) + Math.max(...lons)) / 2, cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const medioLat = Math.max((Math.max(...lats) - Math.min(...lats)) / 2, minKm / 2 / KM_GRADO);
      const medioLon = Math.max((Math.max(...lons) - Math.min(...lons)) / 2, minKm / 2 / (KM_GRADO * kx));
      this.mapa.fitBounds([[cLon - medioLon, cLat - medioLat], [cLon + medioLon, cLat + medioLat]],
        { padding: { top: 60, bottom: 30, left: 30, right: 30 }, duration: 0, maxZoom: 15 });
    }

    zoom(factor) {
      this.mapa.easeTo({ zoom: this.mapa.getZoom() + Math.log2(factor), duration: 250 });
    }

    bloquear(bloqueado) {
      this.activo = !bloqueado;
      if (this.interactivo) this.mapa.getCanvas().style.cursor = this.activo ? 'crosshair' : 'grab';
    }

    poner({ pines, lineas } = {}) {
      if (pines) {
        // Se reutilizan los marcadores del mismo tipo para que las animaciones de tamaño no parpadeen.
        const antes = this.marcadores;
        this.marcadores = pines.map(p => {
          let m = antes.find(x => x.tipo === p.tipo && !x.usado);
          if (!m) m = { tipo: p.tipo, marcador: new gl.Marker({ element: elementoPin(p.tipo), anchor: 'bottom' }) };
          m.usado = true;
          m.marcador.setLngLat(p.lonlat).addTo(this.mapa);
          m.marcador.getElement().firstChild.style.transform = `scale(${p.escala ?? 1})`;
          return m;
        });
        antes.filter(m => !m.usado).forEach(m => m.marcador.remove());
        this.marcadores.forEach(m => { m.usado = false; });
      }
      if (lineas) {
        const datos = {
          type: 'FeatureCollection',
          features: lineas.filter(l => (l.progreso ?? 1) > 0).map(({ de, a, color = '#1c1033', progreso = 1 }) => ({
            type: 'Feature', properties: { color },
            geometry: { type: 'LineString', coordinates: [de, [de[0] + (a[0] - de[0]) * progreso, de[1] + (a[1] - de[1]) * progreso]] },
          })),
        };
        const fuente = () => this.mapa.getSource('lineas')?.setData(datos);
        if (this.mapa.isStyleLoaded()) fuente(); else this.listo.then(fuente);
        this.etiquetas.forEach(e => e.remove());
        this.etiquetas = lineas.filter(l => l.texto && (l.progreso ?? 1) >= 1).map(({ de, a, color, texto }) => {
          const el = document.createElement('div');
          el.className = 'etiqueta-distancia';
          el.style.background = color;
          el.textContent = texto;
          return new gl.Marker({ element: el }).setLngLat([(de[0] + a[0]) / 2, (de[1] + a[1]) / 2]).addTo(this.mapa);
        });
      }
    }
  }

  // ================================================================== elección del motor
  let motor = null;
  function preparar() {
    motor ??= (async () => {
      if (location.protocol === 'file:' || typeof pmtiles === 'undefined' || typeof basemaps === 'undefined') return 'simple';
      const lib = await (window.MOTOR_MAPA ?? Promise.resolve(null));
      const c = document.createElement('canvas');
      if (!lib || !(c.getContext('webgl2') || c.getContext('webgl'))) return 'simple';
      gl = lib;
      const protocolo = new pmtiles.Protocol();
      gl.addProtocol('pmtiles', protocolo.tile);
      return 'osm';
    })().catch(err => { console.warn('Mapa simplificado:', err); return 'simple'; });
    return motor;
  }

  function crear(contenedor, opciones) {
    if (gl) return new MapaOSM(contenedor, opciones);
    const canvas = document.createElement('canvas');
    contenedor.appendChild(canvas);
    return new MapaSimple(canvas, contenedor, opciones);
  }

  return { preparar, crear, distanciaKm, cercaDe, get motor() { return gl ? 'osm' : 'simple'; } };
})();
