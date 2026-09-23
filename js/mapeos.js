/**
 * Ventana «Mapeos»: crear, editar, guardar y elegir mapeos (campo del reporte -> fuente + clave).
 * El mapeo por defecto es de solo lectura; para modificarlo se duplica.
 */

const uiMapeos = {
  modal: document.getElementById('modal-mapeos'),
  lista: document.getElementById('lista-mapeos'),
  nombre: document.getElementById('mapeo-nombre'),
  principal: document.getElementById('mapeo-principal'),
  detalle: document.getElementById('mapeo-detalle'),
  aviso: document.getElementById('mapeo-aviso'),
  filtro: document.getElementById('mapeo-filtro'),
  contador: document.getElementById('mapeo-contador'),
  filas: document.getElementById('mapeo-filas'),
  datalists: document.getElementById('mapeo-datalists'),
  mensaje: document.getElementById('mapeo-mensaje'),
  btnNuevo: document.getElementById('btn-nuevo-mapeo'),
  btnAutoemparejar: document.getElementById('btn-autoemparejar'),
  btnLimpiar: document.getElementById('btn-limpiar-mapeo'),
  btnEliminar: document.getElementById('btn-eliminar-mapeo'),
  btnDuplicar: document.getElementById('btn-duplicar-mapeo'),
  btnGuardar: document.getElementById('btn-guardar-mapeo'),
  btnUsar: document.getElementById('btn-usar-mapeo'),
};

let borrador = null;       // copia del mapeo que se está editando: { id, nombre, fuentePrincipal, campos, automatico }
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

function refrescarTrasCarga() {
  if (!borrador) return;
  renderizarDatalists();
  if (borrador.automatico) {
    borrador.campos = paresDelMapeo(buscarMapeo(borrador.id));
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

function filaMapeo(campo, indice) {
  const par = borrador.campos[campo] ?? { fuente: '', clave: '' };
  const soloLectura = borrador.automatico ? ' disabled' : '';
  const sinFuente = soloLectura || (par.fuente ? '' : ' disabled');
  return `
    <tr data-indice="${indice}">
      <td class="campo-mapeo">${escaparHtml(campo)}</td>
      <td><select class="form-select form-select-sm" data-rol="fuente" aria-label="Fuente de ${escaparHtml(campo)}"${soloLectura}>${opcionesFuentes(par.fuente, true)}</select></td>
      <td><input class="form-control form-control-sm font-monospace" data-rol="clave" aria-label="Clave de ${escaparHtml(campo)}" value="${escaparHtml(par.clave)}" list="${idDatalist(par.fuente)}"${sinFuente}></td>
      <td><select class="form-select form-select-sm" data-rol="metrica" aria-label="Métrica de ${escaparHtml(campo)}"${sinFuente}>${opcionesMetricas(par.metrica)}</select></td>
      <td class="text-center" data-rol="estado">${estadoPar(par)}</td>
    </tr>`;
}

function renderizarFilas() {
  uiMapeos.filas.innerHTML = CAMPOS_REPORTE.map(filaMapeo).join('');
  aplicarFiltroMapeo();
}

/** Actualiza una fila a partir del borrador sin volver a dibujarla (no pierde el foco). */
function actualizarFila(fila) {
  const par = borrador.campos[CAMPOS_REPORTE[fila.dataset.indice]];
  const input = fila.querySelector('[data-rol="clave"]');
  if (document.activeElement !== input) input.value = par?.clave ?? '';
  input.disabled = borrador.automatico || !par?.fuente;
  input.setAttribute('list', idDatalist(par?.fuente));
  const metrica = fila.querySelector('[data-rol="metrica"]');
  metrica.value = par?.metrica ?? 'primero';
  metrica.disabled = input.disabled;
  fila.querySelector('[data-rol="estado"]').innerHTML = estadoPar(par);
}

function renderizarAvisoMapeo() {
  const partes = [];
  const ids = fuentesDelMapeo(borrador).filter(Boolean);

  if (borrador.automatico) {
    partes.push(`<div class="alert alert-info small py-2 mb-2"><i class="bi bi-lock me-1"></i>Este es el mapeo por defecto: se calcula con las equivalencias de <code>js/config.js</code> sobre la fuente «${escaparHtml(nombreFuente(borrador.fuentePrincipal))}» y no se puede modificar. Para cambiarlo, usa <strong>Duplicar</strong>.</div>`);
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
    partes.push(`<div class="alert alert-light border small py-2 mb-2"><i class="bi bi-info-circle me-1"></i>${nombres} ${conRepetidos.length === 1 ? 'tiene' : 'tienen'} varios registros para un mismo Id. En la columna <strong>Si hay varios registros</strong> elige cómo combinarlos en la vista Resumen; en <strong>Filas de la vista Detalle</strong>, de qué fuente sale una fila por registro.</div>`);
  }
  uiMapeos.aviso.innerHTML = partes.join('');
}

function actualizarContadorMapeo() {
  const pares = Object.values(borrador.campos).filter(par => par?.fuente && par.clave);
  const disponibles = pares.filter(par => resultadosFuentes.get(par.fuente)?.cabeceras?.has(par.clave));
  const conDatos = disponibles.filter(par => resultadosFuentes.get(par.fuente).conDatos?.has(par.clave) !== false);
  uiMapeos.contador.textContent = `${pares.length} de ${CAMPOS_REPORTE.length} mapeados · ${disponibles.length} con la clave en la respuesta · ${conDatos.length} con datos`;
}

function renderizarOpcionesDetalle() {
  const ids = fuentesDelMapeo(borrador).filter(Boolean);
  let opciones = '<option value="">Automática (la que tenga varios registros por Id)</option>';
  if (borrador.fuenteDetalle && !ids.includes(borrador.fuenteDetalle)) ids.push(borrador.fuenteDetalle);
  opciones += ids
    .map(id => `<option value="${escaparHtml(id)}"${id === borrador.fuenteDetalle ? ' selected' : ''}>${escaparHtml(nombreFuente(id))}</option>`)
    .join('');
  uiMapeos.detalle.innerHTML = opciones;
  uiMapeos.detalle.value = borrador.fuenteDetalle ?? '';
}

function aplicarFiltroMapeo() {
  const filtro = simplificar(uiMapeos.filtro.value.trim());
  uiMapeos.filas.querySelectorAll('tr[data-indice]').forEach(fila => {
    const campo = CAMPOS_REPORTE[fila.dataset.indice];
    const clave = borrador.campos[campo]?.clave ?? '';
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
  renderizarOpcionesDetalle();
  uiMapeos.detalle.disabled = soloLectura;
  uiMapeos.btnAutoemparejar.disabled = soloLectura;
  uiMapeos.btnLimpiar.disabled = soloLectura;
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
  borrador = structuredClone({ ...mapeo, campos: mapeo.automatico ? paresDelMapeo(mapeo) : (mapeo.campos ?? {}) });
  mapeoSucio = false;
  uiMapeos.mensaje.textContent = '';
  renderizarEditor();
}

function nuevoMapeo() {
  if (!confirmarDescarte()) return;
  borrador = { id: null, nombre: 'Nuevo mapeo', fuentePrincipal: configuracion.fuentes[0]?.id ?? '', fuenteDetalle: '', campos: {} };
  mapeoSucio = true;
  renderizarEditor();
  mensajeMapeo('Elige la fuente principal y usa «Autoemparejar» o asigna los campos a mano.', 'body-secondary');
  uiMapeos.nombre.select();
}

async function duplicarMapeo() {
  if (borrador.automatico) {
    const principal = buscarFuente(borrador.fuentePrincipal);
    if (principal) await cargarFuente(principal).catch(() => {});
    borrador.campos = paresDelMapeo(buscarMapeo(borrador.id));
  }
  borrador = {
    id: null,
    nombre: `${uiMapeos.nombre.value.trim() || borrador.nombre} (copia)`,
    fuentePrincipal: borrador.fuentePrincipal,
    fuenteDetalle: borrador.fuenteDetalle ?? '',
    campos: structuredClone(borrador.campos),
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

  const campos = {};
  for (const campo of CAMPOS_REPORTE) {
    const par = borrador.campos[campo];
    if (!par?.fuente || !par.clave) continue;
    campos[campo] = { fuente: par.fuente, clave: par.clave };
    if (par.metrica && par.metrica !== 'primero') campos[campo].metrica = par.metrica;
  }
  const mapeo = { id: borrador.id, nombre, fuentePrincipal: borrador.fuentePrincipal, campos };
  if (borrador.fuenteDetalle) mapeo.fuenteDetalle = borrador.fuenteDetalle;
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

  borrador = structuredClone(mapeo);
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

  let emparejados = 0;
  let reasignados = 0;
  for (const [campo, par] of Object.entries(autoemparejar(fuentes))) {
    const actual = borrador.campos[campo];
    if (!actual?.fuente || !actual.clave) {
      borrador.campos[campo] = par;
      emparejados++;
    } else if (!tieneDatos(actual) && tieneDatos(par) && (actual.fuente !== par.fuente || actual.clave !== par.clave)) {
      // Estaba asignado a una clave sin datos y otra fuente sí trae datos para ese campo
      borrador.campos[campo] = { ...actual, ...par };
      reasignados++;
    }
  }
  if (emparejados || reasignados) marcarSucio();
  renderizarOpcionesDetalle();
  renderizarFilas();
  renderizarAvisoMapeo();
  actualizarContadorMapeo();

  const partes = [];
  if (emparejados) partes.push(`se emparejaron ${emparejados} campos`);
  if (reasignados) partes.push(`${reasignados} pasaron a una fuente que sí trae datos`);
  mensajeMapeo(
    partes.length ? `${partes.join(' y ')}.`.replace(/^./, letra => letra.toUpperCase()) : 'No se encontraron más coincidencias.',
    partes.length ? 'success' : 'body-secondary'
  );
}

function limpiarMapeo() {
  if (!confirm('¿Quitar la fuente y la clave de todos los campos?')) return;
  borrador.campos = {};
  marcarSucio();
  renderizarFilas();
  actualizarContadorMapeo();
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
  renderizarOpcionesDetalle();
  renderizarAvisoMapeo();
});

uiMapeos.detalle.addEventListener('change', () => {
  borrador.fuenteDetalle = uiMapeos.detalle.value;
  marcarSucio();
});

uiMapeos.filas.addEventListener('change', evento => {
  const fila = evento.target.closest('tr');
  const campo = CAMPOS_REPORTE[fila.dataset.indice];

  if (evento.target.dataset.rol === 'metrica') {
    const par = borrador.campos[campo];
    if (par) par.metrica = evento.target.value;
    marcarSucio();
    return;
  }
  if (evento.target.dataset.rol !== 'fuente') return;
  const fuente = evento.target.value;

  if (!fuente) {
    delete borrador.campos[campo];
  } else {
    // Conserva la clave si existe en la nueva fuente; si no, intenta sugerir una.
    let clave = borrador.campos[campo]?.clave ?? '';
    const resultado = resultadosFuentes.get(fuente);
    if (resultado?.cabeceras && !resultado.cabeceras.has(clave)) {
      clave = autoemparejar([{ id: fuente, ...resultado }], [campo])[campo]?.clave ?? '';
    }
    borrador.campos[campo] = { ...borrador.campos[campo], fuente, clave };
  }
  renderizarOpcionesDetalle();
  marcarSucio();
  actualizarFila(fila);
  actualizarContadorMapeo();
  renderizarAvisoMapeo();
});

uiMapeos.filas.addEventListener('input', evento => {
  if (evento.target.dataset.rol !== 'clave') return;
  const fila = evento.target.closest('tr');
  const par = borrador.campos[CAMPOS_REPORTE[fila.dataset.indice]];
  if (!par) return;
  par.clave = evento.target.value.trim();
  marcarSucio();
  actualizarFila(fila);
  actualizarContadorMapeo();
});

uiMapeos.filtro.addEventListener('input', aplicarFiltroMapeo);
uiMapeos.btnNuevo.addEventListener('click', nuevoMapeo);
uiMapeos.btnDuplicar.addEventListener('click', duplicarMapeo);
uiMapeos.btnGuardar.addEventListener('click', () => { if (guardarMapeo()) alCambiarConfiguracion(); });
uiMapeos.btnUsar.addEventListener('click', usarMapeo);
uiMapeos.btnEliminar.addEventListener('click', eliminarMapeo);
uiMapeos.btnAutoemparejar.addEventListener('click', autoemparejarBorrador);
uiMapeos.btnLimpiar.addEventListener('click', limpiarMapeo);
