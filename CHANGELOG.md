# Registro de cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado es [semántico](https://semver.org/lang/es/). Antes de 1.0.0 las versiones menores pueden introducir cambios de contrato.

## [0.2.0] — 2026-09-12

Primera versión publicada del harness. La 0.1.0 fue la entrega inicial y no llegó a etiquetarse.

### Añadido

**Iconos.** Referencias `tabler:`, `tabler-filled:` y `brand:` en slides y en cada elemento de una lista, resueltas en tiempo de compilación e insertadas como SVG en línea para que hereden el color del tema. 9643 iconos alcanzables entre Tabler (MIT) y Simple Icons (CC0). `npm run icons -- search <términos>` busca por nombre, etiqueta y categoría; `has` verifica un lote de referencias.

**Plantillas.** `bullets` renderiza una lista real con escalado tipográfico hasta seis elementos. `cover-cyan` y siete divisores de sección (`section-orange`, `-olive`, `-teal`, `-violet`, `-raspberry`, `-crimson`, `-blue`) pintan su propio campo de color, independiente del tema activo.

**Temas y tipografías.** Temas `prisma` y `prisma-claro`. Tipografías Poppins, Montserrat, Open Sans y Raleway, embebidas localmente.

**Transiciones.** `fade`, `crossfade`, `slide`, `morph`, `fade-dark` y `none`, por diapositiva o con un valor por defecto del deck. `morph` se apoya en auto-animate y es por pares. `prefers-reduced-motion` fuerza `none` sobre cualquier valor declarado.

**Escena 3D `pipeline`.** Una cadena ordenada con etiquetas legibles, navegación por pasos, lectura sin GPU y captura fija para el PDF.

**Barra de presentación.** Botones solo con icono y nombre accesible, colapsable con `T`, y un diálogo de créditos bilingüe inhabilitado en pantalla completa.

**Marcas según el tema.** `logoOnLight` en las marcas e `imageOnLight` en las imágenes de contenido: el build calcula la luminancia de cada tema y sirve la variante legible.

**Herramientas.** `npm run wcag` mide contraste por lotes, elige la tinta de un campo, encuentra el color más cercano que cumple un objetivo conservando tono y croma en OKLCh, y audita todos los temas y plantillas. `npm run check` verifica cada dependencia y entrega el comando exacto que falta.

**Contexto para los agentes.** Las etapas de storyboard y compose reciben las plantillas, temas y tipografías que existen en disco, más el comando para buscar iconos.

### Corregido

- El selector de tema cambiaba el atributo pero nunca repintaba. `:root` en `src/style.css` empataba en especificidad con cada bloque `[data-theme]` y ganaba por orden de concatenación; los valores por defecto coincidían con el tema `ink`, lo que ocultó el fallo.
- Ninguna transición llegaba a animarse. Reveal marca las diapositivas no visibles con `[hidden]` pero las mantiene renderizadas; una regla global `[hidden]{display:none!important}` las sacaba del árbol de render y todo cambio era un corte seco, con el CSS declarando una duración que nunca se aplicaba.
- `section-orange` declaraba un color de eyebrow que nunca se aplicaba: `.reveal p.eyebrow` le ganaba por especificidad. Solo pasaba desapercibido porque ambos colores son casi negros.
- La versión estaba escrita a mano en tres archivos. Ahora sale de `package.json`.

### Eliminado

- `source.bundle`, que contenía un único commit cuyo árbol ya estaba en el historial del repositorio y que ningún script leía.
