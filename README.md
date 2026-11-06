# TripTracking

Cada persona crea un perfil, elige si quiere seguir vuelos, hospedaje, transporte, planes y eventos, y define cada cuánto se lee Gmail. El lector guarda solo los datos de la reserva (código, fechas, tramo, lugar, precio), no el cuerpo del correo.

La pestaña del sitio está en [travaglino.me/trips](https://travaglino.me/trips). Ahí la lectura corre mientras la página está abierta. Este servidor hace la misma lectura con la pestaña cerrada.

## Servidor

```bash
npm test
npm start
```

Abre `http://127.0.0.1:8787`. Variables:

| Variable | Uso |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Cliente OAuth de tipo aplicación web |
| `GOOGLE_CLIENT_SECRET` | Secreto de ese cliente |
| `PUBLIC_URL` | URL pública, sin barra final. El redirect es `{PUBLIC_URL}/api/auth/google/callback` |
| `APP_SECRET` | Cifra los tokens de Gmail. Si falta, se crea `data/app-secret` |
| `PORT` | Puerto. Por defecto `8787` |

En Google Cloud el redirect autorizado tiene que ser exactamente `{PUBLIC_URL}/api/auth/google/callback`. El alcance es `https://www.googleapis.com/auth/gmail.readonly`.

Sin esas variables el servidor igual deja crear perfiles y cargar el correo de ejemplo. No vincula Gmail hasta que estén.

## Pestaña del sitio

En `travaglino.me/trips` cada perfil vive en ese navegador. Para vincular Gmail hace falta un Client ID público (aplicación web) con origen `https://travaglino.me`. El token de acceso no se guarda en el disco: al recargar hay que vincular de nuevo, y la lectura periódica sigue el intervalo mientras la pestaña está abierta.
