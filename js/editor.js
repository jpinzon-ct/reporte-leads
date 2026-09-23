/**
 * Partes del configurador que no van en los reportes exportados: selector de mapeos,
 * importar/exportar la configuración y enlaces al repositorio.
 */

const uiEditor = {
  selectorMapeo: document.getElementById('selector-mapeo'),
  btnExportar: document.getElementById('btn-exportar'),
  btnImportar: document.getElementById('btn-importar'),
  archivoImportar: document.getElementById('archivo-importar'),
};

function renderizarSelectorMapeos() {
  const activo = mapeoActivo().id;
  uiEditor.selectorMapeo.innerHTML = todosLosMapeos()
    .map(m => `<option value="${escaparHtml(m.id)}"${m.id === activo ? ' selected' : ''}>${escaparHtml(m.nombre)}</option>`)
    .join('');
}

/** Se llama cuando cambian las fuentes o los mapeos. */
function alCambiarConfiguracion() {
  renderizarSelectorMapeos();
  cargarReporte();
}

uiEditor.selectorMapeo.addEventListener('change', () => {
  configuracion.mapeoActivo = uiEditor.selectorMapeo.value;
  guardarConfiguracion();
  cargarReporte();
});

uiEditor.btnExportar.addEventListener('click', exportarConfiguracion);
uiEditor.btnImportar.addEventListener('click', () => uiEditor.archivoImportar.click());
uiEditor.archivoImportar.addEventListener('change', async () => {
  const archivo = uiEditor.archivoImportar.files[0];
  uiEditor.archivoImportar.value = '';
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
