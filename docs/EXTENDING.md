# Extender Lumen Slides

## Plantillas

Cada carpeta `templates/<id>/` contiene `manifest.json`, `slide.hbs` y, opcionalmente, `style.css`. El motor descubre el layout por su identificador, sin modificar un switch central.

```sh
node bin/lumen.mjs template executive --from statement
```

Edita la composición de `slide.hbs`. El contexto incluye los campos de la slide, `author`, `references`, `imageData`, `dataTable` y `formula`. `{{title}}` escapa contenido. Las llaves triples deben reservarse para las salidas seguras generadas por el cliente, como `formula`. Los templates son código confiable mantenido por el desarrollador, no entrada sin validar de un agente.

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
  "logo": "assets/brands/my-company.png"
}
```

Los logos se incorporan al HTML y se conservan con su proporción. Los logos de empresas no se descargan ni se inventan automáticamente. Usa el archivo oficial aportado para la presentación. La demo alterna los wordmarks LUMEN y RESEARCH LAB.

## Gráficas

El contrato acepta `bar`, `line` y `scatter`, con `labels`, `series`, `unit` y `caption`. Todas las series tienen la misma longitud que labels. El eje X actual es categórico, incluso en scatter. No representa coordenadas X numéricas desiguales. Para ampliar esto, define pares XY en el schema y adapta `src/features/chart.mjs` y la tabla de datos en `src/build.mjs`.

Se elige SVG en ECharts. Cada gráfica debe seguir funcionando después de cambiar tema o fuente y debe devolver un estado estable con `freeze()`. Una nueva transformación de datos debe conservar unidad, fuente y método de cálculo.

## Diagramas

El código Mermaid vive en `diagram.code`; los pasos están en `diagram.steps`, asociados a IDs de nodos. La interacción inicial está diseñada para flowcharts. Otros diagramas compatibles con Mermaid pueden renderizarse, pero el resaltado por pasos requiere otro adaptador si no usan los nodos de flowchart.

Los componentes no interpretan instrucciones click ni directivas de Mermaid. No uses HTML dentro de los diagramas. En PDF se imprime el diagrama entero y el primer paso como explicación fija.

## Escenas y nuevas funciones

`src/features/scene.mjs` incluye network y robot, con descripción alternativa. Una nueva escena debe aportar lectura sin GPU, controles de teclado o alternativa equivalente, pausa, respeto por reduced-motion y una captura fija para PDF. No presentes una ilustración como una simulación validada.

Cada función devuelve métodos opcionales:

```js
{ update(), onSlide(id), freeze(), restore() }
```

`update()` recibe la configuración actual a través del estado compartido. `freeze()` prepara la exportación. Debe hacer los cambios visuales esenciales de forma síncrona para que también funcione Ctrl/Cmd+P. Puede devolver una promesa si hay preparación adicional. El exportador automático espera esa promesa.

Para un nuevo tipo de función, añade su schema, un módulo en `src/features/`, la importación por capacidad en `src/build.mjs` y una prueba de uso y exportación. El contenido JSON no debe admitir funciones JS arbitrarias.

## Fuentes de investigación

Añade entradas a `config/sources.json`. Los topics reconocidos inicialmente son software, ai, llm, statistics, robotics, science, math y news. Incluye dominio, categoría y guía de interpretación. El agente puede usar una fuente primaria relevante aunque no esté en el catálogo. Una entrada no es una verificación factual.

## Adaptadores y modelos

`config/adapters.json` define command, args e input. Las sustituciones disponibles son `{prompt}` y `{response}`. Se usa un proceso sin shell. `input: stdin` envía el prompt por la entrada estándar; OpenCode lo recibe como archivo adjunto.

`--model` se pasa al CLI. El harness no almacena API keys ni inicia sesiones. Para un protocolo de salida diferente, añade el parser en `src/harness.mjs` y prueba eventos de éxito, fallo y consumo ausente. No conviertas un texto de error en una slide aprobada.

La orden de trabajo solicita solo lecturas y la devolución del JSON. No es una sandbox de seguridad del proceso externo: se mantienen las capacidades y restricciones reales de cada CLI. Usa un checkout aislado y los permisos que correspondan cuando las fuentes o el contexto lo requieran.

## Skills y agentes

La skill canónica está en `.agents/skills/lumen-decks/SKILL.md`. `npm run agent:sync` actualiza copias de proyecto para `.claude/skills/`, `.opencode/skills/` y `.pi/skills/`, además de los roles nativos de Claude y OpenCode. No escribe configuración global. Codex, OpenCode y Pi pueden leer `AGENTS.md`; Claude usa `CLAUDE.md` para cargarlo.

El harness no requiere que un proveedor implemente subagentes: ejecuta los roles secuencialmente mediante su interfaz de proceso. Los archivos nativos facilitan el uso manual desde clientes que sí los descubren.
