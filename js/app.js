/**
 * Reporte de Leads: carga las fuentes del mapeo en uso, las une por Id y muestra en la tabla solo los
 * campos del reporte que coinciden con alguna clave de las respuestas.
 * Vista Resumen: una fila por Id. Vista Detalle: una fila por registro de la fuente elegida.
 */

const estado = {
  mapeo: null,
  columnas: [],         // campos con coincidencia: { campo, fuente, clave, metrica }
  sinCoincidencia: [],  // campos sin clave en las respuestas
  filas: [],            // [{ grupo: Id, valores: { [campo]: valor } }]
  // Preferencias del mapeo en uso (se guardan en configuracion.preferencias)
  vista: 'resumen',
  fuenteDetalle: null,
  ocultos: new Set(),
  filtros: [],
  busqueda: '',
  filtroCampos: '',
  error: null,
  avisos: [],
};

let cargaActual = 0;

const el = {
  estadoFuente: document.getElementById('estado-fuente'),
  selectorMapeo: document.getElementById('selector-mapeo'),
  buscar: document.getElementById('buscar'),
  btnActualizar: document.getElementById('btn-actualizar'),
  btnCampos: document.getElementById('btn-campos'),
  btnFiltros: document.getElementById('btn-filtros'),
  contadorCampos: document.getElementById('contador-campos'),
  btnExportar: document.getElementById('btn-exportar'),
  btnImportar: document.getElementById('btn-importar'),
  archivoImportar: document.getElementById('archivo-importar'),
  notificaciones: document.getElementById('notificaciones'),
  avisos: document.getElementById('avisos'),
  vistaResumen: document.getElementById('vista-resumen'),
  vistaDetalle: document.getElementById('vista-detalle'),
  grupoFuenteDetalle: document.getElementById('grupo-fuente-detalle'),
  fuenteDetalle: document.getElementById('fuente-detalle'),
  infoRepetidos: document.getElementById('info-repetidos'),
  resumenRegistros: document.getElementById('resumen-registros'),
  resumenCoincidencias: document.getElementById('resumen-coincidencias'),
  tabla: document.getElementById('tabla-contenedor'),
  panel: document.getElementById('panel-campos'),
  panelResumen: document.getElementById('panel-resumen'),
  filtroCampos: document.getElementById('filtro-campos'),
  btnMostrarTodos: document.getElementById('btn-mostrar-todos'),
  btnOcultarTodos: document.getElementById('btn-ocultar-todos'),
  listaCampos: document.getElementById('lista-campos'),
  sinCoincidencia: document.getElementById('sin-coincidencia'),
};

function notificar(texto, tipo = 'success') {
  el.notificaciones.insertAdjacentHTML('beforeend', `
    <div class="alert alert-${tipo} alert-dismissible fade show small py-2" role="alert">
      ${escaparHtml(texto)}
      <button type="button" class="btn-close py-2" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    </div>`);
}

// ---------- Preferencias del reporte (por mapeo) ----------

function leerPreferencias(idMapeo) {
  const guardadas = configuracion.preferencias[idMapeo] ?? {};
  return {
    vista: guardadas.vista === 'detalle' ? 'detalle' : 'resumen',
    fuenteDetalle: guardadas.fuenteDetalle ?? null,
    ocultos: new Set(Array.isArray(guardadas.ocultos) ? guardadas.ocultos : []),
    filtros: Array.isArray(guardadas.filtros) ? structuredClone(guardadas.filtros) : [],
  };
}

function guardarPreferencias() {
  if (!estado.mapeo) return;
  configuracion.preferencias[estado.mapeo.id] = {
    vista: estado.vista,
    fuenteDetalle: estado.fuenteDetalle,
    ocultos: [...estado.ocultos],
    filtros: estado.filtros,
  };
  guardarConfiguracion();
}

// ---------- Columnas y filas ----------

function columnasVisibles() {
  return estado.columnas.filter(c => !estado.ocultos.has(c.campo));
}

function cambiarVisibilidad(columnas, visible) {
  for (const { campo } of columnas) {
    if (visible) estado.ocultos.delete(campo);
    else estado.ocultos.add(campo);
  }
  guardarPreferencias();
  actualizarContador();
  renderizarFiltros();
  renderizarTabla();
}

/** Fuentes que pueden dar las filas de la vista Detalle: la principal y las que aportan columnas. */
function fuentesDeDetalle() {
  return [...new Set([estado.mapeo.fuentePrincipal, ...estado.columnas.map(c => c.fuente)])];
}

function recalcularFilas() {
  const opciones = fuentesDeDetalle();
  if (!opciones.includes(estado.fuenteDetalle)) {
    // Por defecto, la primera fuente con varios registros por Id; si no hay, la primera secundaria.
    estado.fuenteDetalle = opciones.find(id => resultadosFuentes.get(id)?.repetidos) ?? opciones[1] ?? opciones[0];
  }
  estado.filas = construirFilas(estado.mapeo, estado.columnas, estado.vista, estado.fuenteDetalle);
  reiniciarTiposCampos();
}

/** "fuente · clave · métrica" de una columna (la métrica si no es la predeterminada). */
function describirColumna({ fuente, clave, metrica }, conFuente) {
  const partes = conFuente ? [nombreFuente(fuente), clave] : [clave];
  if (metrica && metrica !== 'primero') partes.push(METRICAS[metrica]);
  return partes.join(' · ');
}

// ---------- Tabla ----------

function mensajeTabla(icono, texto) {
  return `<div class="mensaje-tabla"><i class="bi ${icono}"></i>${texto}</div>`;
}

function celda(valor) {
  const texto = valorComoTexto(valor);
  if (texto === '') return '<td><span class="vacio">—</span></td>';
  const html = escaparHtml(texto);
  return texto.length > 40 ? `<td title="${html}">${html}</td>` : `<td>${html}</td>`;
}

function renderizarTabla() {
  if (estado.error) {
    el.resumenRegistros.textContent = '';
    el.tabla.innerHTML = `<div class="alert alert-danger m-3"><i class="bi bi-exclamation-triangle me-1"></i>${escaparHtml(estado.error)}</div>`;
    return;
  }

  const columnas = columnasVisibles();
  const total = estado.filas.length;
  const busqueda = simplificar(estado.busqueda.trim());
  const filtradas = aplicarFiltros(estado.filas);
  const filas = busqueda
    ? filtradas.filter(fila => columnas.some(c => simplificar(valorComoTexto(fila.valores[c.campo])).includes(busqueda)))
    : filtradas;

  el.resumenRegistros.textContent = filas.length === total
    ? `${total} ${total === 1 ? 'registro' : 'registros'}`
    : `${filas.length} de ${total} registros`;

  if (!estado.columnas.length) {
    el.tabla.innerHTML = mensajeTabla('bi-diagram-3', 'Ningún campo del reporte coincide con las claves de las fuentes. Revisa el mapeo en Configuración → Mapeos.');
    return;
  }
  if (!columnas.length) {
    el.tabla.innerHTML = mensajeTabla('bi-eye-slash', 'No hay campos seleccionados. Usa el botón «Campos» para habilitarlos.');
    return;
  }
  if (!total) {
    el.tabla.innerHTML = mensajeTabla('bi-inbox', 'La fuente principal no devolvió registros.');
    return;
  }
  if (!filas.length) {
    el.tabla.innerHTML = busqueda
      ? mensajeTabla('bi-search', `Sin resultados para «${escaparHtml(estado.busqueda.trim())}».`)
      : mensajeTabla('bi-funnel', 'Ningún registro cumple los filtros.');
    return;
  }

  const encabezado = columnas.map(columna => {
    // <wbr> permite partir los nombres largos en los guiones bajos
    return `<th scope="col" title="${escaparHtml(describirColumna(columna, true))}">${escaparHtml(columna.campo).replace(/_/g, '_<wbr>')}</th>`;
  }).join('');

  // En la vista Detalle, una línea separa los registros de cada Id
  const detalle = estado.vista === 'detalle';
  const cuerpo = filas.map((fila, i) => {
    const inicioGrupo = detalle && i > 0 && filas[i - 1].grupo !== fila.grupo;
    return `<tr${inicioGrupo ? ' class="inicio-grupo"' : ''}>${columnas.map(c => celda(fila.valores[c.campo])).join('')}</tr>`;
  }).join('');

  el.tabla.innerHTML = `
    <table class="table table-sm table-striped table-hover align-middle mb-0 tabla-reporte">
      <thead><tr>${encabezado}</tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>`;
}

// ---------- Barra de vista ----------

function renderizarBarraVista() {
  el.vistaResumen.checked = estado.vista === 'resumen';
  el.vistaDetalle.checked = estado.vista === 'detalle';

  const opciones = estado.error || !estado.mapeo ? [] : fuentesDeDetalle();
  el.grupoFuenteDetalle.hidden = estado.vista !== 'detalle' || !opciones.length;
  el.fuenteDetalle.innerHTML = opciones.map(id => {
    const repetidos = resultadosFuentes.get(id)?.repetidos ? ' (varios por Id)' : '';
    return `<option value="${escaparHtml(id)}"${id === estado.fuenteDetalle ? ' selected' : ''}>${escaparHtml(nombreFuente(id))}${repetidos}</option>`;
  }).join('');

  const conRepetidos = opciones.filter(id => resultadosFuentes.get(id)?.repetidos);
  el.infoRepetidos.innerHTML = conRepetidos.length
    ? `<i class="bi bi-info-circle me-1"></i>${conRepetidos.map(id => {
        const n = resultadosFuentes.get(id).repetidos;
        return `«${escaparHtml(nombreFuente(id))}»: ${n} ${n === 1 ? 'Id tiene' : 'Ids tienen'} varios registros`;
      }).join('; ')}`
    : '';
  el.infoRepetidos.title = conRepetidos.length
    ? 'En Resumen se combinan con la métrica de cada campo (Configuración → Mapeos); en Detalle se ve un registro por fila.'
    : '';
}

function cambiarVista() {
  if (!estado.mapeo || estado.error) return;
  estado.vista = el.vistaDetalle.checked ? 'detalle' : 'resumen';
  estado.fuenteDetalle = el.fuenteDetalle.value || estado.fuenteDetalle;
  guardarPreferencias();
  recalcularFilas();
  renderizarBarraVista();
  renderizarPanel();
  renderizarFiltros();
  renderizarTabla();
}

// ---------- Panel de campos ----------

function camposFiltrados() {
  const filtro = simplificar(estado.filtroCampos.trim());
  const conFuente = estado.mapeo && fuentesDelMapeo(estado.mapeo).length > 1;
  return estado.columnas
    .map((columna, indice) => ({ ...columna, indice, descripcion: describirColumna(columna, conFuente) }))
    .filter(c => !filtro || simplificar(`${c.campo} ${c.descripcion}`).includes(filtro));
}

function renderizarPanel() {
  const campos = camposFiltrados();

  el.listaCampos.innerHTML = campos.length
    ? campos.map(({ campo, indice, descripcion }) => `
        <div class="list-group-item">
          <div class="form-check form-switch mb-0">
            <input class="form-check-input" type="checkbox" role="switch" id="campo-${indice}" data-indice="${indice}"${estado.ocultos.has(campo) ? '' : ' checked'}>
            <label class="form-check-label w-100" for="campo-${indice}">
              ${escaparHtml(campo)}
              ${descripcion !== campo ? `<span class="campo-clave font-monospace">← ${escaparHtml(descripcion)}</span>` : ''}
            </label>
          </div>
        </div>`).join('')
    : `<div class="list-group-item small text-body-secondary">${estado.columnas.length ? 'Ningún campo coincide con la búsqueda.' : 'No hay campos con coincidencia.'}</div>`;

  const hayFiltro = estado.filtroCampos.trim() !== '';
  el.btnMostrarTodos.textContent = hayFiltro ? 'Mostrar encontrados' : 'Mostrar todos';
  el.btnOcultarTodos.textContent = hayFiltro ? 'Ocultar encontrados' : 'Ocultar todos';

  el.sinCoincidencia.hidden = !estado.sinCoincidencia.length;
  el.sinCoincidencia.querySelector('summary').textContent = `Sin coincidencia (${estado.sinCoincidencia.length})`;
  el.sinCoincidencia.querySelector('ul').innerHTML = estado.sinCoincidencia.map(c => `<li>${escaparHtml(c)}</li>`).join('');
}

function cambiarVisibilidadFiltrados(visible) {
  cambiarVisibilidad(camposFiltrados(), visible);
  el.listaCampos.querySelectorAll('input[data-indice]').forEach(input => { input.checked = visible; });
}

function actualizarContador() {
  el.contadorCampos.textContent = `${columnasVisibles().length}/${estado.columnas.length}`;
}

/** Abre el panel en la pestaña indicada; si ya estaba abierto en esa pestaña, lo cierra. */
function alternarPanel(pestana) {
  const panel = bootstrap.Offcanvas.getOrCreateInstance(el.panel);
  const boton = document.getElementById(`tab-${pestana}`);
  if (el.panel.classList.contains('show') && boton.classList.contains('active')) {
    panel.hide();
    return;
  }
  bootstrap.Tab.getOrCreateInstance(boton).show();
  panel.show();
}

function actualizarResumenes() {
  const texto = estado.error
    ? ''
    : `${estado.columnas.length} de ${CAMPOS_REPORTE.length} campos del reporte coinciden con las fuentes`;
  el.resumenCoincidencias.textContent = texto ? `· ${texto}` : '';
  el.panelResumen.textContent = texto;
  el.avisos.innerHTML = estado.avisos
    .map(aviso => `<div class="alert alert-warning small py-2"><i class="bi bi-exclamation-triangle me-1"></i>${escaparHtml(aviso)}</div>`)
    .join('');
}

function renderizarSelectorMapeos() {
  const activo = mapeoActivo().id;
  el.selectorMapeo.innerHTML = todosLosMapeos()
    .map(m => `<option value="${escaparHtml(m.id)}"${m.id === activo ? ' selected' : ''}>${escaparHtml(m.nombre)}</option>`)
    .join('');
}

function renderizarTodo() {
  actualizarResumenes();
  actualizarContador();
  renderizarBarraVista();
  renderizarPanel();
  renderizarFiltros();
  renderizarTabla();
}

// ---------- Carga ----------

async function cargarReporte(forzar = false) {
  const carga = ++cargaActual;
  const mapeo = mapeoActivo();
  const ids = fuentesDelMapeo(mapeo);

  el.btnActualizar.disabled = true;
  el.estadoFuente.textContent = 'Consultando…';
  el.tabla.innerHTML = '<div class="mensaje-tabla"><div class="spinner-border text-primary mb-2" role="status"></div><div>Consultando fuentes…</div></div>';

  const avisos = [];
  await Promise.all(ids.map(async id => {
    const fuente = buscarFuente(id);
    if (!fuente) {
      avisos.push(`La fuente «${id}» ya no existe; sus campos no se muestran.`);
      return;
    }
    try {
      await cargarFuente(fuente, forzar);
    } catch (error) {
      avisos.push(`No se pudo cargar «${fuente.nombre}»: ${conPunto(error.message)} Sus campos no se muestran.`);
    }
  }));
  if (carga !== cargaActual) return;  // mientras tanto se pidió otra carga

  const principal = resultadosFuentes.get(mapeo.fuentePrincipal);
  Object.assign(estado, { mapeo }, leerPreferencias(mapeo.id));
  if (principal?.registros) {
    Object.assign(estado, resolverColumnas(mapeo), { error: null, avisos });
    recalcularFilas();
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    el.estadoFuente.textContent = `${ids.filter(buscarFuente).map(nombreFuente).join(' + ')} · actualizado ${hora}`;
  } else {
    Object.assign(estado, {
      columnas: [],
      sinCoincidencia: [],
      filas: [],
      avisos: [],
      error: buscarFuente(mapeo.fuentePrincipal)
        ? `No se pudo cargar la fuente principal «${nombreFuente(mapeo.fuentePrincipal)}»: ${principal?.error ?? ''}`
        : `La fuente principal «${mapeo.fuentePrincipal}» no existe. Elige otra en Configuración → Mapeos.`,
    });
    el.estadoFuente.textContent = 'Error al consultar';
  }
  el.btnActualizar.disabled = false;
  renderizarTodo();
}

/** Se llama cuando cambian las fuentes o los mapeos. */
function alCambiarConfiguracion() {
  renderizarSelectorMapeos();
  cargarReporte();
}

// ---------- Eventos ----------

el.btnActualizar.addEventListener('click', () => cargarReporte(true));

el.selectorMapeo.addEventListener('change', () => {
  configuracion.mapeoActivo = el.selectorMapeo.value;
  guardarConfiguracion();
  cargarReporte();
});

el.vistaResumen.addEventListener('change', cambiarVista);
el.vistaDetalle.addEventListener('change', cambiarVista);
el.fuenteDetalle.addEventListener('change', cambiarVista);

el.btnCampos.addEventListener('click', () => alternarPanel('campos'));
el.btnFiltros.addEventListener('click', () => alternarPanel('filtros'));

el.buscar.addEventListener('input', conRetardo(() => {
  estado.busqueda = el.buscar.value;
  renderizarTabla();
}, 150));

el.filtroCampos.addEventListener('input', () => {
  estado.filtroCampos = el.filtroCampos.value;
  renderizarPanel();
});

el.listaCampos.addEventListener('change', evento => {
  const columna = estado.columnas[evento.target.dataset.indice];
  if (columna) cambiarVisibilidad([columna], evento.target.checked);
});

el.btnMostrarTodos.addEventListener('click', () => cambiarVisibilidadFiltrados(true));
el.btnOcultarTodos.addEventListener('click', () => cambiarVisibilidadFiltrados(false));

el.btnExportar.addEventListener('click', exportarConfiguracion);
el.btnImportar.addEventListener('click', () => el.archivoImportar.click());
el.archivoImportar.addEventListener('change', async () => {
  const archivo = el.archivoImportar.files[0];
  el.archivoImportar.value = '';
  if (!archivo) return;
  try {
    const { fuentes, mapeos } = importarConfiguracion(await archivo.text());
    notificar(`Configuración importada: ${fuentes} fuentes y ${mapeos} mapeos.`);
    alCambiarConfiguracion();
  } catch (error) {
    notificar(error.message, 'danger');
  }
});

renderizarSelectorMapeos();
cargarReporte();
