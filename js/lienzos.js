// Lienzos de imagen: el editor donde el alumno dibuja cajas y el visor animado de resultados.
// Todas las cajas se guardan en píxeles de la imagen original: [x, y, ancho, alto].
const PALETA_CAJAS = ['#e21b3c', '#1368ce', '#ffa602', '#26890c', '#864cbf', '#ff6f00', '#00a3a3', '#d6249f'];

const ESTILOS_VISOR = {
  neutro: { color: '#ffffff', relleno: 0.12, grosor: 3, textoOscuro: true },
  acierto: { color: '#4cd137', relleno: 0.2, grosor: 3.5, textoOscuro: true },
  fp: { color: '#ff3355', relleno: 0.25, grosor: 3.5 },
  fn: { color: '#ffd000', relleno: 0.12, grosor: 3.5, discontinua: true, textoOscuro: true, abajo: true },
  gt: { color: '#ffffff', relleno: 0, grosor: 2, discontinua: true },
};

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const rectangulo = (a, b) => [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];

// Ajusta el lienzo al contenedor manteniendo la proporción de la imagen. Devuelve la escala imagen→CSS.
function ajustarLienzo(canvas, marco, contenedor, w, h, margen = 10) {
  const esc = Math.min(Math.max(50, contenedor.clientWidth - margen) / w, Math.max(50, contenedor.clientHeight - margen) / h);
  const cw = Math.floor(w * esc), ch = Math.floor(h * esc);
  marco.style.width = cw + 'px';
  marco.style.height = ch + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  return { esc: cw / w, dpr };
}

// k convierte píxeles de pantalla en píxeles de imagen, para que grosores y textos no dependan del zoom.
function trazarCaja(ctx, [x, y, w, h], { color, relleno = 0, grosor = 3, discontinua = false }, k) {
  ctx.save();
  if (relleno) {
    ctx.globalAlpha *= relleno;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha /= relleno;
  }
  ctx.setLineDash(discontinua ? [8 * k, 5 * k] : []);
  ctx.lineWidth = (grosor + 2.5) * k;
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = grosor * k;
  ctx.strokeStyle = color;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

// La etiqueta va encima de la caja (o debajo, con «abajo»); si no cabe fuera de la imagen, se pone por dentro.
function dibujarEtiqueta(ctx, caja, texto, { color, k, anchoImagen, altoImagen, textoOscuro = false, abajo = false }) {
  const tam = 13 * k, pad = 5 * k;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `800 ${tam}px Montserrat, system-ui, sans-serif`;
  const ancho = ctx.measureText(texto).width + pad * 2, alto = tam + pad * 1.4;
  const x = limitar(caja[0] - 1.5 * k, 0, Math.max(0, anchoImagen - ancho));
  const fondo = caja[1] + caja[3];
  const y = abajo
    ? (fondo + alto <= altoImagen ? fondo : fondo - alto)
    : (caja[1] - alto >= 0 ? caja[1] - alto : caja[1]);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, ancho, alto);
  ctx.fillStyle = textoOscuro ? '#1c1033' : '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x + pad, y + alto / 2 + 0.5 * k);
  ctx.restore();
}

class EditorCajas {
  constructor(canvas, contenedor, { alCambiar = () => {}, alSonar = () => {} } = {}) {
    Object.assign(this, { canvas, contenedor, alCambiar, alSonar });
    this.marco = canvas.parentElement;
    this.ctx = canvas.getContext('2d');
    this.img = null;
    this.cajas = [];
    this.historial = [];
    this.sel = -1;
    this.arrastre = null;
    this.cursor = null;
    this.activo = false;
    canvas.addEventListener('pointerdown', e => this.pulsar(e));
    canvas.addEventListener('pointermove', e => this.mover(e));
    canvas.addEventListener('pointerup', () => this.soltar());
    canvas.addEventListener('pointercancel', () => this.soltar());
    canvas.addEventListener('pointerleave', () => { if (!this.arrastre) { this.cursor = null; this.dibujar(); } });
    canvas.addEventListener('contextmenu', e => this.menuContextual(e));
    new ResizeObserver(() => this.redimensionar()).observe(contenedor);
  }

  get W() { return this.img.naturalWidth; }
  get H() { return this.img.naturalHeight; }
  get k() { return 1 / this.esc; }

  cargar(img) {
    Object.assign(this, { img, cajas: [], historial: [], sel: -1, arrastre: null, cursor: null, color: 0, activo: true });
    this.redimensionar();
    this.alCambiar(0);
  }

  redimensionar() {
    if (!this.img) return;
    Object.assign(this, ajustarLienzo(this.canvas, this.marco, this.contenedor, this.W, this.H));
    this.pintar();
  }

  obtenerCajas() { return this.cajas.map(b => b.c.map(v => Math.round(v * 10) / 10)); }

  bloquear() {
    this.soltar();
    Object.assign(this, { activo: false, sel: -1, cursor: null });
    this.canvas.style.cursor = 'default';
    this.dibujar();
  }

  instantanea() { return this.cajas.map(b => ({ c: [...b.c], color: b.color })); }

  guardarHistorial(antes) {
    this.historial.push(antes);
    if (this.historial.length > 60) this.historial.shift();
  }

  cambiado() {
    this.alCambiar(this.cajas.length);
    this.dibujar();
  }

  deshacer() {
    if (!this.activo || !this.historial.length) return;
    this.cajas = this.historial.pop();
    this.sel = -1;
    this.alSonar('borrar');
    this.cambiado();
  }

  borrarTodo() {
    if (!this.activo || !this.cajas.length) return;
    this.guardarHistorial(this.instantanea());
    this.cajas = [];
    this.sel = -1;
    this.alSonar('borrar');
    this.cambiado();
  }

  eliminar(i) {
    if (!this.activo || i < 0 || i >= this.cajas.length) return;
    this.guardarHistorial(this.instantanea());
    this.cajas.splice(i, 1);
    this.sel = -1;
    this.alSonar('borrar');
    this.cambiado();
  }

  eliminarSeleccionada() { this.eliminar(this.sel); }

  deseleccionar() {
    this.sel = -1;
    this.dibujar();
  }

  // Coordenadas del puntero en píxeles de imagen (robusto ante transformaciones CSS).
  punto(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: limitar((e.clientX - r.left) / r.width * this.W, 0, this.W),
      y: limitar((e.clientY - r.top) / r.height * this.H, 0, this.H),
    };
  }

  tiradores([x, y, w, h]) {
    return { nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2], se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2] };
  }

  botonBorrar([x, y, w]) {
    const k = this.k, r = 11 * k, sep = r + 7 * k;
    return { x: limitar(x + w - r, r, this.W - r), y: y - sep >= r ? y - sep : y + sep, r };
  }

  // Qué hay bajo el puntero: botón de borrar, tirador de la caja seleccionada, una caja o nada.
  zona(p, tactil) {
    const k = this.k, tol = (tactil ? 16 : 8) * k;
    if (this.sel >= 0) {
      const c = this.cajas[this.sel].c, b = this.botonBorrar(c);
      if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 3 * k) return { tipo: 'borrar', i: this.sel };
      for (const [h, [hx, hy]] of Object.entries(this.tiradores(c))) {
        if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) return { tipo: 'tirador', i: this.sel, h };
      }
    }
    for (let i = this.cajas.length - 1; i >= 0; i--) {
      const [x, y, w, h] = this.cajas[i].c;
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) return { tipo: 'caja', i };
    }
    return { tipo: 'nada' };
  }

  // Arrastrar dentro de la caja seleccionada la mueve; en cualquier otro sitio se dibuja una caja nueva
  // (así se pueden dibujar cajas que se solapan). Un clic sin arrastrar selecciona la caja de debajo.
  // Las cajas recién dibujadas no quedan seleccionadas, para poder encadenar varias aunque se solapen.
  pulsar(e) {
    if (!this.activo || !this.img || e.button > 0) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* algunos navegadores táctiles no lo permiten */ }
    const p = this.punto(e), z = this.zona(p, e.pointerType !== 'mouse');
    if (z.tipo === 'borrar') { this.eliminar(z.i); return; }
    const antes = this.instantanea();
    if (z.tipo === 'tirador' || (z.tipo === 'caja' && z.i === this.sel)) {
      this.arrastre = { tipo: z.tipo === 'tirador' ? 'tirador' : 'mover', i: z.i, h: z.h, p0: p, orig: [...this.cajas[z.i].c], antes };
    } else {
      this.arrastre = { tipo: 'nueva', p0: p, p1: p, candidata: z.tipo === 'caja' ? z.i : -1, antes };
    }
    this.dibujar();
  }

  mover(e) {
    if (!this.img) return;
    const p = this.punto(e), a = this.arrastre;
    this.cursor = e.pointerType === 'mouse' && this.activo ? p : null;
    if (!a) {
      this.actualizarCursor(p);
    } else if (a.tipo === 'nueva') {
      a.p1 = p;
    } else if (a.tipo === 'mover') {
      const [x, y, w, h] = a.orig;
      this.cajas[a.i].c = [limitar(x + p.x - a.p0.x, 0, this.W - w), limitar(y + p.y - a.p0.y, 0, this.H - h), w, h];
    } else {
      const [x, y, w, h] = a.orig;
      let l = x, t = y, r = x + w, b = y + h;
      if (a.h.includes('w')) l = p.x;
      if (a.h.includes('e')) r = p.x;
      if (a.h.includes('n')) t = p.y;
      if (a.h.includes('s')) b = p.y;
      this.cajas[a.i].c = [Math.min(l, r), Math.min(t, b), Math.abs(r - l), Math.abs(b - t)];
    }
    this.dibujar();
  }

  soltar() {
    const a = this.arrastre;
    if (!a) return;
    this.arrastre = null;
    if (a.tipo === 'nueva') {
      const c = rectangulo(a.p0, a.p1);
      if (c[2] * this.esc < 6 || c[3] * this.esc < 6) {   // ha sido un clic: seleccionar
        this.sel = a.candidata;
        this.dibujar();
        return;
      }
      this.cajas.push({ c, color: PALETA_CAJAS[this.color++ % PALETA_CAJAS.length] });
      this.sel = -1;
      this.alSonar('pop');
    } else {
      const c = this.cajas[a.i].c;
      if (c[2] * this.esc < 4 || c[3] * this.esc < 4) this.cajas[a.i].c = a.orig;
      if (this.cajas[a.i].c.every((v, j) => v === a.orig[j])) { this.dibujar(); return; }
    }
    this.guardarHistorial(a.antes);
    this.cambiado();
  }

  menuContextual(e) {
    e.preventDefault();
    if (!this.activo || this.arrastre || (e.pointerType && e.pointerType !== 'mouse')) return;
    const z = this.zona(this.punto(e), false);
    if (z.tipo === 'caja' || z.tipo === 'tirador') this.eliminar(z.i);
  }

  actualizarCursor(p) {
    if (!this.activo) { this.canvas.style.cursor = 'default'; return; }
    const z = this.zona(p, false);
    const CURSORES = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
    this.enCajaSel = z.tipo === 'caja' && z.i === this.sel;
    this.canvas.style.cursor = z.tipo === 'borrar' ? 'pointer' : z.tipo === 'tirador' ? CURSORES[z.h] : this.enCajaSel ? 'move' : 'crosshair';
  }

  dibujar() {
    if (this.pendiente) return;
    this.pendiente = true;
    requestAnimationFrame(() => { this.pendiente = false; this.pintar(); });
  }

  pintar() {
    const { ctx, img } = this;
    if (!img) return;
    const k = this.k, a = this.arrastre;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.esc, 0, 0, this.dpr * this.esc, 0, 0);
    ctx.drawImage(img, 0, 0);

    this.cajas.forEach((b, i) => {
      const elegida = i === this.sel;
      trazarCaja(ctx, b.c, { color: b.color, relleno: elegida ? 0.28 : 0.16, grosor: elegida ? 4 : 3 }, k);
      dibujarEtiqueta(ctx, b.c, String(i + 1), { color: b.color, k, anchoImagen: this.W, altoImagen: this.H });
    });

    if (a && a.tipo === 'nueva') {
      trazarCaja(ctx, rectangulo(a.p0, a.p1), { color: '#ffffff', relleno: 0.15, grosor: 2.5, discontinua: true }, k);
    } else if (this.sel >= 0 && this.activo) {
      const b = this.cajas[this.sel], t = 5 * k;
      for (const [hx, hy] of Object.values(this.tiradores(b.c))) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(hx - t, hy - t, 2 * t, 2 * t);
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = b.color;
        ctx.strokeRect(hx - t, hy - t, 2 * t, 2 * t);
      }
      const bb = this.botonBorrar(b.c), d = bb.r * 0.38;
      ctx.beginPath();
      ctx.arc(bb.x, bb.y, bb.r, 0, Math.PI * 2);
      ctx.fillStyle = '#e21b3c';
      ctx.fill();
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth = 2.5 * k;
      ctx.beginPath();
      ctx.moveTo(bb.x - d, bb.y - d); ctx.lineTo(bb.x + d, bb.y + d);
      ctx.moveTo(bb.x + d, bb.y - d); ctx.lineTo(bb.x - d, bb.y + d);
      ctx.stroke();
    }

    // Guías en cruz para apuntar con precisión (solo con ratón).
    if (this.cursor && this.activo && !(a && a.tipo !== 'nueva') && !this.enCajaSel) {
      const { x, y } = this.cursor;
      ctx.save();
      for (const [ancho, color, guion] of [[3, 'rgba(0,0,0,.35)', []], [1.2, 'rgba(255,255,255,.95)', [6 * k, 4 * k]]]) {
        ctx.lineWidth = ancho * k;
        ctx.strokeStyle = color;
        ctx.setLineDash(guion);
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(this.W, y);
        ctx.moveTo(x, 0); ctx.lineTo(x, this.H);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

class VisorCajas {
  constructor(canvas, contenedor) {
    Object.assign(this, { canvas, contenedor, marco: canvas.parentElement, ctx: canvas.getContext('2d'), img: null, elementos: [] });
    new ResizeObserver(() => this.redimensionar()).observe(contenedor);
  }

  // elementos: [{ c: [x, y, w, h], estilo: 'neutro'|'acierto'|'fp'|'fn'|'gt', etiqueta, visible }]
  cargar(img, elementos) {
    const t = performance.now();
    this.img = img;
    this.elementos = elementos.map(e => ({ ...e, t }));
    this.redimensionar();
    this.animar();
  }

  cambiar(i, cambios) {
    Object.assign(this.elementos[i], cambios, { t: performance.now() });
    this.animar();
  }

  redimensionar() {
    if (!this.img) return;
    Object.assign(this, ajustarLienzo(this.canvas, this.marco, this.contenedor, this.img.naturalWidth, this.img.naturalHeight, 0));
    this.pintar(performance.now());
  }

  animar() {
    if (this.animando) return;
    this.animando = true;
    const cuadro = t => {
      if (this.pintar(t)) requestAnimationFrame(cuadro);
      else this.animando = false;
    };
    requestAnimationFrame(cuadro);
  }

  // Cada caja aparece con un pequeño "pop". Devuelve true mientras quede alguna animación en curso.
  pintar(t) {
    const { ctx, img } = this;
    if (!img) return false;
    const k = 1 / this.esc;
    let sigue = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.esc, 0, 0, this.dpr * this.esc, 0, 0);
    ctx.drawImage(img, 0, 0);
    for (const el of this.elementos) {
      if (!el.visible) continue;
      const avance = limitar((t - el.t) / 300, 0, 1);
      if (avance < 1) sigue = true;
      const esc = 1 + 0.3 * (1 - avance) ** 2;
      const [x, y, w, h] = el.c;
      const c = [x + w / 2 - w * esc / 2, y + h / 2 - h * esc / 2, w * esc, h * esc];
      const estilo = ESTILOS_VISOR[el.estilo];
      ctx.globalAlpha = Math.min(1, avance * 1.6);
      trazarCaja(ctx, c, estilo, k);
      if (el.etiqueta) dibujarEtiqueta(ctx, c, el.etiqueta, { ...estilo, k, anchoImagen: img.naturalWidth, altoImagen: img.naturalHeight });
      ctx.globalAlpha = 1;
    }
    return sigue;
  }
}
