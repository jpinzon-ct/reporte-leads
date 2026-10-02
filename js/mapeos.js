/**
 * Ventana «Mapeos»: crear, editar, guardar y elegir mapeos (campo del reporte -> fuente + clave).
 * Cada mapeo define sus campos base (las columnas del reporte): se pueden agregar, renombrar, ordenar,
 * quitar o tomar directamente de las claves que llegan de las fuentes de datos.
 * El mapeo por defecto es de solo lectura; para modificarlo se duplica.
 */

const uiMapeos = {
  modal: document.getElementById('modal-mapeos'),
  lista: document.getElementById('lista-mapeos'),
  nombre: document.getElementById('mapeo-nombre'),
  principal: document.getElementById('mapeo-principal'),
  aviso: document.getElementById('mapeo-aviso'),
  filtro: document.getElementById('mapeo-filtro'),
  contador: document.getElementById('mapeo-contador'),
  filas: document.getElementById('mapeo-filas'),
  datalists: document.getElementById('mapeo-datalists'),
  mensaje: document.getElementById('mapeo-mensaje'),
  btnNuevo: document.getElementById('btn-nuevo-mapeo'),
  btnAutoemparejar: document.getElementById('btn-autoemparejar'),
  btnLimpiar: document.getElementById('btn-limpiar-mapeo'),
  btnCamposBase: document.getElementById('btn-campos-base'),
  menuCamposBase: document.getElementById('menu-campos-base'),
  btnAgregarCampo: document.getElementById('btn-agregar-campo'),
  btnEliminar: document.getElementById('btn-eliminar-mapeo'),
  btnDuplicar: document.getElementById('btn-duplicar-mapeo'),
  btnGuardar: document.getElementById('btn-guardar-mapeo'),
  btnUsar: document.getElementById('btn-usar-mapeo'),
};

// Copia del mapeo que se está editando: { id, nombre, fuentePrincipal, automatico, filas }.
// filas = [{ campo, fuente, clave, metrica }] en el orden del reporte (un campo sin mapear tiene fuente '').
let borrador = null;
let mapeoSucio = false;    // hay cambios sin guardar

function mensajeMapeo(texto, tipo = 'success') {
  uiMapeos.mensaje.className = `small text-${tipo}`;
  uiMapeos.mensaje.textContent = texto;
}

function confirmarDescarte() {
  return !mapeoSucio || confirm('Hay cambios sin guardar en el mapeo. ¿Descartarlos?');
}

function marcarSucio() {
  mapeoSucio = true;
  uiMapeos.mensaje.textContent = '';
}

/** Carga las claves de todas las fuentes para sugerirlas y validar cada par. */
function cargarClavesDeFuentes() {
  const cargas = configuracion.fuentes.map(fuente => cargarFuente(fuente).catch(() => {}));
  return Promise.all(cargas).then(refrescarTrasCarga);
}

function filaVacia(campo) {
  return { campo, fuente: '', clave: '' };
}

/** Filas del editor a partir de un mapeo guardado (o del automático, ya calculado). */
function filasDelMapeo(mapeo) {
  const pares = paresDelMapeo(mapeo);
  return camposDelMapeo(mapeo).map(campo => ({ ...filaVacia(campo), ...structuredClone(pares[campo] ?? {}) }));
}

/** Pares campo -> { fuente, clave } del borrador (solo los campos con fuente). */
function paresDelBorrador() {
  const pares = {};
  for (const fila of borrador.filas) {
    if (fila.fuente) pares[fila.campo.trim()] = { fuente: fila.fuente, clave: fila.clave };
  }
  return pares;
}

/** Nombres de campo vacíos o repetidos: impiden guardar. */
function camposInvalidos() {
  const veces = new Map();
  for (const fila of borrador.filas) {
    const nombre = fila.campo.trim();
    veces.set(nombre, (veces.get(nombre) ?? 0) + 1);
  }
  return new Set([...veces].filter(([nombre, n]) => !nombre || n > 1).map(([nombre]) => nombre));
}

function refrescarTrasCarga() {
  if (!borrador) return;
  renderizarDatalists();
  if (borrador.automatico) {
    borrador.filas = filasDelMapeo(buscarMapeo(borrador.id));
    renderizarFilas();
  } else {
    uiMapeos.filas.querySelectorAll('tr[data-indice]').forEach(actualizarFila);
  }
  renderizarAvisoMapeo();
  actualizarContadorMapeo();
}

// ---------- Renderizado ----------

function renderizarListaMapeos() {
  const items = todosLosMapeos().map(m => ({ id: m.id, nombre: m.nombre, automatico: m.automatico }));
  if (borrador && !borrador.id) items.push({ id: null, nombre: borrador.nombre || 'Nuevo mapeo', nuevo: true });

  uiMapeos.lista.innerHTML = items.map(m => {
    const activo = borrador && m.id === borrador.id;
    const enUso = m.id === configuracion.mapeoActivo;
    return `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-2${activo ? ' active' : ''}" data-id="${escaparHtml(m.id ?? '')}">
        <span class="text-break">${m.automatico ? '<i class="bi bi-lock me-1"></i>' : ''}${escaparHtml(m.nombre)}${m.nuevo ? ' <em class="small">(sin guardar)</em>' : ''}</span>
        ${enUso ? '<span class="badge text-bg-success">en uso</span>' : ''}
      </button>`;
  }).join('');
}

function idDatalist(idFuente) {
  return `claves-${configuracion.fuentes.findIndex(f => f.id === idFuente)}`;
}

function renderizarDatalists() {
  uiMapeos.datalists.innerHTML = configuracion.fuentes.map((fuente, indice) => {
    const cabeceras = resultadosFuentes.get(fuente.id)?.cabeceras ?? [];
    return `<datalist id="claves-${indice}">${[...cabeceras].map(c => `<option value="${escaparHtml(c)}">`).join('')}</datalist>`;
  }).join('');
}

function opcionesFuentes(seleccionada, conVacio) {
  let html = conVacio ? '<option value="">— sin mapear —</option>' : '';
  if (seleccionada && !buscarFuente(seleccionada)) {
    html += `<option value="${escaparHtml(seleccionada)}" selected>(fuente eliminada) ${escaparHtml(seleccionada)}</option>`;
  }
  html += configuracion.fuentes
    .map(f => `<option value="${escaparHtml(f.id)}"${f.id === seleccionada ? ' selected' : ''}>${escaparHtml(f.nombre)}</option>`)
    .join('');
  return html;
}

function estadoPar(par) {
  if (!par?.fuente) return '<span class="text-body-tertiary" title="Sin mapear">—</span>';
  if (!buscarFuente(par.fuente)) return '<i class="bi bi-x-circle text-danger" title="La fuente ya no existe"></i>';
  const resultado = resultadosFuentes.get(par.fuente);
  if (!resultado) return '<span class="spinner-border spinner-border-sm text-body-tertiary" title="Cargando la fuente…"></span>';
  if (resultado.error) return `<i class="bi bi-exclamation-triangle text-warning" title="${escaparHtml(`No se pudo cargar la fuente: ${resultado.error}`)}"></i>`;
  if (!par.clave) return '<i class="bi bi-dash-circle text-warning" title="Falta la clave"></i>';
  if (!resultado.cabeceras.has(par.clave)) {
    return '<i class="bi bi-exclamation-triangle text-warning" title="La clave no viene en la respuesta de la fuente"></i>';
  }
  return resultado.conDatos?.has(par.clave) === false
    ? '<i class="bi bi-circle text-body-tertiary" title="La clave viene en la respuesta, pero vacía en todos los registros"></i>'
    : '<i class="bi bi-check-circle-fill text-success" title="La clave viene en la respuesta con datos"></i>';
}

function opcionesMetricas(seleccionada = 'primero') {
  return Object.entries(METRICAS)
    .map(([valor, nombre]) => `<option value="${valor}"${valor === seleccionada ? ' selected' : ''}>${nombre}</option>`)
    .join('');
}

function filaMapeo(par, indice) {
  const { campo } = par;
  const soloLectura = borrador.automatico ? ' disabled' : '';
  const sinFuente = soloLectura || (par.fuente ? '' : ' disabled');
  const celdaCampo = borrador.automatico
    ? escaparHtml(campo)
    : `<input class="form-control form-control-sm" data-rol="campo" aria-label="Nombre del campo ${indice + 1}" value="${escaparHtml(campo)}" placeholder="Nombre del campo">`;
  const acciones = borrador.automatico ? '' : `
        <div class="btn-group btn-group-sm" role="group" aria-label="Acciones del campo ${indice + 1}">
          <button type="button" class="btn btn-outline-secondary" data-accion="subir" title="Subir"${indice === 0 ? ' disabled' : ''}><i class="bi bi-arrow-up"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-accion="bajar" title="Bajar"${indice === borrador.filas.length - 1 ? ' disabled' : ''}><i class="bi bi-arrow-down"></i></button>
          <button type="button" class="btn btn-outline-danger" data-accion="quitar" title="Quitar el campo del reporte"><i class="bi bi-x-lg"></i></button>
        </div>`;
  return `
    <tr data-indice="${indice}">
      <td class="campo-mapeo">${celdaCampo}</td>
      <td><select class="form-select form-select-sm" data-rol="fuente" aria-label="Fuente de ${escaparHtml(campo)}"${soloLectura}>${opcionesFuentes(par.fuente, true)}</select></td>
      <td><input class="form-control form-control-sm font-monospace" data-rol="clave" aria-label="Clave de ${escaparHtml(campo)}" value="${escaparHtml(par.clave)}" list="${idDatalist(par.fuente)}"${sinFuente}></td>
      <td><select class="form-select form-select-sm" data-rol="metrica" aria-label="Métrica de ${escaparHtml(campo)}"${sinFuente}>${opcionesMetricas(par.metrica)}</select></td>
      <td class="text-center" data-rol="estado">${estadoPar(par)}</td>
      <td class="text-end text-nowrap acciones-mapeo">${acciones}</td>
    </tr>`;
}

function renderizarFilas() {
  uiMapeos.filas.innerHTML = borrador.filas.length
    ? borrador.filas.map(filaMapeo).join('')
    : '<tr><td colspan="6" class="text-center text-body-secondary small py-3">El mapeo no tiene campos. Usa <strong>Campos base</strong> para tomarlos de la fuente de datos o agrégalos a mano.</td></tr>';
  marcarCamposInvalidos();
  aplicarFiltroMapeo();
}

function marcarCamposInvalidos() {
  const invalidos = camposInvalidos();
  uiMapeos.filas.querySelectorAll('[data-rol="campo"]').forEach(input => {
    const nombre = input.value.trim();
    const invalido = invalidos.has(nombre);
    input.classList.toggle('is-invalid', invalido);
    input.title = invalido ? (nombre ? 'Hay otro campo con el mismo nombre' : 'Escribe un nombre') : '';
  });
}

/** Actualiza una fila a partir del borrador sin volver a dibujarla (no pierde el foco). */
function actualizarFila(fila) {
  const par = borrador.filas[fila.dataset.indice];
  const input = fila.querySelector('[data-rol="clave"]');
  if (document.activeElement !== input) input.value = par.clave ?? '';
  input.disabled = borrador.automatico || !par.fuente;
  input.setAttribute('list', idDatalist(par.fuente));
  const metrica = fila.querySelector('[data-rol="metrica"]');
  metrica.value = par.metrica ?? 'primero';
  metrica.disabled = input.disabled;
  fila.querySelector('[data-rol="estado"]').innerHTML = estadoPar(par);
}

function renderizarAvisoMapeo() {
  const partes = [];
  const ids = fuentesDelMapeo({ fuentePrincipal: borrador.fuentePrincipal, campos: paresDelBorrador() }).filter(Boolean);

  if (borrador.automatico) {
    partes.push(`<div class="alert alert-info small py-2 mb-2"><i class="bi bi-lock me-1"></i>Este es el mapeo por defecto: usa los campos y las equivalencias de <code>js/config.js</code> sobre la fuente «${escaparHtml(nombreFuente(borrador.fuentePrincipal))}» y no se puede modificar. Para cambiarlo (también sus campos base), usa <strong>Duplicar</strong> o crea un <strong>Nuevo mapeo</strong>.</div>`);
  }
  const pendientes = ids.filter(id => buscarFuente(id) && !resultadosFuentes.has(id));
  if (pendientes.length) {
    partes.push(`<div class="small text-body-secondary mb-2"><span class="spinner-border spinner-border-sm me-1"></span>Cargando claves de ${pendientes.map(id => `«${escaparHtml(nombreFuente(id))}»`).join(', ')}…</div>`);
  }
  const problemas = [
    ...ids.filter(id => !buscarFuente(id)).map(id => `La fuente «${escaparHtml(id)}» ya no existe.`),
    ...ids.filter(id => resultadosFuentes.get(id)?.error)
      .map(id => `No se pudo cargar «${escaparHtml(nombreFuente(id))}»: ${escaparHtml(conPunto(resultadosFuentes.get(id).error))} Puedes escribir las claves a mano.`),
  ];
  if (problemas.length) {
    partes.push(`<div class="alert alert-warning small py-2 mb-2">${problemas.join('<br>')}</div>`);
  }
  // Unión por Id: cuántos Ids de la principal encuentran registros en cada fuente secundaria
  const principal = borrador.fuentePrincipal;
  if (resultadosFuentes.get(principal)?.registros) {
    const uniones = ids
      .filter(id => id !== principal && resultadosFuentes.get(id)?.registros)
      .map(id => ({ id, ...coincidenciasPorId(principal, id) }));
    const sinCoincidencias = uniones.filter(u => !u.coinciden);
    if (sinCoincidencias.length) {
      partes.push(`<div class="alert alert-warning small py-2 mb-2">${sinCoincidencias.map(u =>
        `<i class="bi bi-exclamation-triangle me-1"></i>Ningún Id de «${escaparHtml(nombreFuente(principal))}» (campo <code>${escaparHtml(buscarFuente(principal)?.campoId || 'id')}</code>) aparece en «${escaparHtml(nombreFuente(u.id))}» (campo <code>${escaparHtml(buscarFuente(u.id)?.campoId || 'id')}</code>): sus campos quedarán vacíos. Revisa el campo Id de la fuente en Fuentes de datos.`).join('<br>')}</div>`);
    }
    const conCoincidencias = uniones.filter(u => u.coinciden);
    if (conCoincidencias.length) {
      partes.push(`<div class="small text-body-secondary mb-2"><i class="bi bi-link-45deg me-1"></i>Unión por Id: ${conCoincidencias.map(u =>
        `«${escaparHtml(nombreFuente(u.id))}» tiene datos para ${u.coinciden} de ${u.total} Ids de «${escaparHtml(nombreFuente(principal))}»`).join('; ')}.</div>`);
    }
  }

  const conRepetidos = ids.filter(id => resultadosFuentes.get(id)?.repetidos);
  if (conRepetidos.length) {
    const nombres = conRepetidos.map(id => `«${escaparHtml(nombreFuente(id))}»`).join(', ');
    partes.push(`<div class="alert alert-light border small py-2 mb-2"><i class="bi bi-info-circle me-1"></i>${nombres} ${conRepetidos.length === 1 ? 'tiene' : 'tienen'} varios registros para un mismo Id. En la columna <strong>Si hay varios registros</strong> elige cómo combinarlos en la vista Resumen (en la vista Detalle se ve un registro por fila).</div>`);
  }
  uiMapeos.aviso.innerHTML = partes.join('');
}

function actualizarContadorMapeo() {
  const pares = borrador.filas.filter(par => par.fuente && par.clave);
  const disponibles = pares.filter(par => resultadosFuentes.get(par.fuente)?.cabeceras?.has(par.clave));
  const conDatos = disponibles.filter(par => resultadosFuentes.get(par.fuente).conDatos?.has(par.clave) !== false);
  uiMapeos.contador.textContent = `${pares.length} de ${borrador.filas.length} mapeados · ${disponibles.length} con la clave en la respuesta · ${conDatos.length} con datos`;
}

function aplicarFiltroMapeo() {
  const filtro = simplificar(uiMapeos.filtro.value.trim());
  uiMapeos.filas.querySelectorAll('tr[data-indice]').forEach(fila => {
    const { campo, clave } = borrador.filas[fila.dataset.indice];
    fila.hidden = filtro !== '' && !simplificar(`${campo} ${clave}`).includes(filtro);
  });
}

function renderizarEditor() {
  const soloLectura = Boolean(borrador.automatico);
  uiMapeos.nombre.value = borrador.nombre;
  uiMapeos.nombre.disabled = soloLectura;
  uiMapeos.principal.innerHTML = opcionesFuentes(borrador.fuentePrincipal, false);
  uiMapeos.principal.value = borrador.fuentePrincipal;
  uiMapeos.principal.disabled = soloLectura;
  uiMapeos.btnAutoemparejar.disabled = soloLectura;
  uiMapeos.btnLimpiar.disabled = soloLectura;
  uiMapeos.btnCamposBase.disabled = soloLectura;
  uiMapeos.btnAgregarCampo.hidden = soloLectura;
  uiMapeos.btnEliminar.disabled = soloLectura;
  uiMapeos.btnGuardar.hidden = soloLectura;
  uiMapeos.btnUsar.textContent = soloLectura ? 'Usar en el reporte' : 'Guardar y usar en el reporte';

  renderizarListaMapeos();
  renderizarDatalists();
  renderizarFilas();
  renderizarAvisoMapeo();
  actualizarContadorMapeo();
}

// ---------- Acciones ----------

function editarMapeo(id) {
  const mapeo = buscarMapeo(id);
  if (!mapeo) return;
  borrador = {
    id: mapeo.id,
    nombre: mapeo.nombre,
    fuentePrincipal: mapeo.fuentePrincipal,
    automatico: mapeo.automatico,
    filas: filasDelMapeo(mapeo),
  };
  mapeoSucio = false;
  uiMapeos.mensaje.textContent = '';
  renderizarEditor();
}

function nuevoMapeo() {
  if (!confirmarDescarte()) return;
  borrador = {
    id: null,
    nombre: 'Nuevo mapeo',
    fuentePrincipal: configuracion.fuentes[0]?.id ?? '',
    filas: CAMPOS_REPORTE.map(filaVacia),
  };
  mapeoSucio = true;
  renderizarEditor();
  mensajeMapeo('Elige la fuente principal y usa «Autoemparejar», o «Campos base» para tomar los campos de la fuente.', 'body-secondary');
  uiMapeos.nombre.select();
}

async function duplicarMapeo() {
  if (borrador.automatico) {
    const principal = buscarFuente(borrador.fuentePrincipal);
    if (principal) await cargarFuente(principal).catch(() => {});
    borrador.filas = filasDelMapeo(buscarMapeo(borrador.id));
  }
  borrador = {
    id: null,
    nombre: `${uiMapeos.nombre.value.trim() || borrador.nombre} (copia)`,
    fuentePrincipal: borrador.fuentePrincipal,
    filas: structuredClone(borrador.filas),
  };
  mapeoSucio = true;
  renderizarEditor();
  mensajeMapeo('Copia creada. Revísala y pulsa «Guardar».', 'body-secondary');
}

/** Guarda el borrador. Devuelve false si no se pudo. */
function guardarMapeo() {
  if (borrador.automatico) return true;

  const nombre = uiMapeos.nombre.value.trim();
  if (!nombre) {
    mensajeMapeo('Escribe un nombre para el mapeo.', 'danger');
    return false;
  }
  if (!buscarFuente(borrador.fuentePrincipal)) {
    mensajeMapeo('Elige una fuente principal que exista.', 'danger');
    return false;
  }
  if (camposInvalidos().size) {
    uiMapeos.filtro.value = '';
    renderizarFilas();
    mensajeMapeo('Hay campos sin nombre o con el nombre repetido.', 'danger');
    return false;
  }

  const camposReporte = [];
  const campos = {};
  for (const par of borrador.filas) {
    const campo = par.campo.trim();
    camposReporte.push(campo);
    if (!par.fuente || !par.clave) continue;
    campos[campo] = { fuente: par.fuente, clave: par.clave };
    if (par.metrica && par.metrica !== 'primero') campos[campo].metrica = par.metrica;
  }
  const mapeo = { id: borrador.id, nombre, fuentePrincipal: borrador.fuentePrincipal, camposReporte, campos };
  if (mapeo.id) {
    configuracion.mapeos[configuracion.mapeos.findIndex(m => m.id === mapeo.id)] = mapeo;
  } else {
    mapeo.id = crearId(nombre, todosLosMapeos().map(m => m.id));
    configuracion.mapeos.push(mapeo);
  }
  if (!guardarConfiguracion()) {
    mensajeMapeo('El navegador no permitió guardar el mapeo.', 'danger');
    return false;
  }

  borrador = { id: mapeo.id, nombre, fuentePrincipal: mapeo.fuentePrincipal, filas: filasDelMapeo(mapeo) };
  mapeoSucio = false;
  renderizarEditor();
  mensajeMapeo('Mapeo guardado.');
  return true;
}

function usarMapeo() {
  if (!guardarMapeo()) return;
  configuracion.mapeoActivo = borrador.id;
  guardarConfiguracion();
  bootstrap.Modal.getOrCreateInstance(uiMapeos.modal).hide();
  alCambiarConfiguracion();
}

function eliminarMapeo() {
  if (borrador.automatico) return;
  if (!borrador.id) {
    mapeoSucio = false;
    return editarMapeo(configuracion.mapeoActivo);
  }
  if (!confirm(`¿Eliminar el mapeo «${borrador.nombre}»?`)) return;

  configuracion.mapeos = configuracion.mapeos.filter(m => m.id !== borrador.id);
  delete configuracion.preferencias[borrador.id];
  if (configuracion.mapeoActivo === borrador.id) configuracion.mapeoActivo = MAPEO_PREDETERMINADO.id;
  guardarConfiguracion();
  mapeoSucio = false;
  editarMapeo(mapeoActivo().id);
  alCambiarConfiguracion();
}

/** Re-dibuja la tabla, el aviso y el contador tras cambiar las filas del borrador. */
function refrescarFilas() {
  renderizarFilas();
  renderizarAvisoMapeo();
  actualizarContadorMapeo();
}

async function autoemparejarBorrador() {
  uiMapeos.btnAutoemparejar.disabled = true;
  await cargarClavesDeFuentes();
  uiMapeos.btnAutoemparejar.disabled = false;

  // La fuente principal tiene prioridad; luego el resto en el orden en que están configuradas.
  // Entre fuentes que tienen la misma clave, gana la que trae datos (ver autoemparejar).
  const orden = [borrador.fuentePrincipal, ...configuracion.fuentes.map(f => f.id).filter(id => id !== borrador.fuentePrincipal)];
  const fuentes = orden
    .map(id => ({ id, ...resultadosFuentes.get(id) }))
    .filter(f => f.cabeceras);
  const tieneDatos = par => resultadosFuentes.get(par?.fuente)?.conDatos?.has(par.clave) ?? false;

  const sugeridos = autoemparejar(fuentes, borrador.filas.map(fila => fila.campo.trim()));
  let emparejados = 0;
  let reasignados = 0;
  for (const actual of borrador.filas) {
    const par = sugeridos[actual.campo.trim()];
    if (!par) continue;
    if (!actual.fuente || !actual.clave) {
      Object.assign(actual, par);
      emparejados++;
    } else if (!tieneDatos(actual) && tieneDatos(par) && (actual.fuente !== par.fuente || actual.clave !== par.clave)) {
      // Estaba asignado a una clave sin datos y otra fuente sí trae datos para ese campo
      Object.assign(actual, par);
      reasignados++;
    }
  }
  if (emparejados || reasignados) marcarSucio();
  refrescarFilas();

  const partes = [];
  if (emparejados) partes.push(`se emparejaron ${emparejados} campos`);
  if (reasignados) partes.push(`${reasignados} pasaron a una fuente que sí trae datos`);
  mensajeMapeo(
    partes.length ? `${partes.join(' y ')}.`.replace(/^./, letra => letra.toUpperCase()) : 'No se encontraron más coincidencias.',
    partes.length ? 'success' : 'body-secondary'
  );
}

function limpiarMapeo() {
  if (!confirm('¿Quitar la fuente y la clave de todos los campos? Los campos base se conservan.')) return;
  borrador.filas = borrador.filas.map(fila => filaVacia(fila.campo));
  marcarSucio();
  refrescarFilas();
}

// ---------- Campos base ----------

function agregarCampo() {
  borrador.filas.push(filaVacia(''));
  uiMapeos.filtro.value = '';
  marcarSucio();
  refrescarFilas();
  const inputs = uiMapeos.filas.querySelectorAll('[data-rol="campo"]');
  inputs[inputs.length - 1]?.focus();
}

/**
 * Campos base tomados de las claves que llegan de las fuentes: cada campo se llama como su clave y queda
 * mapeado a ella. Una clave que viene en varias fuentes se toma de la primera (la principal, luego el resto)
 * donde trae datos.
 * modo: 'principal' o 'todas' reemplazan los campos; 'faltantes' agrega solo las claves que aún no son campos.
 */
async function tomarCamposDeFuentes(modo) {
  uiMapeos.btnCamposBase.disabled = true;
  await cargarClavesDeFuentes();
  uiMapeos.btnCamposBase.disabled = false;

  const principal = borrador.fuentePrincipal;
  const ids = modo === 'principal'
    ? [principal]
    : [principal, ...configuracion.fuentes.map(f => f.id).filter(id => id !== principal)];
  const cargadas = ids.filter(id => resultadosFuentes.get(id)?.cabeceras);
  const origen = modo === 'principal' ? `«${nombreFuente(principal)}»` : 'las fuentes';
  if (!cargadas.length) {
    mensajeMapeo(`No se pudieron leer las claves de ${origen}.`, 'danger');
    return;
  }

  const porClave = new Map();
  for (const id of cargadas) {
    const { cabeceras, conDatos } = resultadosFuentes.get(id);
    for (const clave of cabeceras) {
      const actual = porClave.get(clave);
      const trae = conDatos?.has(clave) ?? true;
      if (!actual || (!actual.trae && trae)) porClave.set(clave, { fuente: id, clave, trae });
    }
  }
  // Conserva la métrica elegida si la misma clave de la misma fuente ya estaba mapeada
  const metricas = new Map(borrador.filas.filter(f => f.metrica).map(f => [`${f.fuente}\n${f.clave}`, f.metrica]));
  const nuevas = [...porClave.values()].map(({ fuente, clave }) => {
    const fila = { campo: clave, fuente, clave };
    const metrica = metricas.get(`${fuente}\n${clave}`);
    if (metrica) fila.metrica = metrica;
    return fila;
  });

  if (modo === 'faltantes') {
    const nombres = new Set(borrador.filas.map(f => normalizarNombre(f.campo)));
    const mapeadas = new Set(borrador.filas.filter(f => f.fuente).map(f => `${f.fuente}\n${f.clave}`));
    const faltantes = nuevas.filter(f => !nombres.has(normalizarNombre(f.campo)) && !mapeadas.has(`${f.fuente}\n${f.clave}`));
    if (!faltantes.length) {
      mensajeMapeo('Todas las claves de las fuentes ya están en el reporte.', 'body-secondary');
      return;
    }
    borrador.filas.push(...faltantes);
    marcarSucio();
    mensajeMapeo(`Se agregaron ${faltantes.length} campos tomados de las fuentes.`);
  } else {
    if (borrador.filas.length && !confirm(`Se reemplazarán los ${borrador.filas.length} campos del mapeo por las ${nuevas.length} claves de ${origen}. ¿Continuar?`)) return;
    borrador.filas = nuevas;
    marcarSucio();
    mensajeMapeo(`Los campos del reporte son ahora las ${nuevas.length} claves de ${origen}.`);
  }
  uiMapeos.filtro.value = '';
  refrescarFilas();
}

/** Vuelve a los campos de js/config.js; conserva el mapeo de los que se llaman igual. */
function restaurarCamposPredeterminados() {
  if (!confirm('¿Volver a los campos predeterminados del reporte? Se quitarán los campos que no estén entre ellos.')) return;
  const actuales = new Map(borrador.filas.map(fila => [fila.campo.trim(), fila]));
  borrador.filas = CAMPOS_REPORTE.map(campo => ({ ...(actuales.get(campo) ?? filaVacia(campo)), campo }));
  marcarSucio();
  uiMapeos.filtro.value = '';
  refrescarFilas();
  mensajeMapeo('Se restauraron los campos predeterminados. Usa «Autoemparejar» para mapear los que quedaron vacíos.', 'body-secondary');
}

function moverCampo(indice, desplazamiento) {
  const destino = indice + desplazamiento;
  if (destino < 0 || destino >= borrador.filas.length) return;
  [borrador.filas[indice], borrador.filas[destino]] = [borrador.filas[destino], borrador.filas[indice]];
  marcarSucio();
  renderizarFilas();
  const boton = uiMapeos.filas.querySelector(`tr[data-indice="${destino}"] [data-accion="${desplazamiento < 0 ? 'subir' : 'bajar'}"]`);
  (boton && !boton.disabled ? boton : uiMapeos.filas.querySelector(`tr[data-indice="${destino}"] [data-rol="campo"]`))?.focus();
}

function quitarCampo(indice) {
  borrador.filas.splice(indice, 1);
  marcarSucio();
  refrescarFilas();
}

// ---------- Eventos ----------

uiMapeos.modal.addEventListener('show.bs.modal', () => {
  mapeoSucio = false;
  uiMapeos.filtro.value = '';
  editarMapeo(mapeoActivo().id);
  cargarClavesDeFuentes();
});

uiMapeos.modal.addEventListener('hide.bs.modal', evento => {
  if (!confirmarDescarte()) evento.preventDefault();
  else mapeoSucio = false;
});

uiMapeos.lista.addEventListener('click', evento => {
  const boton = evento.target.closest('[data-id]');
  if (!boton || !boton.dataset.id || boton.dataset.id === borrador.id) return;
  if (confirmarDescarte()) editarMapeo(boton.dataset.id);
});

uiMapeos.nombre.addEventListener('input', () => {
  borrador.nombre = uiMapeos.nombre.value;
  marcarSucio();
});

uiMapeos.principal.addEventListener('change', () => {
  borrador.fuentePrincipal = uiMapeos.principal.value;
  marcarSucio();
  renderizarAvisoMapeo();
});

uiMapeos.filas.addEventListener('change', evento => {
  const fila = evento.target.closest('tr');
  const par = borrador.filas[fila.dataset.indice];

  if (evento.target.dataset.rol === 'metrica') {
    par.metrica = evento.target.value;
    marcarSucio();
    return;
  }
  if (evento.target.dataset.rol !== 'fuente') return;
  const fuente = evento.target.value;

  if (!fuente) {
    Object.assign(par, filaVacia(par.campo));
    delete par.metrica;
  } else {
    // Conserva la clave si existe en la nueva fuente; si no, intenta sugerir una.
    const campo = par.campo.trim();
    let clave = par.clave ?? '';
    const resultado = resultadosFuentes.get(fuente);
    if (resultado?.cabeceras && !resultado.cabeceras.has(clave)) {
      clave = autoemparejar([{ id: fuente, ...resultado }], [campo])[campo]?.clave ?? '';
    }
    Object.assign(par, { fuente, clave });
  }
  marcarSucio();
  actualizarFila(fila);
  actualizarContadorMapeo();
  renderizarAvisoMapeo();
});

uiMapeos.filas.addEventListener('input', evento => {
  const fila = evento.target.closest('tr');
  const par = borrador.filas[fila.dataset.indice];
  if (evento.target.dataset.rol === 'campo') {
    par.campo = evento.target.value;
    marcarSucio();
    marcarCamposInvalidos();
    return;
  }
  if (evento.target.dataset.rol !== 'clave' || !par.fuente) return;
  par.clave = evento.target.value.trim();
  marcarSucio();
  actualizarFila(fila);
  actualizarContadorMapeo();
});

uiMapeos.filas.addEventListener('click', evento => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;
  const indice = Number(boton.closest('tr').dataset.indice);
  if (boton.dataset.accion === 'subir') moverCampo(indice, -1);
  else if (boton.dataset.accion === 'bajar') moverCampo(indice, 1);
  else if (boton.dataset.accion === 'quitar') quitarCampo(indice);
});

uiMapeos.menuCamposBase.addEventListener('click', evento => {
  const accion = evento.target.closest('[data-accion]')?.dataset.accion;
  if (accion === 'agregar') agregarCampo();
  else if (accion === 'predeterminados') restaurarCamposPredeterminados();
  else if (accion) tomarCamposDeFuentes(accion);
});

uiMapeos.filtro.addEventListener('input', aplicarFiltroMapeo);
uiMapeos.btnNuevo.addEventListener('click', nuevoMapeo);
uiMapeos.btnDuplicar.addEventListener('click', duplicarMapeo);
uiMapeos.btnGuardar.addEventListener('click', () => { if (guardarMapeo()) alCambiarConfiguracion(); });
uiMapeos.btnUsar.addEventListener('click', usarMapeo);
uiMapeos.btnEliminar.addEventListener('click', eliminarMapeo);
uiMapeos.btnAutoemparejar.addEventListener('click', autoemparejarBorrador);
uiMapeos.btnAgregarCampo.addEventListener('click', agregarCampo);
uiMapeos.btnLimpiar.addEventListener('click', limpiarMapeo);
