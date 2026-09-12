# Validación de la entrega 0.1.0

Pruebas ejecutadas para esta entrega. Estas comprobaciones corresponden a la demo y al contrato del harness; no prometen que cualquier contenido generado por un modelo tendrá buena calidad.

| Comprobación | Resultado y alcance |
| --- | --- |
| Pruebas unitarias | 9 pruebas aprobadas. |
| Compilación repetida | Mismo hash SHA-256 del HTML con las mismas entradas en el mismo entorno. |
| Contratos de evidencia | Rechazo de citas inexistentes, slides factuales sin fuente y fuentes nuevas en composición headless. |
| Contenido y recursos | Rechazo de series inconsistentes, directivas de Mermaid y rutas fuera de la carpeta permitida. Escape de contenido HTML y JSON. |
| Navegador real | Chromium 153.0.8010.0 en Linux. |
| Uso offline | Cero solicitudes HTTP(S) de carga de recursos durante la apertura. Se activó modo offline para las interacciones. |
| Interacciones | Navegación, temas, tipografías, pasos de diagrama, tabla de datos, notas, índice y controles 3D. |
| Móvil | Vista de 390×844 con emulación táctil en Chromium. No equivale a un dispositivo físico Android/iOS. |
| 3D | WebGL2 operativo en el navegador de pruebas con renderizado software. |
| Geometría | Sin desbordamientos detectados en los elementos comprobados, tanto en pantalla como en impresión. |
| PDF | 10 páginas de 960×540 puntos, correspondientes a 1280×720 px. Revisión visual de todas las páginas. |
| PDF y empaquetado | Número de páginas validado por el exportador. El ZIP rechaza un PDF desactualizado. |
| Flujo completo | Investigación, guion, composición, revisión, HTML, verificación, PDF y ZIP completados con un proveedor simulado. |
| Reanudación | Reutilización de una etapa sin cambios y nueva ejecución al cambiar un recurso. |
| Adaptadores | Los cuatro parsers y subprocess adapters probados con procesos simulados. |
| Skill | Frontmatter y estructura validados. Copias locales de proyecto generadas. |
| Creación y extensión | Comandos new, validate, build y clonación de un template comprobados. |

Los CLI autenticados de Codex, Claude Code, OpenCode y Pi no estaban disponibles en este entorno. No se ejecutaron llamadas a modelos reales ni se comprobaron sus herramientas web o permisos de cuenta. La documentación oficial fundamenta los adaptadores, y `doctor` permite revisar su disponibilidad local.

Windows, macOS, Firefox, Safari y dispositivos físicos siguen pendientes de validación directa. La matriz CI de Windows/macOS/Linux está incluida, pero no se ha publicado ni ejecutado en una cuenta GitHub. La arquitectura usa Node y APIs web multiplataforma; la compatibilidad diseñada es más amplia que la compatibilidad medida aquí.

La descarga estándar del navegador de Playwright falló en este entorno. La prueba y el PDF se generaron con un Chromium local equivalente indicado mediante `LUMEN_CHROMIUM_PATH`. Esa alternativa temporal no es una dependencia del proyecto entregado.

## Comandos para reproducir

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
npm run verify
npm run pdf
npm run test:harness
```

Los scripts del navegador guardan capturas y reportes en `.qa/`. La verificación escribe `verification.json` junto al deck. Los screenshots ayudan a inspeccionar el resultado; los tests geométricos no sustituyen leer el contenido ni revisar la narrativa.
