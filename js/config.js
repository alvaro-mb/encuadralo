// Ajustes del juego. Cambia estos valores para adaptar la dificultad.
window.CONFIG = {
  rondas: 8,                 // una imagen por cada tipo de objeto
  segundosRonda: 45,         // tiempo máximo para encuadrar
  iouAcierto: 0.5,           // IoU mínima para que una caja cuente como acierto
  puntosPorIoU: 1000,        // cada acierto vale IoU × 1000
  penalizacionFP: 250,       // por cada caja que sobra
  penalizacionFN: 250,       // por cada objeto sin encuadrar
  bonusTiempoMax: 500,       // se reduce con el tiempo y se multiplica por la fracción de objetos acertados
  confIA: window.DATOS_JUEGO.confIA,  // confianza mínima con la que juega la IA
  iouNMS: 0.5,
  modelo: 'models/yolo11n.onnx',
  ritmoAnimacion: 550,       // ms entre pasos del recuento de puntos
  textos: {
    fp: 'FALSO POSITIVO',
    fn: 'FALSO NEGATIVO',
  },
};
