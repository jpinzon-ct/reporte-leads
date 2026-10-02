# Reporte de Leads

Reporte web sencillo (HTML, CSS, JavaScript y Bootstrap 5) que consume una o varias fuentes de datos REST,
empareja sus claves con los campos del reporte y muestra solo los campos que coinciden.

No necesita instalación ni servidor: basta con abrir `index.html` en el navegador.

## Usarlo en otros dispositivos

- **Versión publicada**: el sitio se puede publicar en Vercel (u otro hosting estático) sin configuración ni
  paso de compilación; basta con abrir su URL en cualquier dispositivo.
- **Descargar el proyecto completo**: en GitHub, *Code → Download ZIP*. Se descomprime y se abre `index.html`.
  (Si en `js/config.js` se indica `URL_REPOSITORIO`, el sitio también ofrece *Configuración → Descargar proyecto (.zip)*).

Las fuentes, mapeos y filtros de cada navegador no viajan con el proyecto: para llevarlos a otro dispositivo,
usa *Configuración → Exportar configuración* y luego *Importar configuración* en el otro dispositivo.

## Funcionalidades

- **Fuentes de datos**: consumos API REST (URL, método, encabezados, cuerpo) o respuestas JSON pegadas.
  Cada fuente define su *campo Id* (para unirse con las demás) y, opcionalmente, un *campo de orden*.
- **Mapeos**: cada campo del reporte se asigna a *fuente + clave*. Hay un mapeo por defecto (solo lectura)
  que se calcula con las equivalencias de `js/config.js`; se pueden crear, duplicar y guardar otros.
- **Campos base configurables**: cada mapeo define sus propios campos del reporte (columnas). En la ventana
  de mapeos se pueden agregar, renombrar, ordenar y quitar, o con *Campos base* tomarlos directamente de las
  claves que llegan de la fuente principal o de todas las fuentes (quedan ya mapeados), agregar solo las
  claves que faltan o volver a los campos predeterminados de `js/config.js`.
- **Varios registros por Id**:
  - *Resumen*: una fila por Id; cada campo se calcula con su métrica (primer/último registro, conteo,
    valores distintos, suma, promedio, mínimo, máximo o lista de valores).
  - *Detalle*: una fila por cada registro de la fuente que tiene varios registros por Id (se elige sola).
- **Campos y filtros**: mostrar u ocultar campos y filtrar por cualquier campo visible; las condiciones se
  adaptan al tipo de dato (texto, número o fecha).
- **Exportar / importar** la configuración (fuentes, mapeos y preferencias) como JSON.
- **Exportar reporte** (*Configuración → Exportar reporte…*): descarga un .zip con un proyecto independiente
  que muestra el reporte en uso sin opciones de configuración. Las URL y credenciales de las fuentes API van
  en su archivo `.env` y las consulta su propio servidor (`npm start`, o Vercel con variables de entorno),
  así nunca llegan al navegador. Las plantillas de ese proyecto están en `plantilla/`. Exportar requiere
  abrir el configurador desde un servidor web (por ejemplo, Vercel), no como archivo local.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `index.html` | Página, ventanas de fuentes y mapeos, panel de campos y filtros |
| `js/config.js` | Fuentes iniciales, campos del reporte, equivalencias y mapeo por defecto |
| `js/datos-ejemplo.js` | Respuesta de ejemplo (datos ficticios) de la fuente «Leads» |
| `js/nucleo.js` | Configuración guardada, carga de fuentes, emparejamiento, métricas y unión por Id |
| `js/fuentes.js` / `js/mapeos.js` | Ventanas de fuentes de datos y de mapeos |
| `js/filtros.js` | Filtros dinámicos |
| `js/app.js` | Tabla del reporte, vistas y panel de campos (también va en los reportes exportados) |
| `js/editor.js` | Selector de mapeos e importar/exportar configuración (solo configurador) |
| `js/exportar.js` | Exportar reporte independiente (.zip) |
| `plantilla/` | Servidor, función de API, README y archivos ignorados del proyecto exportado |
| `css/styles.css` | Estilos |

## Notas

- Las fuentes, los mapeos y las preferencias se guardan en el navegador (`localStorage`); para respaldarlos
  o compartirlos usa *Configuración → Exportar configuración*.
- Los encabezados de las fuentes (p. ej. tokens) también se guardan en el navegador y se incluyen al exportar.
- Para consumir una API desde el navegador, esta debe permitir CORS. Si requiere credenciales que no deben
  quedar expuestas, conviene un pequeño servidor intermedio (proxy).
