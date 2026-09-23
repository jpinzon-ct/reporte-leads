/**
 * Ventana «Fuentes de datos»: crear, probar, editar y eliminar los consumos (fuentes) del reporte.
 */

const uiFuentes = {
  modal: document.getElementById('modal-fuentes'),
  lista: document.getElementById('lista-fuentes'),
  form: document.getElementById('form-fuente'),
  titulo: document.getElementById('fuente-titulo'),
  id: document.getElementById('fuente-id'),
  nombre: document.getElementById('fuente-nombre'),
  tipo: document.getElementById('fuente-tipo'),
  metodo: document.getElementById('fuente-metodo'),
  url: document.getElementById('fuente-url'),
  encabezados: document.getElementById('fuente-encabezados'),
  cuerpo: document.getElementById('fuente-cuerpo'),
  json: document.getElementById('fuente-json'),
  ruta: document.getElementById('fuente-ruta'),
  campoId: document.getElementById('fuente-campo-id'),
  campoOrden: document.getElementById('fuente-campo-orden'),
  btnNueva: document.getElementById('btn-nueva-fuente'),
  btnProbar: document.getElementById('btn-probar-fuente'),
  btnEliminar: document.getElementById('btn-eliminar-fuente'),
  btnRestaurar: document.getElementById('btn-restaurar-fuentes'),
  mensaje: document.getElementById('fuente-mensaje'),
  prueba: document.getElementById('fuente-prueba'),
};

let idFuenteEditada = null;  // null = fuente nueva

function mensajeFuente(texto, tipo = 'success') {
  uiFuentes.mensaje.className = `small mt-2 text-${tipo}`;
  uiFuentes.mensaje.textContent = texto;
}

function textoJson(valor) {
  if (valor === null || valor === undefined) return '';
  return typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2);
}

function renderizarListaFuentes() {
  uiFuentes.lista.innerHTML = configuracion.fuentes.map(f => `
    <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-2${f.id === idFuenteEditada ? ' active' : ''}" data-id="${escaparHtml(f.id)}">
      <span class="text-break">${escaparHtml(f.nombre)}</span>
      <span class="badge ${f.tipo === 'json' ? 'text-bg-secondary' : 'text-bg-info'}">${f.tipo === 'json' ? 'JSON' : 'API'}</span>
    </button>`).join('') || '<div class="list-group-item small text-body-secondary">No hay fuentes.</div>';
}

function mostrarCamposPorTipo() {
  uiFuentes.form.querySelectorAll('[data-tipo]').forEach(elemento => {
    elemento.hidden = elemento.dataset.tipo !== uiFuentes.tipo.value;
  });
}

function editarFuente(id) {
  const fuente = buscarFuente(id);
  idFuenteEditada = fuente?.id ?? null;
  uiFuentes.titulo.textContent = fuente ? fuente.nombre : 'Nueva fuente';
  uiFuentes.id.textContent = fuente ? `id: ${fuente.id}` : '';
  uiFuentes.nombre.value = fuente?.nombre ?? '';
  uiFuentes.tipo.value = fuente?.tipo ?? 'api';
  uiFuentes.metodo.value = fuente?.metodo || 'GET';
  uiFuentes.url.value = fuente?.url ?? '';
  uiFuentes.encabezados.value = textoJson(fuente?.encabezados);
  uiFuentes.cuerpo.value = textoJson(fuente?.cuerpo);
  uiFuentes.json.value = fuente?.json ?? '';
  uiFuentes.ruta.value = fuente?.rutaDatos ?? '';
  uiFuentes.campoId.value = fuente?.campoId ?? 'id';
  uiFuentes.campoOrden.value = fuente?.campoOrden ?? '';
  uiFuentes.btnEliminar.hidden = !fuente;
  uiFuentes.mensaje.textContent = '';
  uiFuentes.prueba.innerHTML = '';
  mostrarCamposPorTipo();
  renderizarListaFuentes();
}

function leerFormularioFuente() {
  const tipo = uiFuentes.tipo.value;
  return {
    id: idFuenteEditada,
    nombre: uiFuentes.nombre.value.trim(),
    tipo,
    url: tipo === 'api' ? uiFuentes.url.value.trim() : '',
    metodo: uiFuentes.metodo.value,
    encabezados: tipo === 'api' ? uiFuentes.encabezados.value.trim() : '',
    cuerpo: tipo === 'api' ? uiFuentes.cuerpo.value.trim() : '',
    json: tipo === 'json' ? uiFuentes.json.value : '',
    rutaDatos: uiFuentes.ruta.value.trim(),
    campoId: uiFuentes.campoId.value.trim() || 'id',
    campoOrden: uiFuentes.campoOrden.value.trim(),
  };
}

/** Valida lo que se puede validar sin consultar la API. Devuelve el mensaje de error o null. */
function validarFuente(fuente) {
  if (!fuente.nombre) return 'Escribe un nombre para la fuente.';
  if (fuente.tipo === 'api') {
    if (!fuente.url) return 'Escribe la URL del consumo.';
    try {
      leerJsonOpcional(fuente.encabezados, 'Los encabezados');
      leerJsonOpcional(fuente.cuerpo, 'El cuerpo');
    } catch (error) {
      return error.message;
    }
  } else {
    try {
      JSON.parse(fuente.json);
    } catch {
      return 'La respuesta JSON pegada no es válida.';
    }
  }
  return null;
}

async function probarFuente() {
  const fuente = leerFormularioFuente();
  const error = validarFuente(fuente);
  if (error) return mensajeFuente(error, 'danger');

  uiFuentes.mensaje.textContent = '';
  uiFuentes.btnProbar.disabled = true;
  uiFuentes.prueba.innerHTML = '<div class="small text-body-secondary"><span class="spinner-border spinner-border-sm me-1"></span>Consultando…</div>';
  try {
    const { registros, cabeceras, repetidos } = await leerFuente(fuente);
    const problemas = [];
    if (!cabeceras.has(fuente.campoId)) {
      problemas.push(`La clave <code>${escaparHtml(fuente.campoId)}</code> indicada como Id no viene en la respuesta.`);
    }
    if (fuente.campoOrden && !cabeceras.has(fuente.campoOrden)) {
      problemas.push(`La clave <code>${escaparHtml(fuente.campoOrden)}</code> para ordenar no viene en la respuesta.`);
    }
    const detalleRepetidos = repetidos
      ? ` ${repetidos} ${repetidos === 1 ? 'Id tiene' : 'Ids tienen'} varios registros.`
      : '';
    uiFuentes.prueba.innerHTML = `
      <div class="alert ${problemas.length ? 'alert-warning' : 'alert-success'} small py-2 mb-2">
        <i class="bi ${problemas.length ? 'bi-exclamation-triangle' : 'bi-check-circle'} me-1"></i>
        ${registros.length} registros · ${cabeceras.size} claves.${detalleRepetidos}
        ${problemas.join(' ')}
      </div>
      <div class="claves-prueba">${[...cabeceras].map(c => `<span class="badge text-bg-light border fw-normal font-monospace">${escaparHtml(c)}</span>`).join(' ')}</div>`;
  } catch (e) {
    uiFuentes.prueba.innerHTML = `<div class="alert alert-danger small py-2 mb-0"><i class="bi bi-x-circle me-1"></i>${escaparHtml(e.message)}</div>`;
  } finally {
    uiFuentes.btnProbar.disabled = false;
  }
}

function guardarFuente(evento) {
  evento.preventDefault();
  const fuente = leerFormularioFuente();
  const error = validarFuente(fuente);
  if (error) return mensajeFuente(error, 'danger');

  if (fuente.id) {
    configuracion.fuentes[configuracion.fuentes.findIndex(f => f.id === fuente.id)] = fuente;
  } else {
    fuente.id = crearId(fuente.nombre, configuracion.fuentes.map(f => f.id));
    configuracion.fuentes.push(fuente);
  }
  olvidarFuente(fuente.id);
  if (!guardarConfiguracion()) return mensajeFuente('El navegador no permitió guardar la fuente.', 'danger');

  editarFuente(fuente.id);
  mensajeFuente('Fuente guardada.');
  alCambiarConfiguracion();
}

function eliminarFuente() {
  const fuente = buscarFuente(idFuenteEditada);
  if (!fuente) return;
  const enUso = mapeosQueUsan(fuente.id);
  if (enUso.length) {
    return mensajeFuente(`No se puede eliminar: la usan los mapeos ${enUso.map(m => `«${m.nombre}»`).join(', ')}.`, 'danger');
  }
  if (!confirm(`¿Eliminar la fuente «${fuente.nombre}»?`)) return;

  configuracion.fuentes = configuracion.fuentes.filter(f => f.id !== fuente.id);
  olvidarFuente(fuente.id);
  guardarConfiguracion();
  editarFuente(configuracion.fuentes[0]?.id);
  alCambiarConfiguracion();
}

function restaurarFuentes() {
  const nombres = FUENTES_PROYECTO.map(f => `«${f.nombre}»`).join(', ');
  if (!confirm(`Se restaurarán las fuentes del proyecto (${nombres}) a como están en js/config.js. Las demás fuentes no se tocan. ¿Continuar?`)) return;
  restaurarFuentesProyecto();
  editarFuente(idFuenteEditada && buscarFuente(idFuenteEditada) ? idFuenteEditada : configuracion.fuentes[0]?.id);
  mensajeFuente('Fuentes del proyecto restauradas.');
  alCambiarConfiguracion();
}

uiFuentes.modal.addEventListener('show.bs.modal', () => {
  editarFuente(buscarFuente(idFuenteEditada) ? idFuenteEditada : configuracion.fuentes[0]?.id);
});
uiFuentes.lista.addEventListener('click', evento => {
  const boton = evento.target.closest('[data-id]');
  if (boton) editarFuente(boton.dataset.id);
});
uiFuentes.btnNueva.addEventListener('click', () => {
  editarFuente(null);
  uiFuentes.nombre.focus();
});
uiFuentes.tipo.addEventListener('change', mostrarCamposPorTipo);
uiFuentes.btnProbar.addEventListener('click', probarFuente);
uiFuentes.form.addEventListener('submit', guardarFuente);
uiFuentes.btnEliminar.addEventListener('click', eliminarFuente);
uiFuentes.btnRestaurar.addEventListener('click', restaurarFuentes);
