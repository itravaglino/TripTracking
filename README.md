# Viajes — travaglino.me/trips

Cada persona autoriza su propia cuenta de Gmail. El servicio revisa el correo en el intervalo que esa persona eligió y guarda solo las reservas de las categorías activas: vuelos, hospedaje, transporte, planes y, si lo prende, eventos. Los eventos arrancan apagados.

La interfaz vive en `/trips`. En [travaglino.me](https://travaglino.me) esa ruta es una pestaña más del sitio. La lectura periódica no puede correr en GitHub Pages: hace falta este servicio, porque el token de Gmail se guarda cifrado en el servidor y el correo no se muestra entero.

## Qué hace

- El enlace con Google pide `gmail.readonly` más el perfil, para saber qué cuenta es.
- La primera lectura mira cerca de un año de correos que parecen reservas. Después mira unas tres semanas.
- Reconoce JSON-LD de schema.org (`FlightReservation`, `LodgingReservation`, tren, auto, tours, eventos) y, si no hay datos estructurados, textos en español e inglés con código de reserva, vuelo y fechas.
- Las reservas cercanas se agrupan en un viaje.
- Desconectar revoca el token y borra las reservas guardadas.
- Sin credenciales de Google, «Ver con datos de muestra» usa el mismo lector sobre correos ficticios.

## Google Cloud

1. En Google Cloud, activar la API de Gmail y crear un cliente OAuth de tipo aplicación web.
2. URIs de redirección: `https://<origen-del-servicio>/api/auth/google/callback` y, para probar en esta máquina, `http://127.0.0.1:3000/api/auth/google/callback`.
3. `gmail.readonly` es un alcance restringido. Mientras la app de Google esté en modo de prueba, hay que agregar como usuarios de prueba a cada cuenta que vaya a conectarse.
4. Cargar en los secretos de la app, sin pegarlos en el chat ni en un archivo del repositorio:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `TOKEN_ENCRYPTION_KEY` (una frase de al menos 16 caracteres, generada al azar)
   - `CRON_SECRET` (opcional). Si está, `POST /api/cron` con `Authorization: Bearer <ese valor>` lee a quien ya tenga una revisión vencida.

Abrir la página también dispara la lectura cuando ya toca, así que el intervalo se cumple aunque nadie llame a `/api/cron`.

Para que la pestaña de travaglino.me hable con este servicio, `public/trips/reader.json` (y la copia en el sitio) lleva `{ "api": "https://<origen-del-servicio>" }`. Vacío, la pestaña muestra el perfil y los datos de muestra en el navegador.

## Local

```bash
npm install
npm test
npm run dev
```

La app queda en `http://127.0.0.1:3000/trips`. Sin `DATABASE_URL` usa Postgres en memoria. No hace falta un `.env` para ver los datos de muestra.
