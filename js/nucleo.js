/**
 * Núcleo del reporte: utilidades, configuración guardada (fuentes y mapeos), carga de fuentes,
 * emparejamiento de campos y unión de las fuentes por su campo Id.
 */

// ---------- Utilidades ----------

/** Minúsculas y sin tildes, para búsquedas. */
function simplificar(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Nombre sin tildes, mayúsculas, espacios ni símbolos: "Fecha y hora" y "fecha_y_hora" quedan iguales. */
function normalizarNombre(texto) {
  return simplificar(texto).replace(/[^a-z0-9]/g, '');
}

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function valorComoTexto(valor) {
  if (valor === null || valor === undefined) return '';
  return typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
}

/** Termina el texto en punto, para poder encadenar otra oración. */
function conPunto(texto) {
  return /[.!?]$/.test(texto) ? texto : `${texto}.`;
}

function conRetardo(fn, ms) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), ms);
  };
}

/** Id legible y único a partir de un nombre: "Leads producción" -> "leads-produccion". */
function crearId(nombre, existentes) {
  const base = simplificar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  let id = base;
  for (let n = 2; existentes.includes(id); n++) id = `${base}-${n}`;
  return id;
}

// ---------- Configuración guardada en el navegador ----------

const CLAVE_CONFIGURACION = 'reporte-leads:configuracion';

const configuracion = leerConfiguracion();

function leerConfiguracion() {
  let guardada = null;
  try {
    guardada = JSON.parse(localStorage.getItem(CLAVE_CONFIGURACION));
  } catch {
    // Sin almacenamiento o dato corrupto: se parte de la configuración del proyecto.
  }
  return {
    fuentes: Array.isArray(guardada?.fuentes) ? guardada.fuentes : structuredClone(FUENTES_PROYECTO),
    mapeos: Array.isArray(guardada?.mapeos) ? guardada.mapeos : [],
    mapeoActivo: guardada?.mapeoActivo || MAPEO_PREDETERMINADO.id,
    // Por mapeo: vista, fuente de detalle, campos ocultos y filtros del reporte
    preferencias: guardada?.preferencias && typeof guardada.preferencias === 'object' ? guardada.preferencias : {},
  };
}

/** Devuelve false si el navegador no permitió guardar (sin almacenamiento o sin espacio). */
function guardarConfiguracion() {
  try {
    localStorage.setItem(CLAVE_CONFIGURACION, JSON.stringify(configuracion));
    return true;
  } catch {
    return false;
  }
}

function buscarFuente(id) {
  return configuracion.fuentes.find(f => f.id === id) ?? null;
}

function nombreFuente(id) {
  return buscarFuente(id)?.nombre ?? id;
}

/** El mapeo por defecto no se guarda: se calcula siempre a partir de js/config.js. */
function todosLosMapeos() {
  return [{ ...MAPEO_PREDETERMINADO, automatico: true }, ...configuracion.mapeos];
}

function buscarMapeo(id) {
  return todosLosMapeos().find(m => m.id === id) ?? null;
}

function mapeoActivo() {
  return buscarMapeo(configuracion.mapeoActivo) ?? todosLosMapeos()[0];
}

/** Ids de las fuentes que usa un mapeo, con la principal primero. */
function fuentesDelMapeo(mapeo) {
  const ids = new Set([mapeo.fuentePrincipal]);
  for (const par of Object.values(mapeo.campos ?? {})) {
    if (par?.fuente) ids.add(par.fuente);
  }
  return [...ids];
}

function mapeosQueUsan(idFuente) {
  return todosLosMapeos().filter(m => fuentesDelMapeo(m).includes(idFuente));
}

function restaurarFuentesProyecto() {
  for (const fuente of structuredClone(FUENTES_PROYECTO)) {
    const indice = configuracion.fuentes.findIndex(f => f.id === fuente.id);
    if (indice >= 0) configuracion.fuentes[indice] = fuente;
    else configuracion.fuentes.push(fuente);
    olvidarFuente(fuente.id);
  }
  return guardarConfiguracion();
}

function exportarConfiguracion() {
  const contenido = {
    version: 1,
    exportado: new Date().toISOString(),
    fuentes: configuracion.fuentes,
    mapeos: configuracion.mapeos,
    preferencias: configuracion.preferencias,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(contenido, null, 2)], { type: 'application/json' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'configuracion-reporte.json';
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Agrega o reemplaza (por id) las fuentes y mapeos de un archivo exportado. */
function importarConfiguracion(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!Array.isArray(datos?.fuentes) || !Array.isArray(datos?.mapeos)) {
    throw new Error('El archivo no tiene el formato esperado (listas "fuentes" y "mapeos").');
  }

  const reemplazar = (lista, elemento) => {
    const indice = lista.findIndex(e => e.id === elemento.id);
    if (indice >= 0) lista[indice] = elemento;
    else lista.push(elemento);
  };
  const fuentes = datos.fuentes.filter(f => f?.id && f?.nombre);
  const mapeos = datos.mapeos.filter(m => m?.id && m?.nombre && m.id !== MAPEO_PREDETERMINADO.id);
  fuentes.forEach(f => { reemplazar(configuracion.fuentes, f); olvidarFuente(f.id); });
  mapeos.forEach(m => reemplazar(configuracion.mapeos, m));
  if (datos.preferencias && typeof datos.preferencias === 'object') {
    Object.assign(configuracion.preferencias, datos.preferencias);
  }

  if (!guardarConfiguracion()) throw new Error('El navegador no permitió guardar la configuración.');
  return { fuentes: fuentes.length, mapeos: mapeos.length };
}

// ---------- Carga de fuentes ----------

const cargasFuentes = new Map();      // id -> promesa de la carga en curso o terminada
const resultadosFuentes = new Map();  // id -> { registros, cabeceras } | { error }

/** Carga una fuente (una sola vez, salvo que se fuerce) y deja el resultado en resultadosFuentes. */
function cargarFuente(fuente, forzar = false) {
  if (forzar || !cargasFuentes.has(fuente.id)) {
    const carga = leerFuente(fuente).then(
      resultado => {
        if (cargasFuentes.get(fuente.id) === carga) resultadosFuentes.set(fuente.id, resultado);
        return resultado;
      },
      error => {
        if (cargasFuentes.get(fuente.id) === carga) {
          cargasFuentes.delete(fuente.id);
          resultadosFuentes.set(fuente.id, { error: error.message });
        }
        throw error;
      }
    );
    cargasFuentes.set(fuente.id, carga);
  }
  return cargasFuentes.get(fuente.id);
}

/** Descarta lo cargado de una fuente (p. ej. porque se editó). */
function olvidarFuente(id) {
  cargasFuentes.delete(id);
  resultadosFuentes.delete(id);
}

/** Obtiene los registros de una fuente sin guardar nada; sirve también para probar una fuente sin guardarla. */
async function leerFuente(fuente) {
  let respuesta;
  if (fuente.tipo === 'json') {
    try {
      respuesta = JSON.parse(fuente.json || '');
    } catch {
      throw new Error('La respuesta JSON pegada no es válida.');
    }
  } else {
    respuesta = await consultarApi(fuente);
  }

  const lista = fuente.rutaDatos
    ? fuente.rutaDatos.split('.').reduce((obj, parte) => obj?.[parte], respuesta)
    : respuesta;
  if (!Array.isArray(lista)) {
    throw new Error('La respuesta no contiene una lista de registros. Revisa la «ruta de la lista».');
  }
  const registros = lista.filter(r => r && typeof r === 'object' && !Array.isArray(r));
  // Cabeceras = todas las claves presentes en la respuesta (unión de todos los registros)
  const cabeceras = new Set(registros.flatMap(r => Object.keys(r)));

  const registrosPorId = new Map();
  for (const registro of registros) {
    const id = valorComoTexto(registro[fuente.campoId || 'id']);
    if (id !== '') registrosPorId.set(id, (registrosPorId.get(id) ?? 0) + 1);
  }
  // Cantidad de Ids que tienen más de un registro
  const repetidos = [...registrosPorId.values()].filter(n => n > 1).length;

  return { registros, cabeceras, repetidos };
}

function leerJsonOpcional(valor, descripcion) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    throw new Error(`${descripcion} no es un JSON válido.`);
  }
}

async function consultarApi(fuente) {
  if (!fuente.url) throw new Error('La fuente no tiene URL.');
  const encabezados = leerJsonOpcional(fuente.encabezados, 'Los encabezados') ?? {};
  const cuerpo = leerJsonOpcional(fuente.cuerpo, 'El cuerpo');

  const opciones = {
    method: fuente.metodo || 'GET',
    headers: { Accept: 'application/json', ...encabezados },
  };
  if (cuerpo !== null) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(fuente.url, opciones);
  } catch {
    throw new Error('No se pudo conectar con la API. Revisa la URL, la red o que el servidor permita solicitudes (CORS) desde esta página.');
  }
  if (!respuesta.ok) {
    throw new Error(`La API respondió ${respuesta.status} ${respuesta.statusText}`.trim());
  }
  try {
    return await respuesta.json();
  } catch {
    throw new Error('La respuesta de la API no es un JSON válido.');
  }
}

// ---------- Emparejamiento campos del reporte <-> claves de las fuentes ----------

/**
 * Empareja automáticamente campos del reporte con claves de las fuentes: primero por EQUIVALENCIAS y
 * luego por nombre. Las fuentes se revisan en el orden recibido; gana la primera que tenga la clave.
 * @param {{ id: string, cabeceras: Set<string> }[]} fuentes
 * @returns {Object<string, { fuente: string, clave: string }>}
 */
function autoemparejar(fuentes, campos = CAMPOS_REPORTE) {
  const equivalencias = new Map(
    Object.entries(EQUIVALENCIAS).map(([campo, clave]) => [normalizarNombre(campo), clave])
  );
  const buscadores = fuentes.map(({ id, cabeceras }) => {
    const cabeceraPorNombre = new Map();
    for (const cabecera of cabeceras) {
      const nombre = normalizarNombre(cabecera);
      if (!cabeceraPorNombre.has(nombre)) cabeceraPorNombre.set(nombre, cabecera);
    }
    return nombre => {
      const clave = cabeceras.has(nombre) ? nombre : cabeceraPorNombre.get(normalizarNombre(nombre));
      return clave ? { fuente: id, clave } : null;
    };
  });
  const buscar = nombre => {
    for (const buscador of buscadores) {
      const par = buscador(nombre);
      if (par) return par;
    }
    return null;
  };

  const pares = {};
  for (const campo of campos) {
    const equivalente = equivalencias.get(normalizarNombre(campo));
    const par = (equivalente && buscar(equivalente)) || buscar(campo);
    if (par) pares[campo] = par;
  }
  return pares;
}

/** Pares campo -> { fuente, clave } de un mapeo. El automático se calcula con su fuente principal ya cargada. */
function paresDelMapeo(mapeo) {
  if (!mapeo.automatico) return mapeo.campos ?? {};
  const principal = resultadosFuentes.get(mapeo.fuentePrincipal);
  return principal?.cabeceras
    ? autoemparejar([{ id: mapeo.fuentePrincipal, cabeceras: principal.cabeceras }])
    : {};
}

/** Columnas del reporte: solo los campos cuya clave viene en la respuesta de su fuente. */
function resolverColumnas(mapeo) {
  const pares = paresDelMapeo(mapeo);
  const columnas = [];
  const sinCoincidencia = [];
  for (const campo of CAMPOS_REPORTE) {
    const par = pares[campo];
    if (par && resultadosFuentes.get(par.fuente)?.cabeceras?.has(par.clave)) columnas.push({ campo, ...par });
    else sinCoincidencia.push(campo);
  }
  return { columnas, sinCoincidencia };
}

// ---------- Varios registros por Id: métricas y vistas ----------

/** Cómo se combinan los registros de una fuente que comparten Id (vista Resumen). */
const METRICAS = {
  primero: 'Primer registro',
  ultimo: 'Último registro',
  conteo: 'Conteo de registros',
  distintos: 'Conteo de valores distintos',
  suma: 'Suma',
  promedio: 'Promedio',
  minimo: 'Mínimo',
  maximo: 'Máximo',
  lista: 'Lista de valores',
};

function esNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor);
  return typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor));
}

/** Compara números como números y el resto como texto ("2026-09-23 10:00" ordena bien). Vacíos al final. */
function compararValores(a, b) {
  const textoA = valorComoTexto(a);
  const textoB = valorComoTexto(b);
  if (textoA === '' || textoB === '') return (textoA === '') - (textoB === '');
  if (esNumero(a) && esNumero(b)) return Number(a) - Number(b);
  return textoA.localeCompare(textoB, 'es', { numeric: true });
}

/** Combina en un solo valor la clave de varios registros (ya ordenados) según la métrica. */
function agregar(registros, clave, metrica = 'primero') {
  if (metrica === 'conteo') return registros.length;

  const valores = registros.map(r => r[clave]);
  const llenos = valores.filter(v => valorComoTexto(v) !== '');
  switch (metrica) {
    case 'ultimo':
      return valores[valores.length - 1];
    case 'distintos':
      return new Set(llenos.map(valorComoTexto)).size;
    case 'suma':
    case 'promedio': {
      const numeros = llenos.filter(esNumero).map(Number);
      if (!numeros.length) return undefined;
      const suma = numeros.reduce((a, b) => a + b, 0);
      return Math.round((metrica === 'suma' ? suma : suma / numeros.length) * 100) / 100;
    }
    case 'minimo':
      return llenos.length ? llenos.reduce((a, b) => (compararValores(b, a) < 0 ? b : a)) : undefined;
    case 'maximo':
      return llenos.length ? llenos.reduce((a, b) => (compararValores(b, a) > 0 ? b : a)) : undefined;
    case 'lista':
      return [...new Set(llenos.map(valorComoTexto))].join(', ');
    default:
      return valores[0];
  }
}

/**
 * Registros de una fuente agrupados por Id, cada grupo ordenado por el «campo de orden» de la fuente.
 * Los registros sin Id no se pueden unir: se descartan, salvo en la fuente principal, donde cada uno es su propio grupo.
 */
function agruparPorId(idFuente, conservarSinId = false) {
  const fuente = buscarFuente(idFuente);
  const campoId = fuente?.campoId || 'id';
  const grupos = new Map();
  resultadosFuentes.get(idFuente).registros.forEach((registro, indice) => {
    let id = valorComoTexto(registro[campoId]);
    if (id === '') {
      if (!conservarSinId) return;
      id = `\u0000sin-id-${indice}`;
    }
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(registro);
  });
  if (fuente?.campoOrden) {
    for (const registros of grupos.values()) {
      registros.sort((a, b) => compararValores(a[fuente.campoOrden], b[fuente.campoOrden]));
    }
  }
  return grupos;
}

/**
 * Filas del reporte, con los Ids de la fuente principal y las demás fuentes unidas por Id:
 * - 'resumen': una fila por Id; si una fuente tiene varios registros con ese Id, cada campo
 *   se calcula con su métrica (primer registro, conteo, suma, ...).
 * - 'detalle': una fila por cada registro de `fuenteDetalle` con ese Id (o una vacía si no tiene).
 *   Los campos de esa fuente se calculan sobre el registro de la fila (su valor; un conteo da 1) y los
 *   de las demás fuentes, como en el resumen.
 * @returns {{ grupo: string, valores: Object<string, *> }[]}
 */
function construirFilas(mapeo, columnas, vista, fuenteDetalle) {
  const principal = mapeo.fuentePrincipal;
  const grupos = new Map([[principal, agruparPorId(principal, true)]]);
  for (const { fuente } of columnas) {
    if (!grupos.has(fuente)) grupos.set(fuente, agruparPorId(fuente));
  }
  const detalle = vista === 'detalle' && grupos.has(fuenteDetalle) ? fuenteDetalle : null;

  const filas = [];
  for (const [id, registrosPrincipal] of grupos.get(principal)) {
    const registrosDe = fuente => (fuente === principal ? registrosPrincipal : grupos.get(fuente).get(id) ?? []);

    const resumen = {};
    for (const { campo, fuente, clave, metrica } of columnas) {
      if (fuente !== detalle) resumen[campo] = agregar(registrosDe(fuente), clave, metrica);
    }
    if (!detalle) {
      filas.push({ grupo: id, valores: resumen });
      continue;
    }

    const registros = registrosDe(detalle);
    for (const registro of registros.length ? registros : [null]) {
      const valores = { ...resumen };
      for (const { campo, fuente, clave, metrica } of columnas) {
        if (fuente === detalle) valores[campo] = agregar(registro ? [registro] : [], clave, metrica);
      }
      filas.push({ grupo: id, valores });
    }
  }
  return filas;
}
