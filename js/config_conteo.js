// Ajustes de «¡Cuéntalos!». Cambia estos valores para adaptar la dificultad.
window.CONFIG = {
  // Nivel de cada ronda, en orden. Dentro de cada nivel se eligen imágenes cada vez con más objetos.
  plan: ['facil', 'facil', 'medio', 'medio', 'dificil', 'dificil', 'extremo'],
  segundos: { facil: 25, medio: 40, dificil: 60, extremo: 75 },   // tiempo máximo por nivel
  puntosPrecision: 1000,     // 1000 × (1 − |error| / real), nunca menos de 0
  bonusExacto: 250,          // por acertar el número exacto
  bonusTiempoMax: 300,       // se reduce con el tiempo y se multiplica por la precisión
  ritmoAnimacion: 550,       // ms entre pasos del recuento de puntos
  niveles: {
    facil: { nombre: 'FÁCIL', color: 'var(--verde)' },
    medio: { nombre: 'MEDIO', color: 'var(--azul)' },
    dificil: { nombre: 'DIFÍCIL', color: 'var(--rojo)' },
    extremo: { nombre: 'EXTREMO', color: 'var(--tinta)' },
  },
};
