// Efectos de sonido y música sintetizados con Web Audio (sin archivos de audio).
const Sonido = (() => {
  let ctx = null, salida = null, activo = true;
  const musica = { deseada: null, modo: null, temporizador: null, paso: 0, t: 0 };
  try { activo = localStorage.getItem('encuadralo-sonido') !== 'off'; } catch (e) { /* sin almacenamiento */ }

  function desbloquear() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      salida = ctx.createGain();
      salida.gain.value = 0.6;
      salida.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function nota(frec, dur, { tipo = 'square', vol = 0.12, en = 0, hasta = 0 } = {}) {
    if (!activo || !desbloquear()) return;
    const t = Math.max(en, ctx.currentTime);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frec, t);
    if (hasta) osc.frequency.exponentialRampToValueAtTime(hasta, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(salida);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function secuencia(frecuencias, paso, opciones = {}) {
    const t0 = ctx.currentTime;
    frecuencias.forEach((f, i) => f && nota(f, paso * (i === frecuencias.length - 1 ? 4 : 1.6), { ...opciones, en: t0 + i * paso }));
  }

  const EFECTOS = {
    tic: () => nota(660, 0.14, { vol: 0.14 }),
    ya: () => secuencia([523, 659, 784, 1047], 0.07, { vol: 0.12 }),
    whoosh: () => nota(180, 0.35, { tipo: 'sine', vol: 0.14, hasta: 720 }),
    pop: () => nota(520, 0.09, { tipo: 'sine', vol: 0.25, hasta: 1100 }),
    borrar: () => nota(500, 0.12, { tipo: 'sine', vol: 0.2, hasta: 160 }),
    tictac: () => nota(1400, 0.05, { tipo: 'triangle', vol: 0.3 }),
    hecho: () => secuencia([784, 1175], 0.08, { vol: 0.12 }),
    tiempo: () => secuencia([440, 330, 220], 0.14, { tipo: 'sawtooth', vol: 0.1 }),
    escaneo: () => nota(220, 1.5, { tipo: 'sine', vol: 0.08, hasta: 1760 }),
    moneda: () => secuencia([988, 1319], 0.07, { vol: 0.1 }),
    fallo: () => nota(150, 0.35, { tipo: 'sawtooth', vol: 0.12, hasta: 80 }),
    bonus: () => secuencia([659, 784, 988, 1319], 0.05, { tipo: 'triangle', vol: 0.18 }),
    victoria: () => secuencia([523, 659, 784, 1047, 0, 784, 1047], 0.11, { vol: 0.12 }),
    derrota: () => secuencia([392, 370, 349, 311], 0.22, { tipo: 'triangle', vol: 0.2 }),
  };

  function efecto(nombre) {
    if (activo && desbloquear()) EFECTOS[nombre]?.();
  }

  // Música en bucle: bajo + arpegio de 4 acordes, programada con antelación para que no se entrecorte.
  const MUSICA = {
    inicio: { tempo: 112, acordes: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    ronda: { tempo: 144, acordes: [[50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55]] },
  };
  const midi = n => 440 * 2 ** ((n - 69) / 12);

  function programar() {
    const m = MUSICA[musica.modo], corchea = 60 / m.tempo / 2;
    while (musica.t < ctx.currentTime + 0.2) {
      const acorde = m.acordes[Math.floor(musica.paso / 8) % 4], p = musica.paso % 8;
      if (p % 4 === 0) nota(midi(acorde[0] - 12), corchea * 3.5, { tipo: 'triangle', vol: 0.1, en: musica.t });
      nota(midi(acorde[[0, 1, 2, 1][p % 4]] + 12), corchea * 0.8, { tipo: 'square', vol: 0.025, en: musica.t });
      musica.t += corchea;
      musica.paso++;
    }
  }

  function aplicarMusica() {
    const modo = activo ? musica.deseada : null;
    if (musica.modo === modo) return;
    clearInterval(musica.temporizador);
    musica.modo = null;
    if (!modo || !desbloquear()) return;
    Object.assign(musica, { modo, paso: 0, t: ctx.currentTime + 0.1, temporizador: setInterval(programar, 60) });
  }

  function ponerMusica(modo) {
    musica.deseada = modo;
    aplicarMusica();
  }

  function alternar() {
    activo = !activo;
    try { localStorage.setItem('encuadralo-sonido', activo ? 'on' : 'off'); } catch (e) { /* sin almacenamiento */ }
    aplicarMusica();
    return activo;
  }

  return { desbloquear, efecto, musica: ponerMusica, alternar, get activo() { return activo; } };
})();
