// «¡Ubícalo!»: inicio → (tutorial) → previa → ronda (poner la chincheta) → turno de la IA → resultado → … → final.
// Usa los módulos comunes Efectos y Sonido, y el mapa vectorial de mapa.js. La IA (GeoCLIP) está pregrabada.
(() => {
  const D = window.DATOS_UBICAR, C = window.CONFIG;
  const { esperar, dosFrames, fmt, fmtSeg, fmtMs, fmtTiempo, animarNumero, reiniciarAnimacion, flotante, confeti } = Efectos;
  const $ = sel => document.querySelector(sel);

  const estado = {
    apodo: 'Tú', rondas: [], i: 0, historial: [], pin: null,
    jugando: false, t0: 0, ultimoSegundo: null, tutorialVisto: false, ocupado: false, trasTutorial: null,
  };

  // ------------------------------------------------------------------ utilidades
  const suma = arr => arr.reduce((s, v) => s + v, 0);
  const media = arr => (arr.length ? suma(arr) / arr.length : 0);
  const pct = v => Math.round(v * 100) + ' %';
  const barajar = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtKm = km => km == null ? '—'
    : km < 1 ? Math.round(km * 1000).toLocaleString('es-ES') + ' m'
    : km.toLocaleString('es-ES', { maximumFractionDigits: km < 10 ? 1 : 0 }) + ' km';
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
  const numRondas = Math.min(C.rondas, D.imagenes.length);
  $('#dato-rondas').textContent = numRondas;
  $('#tabla-distancias').innerHTML = [0, 1, 5, 10, 25].map(km =>
    `<li><span>📍 a ${km} km</span><b>${fmt(puntosPorDistancia(km))} puntos</b></li>`).join('');

  // ------------------------------------------------------------------ puntuación
  function puntosPorDistancia(km) {
    return km == null ? 0 : Math.round(C.puntosMax * Math.exp(-km / C.kKm));
  }

  // Resultado de una respuesta: punto elegido [lon, lat] (o null si no hay), lugar real y tiempo empleado.
  function calcular(punto, real, segundos) {
    const km = punto ? Mapa.distanciaKm(punto, real) : null;
    const total = puntosPorDistancia(km);
    return { punto, km, total, precision: total / C.puntosMax, segundos, cerca: punto ? Mapa.cercaDe(punto) : null };
  }

  // Predicción de GeoCLIP para una foto: [lon, lat] (los datos guardan [lat, lon, probabilidad]).
  function prediccionIA(im, tipo = C.iaPrediccion) {
    const p = im.ia?.[tipo]?.[0];
    return p ? [p[1], p[0]] : null;
  }

  // ------------------------------------------------------------------ fondo y controles globales
  (function crearFondo() {
    const formas = [
      '<path d="M50 96C30 66 16 52 16 34a34 34 0 0 1 68 0c0 18-14 32-34 62z"/>',
      '<circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-width="10"/><circle cx="50" cy="50" r="12"/>',
      '<path d="M50 4l12 34h36l-29 21 11 35-30-21-30 21 11-35L2 38h36z"/>',
      '<rect x="10" y="22" width="80" height="60" rx="10"/><circle cx="50" cy="52" r="18" fill="#000" opacity=".25"/>',
    ];
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

  // ------------------------------------------------------------------ inicio
  const chip = $('#estado-ia'), conIA = D.imagenes.filter(im => prediccionIA(im)).length;
  if (conIA === D.imagenes.length && conIA > 0) {
    chip.classList.add('lista');
    chip.querySelector('.chip-texto').textContent = 'IA lista: predicciones de GeoCLIP calculadas sin conexión';
  } else {
    chip.classList.add('pregrabado');
    chip.querySelector('.chip-texto').textContent = `Faltan predicciones de GeoCLIP (${conIA} de ${D.imagenes.length})`;
    chip.title = 'Ejecuta «python tools/preparar_ubicar.py ia» para calcularlas.';
  }
  if (D.dispositivoIA) $('#credito-dispositivo').textContent = D.dispositivoIA;

  try { $('#apodo').value = localStorage.getItem('encuadralo-apodo') || ''; } catch (e) { /* sin almacenamiento */ }
  $('#btn-jugar').addEventListener('click', empezarPartida);
  $('#apodo').addEventListener('keydown', e => { if (e.key === 'Enter') empezarPartida(); });
  $('#btn-como').addEventListener('click', () => mostrarTutorial(false));
  $('#btn-tutorial').addEventListener('click', () => estado.trasTutorial?.());
  $('#btn-creditos').addEventListener('click', () => {
    $('#lista-creditos').innerHTML = D.imagenes.map(im =>
      `<li>Foto ${im.id}: ${escapar(im.autor)} · <a href="${escapar(im.urlLicencia || im.fuente)}" target="_blank" rel="noopener">${escapar(im.licencia)}</a> · ` +
      `<a href="${escapar(im.fuente)}" target="_blank" rel="noopener">original en Wikimedia Commons</a></li>`).join('');
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

  // Fotos de la partida: de más fácil a más difícil, en orden aleatorio dentro de cada nivel.
  function elegirRondas() {
    const orden = Object.keys(C.niveles);
    return barajar(D.imagenes).slice(0, numRondas)
      .sort((a, b) => orden.indexOf(a.nivel) - orden.indexOf(b.nivel))
      .map(im => ({ im, img: null, real: [im.lon, im.lat] }));
  }

  async function empezarPartida() {
    if (estado.ocupado) return;
    estado.ocupado = true;
    Sonido.desbloquear();
    estado.apodo = $('#apodo').value.trim().slice(0, 16) || 'Tú';
    try { localStorage.setItem('encuadralo-apodo', $('#apodo').value.trim()); } catch (e) { /* sin almacenamiento */ }
    Object.assign(estado, { rondas: elegirRondas(), i: 0, historial: [] });
    try {
      await Promise.all([mapasListos, ...estado.rondas.map(async r => { r.img = await cargarImagen(r.im.archivo); })]);
    } catch (err) {
      alert(err.message);
      estado.ocupado = false;
      return;
    }
    estado.ocupado = false;
    if (estado.tutorialVisto) mostrarPrevia(); else mostrarTutorial(true);
  }

  // ------------------------------------------------------------------ previa y cuenta atrás
  async function mostrarPrevia() {
    const r = estado.rondas[estado.i], nivel = C.niveles[r.im.nivel];
    $('#previa-num').textContent = estado.i + 1;
    $('#previa-total').textContent = estado.rondas.length;
    $('#previa-nivel').textContent = nivel.nombre;
    $('#previa-pista').textContent = `Tienes ${C.segundos} segundos. Todas las fotos son de la provincia de Alicante.`;
    $('#pantalla-previa').style.setProperty('--color-reto', nivel.color);
    const cuenta = $('#cuenta'), num = $('#cuenta-num');
    cuenta.classList.remove('visible');
    num.textContent = '';
    irA('pantalla-previa');
    Sonido.musica(null);
    Sonido.efecto('whoosh');
    await esperar(2000);
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
  const btnHecho = $('#btn-hecho'), infoPin = $('#info-pin');
  // Los mapas se crean cuando el motor está listo (MapLibre se carga como módulo, en paralelo).
  let mapaRonda = null, panelJ = null, panelIA = null;
  const mapasListos = Mapa.preparar().then(() => {
    mapaRonda = crearMapaRonda();
    panelJ = crearPanel('jugador');
    panelIA = crearPanel('ia');
    $('#duelo').prepend(panelJ.raiz);
    $('#duelo').append(panelIA.raiz);
    document.body.dataset.mapa = Mapa.motor;
  });
  const crearMapaRonda = () => Mapa.crear($('#lienzo-mapa'), {
    interactivo: true,
    alPulsar: lonlat => {
      if (!estado.jugando) return;
      estado.pin = lonlat;
      mapaRonda.poner({ pines: [{ tipo: 'jugador', lonlat }] });
      const cerca = Mapa.cercaDe(lonlat);
      infoPin.textContent = cerca.km < 3 ? `Cerca de ${cerca.nombre}` : `A ${fmtKm(cerca.km)} de ${cerca.nombre}`;
      btnHecho.disabled = false;
      Sonido.efecto('pop');
    },
  });
  document.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    const f = Number(b.dataset.zoom);
    if (f) mapaRonda.zoom(f); else mapaRonda.verTodo();
  }));
  btnHecho.addEventListener('click', () => terminarRonda(false));
  document.addEventListener('keydown', e => {
    if (!estado.jugando) return;
    if (e.key === 'Enter' && estado.pin) { e.preventDefault(); terminarRonda(false); }
    else if (e.key === '+' || e.key === '=') mapaRonda.zoom(1.6);
    else if (e.key === '-') mapaRonda.zoom(0.625);
  });
  const ampliar = () => {
    $('#foto-grande').src = $('#foto').src;
    $('#dialogo-foto').showModal();
  };
  $('#foto').addEventListener('click', ampliar);
  $('#btn-ampliar').addEventListener('click', ampliar);

  function empezarRonda() {
    const r = estado.rondas[estado.i], nivel = C.niveles[r.im.nivel];
    $('#ronda-nivel').textContent = nivel.nombre;
    $('#ronda-n').textContent = `foto ${estado.i + 1}/${estado.rondas.length}`;
    $('#capa-ia').hidden = true;
    $('#aviso-tiempo').hidden = true;
    $('#foto').src = r.img.src;
    estado.pin = null;
    btnHecho.disabled = true;
    infoPin.textContent = 'Aún no has puesto la chincheta';
    irA('pantalla-ronda');
    mapaRonda.poner({ pines: [], lineas: [] });
    mapaRonda.bloquear(false);
    requestAnimationFrame(() => mapaRonda.verTodo());
    Object.assign(estado, { jugando: true, t0: performance.now(), ultimoSegundo: null });
    Sonido.musica('ronda');
    requestAnimationFrame(actualizarReloj);
  }

  function actualizarReloj() {
    if (!estado.jugando) return;
    const limite = C.segundos;
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
    if (!estado.jugando || (!porTiempo && !estado.pin)) return;
    estado.jugando = false;
    const segundos = Math.min(C.segundos, (performance.now() - estado.t0) / 1000);
    mapaRonda.bloquear(true);
    btnHecho.disabled = true;
    $('#reloj').classList.remove('urgente');
    Sonido.musica(null);
    const r = estado.rondas[estado.i];

    if (porTiempo) {
      $('#aviso-tiempo').hidden = false;
      Sonido.efecto('tiempo');
      await esperar(1200);
      $('#aviso-tiempo').hidden = true;
    } else {
      Sonido.efecto('hecho');
    }

    // Turno de la IA: su predicción está pregrabada; solo se simula la espera.
    $('#capa-ia-texto').textContent = 'GeoCLIP está mirando la foto…';
    $('#capa-ia').hidden = false;
    Sonido.efecto('escaneo');
    await dosFrames();
    await esperar(1700);
    const puntoIA = prediccionIA(r.im), msIA = r.im.ia?.ms ?? null;
    estado.historial.push({
      ronda: r,
      resJ: calcular(estado.pin, r.real, segundos),
      resIA: { ...calcular(puntoIA, r.real, msIA == null ? null : msIA / 1000), ms: msIA },
      mundoIA: prediccionIA(r.im, 'mundo'),
    });
    mostrarResultado();
  }

  // ------------------------------------------------------------------ resultado de la ronda
  function crearPanel(clase) {
    const raiz = $('#tpl-panel').content.firstElementChild.cloneNode(true);
    raiz.classList.add('panel-' + clase);
    const q = s => raiz.querySelector(s);
    const lineas = {};
    for (const t of ['respuesta', 'aciertos', 'tiempo']) {
      lineas[t] = q('.linea.' + t);
      lineas[t].dataset.base = lineas[t].className;
    }
    const lienzo = q('.panel-lienzo');
    return {
      raiz, lineas, lienzo, total: q('.panel-total b'), cajaTotal: q('.panel-total'),
      grande: q('.recuento-grande b'), grandeCaja: q('.recuento-grande'),
      avatar: q('.avatar'), nombre: q('.panel-nombre'), sub: q('.panel-sub'), tiempo: q('.panel-tiempo'),
      mapa: Mapa.crear(q('.lienzo-mapa')),
    };
  }

  function prepararPanel(p, h, esJ) {
    const res = esJ ? h.resJ : h.resIA;
    p.avatar.textContent = esJ ? '🧑‍🎓' : '🤖';
    p.nombre.textContent = esJ ? estado.apodo.toUpperCase() : `IA · ${D.modelo}`;
    p.sub.textContent = esJ ? 'Humano' : res.punto ? 'Predicción calculada sin conexión' : 'Sin predicción todavía';
    p.tiempo.textContent = esJ ? '⏱ ' + fmtSeg(res.segundos) : res.ms != null ? '⚡ ' + fmtMs(res.ms) : '';
    p.total.textContent = '0';
    p.grande.textContent = '?';
    p.grandeCaja.className = 'recuento-grande';
    for (const l of Object.values(p.lineas)) {
      l.className = l.dataset.base;
      l.querySelector('.linea-puntos').textContent = l.classList.contains('aciertos') ? '0' : '';
      l.querySelector('.linea-detalle').innerHTML = '&nbsp;';
      l.querySelector('.n').textContent = '';
    }
    p.mapa.poner({ pines: [], lineas: [] });
    p.mapa.encuadrar(res.punto ? [res.punto, h.ronda.real] : [h.ronda.real], 6);
  }

  // Animación: aparece la chincheta, se traza la línea hasta el lugar real y se suman los puntos.
  async function animarPanel(p, h, esJ) {
    const res = esJ ? h.resJ : h.resIA, L = p.lineas, ritmo = C.ritmoAnimacion, real = h.ronda.real;
    const sonar = s => { if (esJ) Sonido.efecto(s); };
    const tipo = esJ ? 'jugador' : 'ia', color = esJ ? '#1368ce' : '#0b8f94';
    const revelar = (linea, vacia) => {
      linea.classList.add('revelada');
      linea.classList.toggle('vacia', vacia);
      reiniciarAnimacion(linea, 'golpe');
    };

    // 1) La chincheta de cada uno.
    if (res.punto) {
      for (let k = 1; k <= 8; k++) {
        p.mapa.poner({ pines: [{ tipo, lonlat: res.punto, escala: Math.min(1, k / 6) * (k === 7 ? 1.15 : 1) }] });
        await esperar(30);
      }
      sonar('pop');
    }
    await esperar(ritmo);

    // 2) El lugar real y la línea que los une.
    const pinReal = { tipo: 'real', lonlat: real };
    if (res.punto) {
      const pasos = 24;
      for (let k = 1; k <= pasos; k++) {
        p.mapa.poner({ lineas: [{ de: res.punto, a: real, color, progreso: k / pasos }], pines: [{ tipo, lonlat: res.punto }] });
        await esperar(500 / pasos);
      }
      p.mapa.poner({ lineas: [{ de: res.punto, a: real, color, progreso: 1, texto: fmtKm(res.km) }], pines: [{ tipo, lonlat: res.punto }, pinReal] });
    } else {
      p.mapa.poner({ pines: [pinReal] });
    }
    sonar('whoosh');
    revelar(L.respuesta, !res.punto);
    L.respuesta.querySelector('.n').textContent = fmtKm(res.km);
    L.respuesta.querySelector('.linea-detalle').textContent = !res.punto
      ? (esJ ? 'No pusiste la chincheta a tiempo' : 'Falta calcular la predicción de GeoCLIP')
      : res.km < 0.5 ? '¡Prácticamente en el sitio!'
      : `Marcó ${res.cerca.km < 3 ? 'cerca de' : 'a ' + fmtKm(res.cerca.km) + ' de'} ${res.cerca.nombre}`;
    p.grande.textContent = fmtKm(res.km);
    p.grandeCaja.classList.add(!res.punto ? 'lejos' : res.km < 2 ? 'exacto' : res.km < 15 ? 'cerca' : 'lejos');
    reiniciarAnimacion(p.grandeCaja, 'golpe');
    await esperar(ritmo + 300);

    // 3) Puntos.
    revelar(L.aciertos, !res.total);
    L.aciertos.querySelector('.n').textContent = pct(res.precision);
    L.aciertos.querySelector('.linea-detalle').textContent = res.punto
      ? `${fmt(C.puntosMax)} × e^(−${res.km.toLocaleString('es-ES', { maximumFractionDigits: res.km < 10 ? 2 : 1 })} km / ${C.kKm} km)`
      : 'Sin chincheta: 0 puntos';
    L.aciertos.querySelector('.linea-puntos').textContent = '+' + fmt(res.total);
    if (res.total) {
      animarNumero(p.total, 0, res.total, 700);
      reiniciarAnimacion(p.cajaTotal, 'golpe');
      flotante(p.lienzo, '+' + fmt(res.total), 'positivo');
    }
    sonar(res.total >= 500 ? 'bonus' : res.total ? 'moneda' : 'fallo');
    await esperar(ritmo);

    revelar(L.tiempo, false);
    L.tiempo.querySelector('.n').textContent = esJ ? fmtSeg(res.segundos) : res.ms != null ? fmtMs(res.ms) : '—';
    L.tiempo.querySelector('.linea-detalle').textContent = esJ ? 'Lo que has tardado en decidirte'
      : res.ms != null ? `Medido sin conexión · ${D.dispositivoIA}` : '';
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
    $('#resultado-ronda').textContent = `FOTO ${n} DE ${total} · ${C.niveles[im.nivel].nombre}`;
    const veredicto = $('#veredicto'), comparativa = $('#comparativa'), btn = $('#btn-siguiente');
    veredicto.className = 'veredicto oculto';
    comparativa.innerHTML = '&nbsp;';
    $('#credito-foto').innerHTML = `📷 ${escapar(im.autor)} · <a href="${escapar(im.urlLicencia || im.fuente)}" target="_blank" rel="noopener">${escapar(im.licencia)}</a> · ` +
      `<a href="${escapar(im.fuente)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    btn.disabled = true;
    btn.textContent = n < total ? 'Siguiente foto →' : 'Ver resultado final 🏁';
    irA('pantalla-resultado');
    await dosFrames();
    prepararPanel(panelJ, h, true);
    prepararPanel(panelIA, h, false);
    pintarMarcador(totales(estado.historial.slice(0, -1)), false);
    await esperar(700);
    await Promise.all([animarPanel(panelJ, h, true), animarPanel(panelIA, h, false)]);

    const dif = h.resJ.total - h.resIA.total;
    veredicto.textContent = dif > 0 ? '¡Ganas esta ronda! 🏆' : dif < 0 ? 'La IA gana esta ronda 🤖' : '¡Empate! 🤝';
    veredicto.className = 'veredicto aparece ' + (dif > 0 ? 'gana' : dif < 0 ? 'pierde' : 'empate');
    Sonido.efecto(dif > 0 ? 'victoria' : dif < 0 ? 'derrota' : 'bonus');
    if (dif > 0) confeti(1500, 120);
    let texto = `La foto es de <b>${escapar(im.lugar)}</b>. Tú: <b>${fmtKm(h.resJ.km)}</b> · GeoCLIP: <b>${fmtKm(h.resIA.km)}</b>.`;
    if (h.mundoIA && h.resIA.punto && C.iaPrediccion === 'provincia') {
      const kmMundo = Mapa.distanciaKm(h.mundoIA, h.ronda.real);
      texto += Mapa.distanciaKm(h.mundoIA, h.resIA.punto) < 1
        ? ' <span class="sin-pista">Aunque no le hubiéramos dicho que era de Alicante, GeoCLIP habría marcado el mismo sitio.</span>'
        : ` <span class="sin-pista">Sin saber que era de Alicante, GeoCLIP habría fallado por ${fmtKm(kmMundo)}.</span>`;
    }
    comparativa.innerHTML = texto;
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
    const kms = rs.map(r => r.km).filter(k => k != null);
    return {
      puntos: suma(rs.map(r => r.total)),
      segundos: rs.some(r => r.segundos == null) ? null : suma(rs.map(r => r.segundos)),   // null si falta algún tiempo
      kmMedio: kms.length ? media(kms) : null,
      kmMejor: kms.length ? Math.min(...kms) : null,
      cerca: rs.filter(r => r.km != null && r.km < 5).length,      // a menos de 5 km
      sinRespuesta: rs.filter(r => r.km == null).length,
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
    const tambien = () => (frases.length ? 'Además, ' : '');
    if (veces >= 2) frases.push(`GeoCLIP ha sido unas <b>${fmt(veces)} veces más rápida</b> que tú (${fmtTiempo(IA.segundos)} frente a ${fmtSeg(J.segundos)}).`);
    if (J.kmMedio != null && IA.kmMedio != null) {
      frases.push(J.kmMedio < IA.kmMedio
        ? `${tambien() ? 'Y <b>tú' : '<b>Tú'} has afinado más</b>: de media te has quedado a ${fmtKm(J.kmMedio)}, y la IA a ${fmtKm(IA.kmMedio)}. Conocer la zona es una gran ventaja.`
        : `${tambien() ? 'Además, ha' : 'GeoCLIP ha'} afinado más: de media se ha quedado a ${fmtKm(IA.kmMedio)}, y tú a ${fmtKm(J.kmMedio)}.`);
    }
    const mejor = estado.historial.reduce((a, h) => (h.resJ.km != null && (a == null || h.resJ.km < a.resJ.km) ? h : a), null);
    if (mejor) frases.push(`Tu mejor foto: <b>${escapar(mejor.ronda.im.lugar)}</b>, a solo ${fmtKm(mejor.resJ.km)}.`);
    $('#conclusion').innerHTML = frases.join(' ');

    const filas = [
      ['Puntos totales', fmt(J.puntos), fmt(IA.puntos), J.puntos - IA.puntos],
      ['Fotos ganadas', J.ganadas, IA.ganadas, J.ganadas - IA.ganadas],
      ['Distancia media', fmtKm(J.kmMedio), fmtKm(IA.kmMedio), (IA.kmMedio ?? Infinity) - (J.kmMedio ?? Infinity)],
      ['Mejor distancia', fmtKm(J.kmMejor), fmtKm(IA.kmMejor), (IA.kmMejor ?? Infinity) - (J.kmMejor ?? Infinity)],
      ['A menos de 5 km', `${J.cerca}/${n}`, `${IA.cerca}/${n}`, J.cerca - IA.cerca],
      ['Tiempo total', fmtSeg(J.segundos), IA.segundos == null ? '—' : fmtTiempo(IA.segundos), IA.segundos == null ? 0 : IA.segundos - J.segundos],
    ];
    $('#tabla-stats').innerHTML = `<thead><tr><th></th><th>${escapar(estado.apodo)}</th><th>IA</th></tr></thead><tbody>` +
      filas.map(([nombre, vj, via, dif]) => `<tr><td>${nombre}</td><td class="${dif > 0 ? 'mejor' : ''}">${vj}</td><td class="${dif < 0 ? 'mejor' : ''}">${via}</td></tr>`).join('') +
      '</tbody>';

    $('#tabla-rondas').innerHTML = '<thead><tr><th>Foto</th><th>Tu distancia</th><th>IA</th><th>Tus puntos</th><th>Puntos IA</th><th>Gana</th></tr></thead><tbody>' +
      estado.historial.map(h => {
        const dif = h.resJ.total - h.resIA.total, im = h.ronda.im;
        return `<tr><td><img src="${im.archivo}" alt="">${escapar(im.lugar)}</td>` +
          `<td>${fmtKm(h.resJ.km)}</td><td>${fmtKm(h.resIA.km)}</td>` +
          `<td class="${dif > 0 ? 'gana' : ''}">${fmt(h.resJ.total)}</td><td class="${dif < 0 ? 'gana' : ''}">${fmt(h.resIA.total)}</td>` +
          `<td>${dif > 0 ? '🧑‍🎓' : dif < 0 ? '🤖' : '🤝'}</td></tr>`;
      }).join('') + '</tbody>';

    irA('pantalla-final');
    Sonido.efecto(gana === 'IA' ? 'derrota' : 'victoria');
    if (gana !== 'IA') setTimeout(() => confeti(6000), 600);
  }

  function descargarCSV() {
    const dec = (v, d = 2) => (v == null ? '' : v.toFixed(d).replace('.', ','));
    const coord = (p, i) => (p ? dec(p[i], 5) : '');
    const cab = ['Jugador', 'Ronda', 'Nivel', 'Lugar', 'Latitud real', 'Longitud real',
      'Tu latitud', 'Tu longitud', 'Tu distancia (km)', 'Tu tiempo (s)', 'Tus puntos',
      'Latitud IA', 'Longitud IA', 'Distancia IA (km)', 'Tiempo IA (ms)', 'Puntos IA'];
    const filas = estado.historial.map((h, i) => {
      const a = h.resJ, b = h.resIA, im = h.ronda.im;
      return [estado.apodo, i + 1, C.niveles[im.nivel].nombre, im.lugar, dec(im.lat, 5), dec(im.lon, 5),
        coord(a.punto, 1), coord(a.punto, 0), dec(a.km), dec(a.segundos, 1), a.total,
        coord(b.punto, 1), coord(b.punto, 0), dec(b.km), dec(b.ms, 0), b.total];
    });
    const J = resumen('J'), IA = resumen('IA');
    filas.push([estado.apodo, 'TOTAL', '', '', '', '', '', '', `media: ${dec(J.kmMedio)}`, dec(J.segundos, 1), J.puntos,
      '', '', `media: ${dec(IA.kmMedio)}`, IA.segundos == null ? '' : dec(IA.segundos * 1000, 0), IA.puntos]);
    const csv = '﻿' + [cab, ...filas].map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `ubicalo_${estado.apodo.replace(/[^\p{L}\p{N}_-]+/gu, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('#btn-otra').addEventListener('click', empezarPartida);
  $('#btn-csv').addEventListener('click', descargarCSV);
  $('#btn-inicio').addEventListener('click', () => { irA('pantalla-inicio'); Sonido.musica('inicio'); });
})();
