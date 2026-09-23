/**
 * Configuración del proyecto.
 *
 * - FUENTES_PROYECTO:     fuentes de datos iniciales. Desde la página (Configuración → Fuentes de datos)
 *                         se pueden editar y agregar más; los cambios se guardan en el navegador.
 * - CAMPOS_REPORTE:       campos del reporte, en el orden en que se muestran.
 * - EQUIVALENCIAS:        reglas para emparejar automáticamente campos del reporte con claves de las fuentes.
 * - MAPEO_PREDETERMINADO: mapeo por defecto; se calcula con EQUIVALENCIAS sobre su fuente principal.
 */

const FUENTES_PROYECTO = [
  {
    id: 'leads',
    nombre: 'Leads',
    // 'api' = consumo REST; 'json' = respuesta JSON pegada
    tipo: 'json',
    json: JSON.stringify(DATOS_EJEMPLO, null, 2),
    url: '',
    metodo: 'GET',
    // Encabezados y cuerpo en JSON, p. ej. '{"Authorization": "Bearer <token>"}'
    encabezados: '',
    cuerpo: '',
    // Si la API envuelve la lista en un objeto, p. ej. { "data": { "items": [...] } }, ruta hasta ella: 'data.items'
    rutaDatos: '',
    // Clave con la que los registros de esta fuente se unen con los de las demás
    campoId: 'id',
    // Si hay varios registros con el mismo Id, clave por la que se ordenan (define el primero y el último)
    campoOrden: '',
  },
  // Ejemplo de un consumo REST:
  // {
  //   id: 'gestiones', nombre: 'Gestiones', tipo: 'api',
  //   url: 'https://servidor/api/gestiones', metodo: 'GET',
  //   encabezados: '{"Authorization": "Bearer <token>"}', cuerpo: '',
  //   rutaDatos: 'data', campoId: 'leadId', campoOrden: 'fechaGestion',
  // },
];

const MAPEO_PREDETERMINADO = {
  id: 'predeterminado',
  nombre: 'Mapeo por defecto',
  fuentePrincipal: 'leads',
};

const CAMPOS_REPORTE = [
  'ID_Lead',
  'Id_BDorigen',
  'Origen',
  'Categoria_(Canal_Creación)',
  'Campaña_(Creación)',
  'AdGroup',
  'Publicación',
  'Telefono_de_contacto',
  'Campaña_(marcacion_Out-In)',
  'Fecha_y_hora_creacion_del_lead',
  'Fecha_y_hora_Primer_Conversion',
  'Fecha_y_hora_Ultima_Conversion',
  'Resultado_discador_Ultima_Gestion',
  'Numero_de_Llamadas_intentos',
  'Numero_de_Llamadas_exito',
  'Fecha_y_Hora_ultimo_contacto_WA',
  'Base_Origen',
  'Cliente_Nombre_Gestion',
  'Cliente_Apellidos_Gestion',
  'nombre_comercial',
  'giro',
  'descripcion_actividad',
  'tipo_persona',
  'rfc_comercio',
  'nombre_rl',
  'email',
  'telefono',
  'tipo_tramite',
  'referencias',
  'comentario_instalacion',
  'oferta_disponible',
  'terminal',
  'num_terminales',
  'dir_comercial',
  'calle_num_comercial',
  'cp_comercial',
  'colonia_comercial',
  'ciudad_comercial',
  'estado_comercial',
  'doc_estados_cuenta',
  'doc_csf',
  'doc_id_oficial',
  'doc_acta',
  'doc_fotografias',
  'promotor',
  'afiliacion',
  'fecha_afiliacion',
  'num_ot',
  'fecha_ot',
  'msi_alta',
  'msi_prosa',
  'msi_otros',
  'amex',
  'cashback',
  'seg_afiliacion',
  'seg_fecha',
  'seg_accion',
  'seg_status',
  'seg_motivo',
  'seg_descripcion',
  'seg_compromiso',
  'seg_atraso',
  'seg_resultado',
  'seg_agente',
  'seg_evidencia',
  'seg_notas',
  'Agente_1a_Gestion',
  'Fecha_y_Hora_Primera_Gestion',
  'Fecha y hora de primer llamada',
  'Tiempo(seg)_Primera_Gestion',
  'SubCalificacion_Primera_Gestion',
  'Agente_Ultima_Gestion',
  'Fecha_y_Hora_Ultima_Gestion',
  'Tiempo(seg)_Ultima_Gestion',
  'SubCalificacion_Ultima_Gestion',
  'Agente_Gestion_Negocio',
  'Fecha_y_Hora_Gestion_Negocio',
  'MES_Neg',
  'DIA_Neg',
  'HORA_Neg',
  'Tiempo(seg)_Gestion_Negocio',
  'SubCalificacion_Gestion_Negocio',
  'Calificacion_Gestion_Negocio',
  'Agente_Genera_Agenda',
  'Fecha_y_Hora_Proxima_Agenda',
  'Tipo de Accion_Gestion_Negocio',
  'Comentarios_Formulario',
];

/**
 * Los campos que se llaman igual que la clave de la fuente (sin importar mayúsculas, tildes,
 * espacios, guiones o guiones bajos) se emparejan solos y no necesitan estar aquí
 * (giro, email, rfc_comercio, doc_csf, seg_motivo, ...).
 *
 * Si la clave indicada no viene en la fuente, se intenta emparejar el campo por su nombre.
 */
const EQUIVALENCIAS = {
  // Equivalencias directas
  'ID_Lead': 'id',
  'Categoria_(Canal_Creación)': 'createdByCampaignCategory',
  'Campaña_(Creación)': 'createdByCampaignId',
  'AdGroup': 'createdByClickAdGroup',
  'Telefono_de_contacto': 'phone',
  'Fecha_y_hora_creacion_del_lead': 'createdDate',
  'Fecha_y_hora_Ultima_Conversion': 'lastConversionEventDate',
  'Resultado_discador_Ultima_Gestion': 'lastCallEventResult',
  'Cliente_Nombre_Gestion': 'firstname',
  'Cliente_Apellidos_Gestion': 'lastname',
  'nombre_rl': 'Representante Legal',
  'dir_comercial': 'Direccion Comercial',
  'calle_num_comercial': 'Calle y Numero Comercial',
  'cp_comercial': 'Codigo Postal Comercial',
  'Fecha_y_Hora_Primera_Gestion': 'firstManagedCallEventDate',
  'Fecha y hora de primer llamada': 'firstCallEventDate',
  'Fecha_y_Hora_Ultima_Gestion': 'lastManagedCallEventDate',
  'Comentarios_Formulario': 'comments',

  // Equivalencias inferidas por el significado del nombre: validar con el negocio
  'Id_BDorigen': 'idRegistro',
  'Origen': 'createdBySourceId',
  'Campaña_(marcacion_Out-In)': 'lastEventCampaign',
  'Numero_de_Llamadas_intentos': 'INTQLLAMADOS',
  'Base_Origen': 'Fuente',
  'nombre_comercial': 'Nombre del negocio',
  'telefono': 'phone',
  'seg_afiliacion': 'AFILIACIÓN',
  'seg_fecha': 'FECHA DE CREACIÓN',
  'seg_accion': 'TIPO DE ACCIÓN',
  'seg_status': 'STATUS',
  'seg_atraso': 'DÍAS DE ATRASO',
  'SubCalificacion_Ultima_Gestion': 'select-subcalificacion',
};
