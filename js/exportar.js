/**
 * Exportar reporte: descarga un .zip con un proyecto independiente que muestra el reporte en uso
 * (mapeo, fuentes, vista, campos y filtros) sin las opciones de configuración.
 *
 * Las fuentes API no llevan URL ni credenciales en la página: el proyecto exportado las consulta con
 * su propio servidor (plantilla/servidor.js y plantilla/api/fuente.js), que lee el archivo .env.
 */

const uiExportar = {
  modal: document.getElementById('modal-exportar'),
  nombre: document.getElementById('exportar-nombre'),
  resumen: document.getElementById('exportar-resumen'),
  credenciales: document.getElementById('exportar-credenciales'),
  mensaje: document.getElementById('exportar-mensaje'),
  btnDescargar: document.getElementById('btn-descargar-reporte'),
};

// Archivos de este proyecto que el reporte exportado usa tal cual
const ARCHIVOS_DEL_REPORTE = ['css/styles.css', 'js/nucleo.js', 'js/filtros.js', 'js/app.js'];
// Archivo del proyecto exportado -> plantilla de la que sale
const PLANTILLAS = {
  'servidor.js': 'plantilla/servidor.js',
  'api/fuente.js': 'plantilla/api/fuente.js',
  '.gitignore': 'plantilla/gitignore',
  '.vercelignore': 'plantilla/vercelignore',
};

function mensajeExportar(texto, tipo) {
  uiExportar.mensaje.className = `small mt-3 text-${tipo}`;
  uiExportar.mensaje.textContent = texto;
}

/** Prefijo de las variables de entorno de una fuente: 'gestiones' -> 'FUENTE_GESTIONES_'. */
function prefijoVariables(idFuente) {
  return `FUENTE_${idFuente.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_`;
}

/** Lo que se exporta del reporte en uso: su mapeo con los campos fijos y las fuentes que usa. */
function reporteAExportar() {
  const mapeo = estado.mapeo;
  const pares = paresDelMapeo(mapeo);
  const campos = CAMPOS_REPORTE.filter(campo => pares[campo] && buscarFuente(pares[campo].fuente));
  const ids = [...new Set([mapeo.fuentePrincipal, ...campos.map(campo => pares[campo].fuente)])];
  return { mapeo, pares, campos, fuentes: ids.map(buscarFuente).filter(Boolean) };
}

// ---------- Ventana ----------

function prepararExportacion() {
  uiExportar.mensaje.textContent = '';
  if (!estado.mapeo || estado.error || !estado.columnas.length) {
    uiExportar.resumen.innerHTML = '';
    uiExportar.btnDescargar.disabled = true;
    mensajeExportar('El reporte en uso no tiene datos para exportar: revisa sus fuentes y su mapeo.', 'danger');
    return;
  }
  uiExportar.btnDescargar.disabled = false;

  const { mapeo, campos, fuentes } = reporteAExportar();
  uiExportar.nombre.value = mapeo.automatico ? 'Reporte de Leads' : mapeo.nombre;
  const hayJson = fuentes.some(f => f.tipo === 'json');
  uiExportar.resumen.innerHTML = `
    <p class="mb-2">Mapeo <strong>«${escaparHtml(mapeo.nombre)}»</strong> · ${campos.length} campos · vista ${estado.vista === 'detalle' ? 'Detalle' : 'Resumen'}</p>
    <ul class="list-unstyled mb-0 d-flex flex-column gap-1">
      ${fuentes.map(f => f.tipo === 'json'
        ? `<li><i class="bi bi-filetype-json me-1"></i><strong>${escaparHtml(f.nombre)}</strong> · respuesta JSON pegada: sus datos van dentro del reporte.</li>`
        : `<li><i class="bi bi-shield-lock me-1"></i><strong>${escaparHtml(f.nombre)}</strong> · API: su URL y encabezados van al <code>.env</code> (<code>${escaparHtml(prefijoVariables(f.id))}*</code>).</li>`).join('')}
    </ul>
    ${hayJson ? '<p class="text-warning-emphasis mt-2 mb-0"><i class="bi bi-exclamation-triangle me-1"></i>Los datos de las fuentes JSON pegadas quedan en la página: los podrá ver cualquiera que abra el reporte.</p>' : ''}`;
}

// ---------- Archivos del proyecto exportado ----------

function jsonEnUnaLinea(valor, descripcion) {
  const dato = leerJsonOpcional(valor, descripcion);
  return dato === null ? '' : JSON.stringify(dato);
}

/** index.html sin las partes del configurador (marcadas con data-editor). */
function paginaDelReporte(html, nombre) {
  const documento = new DOMParser().parseFromString(html, 'text/html');
  documento.querySelectorAll('[data-editor]').forEach(elemento => elemento.remove());
  documento.title = nombre;
  documento.querySelector('h1').textContent = nombre;
  return `<!doctype html>\n${documento.documentElement.outerHTML}\n`;
}

function configuracionDelReporte(nombre, id, fecha, { mapeo, pares, campos, fuentes }) {
  const json = valor => JSON.stringify(valor, null, 2);
  const fuentesReporte = fuentes.map(f => ({
    id: f.id,
    nombre: f.nombre,
    // Las fuentes API se piden al servidor del proyecto; las JSON pegadas llevan sus datos
    tipo: f.tipo === 'json' ? 'json' : 'servidor',
    ...(f.tipo === 'json' ? { json: f.json } : {}),
    rutaDatos: f.rutaDatos || '',
    campoId: f.campoId || 'id',
    campoOrden: f.campoOrden || '',
  }));
  const mapeoReporte = {
    id: 'reporte',
    nombre,
    fuentePrincipal: mapeo.fuentePrincipal,
    campos: Object.fromEntries(campos.map(campo => [campo, pares[campo]])),
  };
  const preferencias = {
    vista: estado.vista,
    ocultos: [...estado.ocultos].filter(campo => campos.includes(campo)),
    filtros: estado.filtros.filter(filtro => campos.includes(filtro.campo)),
  };

  return `/**
 * Configuración del reporte «${nombre.replace(/\*\//g, '* /')}», exportado el ${fecha} desde el configurador de reportes.
 * Las fuentes API se consultan a través del servidor del proyecto (api/fuente.js) con las
 * credenciales del archivo .env: aquí no hay URLs ni credenciales.
 */

// Reporte sin opciones para editar fuentes ni mapeos
const SOLO_REPORTE = true;

// Clave con la que el navegador guarda la vista, los campos ocultos y los filtros de este reporte
const CLAVE_ALMACENAMIENTO = ${json(`reporte:${id}`)};

const FUENTES_PROYECTO = ${json(fuentesReporte)};

const MAPEO_PREDETERMINADO = ${json(mapeoReporte)};

// Campos del reporte, en el orden en que se muestran
const CAMPOS_REPORTE = ${json(campos)};

// Vista, campos ocultos y filtros con los que se abre el reporte la primera vez
const PREFERENCIAS_INICIALES = ${json(preferencias)};

// No se usan en un reporte exportado (el mapeo ya trae sus campos)
const EQUIVALENCIAS = {};
const URL_REPOSITORIO = '';
`;
}

/** .env con las credenciales de las fuentes API (o solo los nombres, si no se incluyen valores). */
function variablesDeEntorno(nombre, fuentesApi, conValores) {
  const lineas = [
    `# Credenciales de las fuentes del reporte «${nombre}».`,
    '# No compartas ni subas este archivo (está en .gitignore y .vercelignore).',
    '',
  ];
  if (!fuentesApi.length) lineas.push('# Este reporte no tiene fuentes API: no necesita variables.', '');
  for (const fuente of fuentesApi) {
    const prefijo = prefijoVariables(fuente.id);
    const valor = texto => (conValores ? texto : '');
    lineas.push(
      `# Fuente «${fuente.nombre}»`,
      `${prefijo}URL=${valor(fuente.url || '')}`,
      `${prefijo}METODO=${fuente.metodo || 'GET'}`,
      `${prefijo}ENCABEZADOS=${valor(jsonEnUnaLinea(fuente.encabezados, `Los encabezados de «${fuente.nombre}»`))}`,
      `${prefijo}CUERPO=${valor(jsonEnUnaLinea(fuente.cuerpo, `El cuerpo de «${fuente.nombre}»`))}`,
      ''
    );
  }
  return lineas.join('\n');
}

function leameDelReporte(plantilla, nombre, fecha, { mapeo, fuentes }) {
  const fuentesApi = fuentes.filter(f => f.tipo !== 'json');
  const listaFuentes = fuentes.map(f => {
    const papel = f.id === mapeo.fuentePrincipal ? ' (principal)' : `, unida por \`${f.campoId || 'id'}\``;
    return f.tipo === 'json'
      ? `- **${f.nombre}**${papel}: respuesta JSON incluida en el reporte (\`js/config.js\`).`
      : `- **${f.nombre}**${papel}: API REST, consultada por el servidor con las variables \`${prefijoVariables(f.id)}*\`.`;
  }).join('\n');
  const variables = fuentesApi.length
    ? fuentesApi.map(f => ['URL', 'METODO', 'ENCABEZADOS', 'CUERPO'].map(v => `- \`${prefijoVariables(f.id)}${v}\``).join('\n')).join('\n')
    : 'Este reporte no usa fuentes API, así que no necesita variables.';
  return plantilla
    .split('{{NOMBRE}}').join(nombre)
    .split('{{FECHA}}').join(fecha)
    .split('{{FUENTES}}').join(listaFuentes)
    .split('{{VARIABLES}}').join(variables);
}

async function leerArchivoDelProyecto(ruta) {
  const respuesta = await fetch(ruta, { cache: 'no-store' });
  if (!respuesta.ok) throw new Error(`No se pudo leer ${ruta} (${respuesta.status}).`);
  return respuesta.text();
}

async function exportarReporte() {
  if (location.protocol === 'file:') {
    throw new Error('Para exportar, abre el configurador desde un servidor web (por ejemplo, el sitio en Vercel): abierto como archivo, el navegador no permite leer los archivos del proyecto.');
  }
  const nombre = uiExportar.nombre.value.trim();
  if (!nombre) throw new Error('Escribe un nombre para el reporte.');

  const reporte = reporteAExportar();
  const id = crearId(nombre, []);
  const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const fuentesApi = reporte.fuentes.filter(f => f.tipo !== 'json');

  const [html, leame, ...copias] = await Promise.all(
    ['index.html', 'plantilla/README.md', ...ARCHIVOS_DEL_REPORTE].map(leerArchivoDelProyecto)
  );
  const plantillas = await Promise.all(Object.values(PLANTILLAS).map(leerArchivoDelProyecto));

  const archivos = {
    'index.html': paginaDelReporte(html, nombre),
    'js/config.js': configuracionDelReporte(nombre, id, fecha, reporte),
    ...Object.fromEntries(ARCHIVOS_DEL_REPORTE.map((ruta, i) => [ruta, copias[i]])),
    ...Object.fromEntries(Object.keys(PLANTILLAS).map((ruta, i) => [ruta, plantillas[i]])),
    '.env': variablesDeEntorno(nombre, fuentesApi, uiExportar.credenciales.checked),
    '.env.example': variablesDeEntorno(nombre, fuentesApi, false),
    'package.json': `${JSON.stringify({
      name: id,
      version: '1.0.0',
      private: true,
      description: `Reporte «${nombre}»`,
      scripts: { start: 'node servidor.js' },
      engines: { node: '>=18' },
    }, null, 2)}\n`,
    'README.md': leameDelReporte(leame, nombre, fecha, reporte),
  };

  const zip = crearZip(Object.entries(archivos).map(([ruta, contenido]) => ({ ruta: `${id}/${ruta}`, contenido })));
  const url = URL.createObjectURL(zip);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${id}.zip`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `${id}.zip`;
}

// ---------- ZIP (sin compresión, suficiente para archivos de texto pequeños) ----------

const TABLA_CRC32 = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = TABLA_CRC32[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** @param {{ ruta: string, contenido: string }[]} archivos */
function crearZip(archivos) {
  const codificador = new TextEncoder();
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const UTF8 = 0x0800;  // los nombres de archivo van en UTF-8

  const partes = [];
  const directorio = [];
  let desplazamiento = 0;
  for (const { ruta, contenido } of archivos) {
    const nombre = codificador.encode(ruta);
    const datos = codificador.encode(contenido);
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8, true);
    local.setUint16(8, 0, true);  // sin compresión
    local.setUint16(10, hora, true);
    local.setUint16(12, fecha, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(local, nombre, datos);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, UTF8, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, fecha, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, datos.length, true);
    central.setUint32(24, datos.length, true);
    central.setUint16(28, nombre.length, true);
    central.setUint32(42, desplazamiento, true);
    directorio.push(central, nombre);

    desplazamiento += 30 + nombre.length + datos.length;
  }

  const tamanoDirectorio = directorio.reduce((total, parte) => total + parte.byteLength, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamanoDirectorio, true);
  fin.setUint32(16, desplazamiento, true);
  return new Blob([...partes, ...directorio, fin], { type: 'application/zip' });
}

// ---------- Eventos ----------

uiExportar.modal.addEventListener('show.bs.modal', prepararExportacion);

uiExportar.btnDescargar.addEventListener('click', async () => {
  uiExportar.btnDescargar.disabled = true;
  mensajeExportar('Generando el reporte…', 'body-secondary');
  try {
    const archivo = await exportarReporte();
    mensajeExportar(`Listo: se descargó ${archivo}. Descomprímelo y sigue las instrucciones de su README.md.`, 'success');
  } catch (error) {
    mensajeExportar(error.message, 'danger');
  } finally {
    uiExportar.btnDescargar.disabled = false;
  }
});
