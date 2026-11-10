// Ajustes de «¡Ubícalo!». Cambia estos valores para adaptar la dificultad.
window.CONFIG = {
  rondas: 5,                 // como mucho, tantas como fotos haya en datos_ubicar.js
  segundos: 60,              // tiempo máximo por ronda
  puntosMax: 1000,           // puntos = puntosMax × e^(−distancia / kKm)
  kKm: 10,                   // a 10 km se consigue un 37 % de los puntos; a 1 km, un 90 %
  iaPrediccion: 'provincia', // 'provincia': GeoCLIP sabe que la foto es de la provincia, como el alumno; 'mundo': sin esa pista
  ritmoAnimacion: 550,       // ms entre pasos del recuento de puntos
  niveles: {
    facil: { nombre: 'FÁCIL', color: 'var(--verde)' },
    medio: { nombre: 'MEDIO', color: 'var(--azul)' },
    dificil: { nombre: 'DIFÍCIL', color: 'var(--rojo)' },
  },
};
