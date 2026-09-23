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
  fuenteDetalle: null,  // fuente cuyas filas muestra la vista Detalle (la define el mapeo)
  // Preferencias del mapeo en uso (se guardan en configuracion.preferencias)
  vista: 'resumen',
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
  fuentesMapeo: document.getElementById('fuentes-mapeo'),
  vistaResumen: document.getElementById('vista-resumen'),
  vistaDetalle: document.getElementById('vista-detalle'),
  descripcionVista: document.getElementById('descripcion-vista'),
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
    ocultos: new Set(Array.isArray(guardadas.ocultos) ? guardadas.ocultos : []),
    filtros: Array.isArray(guardadas.filtros) ? structuredClone(guardadas.filtros) : [],
  };
}

function guardarPreferencias() {
  if (!estado.mapeo) return;
  configuracion.preferencias[estado.mapeo.id] = {
    vista: estado.vista,
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

function recalcularFilas() {
  estado.fuenteDetalle = fuenteDeDetalle(estado.mapeo, estado.columnas);
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

function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`;
}

/** Una etiqueta por fuente del mapeo: su papel, cuántos registros trae y si la unión por Id funciona. */
function etiquetaFuente(id) {
  const fuente = buscarFuente(id);
  const resultado = resultadosFuentes.get(id);
  const principal = id === estado.mapeo.fuentePrincipal;
  const campos = estado.columnas.filter(c => c.fuente === id).length;
  const detalles = [];
  const problemas = [];
  const insignias = [];

  if (principal) insignias.push('<span class="badge text-bg-primary">principal</span>');
  if (estado.vista === 'detalle' && id === estado.fuenteDetalle) insignias.push('<span class="badge text-bg-secondary">filas del detalle</span>');

  if (!fuente) {
    problemas.push('ya no existe');
  } else if (!resultado || resultado.error) {
    problemas.push('no se pudo cargar');
  } else {
    if (!principal) detalles.push(`unida por <code>${escaparHtml(fuente.campoId || 'id')}</code>`);
    detalles.push(plural(resultado.registros.length, 'registro', 'registros'));
    detalles.push(plural(campos, 'campo', 'campos'));
    if (resultado.repetidos) insignias.push('<span class="badge text-bg-light border">varios por Id</span>');
    if (!campos) problemas.push('ninguna de sus claves mapeadas viene en la respuesta');

    if (!principal && resultadosFuentes.get(estado.mapeo.fuentePrincipal)?.registros) {
      const { coinciden, total } = coincidenciasPorId(estado.mapeo.fuentePrincipal, id);
      detalles.push(`${coinciden} de ${plural(total, 'Id', 'Ids')} con datos`);
      if (!coinciden) problemas.push(`ningún Id coincide con «${escaparHtml(nombreFuente(estado.mapeo.fuentePrincipal))}»`);
    }
  }

  const titulo = principal
    ? 'Fuente principal: da los Ids (filas) del reporte.'
    : !problemas.length
      ? 'Se une a la fuente principal por su campo Id.'
      : 'Revisa el campo Id de la fuente (Configuración → Fuentes de datos) y que sus Ids sean los mismos que los de la fuente principal.';
  return `
    <span class="fuente-mapeo${problemas.length ? ' con-problema' : ''}" title="${escaparHtml(titulo)}">
      <i class="bi ${problemas.length ? 'bi-exclamation-triangle-fill text-warning' : principal ? 'bi-database-fill text-primary' : 'bi-link-45deg'}"></i>
      <strong>${escaparHtml(nombreFuente(id))}</strong>
      ${insignias.join(' ')}
      <span class="text-body-secondary">${detalles.join(' · ')}</span>
      ${problemas.length ? `<span class="text-warning-emphasis">${problemas.join('; ')}</span>` : ''}
    </span>`;
}

function renderizarBarraVista() {
  el.vistaResumen.checked = estado.vista === 'resumen';
  el.vistaDetalle.checked = estado.vista === 'detalle';

  if (estado.error || !estado.mapeo) {
    el.fuentesMapeo.innerHTML = '';
    el.descripcionVista.textContent = '';
    return;
  }

  el.fuentesMapeo.innerHTML = `
    <small class="text-body-secondary">Fuentes de «${escaparHtml(estado.mapeo.nombre)}»:</small>
    ${fuentesDelMapeo(estado.mapeo).map(etiquetaFuente).join('')}`;

  const principal = `«${escaparHtml(nombreFuente(estado.mapeo.fuentePrincipal))}»`;
  if (estado.vista === 'detalle') {
    el.descripcionVista.innerHTML = `Una fila por cada registro de «${escaparHtml(nombreFuente(estado.fuenteDetalle))}».`;
  } else {
    const combinadas = [...new Set(estado.columnas.map(c => c.fuente))].filter(id => resultadosFuentes.get(id)?.repetidos);
    el.descripcionVista.innerHTML = `Una fila por Id de ${principal}.${combinadas.length
      ? ` Los registros con el mismo Id de ${combinadas.map(id => `«${escaparHtml(nombreFuente(id))}»`).join(', ')} se combinan con la métrica de cada campo.`
      : ''}`;
  }
}

function cambiarVista() {
  if (!estado.mapeo || estado.error) return;
  estado.vista = el.vistaDetalle.checked ? 'detalle' : 'resumen';
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

// Descarga del proyecto completo desde su repositorio público (rama main)
if (URL_REPOSITORIO) {
  const repositorio = URL_REPOSITORIO.replace(/\/+$/, '');
  document.getElementById('enlace-descargar').href = `${repositorio}/archive/refs/heads/main.zip`;
  document.getElementById('enlace-repositorio').href = repositorio;
  document.querySelectorAll('[data-repositorio]').forEach(opcion => { opcion.hidden = false; });
}

renderizarSelectorMapeos();
cargarReporte();
