/**
 * Consulta una fuente de datos del reporte con sus credenciales y devuelve la respuesta al navegador.
 *
 * Cada fuente se configura con variables de entorno (archivo .env en local; en Vercel, en
 * Settings → Environment Variables), donde <ID> es el id de la fuente en mayúsculas:
 *   FUENTE_<ID>_URL          dirección del endpoint
 *   FUENTE_<ID>_METODO       GET, POST o PUT (por defecto GET)
 *   FUENTE_<ID>_ENCABEZADOS  encabezados en JSON, p. ej. {"Authorization":"Bearer ..."}
 *   FUENTE_<ID>_CUERPO       cuerpo en JSON para POST/PUT (opcional)
 *
 * El navegador solo envía el id de la fuente: la URL y las credenciales nunca salen del servidor.
 */
module.exports = async function consultarFuente(req, res) {
  const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
  const prefijo = `FUENTE_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_`;
  const url = process.env[`${prefijo}URL`];
  if (!id || !url) {
    return responder(res, 404, { error: `La fuente «${id}» no está configurada: falta ${prefijo}URL en el archivo .env.` });
  }

  let encabezados;
  try {
    encabezados = JSON.parse(process.env[`${prefijo}ENCABEZADOS`] || '{}');
  } catch {
    return responder(res, 500, { error: `${prefijo}ENCABEZADOS no es un JSON válido.` });
  }
  const cuerpo = process.env[`${prefijo}CUERPO`] || undefined;

  try {
    const respuesta = await fetch(url, {
      method: process.env[`${prefijo}METODO`] || 'GET',
      headers: { Accept: 'application/json', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...encabezados },
      body: cuerpo,
    });
    res.statusCode = respuesta.status;
    res.setHeader('Content-Type', respuesta.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await respuesta.text());
  } catch (error) {
    responder(res, 502, { error: `No se pudo consultar la fuente «${id}»: ${error.message}` });
  }
};

function responder(res, estado, datos) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(datos));
}
