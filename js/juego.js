// Flujo del juego: inicio → (tutorial) → previa con cuenta atrás → ronda → turno de la IA → resultado → … → final.
(() => {
  const D = window.DATOS_JUEGO, C = window.CONFIG;
  const { esperar, dosFrames, fmt, fmtSeg, fmtMs, fmtTiempo, animarNumero, reiniciarAnimacion, flotante, confeti } = Efectos;
  const $ = sel => document.querySelector(sel);
  const COLORES_RETO = ['var(--rojo)', 'var(--azul)', 'var(--amarillo)', 'var(--verde)'];

  const estado = {
    apodo: 'Tú', rondas: [], i: 0, historial: [],
    jugando: false, t0: 0, ultimoSegundo: null, tutorialVisto: false, ocupado: false, trasTutorial: null,
  };

  // ------------------------------------------------------------------ utilidades
  const barajar = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const suma = arr => arr.reduce((s, v) => s + v, 0);
  const media = arr => (arr.length ? suma(arr) / arr.length : 0);
  const pct = v => Math.round(v * 100) + ' %';
  const etiquetaIA = d => `${D.clasesES[d[0]]} ${Math.round(d[1] * 100)}%`;
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

  // Textos que dependen de la configuración (tutorial y leyenda).
  document.querySelectorAll('[data-config]').forEach(el => { el.textContent = fmt(C[el.dataset.config]); });
  document.querySelectorAll('[data-config-pct]').forEach(el => { el.textContent = pct(C[el.dataset.configPct]); });
  document.querySelectorAll('[data-texto]').forEach(el => { el.textContent = C.textos[el.dataset.texto]; });

  // ------------------------------------------------------------------ fondo y controles globales
  (function crearFondo() {
    const formas = [
      '<polygon points="50,6 96,92 4,92"/>',
      '<polygon points="50,4 96,50 50,96 4,50"/>',
      '<circle cx="50" cy="50" r="44"/>',
      '<rect x="8" y="8" width="84" height="84" rx="8"/>',
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
  // El navegador solo permite sonar tras una interacción: arrancamos la música del menú en el primer clic.
  document.addEventListener('pointerdown', () => {
    if (['pantalla-inicio', 'pantalla-tutorial'].includes(document.body.dataset.pantalla)) Sonido.musica('inicio');
  }, { once: true });

  // ------------------------------------------------------------------ inicio: carga de la IA
  const chip = $('#estado-ia');
  Detector.iniciar(p => {
    chip.querySelector('.chip-texto').textContent = p < 1 ? `Descargando la IA… ${Math.round(p * 100)} %` : 'Preparando la IA…';
    chip.querySelector('.chip-barra i').style.width = p * 100 + '%';
  }).then(() => {
    chip.classList.remove('cargando');
    if (Detector.modo === 'real') {
      chip.classList.add('lista');
      chip.querySelector('.chip-texto').textContent = `IA lista: ${D.modelo} funcionando en tu navegador`;
    } else {
      chip.classList.add('pregrabado');
      chip.querySelector('.chip-texto').textContent = 'IA en modo pregrabado';
      chip.title = 'Para ver a la IA trabajar en directo, abre el juego con «servidor.py» (o «jugar.sh» / «jugar.bat»).';
    }
  });

  try { $('#apodo').value = localStorage.getItem('encuadralo-apodo') || ''; } catch (e) { /* sin almacenamiento */ }
  $('#btn-jugar').addEventListener('click', empezarPartida);
  $('#apodo').addEventListener('keydown', e => { if (e.key === 'Enter') empezarPartida(); });
  $('#btn-como').addEventListener('click', () => mostrarTutorial(false));
  $('#btn-tutorial').addEventListener('click', () => estado.trasTutorial?.());
  $('#btn-creditos').addEventListener('click', () => {
    $('#lista-creditos').innerHTML = D.imagenes.map(im => {
      const g = D.grupos[im.grupo];
      return `<li>${g.emoji} ${escapar(g.nombre)} · COCO ${im.id} · <a href="${escapar(im.credito.foto)}" target="_blank" rel="noopener">foto original</a> · <a href="${escapar(im.credito.licenciaUrl)}" target="_blank" rel="noopener">${escapar(im.credito.licencia)}</a></li>`;
    }).join('');
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

  // Una imagen al azar de cada tipo de objeto, ordenadas de menos a más objetos para que la dificultad suba.
  function elegirRondas() {
    const porGrupo = {};
    D.imagenes.forEach(im => (porGrupo[im.grupo] ||= []).push(im));
    return barajar(Object.keys(porGrupo))
      .slice(0, C.rondas)
      .map(g => ({ im: porGrupo[g][Math.floor(Math.random() * porGrupo[g].length)], img: null }))
      .sort((a, b) => a.im.gt.length - b.im.gt.length);
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

  // ------------------------------------------------------------------ previa con cuenta atrás
  async function mostrarPrevia() {
    const r = estado.rondas[estado.i], g = D.grupos[r.im.grupo];
    $('#previa-num').textContent = estado.i + 1;
    $('#previa-total').textContent = estado.rondas.length;
    $('#previa-emoji').textContent = g.emoji;
    $('#previa-articulo').textContent = g.articulo;
    $('#previa-objeto').textContent = g.nombre;
    $('#previa-pista').textContent = g.pista;
    $('#pantalla-previa').style.setProperty('--color-reto', COLORES_RETO[estado.i % COLORES_RETO.length]);
    const cuenta = $('#cuenta'), num = $('#cuenta-num');
    cuenta.classList.remove('visible');
    num.textContent = '';
    irA('pantalla-previa');
    Sonido.musica(null);
    Sonido.efecto('whoosh');
    await esperar(1900);
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
  const editor = new EditorCajas($('#lienzo-editor'), $('#escenario'), {
    alCambiar: n => { $('#num-cajas').textContent = n; },
    alSonar: s => Sonido.efecto(s),
  });
  $('#btn-deshacer').addEventListener('click', () => editor.deshacer());
  $('#btn-borrar').addEventListener('click', () => editor.borrarTodo());
  $('#btn-hecho').addEventListener('click', () => terminarRonda(false));
  document.addEventListener('keydown', e => {
    if (!estado.jugando) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.eliminarSeleccionada(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); editor.deshacer(); }
    else if (e.key === 'Escape') editor.deseleccionar();
  });

  const botonesRonda = activos => ['#btn-deshacer', '#btn-borrar', '#btn-hecho'].forEach(s => { $(s).disabled = !activos; });

  function empezarRonda() {
    const r = estado.rondas[estado.i], g = D.grupos[r.im.grupo];
    $('#ronda-emoji').textContent = g.emoji;
    $('#ronda-articulo').textContent = g.articulo;
    $('#ronda-objeto').textContent = g.nombre;
    $('#ronda-pista').textContent = g.pista;
    $('#ronda-n').textContent = `ronda ${estado.i + 1}/${estado.rondas.length}`;
    $('#capa-ia').hidden = true;
    $('#aviso-tiempo').hidden = true;
    botonesRonda(true);
    irA('pantalla-ronda');
    editor.cargar(r.img);
    Object.assign(estado, { jugando: true, t0: performance.now(), ultimoSegundo: null });
    Sonido.musica('ronda');
    requestAnimationFrame(actualizarReloj);
  }

  function actualizarReloj() {
    if (!estado.jugando) return;
    const limite = C.segundosRonda;
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
    estado.jugando = false;
    const segundos = Math.min(C.segundosRonda, (performance.now() - estado.t0) / 1000);
    editor.bloquear();
    botonesRonda(false);
    $('#reloj').classList.remove('urgente');
    Sonido.musica(null);
    const r = estado.rondas[estado.i], g = D.grupos[r.im.grupo];
    const cajas = editor.obtenerCajas();

    if (porTiempo) {
      $('#aviso-tiempo').hidden = false;
      Sonido.efecto('tiempo');
      await esperar(1200);
      $('#aviso-tiempo').hidden = true;
    } else {
      Sonido.efecto('hecho');
    }

    // Turno de la IA: la misma imagen, la misma regla de puntos. Su tiempo es el de la inferencia.
    $('#capa-ia-texto').textContent = Detector.modo === 'cargando' ? 'Esperando a que la IA termine de cargar…' : 'La IA está analizando la imagen…';
    $('#capa-ia').hidden = false;
    Sonido.efecto('escaneo');
    await dosFrames();
    const [det] = await Promise.all([Detector.detectar(r.img, r.im.ia), esperar(1700)]);
    const predIA = det.detecciones.filter(d => d[1] >= C.confIA && g.clases.includes(D.clases[d[0]]));
    estado.historial.push({
      ronda: r, grupo: g, cajasJ: cajas, predIA, det,
      resJ: Puntuacion.calcular(cajas, r.im.gt, segundos, C.segundosRonda),
      resIA: Puntuacion.calcular(predIA.map(d => d.slice(2)), r.im.gt, det.ms / 1000, C.segundosRonda),
    });
    mostrarResultado();
  }

  // ------------------------------------------------------------------ resultado de la ronda
  function crearPanel(clase) {
    const raiz = $('#tpl-panel').content.firstElementChild.cloneNode(true);
    raiz.classList.add('panel-' + clase);
    const q = s => raiz.querySelector(s);
    const lineas = {};
    for (const t of ['aciertos', 'fp', 'fn', 'bonus']) {
      lineas[t] = raiz.querySelector('.linea.' + t);
      lineas[t].dataset.base = lineas[t].className;
    }
    lineas.fp.querySelector('.t').textContent = C.textos.fp;
    lineas.fn.querySelector('.t').textContent = C.textos.fn;
    return {
      raiz, lineas, lienzo: q('.panel-lienzo'), total: q('.panel-total b'), cajaTotal: q('.panel-total'), minimo: q('.minimo'),
      avatar: q('.avatar'), nombre: q('.panel-nombre'), sub: q('.panel-sub'), tiempo: q('.panel-tiempo'),
      visor: new VisorCajas(q('canvas'), q('.panel-lienzo')),
    };
  }
  const panelJ = crearPanel('jugador'), panelIA = crearPanel('ia');
  $('#duelo').prepend(panelJ.raiz);
  $('#duelo').append(panelIA.raiz);

  function prepararPanel(p, h, esJ) {
    const res = esJ ? h.resJ : h.resIA;
    p.avatar.textContent = esJ ? '🧑‍🎓' : '🤖';
    p.nombre.textContent = esJ ? estado.apodo.toUpperCase() : `IA · ${D.modelo}`;
    p.sub.textContent = esJ ? 'Humano' : h.det.real ? `Inferencia en directo · ${Detector.descripcion}` : 'Resultado pregrabado';
    p.tiempo.textContent = esJ ? '⏱ ' + fmtSeg(res.segundos) : '⚡ ' + fmtMs(h.det.ms);
    p.total.textContent = '0';
    p.minimo.hidden = true;
    for (const l of Object.values(p.lineas)) {
      l.className = l.dataset.base;
      l.querySelector('.linea-puntos').textContent = '0';
      const n = l.querySelector('.n');
      if (n) n.textContent = '×0';
    }
    p.lineas.aciertos.querySelector('.linea-detalle').innerHTML = '&nbsp;';
    p.lineas.bonus.querySelector('.linea-detalle').textContent = esJ ? `Has tardado ${fmtSeg(res.segundos)}` : `Ha tardado ${fmtMs(h.det.ms)}`;

    // Primero van las etiquetas reales (ocultas hasta el recuento) y después las cajas del jugador o de la IA.
    const pred = esJ ? h.cajasJ : h.predIA.map(d => d.slice(2));
    const elementos = h.ronda.im.gt.map(c => ({ c, estilo: 'gt', visible: false }));
    pred.forEach((c, i) => elementos.push({ c, estilo: 'neutro', visible: true, etiqueta: esJ ? String(i + 1) : etiquetaIA(h.predIA[i]) }));
    p.visor.cargar(h.ronda.img, elementos);
  }

  function sello(p, texto, clase) {
    const s = document.createElement('div');
    s.className = 'sello ' + clase;
    s.textContent = texto;
    p.lienzo.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }

  // Recuento animado: aciertos uno a uno, luego falsos positivos, falsos negativos y bonus.
  async function animarPanel(p, h, esJ) {
    const res = esJ ? h.resJ : h.resIA, nGT = h.ronda.im.gt.length, L = p.lineas, ritmo = C.ritmoAnimacion;
    const sonar = s => { if (esJ) Sonido.efecto(s); };
    let total = 0;
    const sumar = delta => {
      animarNumero(p.total, total, total + delta, 450);
      total += delta;
      reiniciarAnimacion(p.cajaTotal, 'golpe');
      flotante(p.lienzo, (delta > 0 ? '+' : '−') + fmt(Math.abs(delta)), delta > 0 ? 'positivo' : 'negativo');
    };
    const revelar = (linea, vacia) => {
      linea.classList.add('revelada');
      linea.classList.toggle('vacia', vacia);
      reiniciarAnimacion(linea, 'golpe');
    };

    let puntos = 0;
    for (const [n, a] of res.aciertos.entries()) {
      p.visor.cambiar(a.g, { visible: true });
      p.visor.cambiar(nGT + a.p, { estilo: 'acierto', etiqueta: (esJ ? '' : etiquetaIA(h.predIA[a.p]) + ' · ') + 'IoU ' + Math.round(a.iou * 100) + '%' });
      puntos += a.puntos;
      revelar(L.aciertos, false);
      L.aciertos.querySelector('.n').textContent = '×' + (n + 1);
      L.aciertos.querySelector('.linea-detalle').textContent = 'IoU ' + res.aciertos.slice(0, n + 1).map(x => Math.round(x.iou * 100) + '%').join(' · ');
      L.aciertos.querySelector('.linea-puntos').textContent = '+' + fmt(puntos);
      sumar(a.puntos);
      sonar('moneda');
      await esperar(ritmo);
    }
    if (!res.aciertos.length) {
      revelar(L.aciertos, true);
      L.aciertos.querySelector('.linea-detalle').textContent = 'Ninguna caja llegó a IoU ' + pct(C.iouAcierto);
      await esperar(ritmo);
    }

    revelar(L.fp, !res.fp.length);
    L.fp.querySelector('.n').textContent = '×' + res.fp.length;
    if (res.fp.length) {
      res.fp.forEach(i => p.visor.cambiar(nGT + i, { estilo: 'fp', etiqueta: esJ ? 'FP' : 'FP · ' + etiquetaIA(h.predIA[i]) }));
      L.fp.querySelector('.linea-puntos').textContent = '−' + fmt(res.penalFP);
      sello(p, `${C.textos.fp} ×${res.fp.length}`, 'negativo');
      sumar(-res.penalFP);
      sonar('fallo');
      await esperar(ritmo + 500);
    } else {
      await esperar(ritmo / 2);
    }

    revelar(L.fn, !res.fn.length);
    L.fn.querySelector('.n').textContent = '×' + res.fn.length;
    if (res.fn.length) {
      res.fn.forEach(j => p.visor.cambiar(j, { visible: true, estilo: 'fn', etiqueta: 'FN' }));
      L.fn.querySelector('.linea-puntos').textContent = '−' + fmt(res.penalFN);
      sello(p, `${C.textos.fn} ×${res.fn.length}`, 'aviso');
      sumar(-res.penalFN);
      sonar('fallo');
      await esperar(ritmo + 500);
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
    if (res.bruto < 0) {
      p.minimo.hidden = false;
      await animarNumero(p.total, res.bruto, 0, 500);
    }
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
    const h = estado.historial.at(-1), n = estado.historial.length, total = estado.rondas.length;
    $('#resultado-ronda').textContent = `RONDA ${n} DE ${total} · ${h.grupo.emoji} ${h.grupo.nombre}`;
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
    const iouTxt = r => (r.aciertos.length ? pct(r.iouMedio) : '—');
    comparativa.innerHTML = `Precisión de las cajas (IoU medio): tú <b>${iouTxt(h.resJ)}</b> · IA <b>${iouTxt(h.resIA)}</b>
      &nbsp;|&nbsp; Objetos encontrados: tú <b>${h.resJ.aciertos.length}/${h.resJ.nGT}</b> · IA <b>${h.resIA.aciertos.length}/${h.resIA.nGT}</b>`;
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
      iou: media(rs.flatMap(r => r.aciertos.map(a => a.iou))),
      aciertos: suma(rs.map(r => r.aciertos.length)),
      objetos: suma(rs.map(r => r.nGT)),
      fp: suma(rs.map(r => r.fp.length)),
      fn: suma(rs.map(r => r.fn.length)),
      ganadas: rs.filter((r, i) => r.total > otro[i].total).length,
    };
  }

  function mostrarFinal() {
    const J = resumen('J'), IA = resumen('IA');
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
    if (J.aciertos && IA.aciertos) {
      frases.push(J.iou > IA.iou
        ? `Pero <b>tus cajas han sido más precisas</b>: IoU medio de ${pct(J.iou)} frente a ${pct(IA.iou)}.`
        : `Además, sus cajas han sido más ajustadas: IoU medio de ${pct(IA.iou)} frente a tu ${pct(J.iou)}.`);
    }
    if (IA.fn > J.fn) frases.push(`La IA se dejó <b>${IA.fn} objeto${IA.fn > 1 ? 's' : ''} sin ver</b> y tú solo ${J.fn}: ¡los ojos humanos siguen siendo muy buenos!`);
    else if (J.fn > IA.fn) frases.push(`Se te escaparon ${J.fn} objeto${J.fn > 1 ? 's' : ''} y a la IA ${IA.fn}. ¡Mira bien los bordes y el fondo de la foto!`);
    if (J.fp > 0) frases.push(`Ojo con los falsos positivos: dibujaste ${J.fp} caja${J.fp > 1 ? 's' : ''} de más o mal colocada${J.fp > 1 ? 's' : ''}.`);
    $('#conclusion').innerHTML = frases.join(' ');

    const filas = [
      ['Puntos totales', fmt(J.puntos), fmt(IA.puntos), J.puntos - IA.puntos],
      ['Rondas ganadas', J.ganadas, IA.ganadas, J.ganadas - IA.ganadas],
      ['Tiempo total', fmtSeg(J.segundos), fmtTiempo(IA.segundos), IA.segundos - J.segundos],
      ['Precisión media (IoU)', J.aciertos ? pct(J.iou) : '—', IA.aciertos ? pct(IA.iou) : '—', J.iou - IA.iou],
      ['Objetos encontrados', `${J.aciertos}/${J.objetos}`, `${IA.aciertos}/${IA.objetos}`, J.aciertos - IA.aciertos],
      ['Falsos positivos (FP)', J.fp, IA.fp, IA.fp - J.fp],
      ['Falsos negativos (FN)', J.fn, IA.fn, IA.fn - J.fn],
    ];
    $('#tabla-stats').innerHTML = `<thead><tr><th></th><th>${escapar(estado.apodo)}</th><th>IA</th></tr></thead><tbody>` +
      filas.map(([nombre, vj, via, dif]) => `<tr><td>${nombre}</td><td class="${dif > 0 ? 'mejor' : ''}">${vj}</td><td class="${dif < 0 ? 'mejor' : ''}">${via}</td></tr>`).join('') +
      '</tbody>';

    $('#tabla-rondas').innerHTML = '<thead><tr><th>Reto</th><th>Tus puntos</th><th>Puntos IA</th><th>Tu tiempo</th><th>Tiempo IA</th><th>Gana</th></tr></thead><tbody>' +
      estado.historial.map(h => {
        const dif = h.resJ.total - h.resIA.total;
        return `<tr><td><img src="${h.ronda.im.archivo}" alt="">${h.grupo.emoji} ${escapar(h.grupo.nombre)}</td>` +
          `<td class="${dif > 0 ? 'gana' : ''}">${fmt(h.resJ.total)}</td><td class="${dif < 0 ? 'gana' : ''}">${fmt(h.resIA.total)}</td>` +
          `<td>${fmtSeg(h.resJ.segundos)}</td><td>${fmtMs(h.det.ms)}</td><td>${dif > 0 ? '🧑‍🎓' : dif < 0 ? '🤖' : '🤝'}</td></tr>`;
      }).join('') + '</tbody>';

    irA('pantalla-final');
    Sonido.efecto(gana === 'IA' ? 'derrota' : 'victoria');
    if (gana !== 'IA') setTimeout(() => confeti(6000), 600);
  }

  function descargarCSV() {
    const dec = (v, d = 2) => v.toFixed(d).replace('.', ',');
    const cab = ['Jugador', 'Ronda', 'Objeto', 'Imagen COCO', 'Objetos reales',
      'Tus cajas', 'Tus aciertos', 'Tus FP', 'Tus FN', 'Tu IoU medio', 'Tu tiempo (s)', 'Tus puntos',
      'Cajas IA', 'Aciertos IA', 'FP IA', 'FN IA', 'IoU medio IA', 'Tiempo IA (ms)', 'Puntos IA'];
    const filas = estado.historial.map((h, i) => {
      const a = h.resJ, b = h.resIA;
      return [estado.apodo, i + 1, h.grupo.nombre, h.ronda.im.id, a.nGT,
        a.nPred, a.aciertos.length, a.fp.length, a.fn.length, dec(a.iouMedio), dec(a.segundos, 1), a.total,
        b.nPred, b.aciertos.length, b.fp.length, b.fn.length, dec(b.iouMedio), dec(h.det.ms, 0), b.total];
    });
    const J = resumen('J'), IA = resumen('IA');
    filas.push([estado.apodo, 'TOTAL', '', '', J.objetos, '', J.aciertos, J.fp, J.fn, dec(J.iou), dec(J.segundos, 1), J.puntos,
      '', IA.aciertos, IA.fp, IA.fn, dec(IA.iou), dec(IA.segundos * 1000, 0), IA.puntos]);
    const csv = '﻿' + [cab, ...filas].map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `encuadralo_${estado.apodo.replace(/[^\p{L}\p{N}_-]+/gu, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('#btn-otra').addEventListener('click', empezarPartida);
  $('#btn-csv').addEventListener('click', descargarCSV);
  $('#btn-inicio').addEventListener('click', () => { irA('pantalla-inicio'); Sonido.musica('inicio'); });
})();
