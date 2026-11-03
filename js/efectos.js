// Utilidades de animación: esperas, contadores de puntos, textos flotantes y confeti.
const Efectos = (() => {
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const dosFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const fmt = n => Math.round(n).toLocaleString('es-ES');
  const fmtSeg = s => s.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
  const fmtMs = ms => Math.round(ms).toLocaleString('es-ES') + ' ms';
  const fmtTiempo = s => (s < 1 ? fmtMs(s * 1000) : fmtSeg(s));

  function animarNumero(el, desde, hasta, ms = 600) {
    return new Promise(resolver => {
      const t0 = performance.now();
      const paso = t => {
        const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
        el.textContent = fmt(desde + (hasta - desde) * e);
        if (k < 1) requestAnimationFrame(paso); else resolver();
      };
      requestAnimationFrame(paso);
    });
  }

  function reiniciarAnimacion(el, clase) {
    el.classList.remove(clase);
    void el.offsetWidth;
    el.classList.add(clase);
  }

  function flotante(contenedor, texto, clase) {
    const s = document.createElement('span');
    s.className = 'flotante ' + clase;
    s.textContent = texto;
    s.style.left = 35 + Math.random() * 30 + '%';
    contenedor.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }

  function confeti(ms = 4000, cantidad = 220) {
    const c = document.createElement('canvas');
    c.className = 'confeti';
    document.body.appendChild(c);
    const ctx = c.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    const colores = ['#e21b3c', '#1368ce', '#ffa602', '#26890c', '#ffffff', '#2de2e6', '#864cbf'];
    const piezas = Array.from({ length: cantidad }, () => ({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.7,
      vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 3.5,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25,
      w: 7 + Math.random() * 7, h: 10 + Math.random() * 8,
      color: colores[(Math.random() * colores.length) | 0],
    }));
    const t0 = performance.now();
    const cuadro = t => {
      const sigue = t - t0 < ms;
      let visibles = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of piezas) {
        p.x += p.vx + Math.sin(t / 400 + p.r);
        p.y += p.vy;
        p.r += p.vr;
        if (p.y > innerHeight + 20) {
          if (!sigue) continue;
          p.y = -20;
          p.x = Math.random() * innerWidth;
        }
        visibles++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(t / 300 + p.r)));
        ctx.restore();
      }
      if (visibles) requestAnimationFrame(cuadro); else c.remove();
    };
    requestAnimationFrame(cuadro);
  }

  return { esperar, dosFrames, fmt, fmtSeg, fmtMs, fmtTiempo, animarNumero, reiniciarAnimacion, flotante, confeti };
})();
