# Extender Lumen Slides

## Plantillas

Cada carpeta `templates/<id>/` contiene `manifest.json`, `slide.hbs` y, opcionalmente, `style.css`. El motor descubre el layout por su identificador, sin modificar un switch central.

```sh
node bin/lumen.mjs template executive --from statement
```

Edita la composición de `slide.hbs`. El contexto incluye los campos de la slide, `author`, `references`, `imageData`, `imageOnLightData`, `dataTable` y `formula`. `{{title}}` escapa contenido. Las llaves triples deben reservarse para las salidas seguras generadas por el cliente, como `formula`. Los templates son código confiable mantenido por el desarrollador, no entrada sin validar de un agente.

```json
{
  "id": "executive",
  "name": "Executive",
  "required": ["body"],
  "brand": "research-lab"
}
```

El estilo opcional se debe delimitar con `.layout-executive`. No carga URLs ni `@import`. La marca puede venir del deck, de la plantilla o de la slide. Prioridad: slide, plantilla, deck.

Cambiar una composición de campos existentes solo requiere una plantilla. Introducir un nuevo campo de contenido requiere actualizar `schemas/deck.schema.json`. Un nuevo componente interactivo también requiere un módulo de runtime y su contrato de exportación.

### Campos invertidos

`cover-cyan` y `section-orange` son plantillas de campo invertido: vuelven a declarar los roles de color sobre su propia `section`, no dentro de `.slide-content`. Por eso el pie, la marca, las citas y el número de página heredan la paleta invertida, y ambas se ven igual bajo cualquier tema. La `section` también repite `color:var(--foreground)`, porque ese valor se resuelve en `.reveal` y no llegaría a los titulares. `cover-cyan` usa el campo cian `#6bd9ec` con texto `#000002`; `section-orange` usa el campo naranja `#ec5512` con titulares en blanco, texto de apoyo oscuro y el cian como fondo del eyebrow, ya que el cian sobre naranja no alcanza contraste legible.

Junto a `section-orange` hay seis cortes de sección más, para que el autor pueda variar el color de un divisor: `section-olive` (`#808000`), `section-teal` (`#00afb9`), `section-violet` (`#9400d3`), `section-raspberry` (`#872657`), `section-crimson` (`#dc143c`) y `section-blue` (`#1034a6`). Todos comparten la composición de `section-orange` y resuelven los mismos cuatro problemas: redeclaran los seis roles sobre su propia `section` con `color:var(--foreground)`, pintan el margen exterior de Reveal desde el `body`, repintan `.controls` y `.progress` —que viven fuera de la `section` y conservarían el `--accent` del tema— y fijan la marca que su campo necesita.

La tinta no se copia de una plantilla a otra: se decide con el mismo umbral de luminancia que usa `isLight()` en `src/build.mjs`. `section-olive` y `section-teal` son campos claros y llevan tinta oscura; los otros cuatro son oscuros y llevan tinta blanca. Copiar el blanco de `section-orange` sobre el teal daría 2,68:1, por debajo incluso del mínimo de 3:1 para elementos no textuales. El eyebrow es un chip de la tinta del titular que devuelve el color del campo como texto: es el mismo par medido, invertido, así que su contraste es conocido sin introducir un tercer color. `section-orange` necesitó un cian prestado porque su paleta ya estaba fijada; un color libre no lo necesita. En `section-crimson` el blanco solo alcanza 4,99:1 y el tinte más claro utilizable, `#fff0f3`, ya baja a 4,52:1, de modo que el texto de apoyo se queda en blanco y se separa del titular solo por tamaño.

La marca se fija en las dos direcciones. Sobre un campo claro se fuerza `logoOnLight`, como en `section-orange`, pero sin su `filter:brightness(0)`: ese filtro existe porque la marca lleva acentos en `#ec5512`, el mismo naranja del campo, y ninguno de los seis colores nuevos choca con ellos. Sobre un campo oscuro se fuerza la marca ordinaria: bajo un tema claro, `themeCSS()` cambiaría a la variante de tinta oscura por la luminancia de la página, que está elegida para el fondo del tema y no para este campo, donde perdería sus glifos.

## Temas

Duplica un archivo en `themes/`. Cambia id, name, colores hexadecimales y paleta chart. Sus colores son background, foreground, muted, accent, secondary y surface. El selector los descubre automáticamente. Usa contraste suficiente para texto, enlaces y las distintas series; comprueba también la versión clara y la oscura.

El cambio de tema durante la presentación es temporal. Para convertirlo en valor por defecto, cambia `theme` en `deck.json` y vuelve a compilar.

## Tipografías

Añade una entrada en `config/fonts.json` con name, family y archivos locales con weight. Se aceptan WOFF2, WOFF y TTF. Se incorporan como data URLs. Los archivos deben estar dentro del proyecto y debes tener permiso de redistribución. Incluye la licencia en el proyecto si agregas fuentes propias. Las fuentes iniciales cubren español y caracteres latinos. Otros alfabetos requieren archivos con esos glifos.

```json
{
  "my-font": {
    "name": "Mi fuente",
    "family": "Mi Fuente",
    "files": [{ "path": "assets/fonts/my-font.woff2", "weight": 400 }]
  }
}
```

El selector de fuente es temporal. `deck.json` controla el valor de compilación. Los SVG de diagramas se regeneran para que la fuente y los colores coincidan.

## Marcas y logos

Crea `brands/<id>.json`. Un wordmark textual funciona sin imagen. Para un logo, usa una ruta relativa al proyecto. Se permiten PNG, JPG, WebP y SVG pasivo con referencias internas.

```json
{
  "id": "my-company",
  "name": "Mi empresa",
  "logo": "assets/brands/my-company.png",
  "logoOnLight": "assets/brands/my-company-on-light.svg"
}
```

`logo` es la marca por defecto. `logoOnLight` es opcional y se usa cuando el campo que hay detrás es claro: los temas cuyo `background` supera el umbral de luminancia relativa WCAG (`sqrt(1.05*0.05)-0.05`, es decir 0,1791) y las plantillas invertidas `cover-cyan` y `section-orange`, que pintan su propio campo claro aunque el tema sea oscuro. El nombre dice que el fondo es claro, no la marca. La decisión se resuelve al compilar y se emite como CSS por tema, así que el selector de temas del visor la respeta sin JavaScript.

Si una marca no declara `logoOnLight`, se usa siempre `logo`; no hay degradación ni hueco. Si no declara ningún logo, el pie muestra el wordmark de texto. Cuando existen las dos, ambas imágenes se incrustan y el CSS decide cuál se ve.

Un SVG sin `width` ni `height` no tiene tamaño intrínseco y colapsa a 0×0 dentro de un `<img>`, porque `.brand-logo` solo fija máximos. Añade ambos atributos al `<svg>` raíz con las medidas del `viewBox`.

Los logos se incorporan al HTML y se conservan con su proporción. Los logos de empresas no se descargan ni se inventan automáticamente. Usa el archivo oficial aportado para la presentación. La demo alterna los wordmarks LUMEN y RESEARCH LAB.

### Imágenes de contenido

El layout `image` sigue el mismo mecanismo para la imagen de la slide. `image` es la variante por defecto y `imageOnLight` es opcional: se usa cuando el campo que hay detrás es claro, con el mismo umbral de luminancia y las mismas reglas por tema que `logoOnLight`. Solo tiene sentido junto a `image`; `validateDeck` rechaza una slide que declare `imageOnLight` sin `image`, y ambas rutas pasan por las mismas comprobaciones: contención dentro del directorio del deck, límite de 12 MiB y SVG pasivo.

```json
{
  "id": "contexto",
  "layout": "image",
  "image": "resources/logo.svg",
  "imageOnLight": "resources/logo-negro.svg",
  "alt": "Logotipo"
}
```

Cuando existen las dos, se incrustan las dos imágenes y el CSS decide cuál se ve; `alt` va solo en la visible y la oculta lleva `alt=""` para que el lector de pantalla no anuncie la misma marca dos veces. Si la slide declara solo `image`, esa imagen se ve bajo cualquier tema: la regla por tema oculta una imagen únicamente cuando su gemela clara la sigue en el marcado. `.content-image` fija ancho y alto, así que aquí un SVG sin tamaño intrínseco no colapsa; aun así conviene declarar `width` y `height` si el archivo se reutiliza como logo.

## Iconos

Los iconos se referencian con una cadena `prefijo:nombre` en `deck.json`. Hay tres prefijos: `tabler` (trazo), `tabler-filled` (relleno) y `brand` (logotipos de Simple Icons). El nombre debe ser minúsculas, dígitos y guiones.

```json
{
  "layout": "bullets",
  "icon": "tabler:rocket",
  "items": [{ "icon": "tabler:prompt", "title": "Prompt", "text": "Entrada del agente" }]
}
```

Se admiten en el campo `icon` de la diapositiva, que las plantillas usan como icono principal, y en el campo `icon` de cada entrada de `items`, que las viñetas usan como marcador. Ambos son opcionales. El SVG se inserta en línea, sin `width` ni `height`, para que el tamaño lo defina el CSS y el color se herede del tema mediante `currentColor`; en las viñetas toma `var(--accent)` y sustituye al guion. Los iconos son decorativos: se marcan `aria-hidden` y se elimina su `<title>`, así que el texto contiguo debe comunicar el significado.

Los paquetes se resuelven desde `node_modules`, sin descargas. Tabler Icons es MIT. Simple Icons es CC0-1.0, pero su `DISCLAIMER.md` aclara que la licencia cubre los archivos, no las marcas registradas ni los logotipos que representan: usar un logo ajeno conlleva obligaciones propias del titular de la marca.

## Gráficas

El contrato acepta `bar`, `line` y `scatter`, con `labels`, `series`, `unit` y `caption`. Todas las series tienen la misma longitud que labels. El eje X actual es categórico, incluso en scatter. No representa coordenadas X numéricas desiguales. Para ampliar esto, define pares XY en el schema y adapta `src/features/chart.mjs` y la tabla de datos en `src/build.mjs`.

Se elige SVG en ECharts. Cada gráfica debe seguir funcionando después de cambiar tema o fuente y debe devolver un estado estable con `freeze()`. Una nueva transformación de datos debe conservar unidad, fuente y método de cálculo.

## Diagramas

El código Mermaid vive en `diagram.code`; los pasos están en `diagram.steps`, asociados a IDs de nodos. La interacción inicial está diseñada para flowcharts. Otros diagramas compatibles con Mermaid pueden renderizarse, pero el resaltado por pasos requiere otro adaptador si no usan los nodos de flowchart.

Los componentes no interpretan instrucciones click ni directivas de Mermaid. No uses HTML dentro de los diagramas. En PDF se imprime el diagrama entero y el primer paso como explicación fija.

## Escenas y nuevas funciones

`src/features/scene.mjs` incluye network, robot y pipeline, con descripción alternativa. Una nueva escena debe aportar lectura sin GPU, controles de teclado o alternativa equivalente, pausa, respeto por reduced-motion y una captura fija para PDF. No presentes una ilustración como una simulación validada.

`pipeline` explica una secuencia ordenada. El deck entrega los rótulos en `scene.steps`, entre 2 y 8 pasos de `{title, detail}`; ocho es el máximo que conserva un rótulo legible dentro del lienzo de 650×430. El orden se lee sin la leyenda: la cadena baja en zigzag alternando columna y profundidad, cada rótulo lleva su número y cada enlace termina en una punta de flecha hacia el paso siguiente. Los rótulos son sprites con textura de canvas, se redibujan al cambiar de tema o de tipografía y el paso activo se resalta con el color de acento. El giro completo se sustituye por un vaivén corto para que el texto siempre se pueda leer; el botón de pausa y `prefers-reduced-motion` se respetan igual. Con `scene.loop` en `true` se añade la flecha de retorno del último paso al primero: úsala solo cuando el contenido afirme ese ciclo. Sin WebGL la escena muestra la lista ordenada completa con su explicación, y los botones de paso siguen funcionando. En PDF se imprime la escena entera y el primer paso como explicación fija.

Cada función devuelve métodos opcionales:

```js
{ update(), onSlide(id), freeze(), restore() }
```

`update()` recibe la configuración actual a través del estado compartido. `freeze()` prepara la exportación. Debe hacer los cambios visuales esenciales de forma síncrona para que también funcione Ctrl/Cmd+P. Puede devolver una promesa si hay preparación adicional. El exportador automático espera esa promesa.

Para un nuevo tipo de función, añade su schema, un módulo en `src/features/`, la importación por capacidad en `src/build.mjs` y una prueba de uso y exportación. El contenido JSON no debe admitir funciones JS arbitrarias.

## Transiciones

`deck.json` acepta `transition` en el deck y en cada slide. La slide gana sobre el deck y el deck sobre el valor por defecto, que es `fade`. Los seis nombres son:

| Nombre | Uso recomendado | Duración |
|---|---|---|
| `fade` | Paso profesional por defecto entre slides | 300 ms |
| `crossfade` | Diagramas, imágenes, dashboards | 320 ms |
| `slide` | Continuación de una secuencia | 300 ms |
| `morph` | Evolución de un diagrama o una arquitectura | 400 ms |
| `fade-dark` | Cambio fuerte de sección | 420 ms |
| `none` | Máxima velocidad y sobriedad | 0 ms |

`fade` y `crossfade` son el mismo mecanismo: la disolución cruzada de Reveal, donde la slide saliente y la entrante se funden a la vez. No hay una diferencia técnica entre ambos; cambian la duración y la intención declarada. Se mantienen como dos nombres porque el autor elige uno u otro según el tipo de contenido, y el nombre queda en `deck.json` como decisión explícita.

Reveal solo ofrece `default`, `fast` y `slow`, es decir `.4s` y `1.2s`. Ninguna de las duraciones de la tabla se alcanza con esos valores, así que las define `src/style.css` con un token por transición: `--transition-fade`, `--transition-crossfade`, `--transition-slide`, `--transition-morph`, `--transition-fade-dark` y `--transition-none`. Cada regla usa la misma especificidad que la de Reveal y se concatena después en `src/build.mjs`, que es lo que la hace ganar. Cambiar una duración es cambiar su token. El `data-transition-speed="fast"` que emite el build es solo el respaldo de Reveal si esas reglas faltaran.

`morph` usa `data-auto-animate` y es **por pares**: Reveal solo interpola entre dos slides consecutivas que lleven el atributo. Marcar una slide como `morph` significa "anima desde la slide anterior hasta esta", así que el build pone el atributo en la slide y también en su predecesora. La predecesora conserva su propia transición declarada. Una `morph` en la primera posición no tendría desde dónde animar: `validateDeck` la rechaza en lugar de degradarla en silencio, igual que rechaza otras combinaciones imposibles del contrato.

`fade-dark` no existe en Reveal. Lo aporta una capa fija `#transition-veil` que `src/runtime.mjs` enciende y apaga con el evento `slidechanged`, la mitad de la duración para entrar y la otra mitad para salir. Su color es `--veil`: el runtime mide la luminancia de `--background` y `--foreground` y elige el más oscuro de los dos, así que en `paper` y `prisma-claro` el corte sigue pasando por un tono oscuro y no por blanco. No hay negro fijo en el código. La capa es `pointer-events:none`, se recalcula al cambiar de tema, no se imprime y el cambio de slide nunca la espera: si fallara, la presentación avanza igual.

`prefers-reduced-motion` manda sobre cualquier valor declarado. Antes de inicializar Reveal, el runtime pone `none` en todas las slides, elimina los atributos de auto-animate, desactiva `autoAnimate` en la configuración y no enciende la capa oscura. Una transición por slide nunca puede devolver el movimiento que la persona pidió desactivar.

En PDF no hay transiciones: `src/runtime.mjs` no inicializa Reveal en modo estático. El PDF conserva un estado fijo.

## Fuentes de investigación

Añade entradas a `config/sources.json`. Los topics reconocidos inicialmente son software, ai, llm, statistics, robotics, science, math y news. Incluye dominio, categoría y guía de interpretación. El agente puede usar una fuente primaria relevante aunque no esté en el catálogo. Una entrada no es una verificación factual.

## Adaptadores y modelos

`config/adapters.json` define command, args e input. Las sustituciones disponibles son `{prompt}` y `{response}`. Se usa un proceso sin shell. `input: stdin` envía el prompt por la entrada estándar; OpenCode lo recibe como archivo adjunto.

`--model` se pasa al CLI. El harness no almacena API keys ni inicia sesiones. Para un protocolo de salida diferente, añade el parser en `src/harness.mjs` y prueba eventos de éxito, fallo y consumo ausente. No conviertas un texto de error en una slide aprobada.

La orden de trabajo solicita solo lecturas y la devolución del JSON. No es una sandbox de seguridad del proceso externo: se mantienen las capacidades y restricciones reales de cada CLI. Usa un checkout aislado y los permisos que correspondan cuando las fuentes o el contexto lo requieran.

## Skills y agentes

La skill canónica está en `.agents/skills/lumen-decks/SKILL.md`. `npm run agent:sync` actualiza copias de proyecto para `.claude/skills/`, `.opencode/skills/` y `.pi/skills/`, además de los roles nativos de Claude y OpenCode. No escribe configuración global. Codex, OpenCode y Pi pueden leer `AGENTS.md`; Claude usa `CLAUDE.md` para cargarlo.

El harness no requiere que un proveedor implemente subagentes: ejecuta los roles secuencialmente mediante su interfaz de proceso. Los archivos nativos facilitan el uso manual desde clientes que sí los descubren.
