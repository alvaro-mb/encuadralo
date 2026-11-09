// «¡Cuéntalos!»: inicio → (tutorial) → previa con la muestra → ronda (contar) → turno de la IA → resultado → … → final.
// Usa los módulos comunes de ¡Encuádralo!: Efectos, Sonido y las utilidades de dibujo de lienzos.js.
// La IA es LOCA, un modelo especializado en contar. Igual que GeoCLIP en ¡Ubícalo!, sus recuentos se calcularon
// antes, sin conexión (tools/preparar_conteo.py): aquí solo se muestran su respuesta, sus puntos y su tiempo.
(() => {
  const D = window.DATOS_CONTEO, C = window.CONFIG;
  const { esperar, dosFrames, fmt, fmtSeg, fmtMs, fmtTiempo, animarNumero, reiniciarAnimacion, flotante, confeti } = Efectos;
  const $ = sel => document.querySelector(sel);

  const estado = {
    apodo: 'Tú', rondas: [], i: 0, historial: [],
    jugando: false, t0: 0, limite: 30, ultimoSegundo: null, tutorialVisto: false, ocupado: false, trasTutorial: null,
  };

  // ------------------------------------------------------------------ utilidades
  const suma = arr => arr.reduce((s, v) => s + v, 0);
  const media = arr => (arr.length ? suma(arr) / arr.length : 0);
  const pct = v => Math.round(v * 100) + ' %';
  const azar = arr => arr[Math.floor(Math.random() * arr.length)];
  const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cargarImagen = src => new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => mal(new Error('No se pudo cargar la imagen ' + src));
    im.src = src;
  });

  function irA(id) {
    document.querySelectorAll('.pantalla.activa').forEach(p => p.classList.remove('activa'));
    const p = document.getElementById(id);
    p.classList.add('activa');
    p.scrollTop = 0;
    document.body.dataset.pantalla = id;
  }

  document.querySelectorAll('[data-config]').forEach(el => { el.textContent = fmt(C[el.dataset.config]); });
  const reales = D.imagenes.map(im => im.real);
  $('#dato-rondas').textContent = C.plan.length;
  $('#dato-min').textContent = Math.min(...reales);
  $('#dato-max').textContent = Math.floor(Math.max(...reales) / 50) * 50 || Math.max(...reales);

  // ------------------------------------------------------------------ puntuación
  // Error relativo: fallar por 2 cuando hay 10 cuesta lo mismo que fallar por 20 cuando hay 100.
  function calcular(respuesta, real, segundos, limite) {
    const error = respuesta - real;
    const errorRel = Math.abs(error) / real;
    const precision = Math.max(0, 1 - errorRel);
    const puntosPrecision = Math.round(C.puntosPrecision * precision);
    const exacto = error === 0 ? C.bonusExacto : 0;
    const bonus = Math.round(C.bonusTiempoMax * Math.max(0, 1 - segundos / limite) * precision);
    return { respuesta, real, error, errorRel, precision, puntosPrecision, exacto, bonus, segundos, total: puntosPrecision + exacto + bonus };
  }

  // ------------------------------------------------------------------ dibujo
  // Recorte de la caja de ejemplo de FSC-147, ajustado al tamaño del lienzo.
  function pintarMuestra(canvas, img, [x, y, w, h], maxW, maxH) {
    const pad = 0.12 * Math.max(w, h);
    const x0 = Math.max(0, x - pad), y0 = Math.max(0, y - pad);
    const x1 = Math.min(img.naturalWidth, x + w + pad), y1 = Math.min(img.naturalHeight, y + h + pad);
    const esc = Math.min(maxW / (x1 - x0), maxH / (y1 - y0));
    const cw = Math.round((x1 - x0) * esc), ch = Math.round((y1 - y0) * esc), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
  }

  function pintarMarca(ctx, x, y, texto, k, color = '#1368ce') {
    const r = (texto.length > 2 ? 11 : 9.5) * k;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${(texto.length > 2 ? 8.5 : 10) * k}px Montserrat, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, x, y + 0.5 * k);
    ctx.restore();
  }

  function pintarPuntoReal(ctx, x, y, k) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 4 * k, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd000';
    ctx.fill();
    ctx.lineWidth = 1.6 * k;
    ctx.strokeStyle = '#1c1033';
    ctx.stroke();
    ctx.restore();
  }

  // Cada objeto que «ve» la IA: un aro cian (los puntos salen de su mapa de densidad).
  function pintarPuntoIA(ctx, x, y, k) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 7 * k, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(45, 226, 230, .25)';
    ctx.fill();
    ctx.lineWidth = 2.5 * k;
    ctx.strokeStyle = '#2de2e6';
    ctx.stroke();
    ctx.restore();
  }

  // Lienzo de la ronda: clic en un objeto para marcarlo; clic en una marca (o clic derecho) para quitarla.
  class Marcador {
    constructor(canvas, contenedor, alCambiar) {
      Object.assign(this, { canvas, contenedor, alCambiar, marco: canvas.parentElement, ctx: canvas.getContext('2d'), img: null, marcas: [], activo: false });
      canvas.addEventListener('pointerdown', e => this.pulsar(e));
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      new ResizeObserver(() => this.redimensionar()).observe(contenedor);
    }

    cargar(img) {
      Object.assign(this, { img, marcas: [], activo: true });
      this.canvas.style.cursor = 'crosshair';
      this.redimensionar();
      this.alCambiar(0);
    }

    bloquear() {
      this.activo = false;
      this.canvas.style.cursor = 'default';
    }

    redimensionar() {
      if (!this.img) return;
      Object.assign(this, ajustarLienzo(this.canvas, this.marco, this.contenedor, this.img.naturalWidth, this.img.naturalHeight));
      this.pintar();
    }

    punto(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * this.img.naturalWidth, y: (e.clientY - r.top) / r.height * this.img.naturalHeight };
    }

    pulsar(e) {
      if (!this.activo || !this.img) return;
      e.preventDefault();
      const p = this.punto(e), radio = (e.pointerType === 'mouse' ? 10 : 16) / this.esc;
      let cerca = -1, mejor = Infinity;
      this.marcas.forEach(([x, y], i) => {
        const d = Math.hypot(x - p.x, y - p.y);
        if (d <= radio && d < mejor) { mejor = d; cerca = i; }
      });
      if (cerca >= 0 || e.button === 2) {
        if (cerca < 0) return;
        this.marcas.splice(cerca, 1);
        Sonido.efecto('borrar');
      } else if (e.button === 0) {
        this.marcas.push([p.x, p.y]);
        Sonido.efecto('pop');
      }
      this.cambiado();
    }

    deshacer() {
      if (!this.activo || !this.marcas.length) return;
      this.marcas.pop();
      Sonido.efecto('borrar');
      this.cambiado();
    }

    borrarTodo() {
      if (!this.activo || !this.marcas.length) return;
      this.marcas = [];
      Sonido.efecto('borrar');
      this.cambiado();
    }

    cambiado() {
      this.alCambiar(this.marcas.length);
      this.pintar();
    }

    pintar() {
      const { ctx, img } = this;
      if (!img) return;
      const k = 1 / this.esc;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.dpr * this.esc, 0, 0, this.dpr * this.esc, 0, 0);
      ctx.drawImage(img, 0, 0);
      this.marcas.forEach(([x, y], i) => pintarMarca(ctx, x, y, String(i + 1), k));
    }
  }

  // Lienzo del resultado: imagen + marcas del jugador o cajas de la IA + puntos reales (que se revelan al final).
  class VisorConteo {
    constructor(canvas, contenedor) {
      Object.assign(this, { canvas, contenedor, marco: canvas.parentElement, ctx: canvas.getContext('2d'), img: null });
      new ResizeObserver(() => this.redimensionar()).observe(contenedor);
    }

    cargar(img, { marcas = [], puntosIA = [], puntos = [] }) {
      Object.assign(this, { img, marcas, puntosIA, puntos, nIA: 0, nMarcas: 0, verPuntos: false });
      this.redimensionar();
    }

    mostrar(cambios) {
      Object.assign(this, cambios);
      this.pintar();
    }

    redimensionar() {
      if (!this.img) return;
      Object.assign(this, ajustarLienzo(this.canvas, this.marco, this.contenedor, this.img.naturalWidth, this.img.naturalHeight, 0));
      this.pintar();
    }

    pintar() {
      const { ctx, img } = this;
      if (!img) return;
      const k = 1 / this.esc;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.dpr * this.esc, 0, 0, this.dpr * this.esc, 0, 0);
      ctx.drawImage(img, 0, 0);
      if (this.verPuntos) {
        ctx.fillStyle = 'rgba(20, 5, 50, .25)';
        ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
      }
      this.puntosIA.slice(0, this.nIA).forEach(([x, y]) => pintarPuntoIA(ctx, x, y, k));
      if (this.verPuntos) this.puntos.forEach(([x, y]) => pintarPuntoReal(ctx, x, y, k));
      this.marcas.slice(0, this.nMarcas).forEach(([x, y], i) => pintarMarca(ctx, x, y, String(i + 1), k * 0.85));
    }
  }

  // ------------------------------------------------------------------ fondo y controles globales
  (function crearFondo() {
    const formas = ['<circle cx="50" cy="50" r="44"/>', '<text x="50" y="80" font-size="90" text-anchor="middle" font-weight="900">1</text>',
      '<text x="50" y="80" font-size="90" text-anchor="middle" font-weight="900">7</text>', '<rect x="8" y="8" width="84" height="84" rx="8"/>'];
    const fondo = $('#fondo');
    for (let i = 0; i < 16; i++) {
      const el = document.createElement('div');
      el.className = 'forma';
      el.innerHTML = `<svg viewBox="0 0 100 100" fill="#fff">${formas[i % 4]}</svg>`;
      el.style.left = Math.random() * 100 + '%';
      el.style.setProperty('--t', 40 + Math.random() * 100 + 'px');
      el.style.setProperty('--d', 18 + Math.random() * 24 + 's');
      el.style.setProperty('--r', -Math.random() * 40 + 's');
      fondo.appendChild(el);
    }
  })();

  const btnSonido = $('#btn-sonido');
  btnSonido.textContent = Sonido.activo ? '🔊' : '🔇';
  btnSonido.addEventListener('click', () => { btnSonido.textContent = Sonido.alternar() ? '🔊' : '🔇'; });
  $('#btn-pantalla').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('pointerdown', () => {
    if (['pantalla-inicio', 'pantalla-tutorial'].includes(document.body.dataset.pantalla)) Sonido.musica('inicio');
  }, { once: true });

  // ------------------------------------------------------------------ inicio: carga de la IA
  const chip = $('#estado-ia');
  chip.classList.add('lista');
  chip.querySelector('.chip-texto').textContent = `IA lista: recuentos de ${D.modelo} calculados sin conexión`;
  chip.title = `Tiempos medidos en ${D.dispositivoIA}`;

  try { $('#apodo').value = localStorage.getItem('encuadralo-apodo') || ''; } catch (e) { /* sin almacenamiento */ }
  $('#btn-jugar').addEventListener('click', empezarPartida);
  $('#apodo').addEventListener('keydown', e => { if (e.key === 'Enter') empezarPartida(); });
  $('#btn-como').addEventListener('click', () => mostrarTutorial(false));
  $('#btn-tutorial').addEventListener('click', () => estado.trasTutorial?.());
  $('#btn-creditos').addEventListener('click', () => {
    $('#lista-creditos').innerHTML = D.imagenes.map(im =>
      `<li>${im.emoji} ${escapar(im.nombre)} · ${C.niveles[im.nivel].nombre} · FSC-147 nº ${im.id} (${escapar(im.claseFSC)})</li>`).join('');
    $('#dialogo-creditos').showModal();
  });

  function mostrarTutorial(antesDeJugar) {
    $('#btn-tutorial').textContent = antesDeJugar ? '¡Entendido, a jugar! →' : '← Volver';
    estado.trasTutorial = () => {
      estado.tutorialVisto = true;
      if (antesDeJugar) mostrarPrevia(); else irA('pantalla-inicio');
    };
    irA('pantalla-tutorial');
  }

  // Para cada nivel del plan, las imágenes de ese nivel se ordenan por número de objetos y se reparten en tantos
  // tramos como rondas tenga el nivel; se elige una al azar de cada tramo. Así cada ronda tiene más objetos que la anterior.
  function elegirRondas() {
    const porNivel = {};
    D.imagenes.forEach(im => (porNivel[im.nivel] ||= []).push(im));
    Object.values(porNivel).forEach(l => l.sort((a, b) => a.real - b.real));
    let mejor = null;
    for (let intento = 0; intento < 40; intento++) {
      const usadas = {};
      const elegidas = C.plan.map(nivel => {
        const lista = porNivel[nivel] || [], total = C.plan.filter(n => n === nivel).length, k = usadas[nivel] = (usadas[nivel] || 0) + 1;
        return azar(lista.slice(Math.floor((k - 1) * lista.length / total), Math.max(Math.floor(k * lista.length / total), Math.floor((k - 1) * lista.length / total) + 1)));
      }).filter(Boolean);
      mejor = elegidas;
      if (elegidas.every((im, i) => i === 0 || im.real > elegidas[i - 1].real) && new Set(elegidas.map(im => im.nombre)).size >= elegidas.length - 1) break;
    }
    return mejor.map(im => ({ im, img: null }));
  }

  async function empezarPartida() {
    if (estado.ocupado) return;
    estado.ocupado = true;
    Sonido.desbloquear();
    estado.apodo = $('#apodo').value.trim().slice(0, 16) || 'Tú';
    try { localStorage.setItem('encuadralo-apodo', $('#apodo').value.trim()); } catch (e) { /* sin almacenamiento */ }
    Object.assign(estado, { rondas: elegirRondas(), i: 0, historial: [] });
    try {
      await Promise.all(estado.rondas.map(async r => { r.img = await cargarImagen(r.im.archivo); }));
    } catch (err) {
      alert(err.message);
      estado.ocupado = false;
      return;
    }
    estado.ocupado = false;
    if (estado.tutorialVisto) mostrarPrevia(); else mostrarTutorial(true);
  }

  // ------------------------------------------------------------------ previa con la muestra y cuenta atrás
  async function mostrarPrevia() {
    const r = estado.rondas[estado.i], nivel = C.niveles[r.im.nivel];
    $('#previa-num').textContent = estado.i + 1;
    $('#previa-total').textContent = estado.rondas.length;
    $('#previa-nivel').textContent = nivel.nombre;
    $('#previa-articulo').textContent = r.im.articulo === 'las' ? 'todas las' : 'todos los';
    $('#previa-emoji').textContent = r.im.emoji;
    $('#previa-objeto').textContent = r.im.nombre;
    $('#previa-pista').textContent = `Tienes ${C.segundos[r.im.nivel]} segundos. ¡Solo cuentan los objetos como el de la muestra!`;
    $('#pantalla-previa').style.setProperty('--color-reto', nivel.color);
    pintarMuestra($('#previa-muestra'), r.img, r.im.ejemplo, 150, 150);
    const cuenta = $('#cuenta'), num = $('#cuenta-num');
    cuenta.classList.remove('visible');
    num.textContent = '';
    irA('pantalla-previa');
    Sonido.musica(null);
    Sonido.efecto('whoosh');
    await esperar(2300);
    cuenta.classList.add('visible');
    for (const n of [3, 2, 1]) {
      num.textContent = n;
      num.classList.remove('corto');
      reiniciarAnimacion(num, 'pop');
      Sonido.efecto('tic');
      await esperar(850);
    }
    num.textContent = '¡YA!';
    num.classList.add('corto');
    reiniciarAnimacion(num, 'pop');
    Sonido.efecto('ya');
    await esperar(550);
    empezarRonda();
  }

  // ------------------------------------------------------------------ ronda
  const entrada = $('#respuesta');
  const marcador = new Marcador($('#lienzo-conteo'), $('#escenario'), n => {
    $('#num-marcas').textContent = n;
    if (estado.jugando) entrada.value = n || '';
  });
  const leerRespuesta = () => {
    const v = parseInt(entrada.value, 10);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  entrada.addEventListener('input', () => { entrada.value = entrada.value.replace(/\D/g, '').slice(0, 4); });
  entrada.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); terminarRonda(false); } });
  document.querySelectorAll('[data-delta]').forEach(b => b.addEventListener('click', () => {
    if (!estado.jugando) return;
    entrada.value = Math.max(0, (leerRespuesta() ?? 0) + Number(b.dataset.delta));
    Sonido.efecto('tic');
  }));
  $('#btn-deshacer').addEventListener('click', () => marcador.deshacer());
  $('#btn-borrar').addEventListener('click', () => marcador.borrarTodo());
  $('#btn-hecho').addEventListener('click', () => terminarRonda(false));
  document.addEventListener('keydown', e => {
    if (!estado.jugando || e.target === entrada) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); marcador.deshacer(); }
    else if (e.key === 'Enter') { e.preventDefault(); terminarRonda(false); }
    else if (/^\d$/.test(e.key)) entrada.focus();
  });

  const controlesRonda = activos => document.querySelectorAll('.panel-respuesta button, #respuesta').forEach(el => { el.disabled = !activos; });

  function empezarRonda() {
    const r = estado.rondas[estado.i], nivel = C.niveles[r.im.nivel];
    $('#ronda-articulo').textContent = r.im.articulo;
    $('#ronda-emoji').textContent = r.im.emoji;
    $('#ronda-objeto').textContent = r.im.nombre;
    $('#ronda-pista').textContent = 'Haz clic en cada uno para marcarlo y escribe cuántos hay';
    $('#ronda-nivel').textContent = nivel.nombre;
    $('#ronda-n').textContent = `ronda ${estado.i + 1}/${estado.rondas.length}`;
    $('#capa-ia').hidden = true;
    $('#aviso-tiempo').hidden = true;
    entrada.value = '';
    controlesRonda(true);
    irA('pantalla-ronda');
    pintarMuestra($('#ronda-muestra'), r.img, r.im.ejemplo, 110, 110);
    Object.assign(estado, { jugando: true, t0: performance.now(), limite: C.segundos[r.im.nivel], ultimoSegundo: null });
    marcador.cargar(r.img);
    Sonido.musica('ronda');
    requestAnimationFrame(actualizarReloj);
  }

  function actualizarReloj() {
    if (!estado.jugando) return;
    const limite = estado.limite;
    const resto = Math.max(0, limite - (performance.now() - estado.t0) / 1000), seg = Math.ceil(resto);
    if (seg !== estado.ultimoSegundo) {
      estado.ultimoSegundo = seg;
      $('#reloj-num').textContent = seg;
      $('#reloj').classList.toggle('urgente', seg <= 5);
      if (seg <= 5 && seg > 0) Sonido.efecto('tictac');
    }
    const barra = $('#barra-tiempo'), fr = resto / limite;
    barra.style.transform = `scaleX(${fr})`;
    barra.className = fr > 0.5 ? '' : fr > 0.2 ? 'media' : 'baja';
    if (resto <= 0) { terminarRonda(true); return; }
    requestAnimationFrame(actualizarReloj);
  }

  async function terminarRonda(porTiempo) {
    if (!estado.jugando) return;
    if (!porTiempo && leerRespuesta() === null) {   // sin número todavía: avisamos en vez de terminar
      reiniciarAnimacion(entrada, 'sacudir');
      entrada.focus();
      Sonido.efecto('fallo');
      return;
    }
    estado.jugando = false;
    const segundos = Math.min(estado.limite, (performance.now() - estado.t0) / 1000);
    marcador.bloquear();
    controlesRonda(false);
    entrada.blur();
    $('#reloj').classList.remove('urgente');
    Sonido.musica(null);
    const r = estado.rondas[estado.i];
    // Si se acaba el tiempo sin escribir nada, vale el número de marcas.
    const respuesta = leerRespuesta() ?? marcador.marcas.length;
    const marcas = marcador.marcas.map(m => [...m]);

    if (porTiempo) {
      $('#aviso-tiempo').hidden = false;
      Sonido.efecto('tiempo');
      await esperar(1200);
      $('#aviso-tiempo').hidden = true;
    } else {
      Sonido.efecto('hecho');
    }

    // Turno de la IA: su recuento está pregrabado; solo se simula la espera.
    $('#capa-ia-texto').textContent = 'La IA está contando…';
    $('#capa-ia').hidden = false;
    Sonido.efecto('escaneo');
    await dosFrames();
    await esperar(1700);
    const ia = r.im.ia;
    // Los puntos se ordenan de arriba abajo para que la animación los vaya «encontrando» en orden de lectura.
    const puntosIA = [...ia.puntos].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    estado.historial.push({
      ronda: r, marcas, puntosIA,
      resJ: calcular(respuesta, r.im.real, segundos, estado.limite),
      resIA: { ...calcular(ia.respuesta, r.im.real, ia.ms / 1000, estado.limite), ms: ia.ms, conteo: ia.conteo },
    });
    mostrarResultado();
  }

  // ------------------------------------------------------------------ resultado de la ronda
  function crearPanel(clase) {
    const raiz = $('#tpl-panel').content.firstElementChild.cloneNode(true);
    raiz.classList.add('panel-' + clase);
    const q = s => raiz.querySelector(s);
    const lineas = {};
    for (const t of ['respuesta', 'aciertos', 'exacto', 'bonus']) {
      lineas[t] = q('.linea.' + t);
      lineas[t].dataset.base = lineas[t].className;
    }
    return {
      raiz, lineas, lienzo: q('.panel-lienzo'), total: q('.panel-total b'), cajaTotal: q('.panel-total'),
      grande: q('.recuento-grande b'), grandeCaja: q('.recuento-grande'),
      avatar: q('.avatar'), nombre: q('.panel-nombre'), sub: q('.panel-sub'), tiempo: q('.panel-tiempo'),
      visor: new VisorConteo(q('canvas'), q('.panel-lienzo')),
    };
  }
  const panelJ = crearPanel('jugador'), panelIA = crearPanel('ia');
  $('#duelo').prepend(panelJ.raiz);
  $('#duelo').append(panelIA.raiz);

  function prepararPanel(p, h, esJ) {
    const res = esJ ? h.resJ : h.resIA;
    p.avatar.textContent = esJ ? '🧑‍🎓' : '🤖';
    p.nombre.textContent = esJ ? estado.apodo.toUpperCase() : `IA · ${D.modelo}`;
    p.sub.textContent = esJ ? 'Humano' : 'Recuento calculado sin conexión';
    p.tiempo.textContent = esJ ? '⏱ ' + fmtSeg(res.segundos) : '⚡ ' + fmtMs(res.ms);
    p.total.textContent = '0';
    p.grande.textContent = '0';
    p.grandeCaja.className = 'recuento-grande';
    for (const l of Object.values(p.lineas)) {
      l.className = l.dataset.base;
      l.querySelector('.linea-puntos').textContent = l.classList.contains('respuesta') ? '' : '0';
      l.querySelector('.linea-detalle').innerHTML = '&nbsp;';
    }
    p.lineas.respuesta.querySelector('.n').textContent = '?';
    p.lineas.aciertos.querySelector('.n').textContent = '';
    p.lineas.bonus.querySelector('.linea-detalle').textContent = esJ ? `Has tardado ${fmtSeg(res.segundos)}` : `Ha tardado ${fmtMs(res.ms)} (${D.dispositivoIA})`;
    p.visor.cargar(h.ronda.img, esJ ? { marcas: h.marcas, puntos: h.ronda.im.puntos } : { puntosIA: h.puntosIA, puntos: h.ronda.im.puntos });
  }

  function textoError(res) {
    if (res.error === 0) return `Real: ${res.real} · ¡clavado!`;
    const quien = res.error < 0 ? `faltan ${fmt(-res.error)}` : `sobran ${fmt(res.error)}`;
    return `Real: ${res.real} · ${quien} (error ${pct(res.errorRel)})`;
  }

  // Recuento animado: primero la respuesta (marcas o cajas de la IA, una a una), luego el número real y los puntos.
  async function animarPanel(p, h, esJ) {
    const res = esJ ? h.resJ : h.resIA, L = p.lineas, ritmo = C.ritmoAnimacion;
    const sonar = s => { if (esJ) Sonido.efecto(s); };
    let total = 0;
    const sumar = delta => {
      if (!delta) return;
      animarNumero(p.total, total, total + delta, 450);
      total += delta;
      reiniciarAnimacion(p.cajaTotal, 'golpe');
      flotante(p.lienzo, '+' + fmt(delta), 'positivo');
    };
    const revelar = (linea, vacia) => {
      linea.classList.add('revelada');
      linea.classList.toggle('vacia', vacia);
      reiniciarAnimacion(linea, 'golpe');
    };

    // 1) Lo que ha contado cada uno.
    const elementos = esJ ? h.marcas.length : h.puntosIA.length;
    const pasos = Math.min(elementos, 30), duracion = Math.min(1600, 70 * elementos);
    for (let s = 1; s <= pasos; s++) {
      const n = Math.round(s * elementos / pasos);
      p.visor.mostrar(esJ ? { nMarcas: n } : { nIA: n });
      if (!esJ) p.grande.textContent = fmt(n);
      await esperar(duracion / pasos);
    }
    await animarNumero(p.grande, esJ ? 0 : res.respuesta, res.respuesta, esJ ? 500 : 1);
    revelar(L.respuesta, false);
    L.respuesta.querySelector('.n').textContent = fmt(res.respuesta);
    sonar('pop');
    await esperar(ritmo);

    // 2) El número real.
    p.visor.mostrar({ verPuntos: true });
    L.respuesta.querySelector('.linea-detalle').textContent = textoError(res);
    p.grandeCaja.classList.add(res.error === 0 ? 'exacto' : res.precision >= 0.8 ? 'cerca' : 'lejos');
    p.grande.textContent = res.error === 0 ? fmt(res.respuesta) : `${fmt(res.respuesta)} / ${fmt(res.real)}`;
    p.grandeCaja.querySelector('small').textContent = res.error === 0 ? '¡exacto!' : res.error < 0 ? `faltan ${fmt(-res.error)}` : `sobran ${fmt(res.error)}`;
    reiniciarAnimacion(p.grandeCaja, 'golpe');
    await esperar(ritmo + 300);

    // 3) Puntos.
    revelar(L.aciertos, !res.puntosPrecision);
    L.aciertos.querySelector('.n').textContent = pct(res.precision);
    L.aciertos.querySelector('.linea-detalle').textContent = res.precision > 0
      ? `${fmt(C.puntosPrecision)} × (1 − ${fmt(Math.abs(res.error))}/${fmt(res.real)})`
      : 'Error del 100 % o más: 0 puntos';
    L.aciertos.querySelector('.linea-puntos').textContent = '+' + fmt(res.puntosPrecision);
    sumar(res.puntosPrecision);
    sonar(res.puntosPrecision ? 'moneda' : 'fallo');
    await esperar(ritmo);

    revelar(L.exacto, !res.exacto);
    L.exacto.querySelector('.linea-detalle').textContent = res.exacto ? '¡En el clavo!' : `Solo si la respuesta es ${res.real} exactamente`;
    L.exacto.querySelector('.linea-puntos').textContent = '+' + fmt(res.exacto);
    if (res.exacto) {
      sumar(res.exacto);
      sonar('bonus');
      await esperar(ritmo + 300);
    } else {
      await esperar(ritmo / 2);
    }

    revelar(L.bonus, !res.bonus);
    L.bonus.querySelector('.linea-puntos').textContent = '+' + fmt(res.bonus);
    if (res.bonus) {
      sumar(res.bonus);
      sonar('bonus');
    }
    await esperar(ritmo);
  }

  const totales = lista => ({ J: suma(lista.map(h => h.resJ.total)), IA: suma(lista.map(h => h.resIA.total)) });

  function pintarMarcador({ J, IA }, animar) {
    const max = Math.max(J, IA, 1);
    $('#marcador-jugador .nombre').textContent = estado.apodo;
    for (const [sel, v] of [['#marcador-jugador', J], ['#marcador-ia', IA]]) {
      const relleno = $(sel + ' .relleno'), num = $(sel + ' b');
      if (animar) {
        relleno.style.width = (v / max) * 100 + '%';
        animarNumero(num, Number(num.dataset.valor) || 0, v, 1000);
      } else {
        relleno.style.transition = 'none';
        relleno.style.width = (v / max) * 100 + '%';
        void relleno.offsetWidth;
        relleno.style.transition = '';
        num.textContent = fmt(v);
      }
      num.dataset.valor = v;
    }
  }

  async function mostrarResultado() {
    const h = estado.historial.at(-1), n = estado.historial.length, total = estado.rondas.length, im = h.ronda.im;
    $('#resultado-ronda').textContent = `RONDA ${n} DE ${total} · ${C.niveles[im.nivel].nombre} · ${im.emoji} ${im.nombre}`;
    const veredicto = $('#veredicto'), comparativa = $('#comparativa'), btn = $('#btn-siguiente');
    veredicto.className = 'veredicto oculto';
    comparativa.innerHTML = '&nbsp;';
    btn.disabled = true;
    btn.textContent = n < total ? 'Siguiente ronda →' : 'Ver resultado final 🏁';
    prepararPanel(panelJ, h, true);
    prepararPanel(panelIA, h, false);
    pintarMarcador(totales(estado.historial.slice(0, -1)), false);
    irA('pantalla-resultado');
    await esperar(800);
    await Promise.all([animarPanel(panelJ, h, true), animarPanel(panelIA, h, false)]);

    const dif = h.resJ.total - h.resIA.total;
    veredicto.textContent = dif > 0 ? '¡Ganas esta ronda! 🏆' : dif < 0 ? 'La IA gana esta ronda 🤖' : '¡Empate! 🤝';
    veredicto.className = 'veredicto aparece ' + (dif > 0 ? 'gana' : dif < 0 ? 'pierde' : 'empate');
    Sonido.efecto(dif > 0 ? 'victoria' : dif < 0 ? 'derrota' : 'bonus');
    if (dif > 0) confeti(1500, 120);
    comparativa.innerHTML = `Había <b>${im.real}</b> ${escapar(im.nombre.toLowerCase())}.
      Tú dijiste <b>${h.resJ.respuesta}</b> (${h.resJ.error ? 'error ' + pct(h.resJ.errorRel) : '¡exacto!'})
      · la IA contó <b>${h.resIA.respuesta}</b> (${h.resIA.error ? 'error ' + pct(h.resIA.errorRel) : '¡exacto!'})
      <span class="sin-pista">Un detector como YOLO, que busca cada objeto y le pone una caja, habría visto ${im.yolo.respuesta}.</span>`;
    pintarMarcador(totales(estado.historial), true);
    btn.disabled = false;
    btn.focus({ preventScroll: true });
  }

  $('#btn-siguiente').addEventListener('click', () => {
    $('#btn-siguiente').disabled = true;
    estado.i++;
    if (estado.i < estado.rondas.length) mostrarPrevia(); else mostrarFinal();
  });

  // ------------------------------------------------------------------ final
  function resumen(quien) {
    const rs = estado.historial.map(h => (quien === 'J' ? h.resJ : h.resIA));
    const otro = estado.historial.map(h => (quien === 'J' ? h.resIA : h.resJ));
    return {
      puntos: suma(rs.map(r => r.total)),
      segundos: suma(rs.map(r => r.segundos)),
      mae: media(rs.map(r => Math.abs(r.error))),           // error absoluto medio
      mape: media(rs.map(r => r.errorRel)),                 // error relativo medio
      exactos: rs.filter(r => r.error === 0).length,
      defecto: rs.filter(r => r.error < 0).length,          // rondas en las que se quedó corto
      ganadas: rs.filter((r, i) => r.total > otro[i].total).length,
    };
  }

  function mostrarFinal() {
    const J = resumen('J'), IA = resumen('IA'), n = estado.historial.length;
    const gana = J.puntos > IA.puntos ? 'J' : J.puntos < IA.puntos ? 'IA' : 'empate';
    $('#titulo-final').textContent = gana === 'J' ? '¡HAS GANADO A LA IA! 🏆' : gana === 'IA' ? 'GANA LA IA… ¡POR ESTA VEZ! 🤖' : '¡EMPATE TÉCNICO! 🤝';

    const max = Math.max(J.puntos, IA.puntos, 1);
    for (const [sel, datos, quien] of [['#podio-jugador', J, 'J'], ['#podio-ia', IA, 'IA']]) {
      const col = $(sel);
      col.classList.toggle('ganador', gana === quien);
      col.querySelector('.podio-bloque').style.height = Math.round(70 + 120 * (datos.puntos / max)) + 'px';
      animarNumero(col.querySelector('.podio-puntos'), 0, datos.puntos, 1500);
    }
    $('#podio-jugador .podio-nombre').textContent = estado.apodo;

    // Conclusión en lenguaje sencillo.
    const frases = [];
    const veces = IA.segundos > 0 ? J.segundos / IA.segundos : 0;
    if (veces >= 2) frases.push(`La IA ha sido unas <b>${fmt(veces)} veces más rápida</b> que tú (${fmtTiempo(IA.segundos)} frente a ${fmtSeg(J.segundos)}).`);
    frases.push(J.mape < IA.mape
      ? `${frases.length ? 'Pero <b>tus' : '<b>Tus'} recuentos han sido más precisos</b>: te has equivocado de media un ${pct(J.mape)}, y la IA un ${pct(IA.mape)}.`
      : `${frases.length ? 'Además, sus' : 'Los recuentos de la IA han sido'} ${frases.length ? 'recuentos han sido ' : ''}más precisos: error medio del ${pct(IA.mape)} frente a tu ${pct(J.mape)}.`);
    // ¿Dónde le ha ido mejor a cada uno? LOCA suele fallar más con pocos objetos grandes que con multitudes.
    const errNivel = (quien, niveles) => media(estado.historial.filter(h => niveles.includes(h.ronda.im.nivel)).map(h => h[quien].errorRel));
    const facilJ = errNivel('resJ', ['facil', 'medio']), facilIA = errNivel('resIA', ['facil', 'medio']);
    const dificilJ = errNivel('resJ', ['dificil', 'extremo']), dificilIA = errNivel('resIA', ['dificil', 'extremo']);
    if (facilJ < facilIA && dificilIA < dificilJ) {
      frases.push(`Fíjate: <b>con pocos objetos has contado mejor tú</b> (error del ${pct(facilJ)} frente al ${pct(facilIA)} de la IA), pero <b>con muchos objetos ha ganado la IA</b> (${pct(dificilIA)} frente a tu ${pct(dificilJ)}).`);
    }
    const yoloExtremo = estado.historial.find(h => h.ronda.im.nivel === 'extremo');
    if (yoloExtremo) frases.push(`En la ronda extrema había ${yoloExtremo.ronda.im.real}: LOCA contó ${yoloExtremo.resIA.respuesta}, y un detector como YOLO solo habría visto ${yoloExtremo.ronda.im.yolo.respuesta}.`);
    if (J.exactos) frases.push(`Has clavado el número exacto en <b>${J.exactos} ronda${J.exactos > 1 ? 's' : ''}</b>.`);
    $('#conclusion').innerHTML = frases.join(' ');

    const filas = [
      ['Puntos totales', fmt(J.puntos), fmt(IA.puntos), J.puntos - IA.puntos],
      ['Rondas ganadas', J.ganadas, IA.ganadas, J.ganadas - IA.ganadas],
      ['Números exactos', `${J.exactos}/${n}`, `${IA.exactos}/${n}`, J.exactos - IA.exactos],
      ['Error medio (objetos)', fmt(J.mae), fmt(IA.mae), IA.mae - J.mae],
      ['Error relativo medio', pct(J.mape), pct(IA.mape), IA.mape - J.mape],
      ['Tiempo total', fmtSeg(J.segundos), fmtTiempo(IA.segundos), IA.segundos - J.segundos],
    ];
    $('#tabla-stats').innerHTML = `<thead><tr><th></th><th>${escapar(estado.apodo)}</th><th>IA</th></tr></thead><tbody>` +
      filas.map(([nombre, vj, via, dif]) => `<tr><td>${nombre}</td><td class="${dif > 0 ? 'mejor' : ''}">${vj}</td><td class="${dif < 0 ? 'mejor' : ''}">${via}</td></tr>`).join('') +
      '</tbody>';

    $('#tabla-rondas').innerHTML = '<thead><tr><th>Reto</th><th>Real</th><th>Tú</th><th>IA</th><th>Tus puntos</th><th>Puntos IA</th><th>Gana</th></tr></thead><tbody>' +
      estado.historial.map(h => {
        const dif = h.resJ.total - h.resIA.total, im = h.ronda.im;
        return `<tr><td><img src="${im.archivo}" alt="">${im.emoji} ${escapar(im.nombre)}</td><td><b>${im.real}</b></td>` +
          `<td>${h.resJ.respuesta}</td><td>${h.resIA.respuesta}</td>` +
          `<td class="${dif > 0 ? 'gana' : ''}">${fmt(h.resJ.total)}</td><td class="${dif < 0 ? 'gana' : ''}">${fmt(h.resIA.total)}</td>` +
          `<td>${dif > 0 ? '🧑‍🎓' : dif < 0 ? '🤖' : '🤝'}</td></tr>`;
      }).join('') + '</tbody>';

    irA('pantalla-final');
    Sonido.efecto(gana === 'IA' ? 'derrota' : 'victoria');
    if (gana !== 'IA') setTimeout(() => confeti(6000), 600);
  }

  function descargarCSV() {
    const dec = (v, d = 2) => v.toFixed(d).replace('.', ',');
    const cab = ['Jugador', 'Ronda', 'Nivel', 'Objeto', 'Imagen FSC-147', 'Objetos reales',
      'Tu respuesta', 'Tu error', 'Tu error relativo', 'Tu tiempo (s)', 'Tus puntos',
      'Respuesta IA', 'Error IA', 'Error relativo IA', 'Tiempo IA (ms)', 'Puntos IA'];
    const filas = estado.historial.map((h, i) => {
      const a = h.resJ, b = h.resIA, im = h.ronda.im;
      return [estado.apodo, i + 1, C.niveles[im.nivel].nombre, im.nombre, im.id, im.real,
        a.respuesta, a.error, dec(a.errorRel), dec(a.segundos, 1), a.total,
        b.respuesta, b.error, dec(b.errorRel), dec(b.ms, 0), b.total];
    });
    const J = resumen('J'), IA = resumen('IA');
    filas.push([estado.apodo, 'TOTAL', '', '', '', suma(estado.historial.map(h => h.ronda.im.real)),
      `exactos: ${J.exactos}`, `MAE: ${dec(J.mae)}`, dec(J.mape), dec(J.segundos, 1), J.puntos,
      `exactos: ${IA.exactos}`, `MAE: ${dec(IA.mae)}`, dec(IA.mape), dec(IA.segundos * 1000, 0), IA.puntos]);
    const csv = '﻿' + [cab, ...filas].map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `cuentalos_${estado.apodo.replace(/[^\p{L}\p{N}_-]+/gu, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('#btn-otra').addEventListener('click', empezarPartida);
  $('#btn-csv').addEventListener('click', descargarCSV);
  $('#btn-inicio').addEventListener('click', () => { irA('pantalla-inicio'); Sonido.musica('inicio'); });
})();
