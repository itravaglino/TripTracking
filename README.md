# Viajes en travaglino.me/trips

Cada persona arma su perfil en el navegador, autoriza Gmail en solo lectura y elige qué seguir: vuelos, hospedaje, transporte y eventos. El intervalo de lectura es propio de cada perfil.

Los mails se interpretan en el navegador. El token de Google queda en la pestaña (`sessionStorage`) y las reservas en `localStorage`. No hay un servidor que guarde la casilla.

La lectura automática corre con `/trips` abierto, porque GitHub Pages no puede guardar un refresh token. Al volver a la pestaña, si ya pasó el intervalo, lee enseguida.

## Google Cloud

1. En Google Cloud, creá un proyecto y habilitá la Gmail API.
2. Pantalla de consentimiento: alcance `https://www.googleapis.com/auth/gmail.readonly`.
3. Cliente OAuth de tipo **aplicación web**.
4. Orígenes de JavaScript autorizados: `https://travaglino.me` y, para probar, `http://127.0.0.1:43148`.
5. Pegá el client ID (termina en `.apps.googleusercontent.com`) en el alta del perfil.

Sin client ID podés recorrer la página con **correos de ejemplo**.

```bash
npm install
npm test
npm run dev
```

La página queda en `http://127.0.0.1:43148/trips/`.
