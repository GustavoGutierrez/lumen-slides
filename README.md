# Lumen Slides

Harness de agentes para investigar, componer y distribuir presentaciones web profesionales. El contenido vive en JSON. El cliente determinista aplica plantillas, colores, tipografías y marcas, y genera un HTML autónomo con una copia PDF opcional.

Incluye una demo de 10 diapositivas, 9 layouts, 3 temas, 2 familias tipográficas, 2 marcas de ejemplo, gráficas ECharts, Mermaid interactivo, escenas Three.js y fórmulas KaTeX. La investigación técnica y la justificación del stack están en [docs/RESEARCH.md](docs/RESEARCH.md).

## Ver la demo sin instalar nada

En el paquete entregado, abre `demo/index.html` en Chrome, Edge, Firefox o Safari moderno. No necesita internet para cargar recursos. `demo/presentation.pdf` es la copia estática. Las pruebas realizadas y los límites de compatibilidad están en [docs/VALIDATION.md](docs/VALIDATION.md).

Flechas o deslizar para navegar, Esc para el índice, N para notas y F para pantalla completa. Cambia tema y fuente desde la barra superior. La gráfica permite elegir series y consultar su tabla. El diagrama permite seleccionar nodos o avanzar por pasos. La escena 3D permite giro y pausa.

En móvil, extrae el archivo y abre el HTML con un navegador. Algunos visores de archivos y adjuntos bloquean JavaScript. En ese caso usa el PDF o sirve el HTML desde un alojamiento estático.

## Instalar el proyecto

Requisitos de autoría: Node.js 22 o posterior y npm. Funciona con scripts Node en Windows, macOS y Linux.

```sh
npm ci
npm run demo
```

El HTML se genera en `decks/demo/output/index.html`. Para exportación y comprobación visual automáticas:

```sh
npx playwright install chromium
npm run verify
npm run pdf
```

En un Linux mínimo, Playwright puede requerir `npx playwright install --with-deps chromium`. También admite un Chrome o Edge local mediante la variable `LUMEN_CHROMIUM_PATH`, definida con la sintaxis de tu terminal.

## Crear una presentación con tu agente

```sh
node bin/lumen.mjs new my-topic --title "Robótica aplicada"
```

Edita `decks/my-topic/brief.json` para fijar audiencia, objetivo, temas, número de diapositivas y fecha de corte. Añade documentos, datos e imágenes a `decks/my-topic/resources/`.

Abre el proyecto en Codex, Claude Code, OpenCode o Pi y solicita:

> Usa AGENTS.md y la skill lumen-decks de este proyecto. Crea la presentación definida en decks/my-topic/brief.json a partir de sus recursos. Investiga fuentes primarias cuando tengas búsqueda disponible, conserva las citas, valida el contenido e inspecciona los slides. Entrega el HTML portable y el PDF. Expón las preguntas que no puedas resolver con evidencia.

Este modo utiliza directamente las herramientas y permisos del agente. La skill y los roles son archivos del proyecto y se distribuyen con él.

## Ejecutar el harness desde CLI

Cada CLI debe estar instalado, autenticado y tener configuradas sus herramientas de investigación. Codex requiere un directorio de trabajo Git confiable: si descargaste el ZIP sin historial Git, inicialízalo con `git init` antes de usar ese adaptador. El renderizador no requiere un modelo.

```sh
node bin/lumen.mjs doctor
node bin/lumen.mjs run decks/my-topic --agent codex
```

Cambia `codex` por `claude`, `opencode` o `pi`. Para elegir un modelo, usa `--model` con el identificador que acepte ese CLI. No se fija un modelo de pago ni se guardan credenciales en el proyecto.

El flujo completo ejecuta investigación, guion, composición, revisión, build, verificación en Chromium, PDF y empaquetado. Guarda artefactos en el deck y recibos en `runs/`. Si una etapa falla, termina con error y conserva la respuesta para corregirla. No hay reintentos ilimitados. Para reutilizar etapas con entradas y salidas sin cambios:

```sh
node bin/lumen.mjs run decks/my-topic --agent codex --resume
```

Para ejecutar una sola etapa:

```sh
node bin/lumen.mjs run decks/my-topic --agent pi --stage research --timeout 300
```

Ctrl+C solicita detener el proceso hijo. Un timeout también detiene la ejecución. Las sesiones de otros clientes no se modifican.

## Flujo manual de artefactos

Puedes generar una tarea, ejecutarla en el agente que prefieras e importar su respuesta JSON:

```sh
node bin/lumen.mjs prompt decks/my-topic --stage research
node bin/lumen.mjs accept decks/my-topic --stage research --file response.json
```

Repite para storyboard, compose y review. Los archivos finales son `research.json`, `storyboard.json`, `deck.json` y `review.json`.

## Construir y distribuir

```sh
node bin/lumen.mjs validate decks/my-topic
node bin/lumen.mjs build decks/my-topic
node bin/lumen.mjs verify decks/my-topic
node bin/lumen.mjs pdf decks/my-topic
node bin/lumen.mjs pack decks/my-topic
```

`presentation.zip` contiene únicamente los archivos de presentación seleccionados por el empaquetador, sin los recursos de investigación ni los logs del agente. Si existe un PDF generado, el empaquetador comprueba que corresponda al HTML actual. La copia JSON incluye notas y fuentes: revisa que sean apropiadas para el público destinatario.

Para vista local por HTTP:

```sh
node bin/lumen.mjs serve decks/my-topic
```

Abre `http://127.0.0.1:4173`. No es necesario para el HTML autónomo y no publica la presentación en internet.

## Estructura y extensión

| Ruta | Responsabilidad |
| --- | --- |
| `bin/` y `src/` | CLI, renderizado, exportación y ejecución de agentes |
| `schemas/` | Contratos de contenido e investigación |
| `templates/` | Composiciones de slide y requisitos de campos |
| `themes/` | Paletas de color |
| `config/fonts.json` | Familias tipográficas y archivos locales |
| `brands/` | Wordmarks y logos independientes |
| `config/sources.json` | Catálogo editable de investigación |
| `config/adapters.json` | Comandos de los proveedores |
| `agents/` | Roles de investigación, guion, composición y revisión |
| `.agents/skills/` | Skill canónica del proyecto |
| `decks/<id>/resources/` | Documentos y datos de cada presentación |
| `docs/` | Investigación, arquitectura, extensión y validación |

Lee [docs/EXTENDING.md](docs/EXTENDING.md) para ampliar plantillas, temas, fuentes, marcas y componentes. Las decisiones de arquitectura están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Pruebas

```sh
npm test
npm run test:browser
npm run test:harness
```

Las pruebas unitarias comprueban citas, contratos de datos, escape de contenido, rutas, reproducibilidad, rechazo de resultados inconsistentes y los cuatro formatos de eventos mediante procesos simulados. Las pruebas de navegador comprueban interacción, carga offline y una vista táctil emulada. La matriz CI de tres sistemas está preparada para ejecutarse en un repositorio del usuario; incluirla no significa que ya se haya ejecutado en esos tres sistemas.

## Alcance de esta versión

Aplicación local operativa de autoría asistida y distribución. No incluye editor visual de arrastrar y soltar, SaaS, colaboración, buscador propio ni PPTX editable. La navegación web la aporta el agente. Three.js tiene una descripción alternativa cuando WebGL2 no está disponible. La exportación PDF es estática y no reproduce animaciones.

Para reconstruir el paquete del proyecto y su demo, usa `npm run pdf` seguido de `npm run package`. El archivo `source.bundle`, cuando está incluido, conserva el historial inicial y permite obtener otro checkout con `git clone source.bundle lumen-source`.

Código original bajo MIT. Dependencias y fuentes conservan sus propias licencias.
