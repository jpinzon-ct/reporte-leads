# {{NOMBRE}}

Reporte independiente exportado el {{FECHA}} desde el configurador de reportes. Muestra el reporte tal
como quedó configurado (fuentes, mapeo, vista, campos y filtros iniciales), sin opciones para editar
fuentes ni mapeos.

## Fuentes de datos

{{FUENTES}}

## Credenciales (archivo `.env`)

La URL y las credenciales de las fuentes API **no están en el código de la página**: el navegador solo
pide los datos a este proyecto (`/api/fuente?id=...`) y es el servidor el que consulta cada endpoint con
las variables del archivo `.env`. Así el token nunca llega al navegador.

Variables que usa este reporte:

{{VARIABLES}}

- `.env` está en `.gitignore` y `.vercelignore`: no se sube a ningún repositorio ni a Vercel.
- `.env.example` tiene los mismos nombres sin valores, como referencia.
- `<ID>_ENCABEZADOS` y `<ID>_CUERPO` van en JSON de una sola línea, por ejemplo
  `FUENTE_GESTIONES_ENCABEZADOS={"Authorization":"Bearer abc123"}`.

## Ejecutarlo en tu equipo

Requiere [Node.js](https://nodejs.org) 18 o superior (no necesita instalar dependencias).

```bash
npm start
```

y abre http://localhost:3000. Para usar otro puerto, agrega `PUERTO=8080` al `.env`.

## Publicarlo en Vercel

1. Publica la carpeta con `vercel deploy --prod` (o impórtala desde un repositorio de GitHub).
2. En el proyecto de Vercel, ve a *Settings → Environment Variables* y crea las variables de arriba con
   sus valores (los mismos del `.env`).
3. Vuelve a desplegar para que tomen efecto.

Vercel publica la página y convierte `api/fuente.js` en la función que consulta las fuentes.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `index.html`, `css/`, `js/` | La página del reporte |
| `js/config.js` | Fuentes (sin credenciales), mapeo, campos y preferencias iniciales del reporte |
| `api/fuente.js` | Consulta las fuentes con las credenciales del `.env` |
| `servidor.js` | Servidor local (`npm start`) |
| `.env` / `.env.example` | Credenciales de las fuentes / plantilla sin valores |
