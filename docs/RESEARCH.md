# Investigación y decisión técnica

Fecha de consulta: 12 de septiembre de 2026. Proyecto: Lumen Slides 0.1.0.

## Decisión

Para este harness recomiendo **presentaciones web con Reveal.js, contenido JSON validado y una compilación a HTML autónomo**. El agente investiga y propone el contenido. El cliente controla el esquema, las plantillas, la identidad visual y la exportación. Esta es una decisión de ingeniería para los requisitos de este proyecto, no una afirmación de que exista un motor superior para todos los casos.

La salida principal es un `index.html` que incorpora JavaScript, CSS, fuentes, imágenes y datos. El destinatario no instala Node.js ni un agente. La copia PDF registra un estado fijo de las visualizaciones. La exportación web requiere un navegador que permita JavaScript; un visor de adjuntos de correo o de archivos móviles puede bloquearlo.

## Motores de presentación evaluados

| Opción | Encaje | Decisión para Lumen |
| --- | --- | --- |
| Reveal.js | Motor HTML con navegación, transiciones, notas y mecanismos de impresión. Permite componer el documento antes de ejecutarlo. | Base elegida: da control directo al cliente sobre el HTML portable. |
| Slidev | Flujo para desarrolladores, temas y componentes Vue. Genera una aplicación web y ofrece exportaciones. | Muy buena alternativa si el editor principal será Markdown/Vue y se acepta distribuir una web compilada o alojada. |
| Marp | Ecosistema para autoría de presentaciones en Markdown. | Alternativa atractiva para documentos y decks más sencillos; Lumen prioriza componentes interactivos controlados. |
| Motor propio con React/Vue | Libertad completa sobre el producto. | Lo reservaría para un editor visual o colaboración. Implementar navegación, impresión y accesibilidad aumenta el trabajo inicial. |

Las capacidades de Reveal y las condiciones de impresión se documentan en [PDF Export](https://revealjs.com/pdf-export/). Su [Auto-Animate](https://revealjs.com/auto-animate/) permite transiciones entre elementos coincidentes. Lumen usa transiciones de slide y animaciones de sus componentes; no habilita Auto-Animate indiscriminadamente.

Slidev documenta el [build y alojamiento](https://sli.dev/guide/hosting.html) y la [exportación](https://sli.dev/guide/exporting.html). Sus formatos estáticos pierden las funciones interactivas. Su exportación PPTX descrita en esa página usa imágenes por slide, por lo que no equivale a un PowerPoint con objetos editables. No incorporo PPTX en esta primera versión. [Marp](https://marp.app/) ofrece su propio ecosistema basado en Markdown.

## Librerías y responsabilidades

| Necesidad | Selección implementada | Criterio y alternativa |
| --- | --- | --- |
| Navegar y presentar | Reveal.js 5.2.1 | Reutilizar un motor especializado. |
| Barras, líneas y dispersión categórica | Apache ECharts 6.0.0, renderer SVG | Interacción, leyenda y un resultado nítido al imprimir. |
| Diagramas | Mermaid 11.12.0 | Texto editable que se transforma en SVG. Un adaptador propio añade pasos y selección de nodos de flowchart. |
| Escenas 3D | Three.js 0.180.0 y OrbitControls | Incluir solo cuando existe un slide con escena. Dos ilustraciones iniciales: red y brazo robótico. |
| Fórmulas | KaTeX 0.16.22 | Render previo con HTML/MathML y fuentes incorporadas. |
| Movimiento | CSS y los motores de cada componente | Evita añadir otra dependencia para transiciones sencillas. |
| Plantillas | Handlebars 4.7.8 | Escapado del texto y layouts mantenidos por el desarrollador. |
| Contratos | JSON Schema, Ajv 8.17.1 y ajv-formats | Fallar antes del render cuando un documento no cumple el contrato. |
| Empaquetado | esbuild 0.25.10 | IIFE sin imports de red en tiempo de presentación. |
| PDF y comprobación | Playwright, versión fijada en package-lock.json | Renderizado real en Chromium y espera explícita del estado listo. |
| Fuentes locales | Inter e IBM Plex Sans, mediante Fontsource | Distribución sin depender de Google Fonts en tiempo de ejecución. |

Las versiones son las utilizadas en este proyecto; no se presentan como las últimas disponibles. `package-lock.json` fija también dependencias transitivas. Las licencias redistribuidas se incluyen en el paquete portable.

[ECharts explica Canvas frente a SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/). SVG evita desenfoque al ampliar y puede ser conveniente en dispositivos con menos memoria. Canvas puede ser más adecuado para muchas marcas o ciertos efectos. Esta implementación limita los datos por slide y conserva una tabla accesible, por lo que SVG es una elección coherente. El tipo scatter actual usa categorías como eje X; una dispersión científica con pares numéricos requeriría ampliar el contrato.

[D3](https://d3js.org/what-is-d3) ofrece primitivas de bajo nivel para visualización a medida. Lo añadiría cuando una gráfica narrativa exija control que los componentes actuales no resuelvan. [Plotly.js](https://plotly.com/javascript/) es otra opción para visualización científica y gráficos especializados. [Chart.js](https://www.chartjs.org/docs/latest/) puede ser adecuado para gráficas convencionales en Canvas. No conviene instalar las tres bibliotecas para resolver el mismo conjunto inicial de gráficos.

[Mermaid](https://mermaid.js.org/config/usage.html) permite renderizar diagramas desde texto y configurar el nivel de seguridad. Lumen usa modo estricto, deshabilita directivas y enlaces dentro del diagrama, y añade los controles desde código del proyecto. Mermaid no convierte automáticamente cualquier diagrama en una simulación: aquí la interacción consiste en seleccionar nodos, recorrer explicaciones y animar conexiones de un flowchart.

[Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) depende de WebGL2. Por eso el 3D no es una condición para leer la presentación: si falla, aparece una descripción. En PDF se captura una cámara fija. Las escenas de la demo son ilustraciones conceptuales, no simulaciones físicas ni modelos científicos validados. No usaría un fondo 3D permanente en todas las diapositivas: aumenta el peso y el trabajo de la GPU sin garantizar mejor comunicación.

Las [opciones de KaTeX](https://katex.org/docs/options) permiten controlar errores y contenido confiable. Lumen configura `trust: false` y hace fallar el build si una fórmula es inválida. [Playwright](https://playwright.dev/docs/browsers) documenta los navegadores y su instalación. El PDF se genera con Chromium; la compatibilidad de presentación y la compatibilidad de exportación son comprobaciones diferentes.

## Qué significa determinista

Con el mismo `deck.json`, recursos, plantillas, temas, fuentes y dependencias instaladas, la compilación produce el mismo HTML. El cliente no solicita un LLM durante `build`, `validate`, `verify`, `pdf` o `pack`.

El resultado de investigar o redactar con un LLM sigue siendo probabilístico. Un schema válido no demuestra que una afirmación sea cierta. La salida gráfica también depende del navegador, sus fuentes, GPU y versión. No prometemos PDFs idénticos byte por byte entre equipos: la metadata del PDF y el renderizador pueden variar. En cambio, el exportador fija tamaño, cámara, estado de gráficos y movimiento.

Los eventos de una ejecución guardan etapa, estado, duración y tokens cuando el proveedor los expone. Un valor desconocido se guarda como `null`. Los tokens de caché tienen semánticas distintas según proveedor: no se deben sumar a ciegas al campo input ni convertirlos en costo sin conocer la tarifa y el contrato de ese proveedor.

## Investigación verificable

El catálogo inicial contiene 30 entradas, editables en `config/sources.json`. No es una lista de instituciones infalibles. Ayuda al agente a buscar y a tratar correctamente cada tipo de evidencia.

| Tema | Puntos de partida | Cuidado al usarlos |
| --- | --- | --- |
| Software | Documentación del producto, W3C, MDN, ACM, IEEE | Distinguir especificación, documentación y artículo. Registrar versión. |
| IA y LLM | Publicaciones de laboratorios, PMLR, NeurIPS, arXiv | Separar resultados del fabricante, evaluación independiente y preprint. |
| Estadística | DANE, World Bank, OECD, Eurostat | Registrar unidad, población, fecha de corte, revisiones y metodología. |
| Síntesis de datos | Our World in Data | Seguir el dataset original y sus condiciones de uso. |
| Robótica | ROS, IEEE, Science, laboratorios | Distinguir software, demostración y validación experimental. |
| Ciencia | NASA, ESA, Nature, Science, NIST | Comprobar tipo de artículo, método y correcciones. |
| Matemáticas | NIST DLMF, AMS, arXiv | Diferenciar definición de referencia y resultado no revisado. |
| Noticias | Reuters, AP, BBC | Corroborar la afirmación central y buscar el documento original. |

Estas entradas son puntos de partida del catálogo, no una investigación ya realizada de cada tema. Sus dominios y notas no sustituyen abrir la fuente concreta.

Cada fuente utilizada debe tener identidad, título, URL exacta, editor, categoría, fecha de consulta y, si existe, publicación y localizador de la evidencia. Cada afirmación investigada indica fuentes, nivel de confianza y limitaciones. Las slides clasifican su contenido como evidencia, propuesta de diseño o ejemplo ilustrativo.

`research` genera consultas e indexa recursos locales; **no incorpora un buscador web propio**. El agente ejecutor utiliza sus herramientas de búsqueda, navegación o MCP. Si no dispone de ellas, debe trabajar con los documentos aportados y registrar preguntas pendientes. Los recursos PDF e imágenes se registran como archivos para que el agente los lea con sus capacidades. Los textos se incluyen en el plan hasta 12.000 caracteres por archivo, con indicador de truncamiento y hash. No hay OCR ni extracción PDF universal en esta versión.

## Adaptadores de agentes

| Agente | Interfaz empleada | Condición |
| --- | --- | --- |
| Codex | `codex exec --json --output-last-message … -` | CLI instalado y sesión/proveedor configurado. |
| Claude Code | `claude -p --output-format stream-json --verbose` | CLI y permisos de herramientas configurados. |
| OpenCode | `opencode run --format json --file …` | Proveedor y modelo elegidos en su configuración o con `--model`. |
| Pi | `pi --print --mode json` | Proveedor autenticado y herramientas/extensiones disponibles. |

Los comandos se basan en documentación primaria: [Codex no interactivo](https://developers.openai.com/codex/noninteractive/), [Claude Code programático](https://code.claude.com/docs/en/headless), [OpenCode CLI](https://opencode.ai/docs/cli/) y [Pi README](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md). Se conserva el comportamiento normal de permisos de cada CLI. No se agregan flags para saltar controles. La configuración es editable en `config/adapters.json` porque los CLI pueden cambiar.

Hay dos modos de uso. En modo asistido, se abre el repositorio en cualquiera de esos agentes y se sigue `AGENTS.md` y la skill local. En modo headless, el CLI de Lumen ejecuta las etapas, captura el JSON, valida y persiste. Los conectores se han probado con procesos simulados que cumplen los formatos de evento; eso no equivale a haber autenticado ni ejecutado esos cuatro productos con modelos reales.

## Portabilidad y límites

Para crear o modificar: Node.js 22+, npm y dependencias. Para PDF automático: Chromium instalado por Playwright o una ruta a Chrome/Edge. Para ver el resultado: navegador moderno con JavaScript. El HTML tiene cero solicitudes externas de carga; sus enlaces a las fuentes naturalmente necesitan red.

El proyecto usa scripts Node sin depender de Bash, symlinks para distribución ni comandos específicos de un sistema operativo. Incluye una matriz CI para Windows, macOS y Linux. Las comprobaciones ejecutadas en este entorno y las aún pendientes se detallan en `VALIDATION.md`.

La primera versión no ofrece editor visual de arrastrar y soltar, edición colaborativa, sesiones remotas sincronizadas, sincronización con Google Slides, PPTX editable, OCR, vídeos embebidos ni alojamiento automático. Son ampliaciones posibles y tienen contratos distintos. La prioridad entregada es el harness extensible, la investigación trazable y las presentaciones portables.
