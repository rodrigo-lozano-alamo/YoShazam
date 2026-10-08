# YoShazam

Estructura base para una app web tipo juego musical con frontend en React + Vite y backend en Node.js + Express + Socket.io.

## Estructura propuesta

```text
frontend/
  src/
    assets/
    components/
    hooks/
    layouts/
    pages/
    router/
    services/
    styles/
    types/
backend/
  src/
    config/
    controllers/
    middleware/
    models/
    routes/
    sockets/
    types/
    utils/
shared/
  constants/
```

## Stack

- Frontend: React, Vite, Tailwind CSS, React Router
- Backend: Node.js, Express, Socket.io
- Compartido: tipos y constantes comunes

## Siguiente paso

Implementar el frontend base, el servidor Express y la conexión en tiempo real con Socket.io.

## Spotify OAuth

1. Entra en https://developer.spotify.com/dashboard e inicia sesión con tu cuenta de Spotify.
2. Crea una nueva app desde el panel.
3. Define nombre y descripción.
4. En Redirect URI añade `http://127.0.0.1:3001/api/auth/spotify/callback`.
5. Acepta los términos y guarda la app.
6. Copia el Client ID y el Client Secret.
7. Coloca esos valores en `backend/.env` o en tu entorno local.

Variables esperadas en backend:

- `PORT`
- `CLIENT_URL`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`

El frontend inicia el login desde `/` y consume el resultado en `/auth/spotify/callback`.

## Guía Paso A Paso

Paso 1: configura el backend.

Archivo a tocar: `backend/.env`

Debes poner estos valores reales:

- `PORT=3001`
- `CLIENT_URL=http://127.0.0.1:5500`
- `FRONTEND_URL=http://127.0.0.1:5500`
- `SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/spotify/callback`
- `SPOTIFY_CLIENT_ID=9178d879cc5a4c14bee72f0cccb10f07`
- `SPOTIFY_CLIENT_SECRET=TU_CLIENT_SECRET_REAL`

Si no quieres guardar el secret en un archivo, escríbelo solo en tu entorno local y no lo compartas.

Comprobación de este paso:

1. Abre `http://127.0.0.1:3001/health` en el navegador.
2. Debe responder `{ "status": "ok" }`.
3. Abre `http://127.0.0.1:3001/api/auth/spotify/login`.
4. Debe redirigirte a Spotify, no mostrar error de conexión.

Paso 2: comprueba el frontend.

Archivo a abrir: `frontend/index.html`

Debes abrirlo con Live Server desde la carpeta `frontend` y entrar por `http://127.0.0.1:5500`.

Comprobación de este paso:

1. Debe verse la pantalla principal vistosa.
2. El botón "Iniciar sesión con Spotify" debe llevar al backend en `127.0.0.1:3001`.

Paso 3: valida el callback.

Archivo implicado: `backend/src/routes/spotifyAuth.ts`

Comprobación de este paso:

1. Tras autorizar Spotify, debes volver al frontend con el token en la URL.
2. El frontend guarda la sesión y te lleva al panel de playlists.

Si un paso falla, no avances al siguiente: dime exactamente cuál fue y lo corregimos antes de seguir.

## Probar sin `localhost`

Si quieres comprobarlo sin usar `localhost`, tienes estas opciones:

1. `127.0.0.1`
  - Abre el frontend con `http://127.0.0.1:5500`
  - Deja el backend en `http://127.0.0.1:3001`
  - En Spotify Dashboard usa exactamente `http://127.0.0.1:3001/api/auth/spotify/callback`

2. IP de la red local
  - Abre el frontend con `http://TU_IP_LOCAL:5500`
  - Cambia `FRONTEND_URL` y `CLIENT_URL` a esa misma IP
  - Registra en Spotify la redirect URI exacta con esa IP

3. Túnel público como ngrok o Cloudflare Tunnel
  - Expón el backend con una URL pública HTTPS
  - Usa esa URL como `SPOTIFY_REDIRECT_URI`
  - Recuerda que Spotify exige que la redirect URI coincida exactamente, carácter por carácter

Si al pulsar iniciar sesión ves “rechazó la conexión”, lo más probable es que el backend no esté levantado en el puerto 3001 o que la redirect URI no coincida exactamente con la configurada en Spotify.
