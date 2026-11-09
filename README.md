# ¡Encuádralo! · Humanos vs IA

Tres juegos educativos para Secundaria en los que el alumno compite contra una inteligencia artificial:

| Juego | Página | Qué hay que hacer | IA rival |
|---|---|---|---|
| **¡Encuádralo!** | `index.html` | Encuadrar con el ratón (o el dedo) los objetos que se piden en una foto | **YOLO11n** (detección de objetos), en directo en el navegador |
| **¡Cuéntalos!** | `contar.html` | Contar los objetos de una foto, cada vez más numerosos | **LOCA** (recuento de objetos), con resultados calculados de antemano |
| **¡Ubícalo!** | `ubicar.html` | Adivinar en el mapa dónde se hizo una foto de la provincia de Alicante | **GeoCLIP** (geolocalización), con resultados calculados de antemano |

En ¡Encuádralo! las fotos y sus etiquetas proceden de **COCO val2017**, un conjunto de imágenes etiquetado a mano, y la puntuación se calcula comparando cada caja con esas etiquetas reales. Desde la pantalla de inicio de cualquiera de los tres juegos se puede cambiar a los otros con el selector de arriba a la izquierda.

## Cómo ejecutar los juegos

No necesitan internet: los modelos, el motor de IA, el mapa y la tipografía están incluidos. Funcionan en Chrome, Edge y Firefox actuales, en ordenador y en tableta.

### Requisito: Python 3

Basta con Python 3.8 o posterior, sin paquetes adicionales. Solo hace falta en el ordenador que hace de servidor (normalmente, el del profesor).

| Sistema | Cómo instalarlo |
|---|---|
| **Windows** | Descárgalo de [python.org](https://www.python.org/downloads/) (marca «Add python.exe to PATH» al instalar) o instálalo desde Microsoft Store. |
| **macOS** | Viene con las herramientas de desarrollo: ejecuta `xcode-select --install` en Terminal, o descárgalo de [python.org](https://www.python.org/downloads/). |
| **Linux** | Suele venir instalado. Si no: `sudo apt install python3` (Debian/Ubuntu) o `sudo dnf install python3` (Fedora). |

Para comprobarlo, abre una terminal y escribe `python3 --version` (en Windows, `py --version`).

### Abrir cada juego

Cada juego tiene su propio lanzador. Todos arrancan el servidor local `servidor.py` y abren el navegador en la página correcta. Para cerrar el servidor, pulsa **Ctrl+C** en su ventana (o ciérrala).

| Juego | Windows | macOS / Linux | Cualquier sistema |
|---|---|---|---|
| ¡Encuádralo! | Doble clic en `jugar.bat` | `./jugar.sh` | `python3 servidor.py` |
| ¡Cuéntalos! | Doble clic en `contar.bat` | `./contar.sh` | `python3 servidor.py --contar` |
| ¡Ubícalo! | Doble clic en `ubicar.bat` | `./ubicar.sh` | `python3 servidor.py --ubicar` |

**Windows.** Haz doble clic en el `.bat` del juego. Se abre una ventana negra con el servidor: no la cierres mientras se juega. Si Windows SmartScreen muestra un aviso, pulsa «Más información» → «Ejecutar de todas formas». Desde la terminal (`cmd` o PowerShell), dentro de la carpeta del juego, también vale `py servidor.py --contar`. La primera vez, el Firewall de Windows puede preguntar si permite el acceso a Python: acéptalo en **redes privadas** si los alumnos van a entrar por la red del aula.

**macOS.** Abre Terminal, entra en la carpeta del juego y ejecuta el lanzador:

```bash
cd ruta/a/encuadralo        # o escribe «cd » y arrastra la carpeta a la ventana de Terminal
./contar.sh                 # o ./jugar.sh, ./ubicar.sh
```

Si aparece «Permission denied», da permiso de ejecución una vez con `chmod +x *.sh` o usa `bash contar.sh`. Al hacer doble clic en un `.sh` desde Finder, macOS lo abre como texto: usa Terminal. La primera vez, macOS puede preguntar si Python acepta conexiones entrantes: acéptalo para jugar por red.

**Linux.** Igual que en macOS: `cd` a la carpeta y `./contar.sh` (o `./jugar.sh`, `./ubicar.sh`). Si falta el permiso de ejecución, `chmod +x *.sh`. Con un cortafuegos activo (por ejemplo `ufw`), abre el puerto para jugar por red: `sudo ufw allow 8000/tcp`.

**Opciones del servidor** (en cualquier sistema; también se pueden pasar a los lanzadores, como `./contar.sh 8080`):

```bash
python3 servidor.py 8080               # otro puerto (por defecto, 8000)
python3 servidor.py --ubicar           # abre ¡Ubícalo! en lugar de ¡Encuádralo! (o --contar)
python3 servidor.py --sin-navegador    # no abre el navegador
```

### Formas de jugar

| Forma | Qué hacer | ¡Encuádralo! | ¡Cuéntalos! | ¡Ubícalo! |
|---|---|---|---|---|
| **Recomendada: servidor local** | Ejecuta el lanzador del juego (ver arriba). Se abre el navegador solo. | IA en directo, con varios hilos | Completo | Mapa completo de OpenStreetMap |
| **En el aula, por red** | Con el servidor en marcha en el ordenador del profesor, los alumnos (ordenadores, tabletas, Chromebooks o móviles de la misma red wifi) abren la dirección «En la red» que aparece en la consola, por ejemplo `http://192.168.1.20:8000/contar.html`. | IA en directo, con un hilo | Completo | Mapa completo |
| **Hosting estático** | Sube la carpeta tal cual a cualquier web estática (GitHub Pages, Moodle, Netlify, el servidor del centro…) y abre `index.html`, `contar.html` o `ubicar.html`. | IA en directo, con un hilo | Completo | Mapa completo (el servidor debe admitir peticiones parciales HTTP Range; casi todos lo hacen) |
| **Sin servidor** | Doble clic en `index.html`, `contar.html` o `ubicar.html`. | Resultados pregrabados de la IA (el navegador no permite ejecutar la IA desde un archivo local) | Completo | Mapa simplificado de respaldo (provincia, municipios, autovías y pueblos) |

- ¡Cuéntalos! y ¡Ubícalo! no ejecutan ningún modelo en el navegador, así que funcionan igual de cualquier forma. ¡Ubícalo! necesita **WebGL** para el mapa completo; sin él, usa el mapa simplificado.
- En **tabletas y móviles** (iPad, Android, Chromebook) no se puede ejecutar Python: se juega por red, desde el servidor del profesor, o con la versión subida a un hosting estático.
- Si el puerto 8000 está ocupado, el servidor no arranca: elige otro, por ejemplo `python3 servidor.py 8080`.
- Si los alumnos no pueden entrar por red, comprueba que están en la misma wifi que el profesor y que el cortafuegos permite el puerto. Algunas redes de invitados aíslan a los dispositivos entre sí.

## ¡Encuádralo!: encuadrar objetos

### Reglas y puntuación

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

## ¡Cuéntalos!: contar objetos

Cada partida tiene **7 rondas** con cada vez más objetos: 2 fáciles (7–10 objetos), 2 de nivel medio (11–30), 2 difíciles (31–50) y 1 extrema (más de 100). Antes de cada ronda se muestra **una muestra** del objeto que hay que contar (una de las cajas de ejemplo de FSC-147). El alumno puede hacer clic en cada objeto para marcarlo y no perder la cuenta, y escribe el número o lo ajusta con los botones −10, −1, +1 y +10.

| Concepto | Puntos |
|---|---|
| ✅ Precisión | 1000 × (1 − \|error\| ÷ real), nunca menos de 0 |
| 🎯 Número exacto | +250 |
| ⚡ Bonus de velocidad | hasta +300 × precisión |

- Se usa el **error relativo**: fallar por 2 cuando hay 10 cuesta lo mismo que fallar por 20 cuando hay 100. Así todas las rondas pesan parecido.
- El tiempo depende del nivel: 25, 40, 60 y 75 s.
- La IA es **LOCA** (Đukić et al., ICCV 2023). Igual que la IA de ¡Ubícalo!, sus recuentos y su tiempo se calculan antes, sin conexión, y el navegador no ejecuta ningún modelo. LOCA recibe la misma caja de ejemplo que ve el alumno. Su tiempo (unos 0,4 s por foto) se midió en CPU con 4 hilos, y el juego indica en qué procesador.
- Al final se comparan los puntos, las rondas ganadas, los números exactos, el **error medio** (MAE, en objetos), el **error relativo medio** y el tiempo. También se puede descargar un CSV.

LOCA no busca los objetos uno a uno: calcula un **mapa de densidad** a partir de la muestra y lo suma. Por eso es muy precisa con multitudes: en las rondas difíciles y extremas se equivoca en torno a un 10–15 %. Con pocos objetos grandes, en cambio, falla más que una persona atenta (alrededor de un 20 %). Esa es la lección del juego: el alumno suele ganar las primeras rondas y la IA las últimas. Tras cada ronda se indica también cuántos objetos habría visto un detector como YOLO, el rival de ¡Encuádralo!: en la ronda extrema, casi ninguno.

En el resultado, los aros cian son los objetos que cuenta LOCA. Se obtienen de los máximos de su mapa de densidad y solo sirven para la animación: su respuesta es la suma del mapa, redondeada.

Las imágenes salen de **FSC-147** (Ranjan et al., «Learning To Count Everything», CVPR 2021), un conjunto con un punto marcado a mano en cada objeto. Solo se usan clases que también existen en COCO (frutas, aves, animales, sillas, libros, botellas…), para poder comparar con YOLO. Como LOCA se entrenó con FSC-147, todas las fotos del juego son de las particiones **val y test**, que LOCA nunca vio al entrenar. El script rechaza las de train. FSC-147 no tiene imágenes con menos de 7 objetos, así que el nivel fácil empieza en 7.

Las 30 imágenes (9 fáciles, 9 medias, 9 difíciles y 3 extremas) se eligen con [tools/preparar_conteo.py](tools/preparar_conteo.py), que funciona igual que `preparar_datos.py`: el paso `candidatos` genera hojas de contacto por nivel y el paso `construir` regenera `img/conteo/` y `js/datos_conteo.js`, con los resultados de LOCA y de YOLO. Para `construir` hace falta LOCA en ONNX, que se genera con [tools/exportar_loca.py](tools/exportar_loca.py). No se incluye en el juego, porque pesa 137 MB y solo se usa aquí. Con 3 cajas de ejemplo, la exportación reproduce el error publicado en el artículo: MAE de 10,2 en val y 10,7 en test. Las imágenes de FSC-147 se descargan aparte; las instrucciones están en el propio script. Los ajustes del juego están en [js/config_conteo.js](js/config_conteo.js).

## ¡Ubícalo!: ¿dónde se hizo esta foto?

Cada partida tiene **5 fotos** de la provincia de Alicante, sobre todo de Alicante, Elche y Santa Pola, ordenadas de más fácil a más difícil. El alumno pone una chincheta en el mapa de la provincia y pulsa **¡AQUÍ!** antes de que pasen 60 s. Se puede acercar el mapa con la rueda del ratón o pellizcando, y ver la foto en grande.

| Distancia | Puntos |
|---|---|
| 0 km | 1000 |
| 1 km | 905 |
| 5 km | 607 |
| 10 km | 368 |
| 25 km | 82 |

- Puntos = 1000 × e^(−distancia / 10 km), la misma fórmula que usan los juegos de geolocalización. La distancia se mide sobre la esfera terrestre.
- Si se acaba el tiempo, vale la chincheta puesta. Sin chincheta, 0 puntos.
- La IA es **GeoCLIP** (Vivanco et al., NeurIPS 2023). Es demasiado grande para el navegador, así que sus predicciones y su tiempo se calculan antes, sin conexión.
- GeoCLIP juega con la misma pista que el alumno: elige solo entre los puntos de su galería (100.000 lugares de todo el mundo donde se hacen fotos) que caen dentro de la provincia, que son 102. Tras cada ronda se indica también por cuánto habría fallado sin esa pista. No sirve una rejilla uniforme: en zonas vacías del interior GeoCLIP da puntuaciones altas sin motivo, y su error medio pasa de 13 a 30 km.
- Al final se comparan los puntos, las fotos ganadas, la distancia media y la mejor, las fotos a menos de 5 km y el tiempo. También se puede descargar un CSV.

El mapa es el de **OpenStreetMap**, completo y sin conexión: las teselas vectoriales de [Protomaps](https://protomaps.com) para la provincia están guardadas en `mapas/alicante.pmtiles` (zoom 0–14, 42 MB) y se dibujan con MapLibre GL. Tiene calles, playas, relieve, puntos de interés y nombres en español. Cada navegador descarga solo las teselas que va viendo, unos 2 MB por partida. Para eso, el servidor tiene que admitir peticiones parciales (HTTP Range): `servidor.py` lo hace, y también GitHub Pages y casi todos los alojamientos web. Si el juego se abre sin servidor (doble clic en `ubicar.html`) o el navegador no tiene WebGL, se usa un mapa simplificado de respaldo (`js/mapa_alicante.js`), con el contorno de la provincia, los municipios, las autovías y los nombres de los pueblos. Las fotos son de Wikimedia Commons con licencia libre. Se guardan con un nombre neutro y sin metadatos, porque el EXIF incluye las coordenadas GPS. El lugar y el autor se muestran después de cada ronda.

Todo se regenera con [tools/preparar_ubicar.py](tools/preparar_ubicar.py):

1. `python tools/preparar_ubicar.py mapa`: descarga y simplifica el mapa de respaldo y genera `js/mapa_alicante.js`.
   `python tools/preparar_ubicar.py teselas`: recorta el mapa completo de Protomaps y descarga sus tipografías e iconos en `mapas/`. Necesita la herramienta [pmtiles](https://github.com/protomaps/go-pmtiles).
2. `python tools/preparar_ubicar.py fotos`: descarga las fotos de `SELECCION` a `img/ubicar/`.
3. `python tools/preparar_ubicar.py ia`: ejecuta GeoCLIP (necesita `torch` y `pip install geoclip`) y guarda sus predicciones en `js/datos_ubicar.js`.
4. `python tools/preparar_ubicar.py tiempo`: mide el tiempo de GeoCLIP en CPU. Conviene hacerlo con el ordenador libre de otras tareas.

Para cambiar las fotos, edita `SELECCION` y repite los pasos 2 y 3. Comprueba antes las coordenadas en Commons: algunas fotos importadas de Panoramio están mal situadas. Los ajustes del juego están en [js/config_ubicar.js](js/config_ubicar.js).

## Ajustes de ¡Encuádralo!

Todo se cambia en [js/config.js](js/config.js): número de rondas, segundos por ronda, umbral de IoU, puntos, penalizaciones, bonus y los textos «FALSO POSITIVO» / «FALSO NEGATIVO».

## Cambiar o añadir imágenes de ¡Encuádralo!

Las imágenes se eligen con [tools/preparar_datos.py](tools/preparar_datos.py). Requiere Python con `numpy`, `pillow` y `onnxruntime`.

1. Edita `GRUPOS` si quieres otros tipos de objeto (cualquier clase de COCO).
2. Ejecuta `python tools/preparar_datos.py candidatos`. Descarga COCO, filtra las fotos adecuadas, les pasa YOLO y genera hojas de contacto en `tools/.cache/candidatos/` para elegirlas a ojo.
3. Copia los identificadores elegidos en `SELECCION`.
4. Ejecuta `python tools/preparar_datos.py construir`. Copia las fotos a `img/` y regenera `js/datos.js`, con las etiquetas, las detecciones pregrabadas y los créditos.

Conviene revisar cada foto antes de usarla: a veces COCO deja objetos sin etiquetar, y eso penalizaría injustamente al alumno.

El modelo se regenera con `python tools/exportar_modelo.py`, que requiere `ultralytics`.

## Estructura

```
index.html            pantallas de ¡Encuádralo!
contar.html           pantallas de ¡Cuéntalos! (contar objetos)
css/estilos.css       estilo visual y animaciones
js/config.js          ajustes
js/juego.js           flujo del juego y recuento de puntos
js/lienzos.js         editor de cajas y visor de resultados
js/detector.js        YOLO11n en el navegador (ONNX Runtime Web)
js/puntuacion.js      IoU, emparejamiento y puntos
js/sonido.js          efectos y música sintetizados (Web Audio)
js/efectos.js         animaciones, confeti
js/datos.js           imágenes, etiquetas y detecciones pregrabadas (generado)
js/contar.js          flujo y puntuación de ¡Cuéntalos!
js/config_conteo.js   ajustes de ¡Cuéntalos!
js/datos_conteo.js    imágenes, recuentos reales y resultados pregrabados de LOCA y YOLO para ¡Cuéntalos! (generado)
css/contar.css        estilos propios de ¡Cuéntalos!
ubicar.html           pantallas de ¡Ubícalo! (adivinar dónde se hizo una foto)
js/ubicar.js          flujo y puntuación de ¡Ubícalo!
js/mapa.js            mapa interactivo de ¡Ubícalo! (MapLibre + Protomaps, o mapa simplificado de respaldo)
js/config_ubicar.js   ajustes de ¡Ubícalo!
js/datos_ubicar.js    fotos, coordenadas y predicciones de GeoCLIP (generado)
js/mapa_alicante.js   mapa simplificado de la provincia de Alicante, de OpenStreetMap (generado)
mapas/                teselas de OpenStreetMap (Protomaps) de la provincia, tipografías e iconos del mapa
css/ubicar.css        estilos propios de ¡Ubícalo!
img/                  16 fotos de COCO val2017
img/conteo/           30 fotos de FSC-147
img/ubicar/           5 fotos de Wikimedia Commons
models/yolo11n.onnx   modelo de detección
vendor/ort/           ONNX Runtime Web 1.22
vendor/maplibre/      MapLibre GL JS 6.15
vendor/pmtiles/       PMTiles 4.5 (lectura de mapas/alicante.pmtiles)
vendor/protomaps/     estilo de mapa de Protomaps (@protomaps/basemaps 5.7)
fonts/montserrat.css  tipografía incrustada
servidor.py           servidor local de los tres juegos (activa el modo multihilo de la IA)
jugar.sh / jugar.bat  abren ¡Encuádralo!
contar.sh / contar.bat  abren ¡Cuéntalos!
ubicar.sh / ubicar.bat  abren ¡Ubícalo!
tools/                scripts para regenerar imágenes y modelo
```

## Créditos y licencias

- **Fotos de ¡Ubícalo!:** [Wikimedia Commons](https://commons.wikimedia.org), con licencias CC BY y CC BY-SA. El autor y la licencia de cada una aparecen en el juego.
- **Mapa de ¡Ubícalo!:** © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), con licencia ODbL, en teselas de [Protomaps](https://protomaps.com). Motor: [MapLibre GL JS](https://maplibre.org) (BSD-3). PMTiles y el estilo de Protomaps tienen licencia BSD-3, la tipografía Noto Sans la SIL Open Font License y los iconos derivan de tangrams/icons (MIT).
- **IA de ¡Ubícalo!:** [GeoCLIP](https://github.com/VicenteVivan/geo-clip) (V. Vivanco Cepeda, G. K. Nayak y M. Shah, NeurIPS 2023), con licencia MIT.
- **Imágenes de ¡Cuéntalos!:** [FSC-147](https://github.com/cvlab-stonybrook/LearningToCountEverything) (V. Ranjan, U. Sharma, T. Nguyen y M. Hoai, CVPR 2021). Las fotos proceden de internet y se usan con fines educativos y de investigación.
- **Imágenes y etiquetas:** [COCO dataset](https://cocodataset.org). Las etiquetas tienen licencia CC BY 4.0. Cada foto mantiene su licencia de Flickr, que se puede consultar dentro del juego en «Créditos».
- **Modelo:** [Ultralytics YOLO11n](https://github.com/ultralytics/ultralytics), con licencia AGPL-3.0.
- **IA de ¡Cuéntalos!:** [LOCA](https://github.com/djukicn/loca) (N. Đukić, A. Lukežič, V. Zavrtanik y M. Kristan, ICCV 2023), con licencia MIT.
- **Motor de IA:** [ONNX Runtime Web](https://onnxruntime.ai), con licencia MIT.
- **Tipografía:** Montserrat, con licencia SIL Open Font License 1.1.
