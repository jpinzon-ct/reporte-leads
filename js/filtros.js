/**
 * Filtros dinámicos del reporte. Se definen sobre los campos visibles; los operadores y los valores
 * se adaptan al tipo de dato de cada campo (texto, número o fecha), que se detecta a partir de sus valores.
 * Los filtros se guardan por mapeo (en configuracion.preferencias, ver app.js).
 */

const OPERADORES = {
  texto: {
    contiene: 'contiene',
    no_contiene: 'no contiene',
    igual: 'es igual a',
    distinto: 'es distinto de',
    empieza: 'empieza con',
    uno_de: 'es uno de',
    vacio: 'está vacío',
    no_vacio: 'no está vacío',
  },
  numero: {
    igual: '=',
    distinto: '≠',
    mayor: '>',
    mayor_igual: '≥',
    menor: '<',
    menor_igual: '≤',
    entre: 'entre',
    contiene: 'contiene',
    vacio: 'está vacío',
    no_vacio: 'no está vacío',
  },
  fecha: {
    dia: 'es el día',
    desde: 'desde',
    hasta: 'hasta',
    entre: 'entre',
    vacio: 'está vacío',
    no_vacio: 'no está vacío',
  },
};
const OPERADOR_INICIAL = { texto: 'contiene', numero: 'igual', fecha: 'desde' };
const NOMBRES_TIPOS = { texto: 'Texto', numero: 'Número', fecha: 'Fecha' };
const OPERADORES_SIN_VALOR = new Set(['vacio', 'no_vacio']);
const OPERADORES_DE_TEXTO = new Set(['contiene', 'no_contiene', 'empieza']);
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}(?:$|[ T])/;
const MAX_OPCIONES = 200;

const uiFiltros = {
  lista: document.getElementById('lista-filtros'),
  btnAgregar: document.getElementById('btn-agregar-filtro'),
  btnQuitarTodos: document.getElementById('btn-quitar-filtros'),
  chips: document.getElementById('chips-filtros'),
  contador: document.getElementById('contador-filtros'),
  contadorPestana: document.getElementById('contador-filtros-pestana'),
};

// ---------- Tipos de dato ----------

let tiposCampos = new Map();

/** Se llama cuando cambian las filas (otra carga u otra vista). */
function reiniciarTiposCampos() {
  tiposCampos = new Map();
}

function tipoDeCampo(campo) {
  if (!tiposCampos.has(campo)) {
    const valores = estado.filas.map(f => f.valores[campo]).filter(v => valorComoTexto(v) !== '');
    let tipo = 'texto';
    if (valores.length && valores.every(esNumero)) tipo = 'numero';
    else if (valores.length && valores.every(v => typeof v === 'string' && PATRON_FECHA.test(v))) tipo = 'fecha';
    tiposCampos.set(campo, tipo);
  }
  return tiposCampos.get(campo);
}

/** Valores distintos de un campo con su cantidad de filas, ordenados. */
function valoresDistintos(campo) {
  const conteo = new Map();
  for (const fila of estado.filas) {
    const texto = valorComoTexto(fila.valores[campo]);
    if (texto !== '') conteo.set(texto, (conteo.get(texto) ?? 0) + 1);
  }
  return [...conteo].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
}

// ---------- Evaluación ----------

function campoDisponible(campo) {
  return estado.columnas.some(c => c.campo === campo);
}

/** El filtro tiene todo lo necesario para evaluarse (mientras se configura, no afecta la tabla). */
function filtroCompleto(filtro) {
  if (!campoDisponible(filtro.campo)) return false;
  if (!Object.hasOwn(OPERADORES[tipoDeCampo(filtro.campo)], filtro.operador)) return false;
  if (OPERADORES_SIN_VALOR.has(filtro.operador)) return true;
  if (filtro.operador === 'uno_de') return filtro.valores?.length > 0;
  if (filtro.operador === 'entre') return Boolean(filtro.valor) && Boolean(filtro.valor2);
  return Boolean(filtro.valor);
}

/** Solo se aplican los filtros completos sobre campos visibles. */
function filtroActivo(filtro) {
  return filtroCompleto(filtro) && !estado.ocultos.has(filtro.campo);
}

function cumpleFiltro(fila, filtro) {
  const texto = valorComoTexto(fila.valores[filtro.campo]);
  const { operador, valor = '', valor2 = '' } = filtro;

  if (operador === 'vacio') return texto === '';
  if (operador === 'no_vacio') return texto !== '';
  if (operador === 'uno_de') return filtro.valores.includes(texto);

  const tipo = tipoDeCampo(filtro.campo);
  if (tipo === 'texto' || OPERADORES_DE_TEXTO.has(operador)) {
    const a = simplificar(texto);
    const b = simplificar(valor);
    switch (operador) {
      case 'contiene': return a.includes(b);
      case 'no_contiene': return !a.includes(b);
      case 'empieza': return a.startsWith(b);
      case 'igual': return a === b;
      case 'distinto': return a !== b;
    }
  }

  if (texto === '') return operador === 'distinto';

  if (tipo === 'numero') {
    const n = Number(texto);
    const a = Number(valor);
    const b = Number(valor2);
    switch (operador) {
      case 'igual': return n === a;
      case 'distinto': return n !== a;
      case 'mayor': return n > a;
      case 'mayor_igual': return n >= a;
      case 'menor': return n < a;
      case 'menor_igual': return n <= a;
      case 'entre': return n >= Math.min(a, b) && n <= Math.max(a, b);
    }
  }

  if (tipo === 'fecha') {
    const dia = texto.slice(0, 10);  // se compara por día: AAAA-MM-DD
    const [desde, hasta] = [valor, valor2].sort();
    switch (operador) {
      case 'dia': return dia === valor;
      case 'desde': return dia >= valor;
      case 'hasta': return dia <= valor;
      case 'entre': return dia >= desde && dia <= hasta;
    }
  }
  return true;
}

function aplicarFiltros(filas) {
  const activos = estado.filtros.filter(filtroActivo);
  return activos.length ? filas.filter(fila => activos.every(filtro => cumpleFiltro(fila, filtro))) : filas;
}

// ---------- Panel ----------

function crearFiltro(campo) {
  return {
    id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    campo,
    operador: OPERADOR_INICIAL[tipoDeCampo(campo)],
    valor: '',
    valor2: '',
    valores: [],
  };
}

function limpiarValores(filtro) {
  Object.assign(filtro, { valor: '', valor2: '', valores: [] });
}

function entradasValor(filtro, tipo) {
  const id = escaparHtml(filtro.id);

  if (filtro.operador === 'uno_de') {
    const opciones = valoresDistintos(filtro.campo);
    if (!opciones.length) return '<div class="small text-body-secondary">El campo no tiene valores.</div>';
    const seleccion = new Set(filtro.valores);
    const casillas = opciones.slice(0, MAX_OPCIONES).map(([valor, cantidad], i) => `
      <div class="form-check mb-0">
        <input class="form-check-input" type="checkbox" id="filtro-${id}-${i}" data-rol="opcion" value="${escaparHtml(valor)}"${seleccion.has(valor) ? ' checked' : ''}>
        <label class="form-check-label small text-break" for="filtro-${id}-${i}">${escaparHtml(valor)} <span class="text-body-secondary">(${cantidad})</span></label>
      </div>`).join('');
    const nota = opciones.length > MAX_OPCIONES
      ? `<div class="form-text">Se muestran ${MAX_OPCIONES} de ${opciones.length} valores; para el resto usa «contiene».</div>`
      : '';
    return `<div class="opciones-filtro border rounded px-2 py-1">${casillas}</div>${nota}`;
  }

  const tipoEntrada = tipo === 'texto' || OPERADORES_DE_TEXTO.has(filtro.operador) ? 'text' : tipo === 'numero' ? 'number' : 'date';
  const sugerencias = tipoEntrada === 'text'
    ? `<datalist id="sugerencias-${id}">${valoresDistintos(filtro.campo).slice(0, MAX_OPCIONES).map(([v]) => `<option value="${escaparHtml(v)}">`).join('')}</datalist>`
    : '';
  const entrada = (rol, etiqueta) => `
    <input type="${tipoEntrada}" class="form-control form-control-sm" data-rol="${rol}" aria-label="${etiqueta}" value="${escaparHtml(filtro[rol] ?? '')}"${
      tipoEntrada === 'text' ? ` list="sugerencias-${id}" placeholder="Valor…"` : ''}${tipoEntrada === 'number' ? ' step="any"' : ''}>`;

  if (filtro.operador === 'entre') {
    return `<div class="d-flex align-items-center gap-2">${entrada('valor', 'Desde')}<span class="small text-body-secondary">y</span>${entrada('valor2', 'Hasta')}</div>`;
  }
  return entrada('valor', 'Valor') + sugerencias;
}

function tarjetaFiltro(filtro) {
  const disponible = campoDisponible(filtro.campo);
  const visible = disponible && !estado.ocultos.has(filtro.campo);
  const tipo = disponible ? tipoDeCampo(filtro.campo) : 'texto';
  // Si el tipo del campo cambió (p. ej. con otra vista), el operador guardado puede no aplicar
  if (!Object.hasOwn(OPERADORES[tipo], filtro.operador)) {
    filtro.operador = OPERADOR_INICIAL[tipo];
    limpiarValores(filtro);
  }

  const opcionNoVisible = visible
    ? ''
    : `<option value="${escaparHtml(filtro.campo)}" selected>${escaparHtml(filtro.campo)} (${disponible ? 'oculto' : 'no disponible'})</option>`;
  const opcionesCampo = columnasVisibles()
    .map(c => `<option value="${escaparHtml(c.campo)}"${c.campo === filtro.campo ? ' selected' : ''}>${escaparHtml(c.campo)}</option>`)
    .join('');
  const opcionesOperador = Object.entries(OPERADORES[tipo])
    .map(([valor, nombre]) => `<option value="${valor}"${valor === filtro.operador ? ' selected' : ''}>${nombre}</option>`)
    .join('');

  return `
    <div class="filtro border rounded p-2${visible ? '' : ' filtro-inactivo'}" data-id="${escaparHtml(filtro.id)}">
      <div class="d-flex gap-2 mb-2">
        <select class="form-select form-select-sm" data-rol="campo" aria-label="Campo a filtrar">${opcionNoVisible}${opcionesCampo}</select>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-rol="quitar" title="Quitar filtro" aria-label="Quitar filtro"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="d-flex align-items-center gap-2">
        <select class="form-select form-select-sm" data-rol="operador" aria-label="Condición">${opcionesOperador}</select>
        <span class="badge text-bg-light border fw-normal" title="Tipo de dato detectado en el campo">${NOMBRES_TIPOS[tipo]}</span>
      </div>
      ${OPERADORES_SIN_VALOR.has(filtro.operador) ? '' : `<div class="mt-2">${entradasValor(filtro, tipo)}</div>`}
      ${visible ? '' : `<div class="small text-warning-emphasis mt-2"><i class="bi bi-exclamation-triangle me-1"></i>${disponible ? 'El campo está oculto' : 'El campo no está en este reporte'}: el filtro no se aplica.</div>`}
    </div>`;
}

function describirFiltro(filtro) {
  const tipo = tipoDeCampo(filtro.campo);
  let valor = '';
  if (filtro.operador === 'uno_de') {
    valor = filtro.valores.length > 3
      ? `${filtro.valores.slice(0, 3).join(', ')} y ${filtro.valores.length - 3} más`
      : filtro.valores.join(', ');
  } else if (filtro.operador === 'entre') {
    valor = `${filtro.valor} y ${filtro.valor2}`;
  } else if (!OPERADORES_SIN_VALOR.has(filtro.operador)) {
    valor = tipo === 'texto' || OPERADORES_DE_TEXTO.has(filtro.operador) ? `«${filtro.valor}»` : filtro.valor;
  }
  return `${filtro.campo} ${OPERADORES[tipo][filtro.operador]} ${valor}`.trim();
}

/** Contadores y «chips» de los filtros sobre la tabla. */
function renderizarIndicadoresFiltros() {
  const completos = estado.filtros.filter(filtroCompleto);
  const activos = completos.filter(filtroActivo).length;
  for (const contador of [uiFiltros.contador, uiFiltros.contadorPestana]) {
    contador.hidden = !activos;
    contador.textContent = activos;
  }

  uiFiltros.chips.hidden = !completos.length;
  uiFiltros.chips.innerHTML = completos.length
    ? `<small class="text-body-secondary me-1"><i class="bi bi-funnel"></i> Filtros:</small>
       ${completos.map(filtro => {
         const activo = filtroActivo(filtro);
         return `
           <span class="chip-filtro badge rounded-pill border fw-normal${activo ? '' : ' inactivo'}"${activo ? '' : ' title="El campo está oculto: el filtro no se aplica"'}>
             <span class="text-truncate">${escaparHtml(describirFiltro(filtro))}</span>
             <button type="button" class="btn-close" data-quitar="${escaparHtml(filtro.id)}" aria-label="Quitar filtro"></button>
           </span>`;
       }).join('')}
       <button type="button" class="btn btn-link btn-sm p-0 ms-1" data-quitar="*">Quitar filtros</button>`
    : '';
}

function renderizarFiltros() {
  uiFiltros.lista.innerHTML = estado.filtros.length
    ? estado.filtros.map(tarjetaFiltro).join('')
    : '<p class="small text-body-secondary border rounded p-3 mb-0 text-center">No hay filtros. Usa «Agregar filtro».</p>';
  uiFiltros.btnAgregar.disabled = !columnasVisibles().length;
  uiFiltros.btnQuitarTodos.disabled = !estado.filtros.length;
  renderizarIndicadoresFiltros();
}

function alCambiarFiltros({ redibujar = false } = {}) {
  guardarPreferencias();
  if (redibujar) renderizarFiltros();
  else renderizarIndicadoresFiltros();
  renderizarTabla();
}

const alCambiarFiltrosConRetardo = conRetardo(alCambiarFiltros, 250);

function quitarFiltro(id) {
  estado.filtros = id === '*' ? [] : estado.filtros.filter(f => f.id !== id);
  alCambiarFiltros({ redibujar: true });
}

// ---------- Eventos ----------

uiFiltros.lista.addEventListener('change', evento => {
  const tarjeta = evento.target.closest('[data-id]');
  const filtro = estado.filtros.find(f => f.id === tarjeta?.dataset.id);
  if (!filtro) return;

  switch (evento.target.dataset.rol) {
    case 'campo':
      filtro.campo = evento.target.value;
      filtro.operador = OPERADOR_INICIAL[tipoDeCampo(filtro.campo)];
      limpiarValores(filtro);
      tarjeta.outerHTML = tarjetaFiltro(filtro);
      break;
    case 'operador': {
      const eraLista = filtro.operador === 'uno_de';
      filtro.operador = evento.target.value;
      if (eraLista || filtro.operador === 'uno_de') limpiarValores(filtro);
      tarjeta.outerHTML = tarjetaFiltro(filtro);
      break;
    }
    case 'opcion':
      filtro.valores = [...tarjeta.querySelectorAll('[data-rol="opcion"]:checked')].map(casilla => casilla.value);
      break;
    default:
      return;
  }
  alCambiarFiltros();
});

uiFiltros.lista.addEventListener('input', evento => {
  const rol = evento.target.dataset.rol;
  if (rol !== 'valor' && rol !== 'valor2') return;
  const filtro = estado.filtros.find(f => f.id === evento.target.closest('[data-id]')?.dataset.id);
  if (!filtro) return;
  filtro[rol] = evento.target.value;
  alCambiarFiltrosConRetardo();
});

uiFiltros.lista.addEventListener('click', evento => {
  if (!evento.target.closest('[data-rol="quitar"]')) return;
  quitarFiltro(evento.target.closest('[data-id]').dataset.id);
});

uiFiltros.chips.addEventListener('click', evento => {
  const boton = evento.target.closest('[data-quitar]');
  if (boton) quitarFiltro(boton.dataset.quitar);
});

uiFiltros.btnAgregar.addEventListener('click', () => {
  const visibles = columnasVisibles();
  if (!visibles.length) return;
  estado.filtros.push(crearFiltro(visibles[0].campo));
  renderizarFiltros();
  guardarPreferencias();
  uiFiltros.lista.lastElementChild.querySelector('[data-rol="campo"]').focus();
});

uiFiltros.btnQuitarTodos.addEventListener('click', () => quitarFiltro('*'));
