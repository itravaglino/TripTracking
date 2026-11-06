# Viajes

Pestaña de reservas para [travaglino.me/trips](https://travaglino.me/trips). Cada persona autoriza su Gmail (solo lectura) y elige si se leen vuelos, hospedaje, transporte, planes y eventos, y cada cuánto.

La lectura corre al abrir la página cuando ya pasó el intervalo, con el botón «Leer ahora», o con `POST /api/cron` y el secreto `CRON_SECRET`.

## Google Cloud

En el cliente OAuth (aplicación web) hay que autorizar el origen del sitio y esta redirección:

`https://<host-del-servicio>/api/auth/callback`

Alcance: `https://www.googleapis.com/auth/gmail.readonly` más OpenID.

Claves del servicio, sin commitearlas: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`.
