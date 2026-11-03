# ¡Encuádralo! · Humanos vs IA

Juego educativo de detección de objetos para Secundaria. El alumno encuadra con el ratón (o el dedo) los objetos que se le piden en una foto. Después, una IA de detección (**YOLO11n**) analiza la misma imagen y se comparan las puntuaciones: precisión (IoU), falsos positivos, falsos negativos y velocidad.

Las fotos y sus etiquetas proceden de **COCO val2017**, un conjunto de imágenes etiquetado a mano. La puntuación se calcula comparando cada caja con esas etiquetas reales.

## Cómo jugar

| Forma | Qué hacer | IA |
|---|---|---|
| **Recomendada** | Ejecuta `./jugar.sh` (Linux/macOS) o `jugar.bat` (Windows), o bien `python3 servidor.py`. Se abre el navegador solo. | En directo, en el navegador del alumno, con varios hilos |
| En el aula, por red | Con el servidor en marcha en el ordenador del profesor, los alumnos abren la dirección «En la red» que aparece en la consola. | En directo, con un hilo |
| Hosting estático | Sube la carpeta tal cual a cualquier web estática (GitHub Pages, Moodle, etc.). | En directo, con un hilo |
| Sin servidor | Doble clic en `index.html`. | Resultados pregrabados (el navegador no permite ejecutar la IA desde un archivo local) |

No necesita internet: el modelo, el motor de IA y la tipografía están incluidos. Funciona en Chrome, Edge y Firefox actuales, también en tabletas.

## Reglas y puntuación

Cada partida tiene **8 rondas**, una por tipo de objeto: pelotas, coches, personas, animales, tazas, bicicletas, paraguas y peluches. Hay 2 fotos por tipo, y en cada partida se elige una al azar. Las rondas se ordenan de menos a más objetos.

| Concepto | Puntos |
|---|---|
| ✅ Acierto (caja con IoU ≥ 50 % con un objeto real) | IoU × 1000 |
| ❌ FALSO POSITIVO (caja que sobra o mal colocada) | −250 cada una |
| 🔍 FALSO NEGATIVO (objeto real sin caja) | −250 cada uno |
| ⚡ Bonus de velocidad | hasta +500 × (fracción de objetos acertados) |

- El bonus baja de forma lineal hasta 0 cuando se agotan los 45 s.
- La puntuación de una ronda nunca baja de 0.
- La IA juega con las mismas reglas: su tiempo es el de la inferencia y solo cuentan sus detecciones con una confianza de al menos el 35 %.
- Cada caja del alumno se empareja con un único objeto real: primero se emparejan las parejas con mayor IoU.

Al final aparece una comparativa completa: puntos, tiempo, IoU medio, objetos encontrados, FP y FN. También hay una tabla ronda a ronda y un botón para **descargar los resultados en CSV**, útil para recogerlos de toda la clase.

En 5 de las 16 fotos la IA se equivoca: no ve un objeto o coloca mal la caja. Un alumno atento puede ganarle.

## Ajustes

Todo se cambia en [js/config.js](js/config.js): número de rondas, segundos por ronda, umbral de IoU, puntos, penalizaciones, bonus y los textos «FALSO POSITIVO» / «FALSO NEGATIVO».

## Cambiar o añadir imágenes

Las imágenes se eligen con [tools/preparar_datos.py](tools/preparar_datos.py). Requiere Python con `numpy`, `pillow` y `onnxruntime`.

1. Edita `GRUPOS` si quieres otros tipos de objeto (cualquier clase de COCO).
2. Ejecuta `python tools/preparar_datos.py candidatos`. Descarga COCO, filtra las fotos adecuadas, les pasa YOLO y genera hojas de contacto en `tools/.cache/candidatos/` para elegirlas a ojo.
3. Copia los identificadores elegidos en `SELECCION`.
4. Ejecuta `python tools/preparar_datos.py construir`. Copia las fotos a `img/` y regenera `js/datos.js`, con las etiquetas, las detecciones pregrabadas y los créditos.

Conviene revisar cada foto antes de usarla: a veces COCO deja objetos sin etiquetar, y eso penalizaría injustamente al alumno.

El modelo se regenera con `python tools/exportar_modelo.py`, que requiere `ultralytics`.

## Estructura

```
index.html            pantallas del juego
css/estilos.css       estilo visual y animaciones
js/config.js          ajustes
js/juego.js           flujo del juego y recuento de puntos
js/lienzos.js         editor de cajas y visor de resultados
js/detector.js        YOLO11n en el navegador (ONNX Runtime Web)
js/puntuacion.js      IoU, emparejamiento y puntos
js/sonido.js          efectos y música sintetizados (Web Audio)
js/efectos.js         animaciones, confeti
js/datos.js           imágenes, etiquetas y detecciones pregrabadas (generado)
img/                  16 fotos de COCO val2017
models/yolo11n.onnx   modelo de detección
vendor/ort/           ONNX Runtime Web 1.22
fonts/montserrat.css  tipografía incrustada
servidor.py           servidor local (activa el modo multihilo de la IA)
tools/                scripts para regenerar imágenes y modelo
```

## Créditos y licencias

- **Imágenes y etiquetas:** [COCO dataset](https://cocodataset.org). Las etiquetas tienen licencia CC BY 4.0. Cada foto mantiene su licencia de Flickr, que se puede consultar dentro del juego en «Créditos».
- **Modelo:** [Ultralytics YOLO11n](https://github.com/ultralytics/ultralytics), con licencia AGPL-3.0.
- **Motor de IA:** [ONNX Runtime Web](https://onnxruntime.ai), con licencia MIT.
- **Tipografía:** Montserrat, con licencia SIL Open Font License 1.1.
