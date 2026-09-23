/**
 * Servidor local del reporte: publica la página y la ruta /api/fuente, que consulta las fuentes de
 * datos con las credenciales del archivo .env (así nunca llegan al navegador).
 *
 * Uso: npm start   (o: node servidor.js). Requiere Node.js 18 o superior.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

cargarArchivoEnv(path.join(__dirname, '.env'));
const consultarFuente = require('./api/fuente');

const PUERTO = Number(process.env.PUERTO) || 3000;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (ruta === '/api/fuente') return consultarFuente(req, res);

  // Solo se publican la página y las carpetas css/ y js/: nunca el .env ni el código del servidor
  const archivo = ruta === '/' ? 'index.html' : ruta.slice(1);
  if (archivo !== 'index.html' && !/^(css|js)\/[\w.-]+$/.test(archivo)) return noEncontrado(res);

  fs.readFile(path.join(__dirname, archivo), (error, datos) => {
    if (error) return noEncontrado(res);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    res.end(datos);
  });
}).listen(PUERTO, () => console.log(`Reporte disponible en http://localhost:${PUERTO}`));

function noEncontrado(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
}

/** Lee las variables del archivo .env (líneas NOMBRE=valor) sin reemplazar las que ya existen. */
function cargarArchivoEnv(ruta) {
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    if (linea.trim().startsWith('#')) continue;
    const partes = linea.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!partes) continue;
    let [, nombre, valor] = partes;
    if (/^(['"]).*\1$/.test(valor)) valor = valor.slice(1, -1);
    if (!(nombre in process.env)) process.env[nombre] = valor;
  }
}
