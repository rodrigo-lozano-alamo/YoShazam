import cors from 'cors';
import express from 'express';
import { spotifyAuthRouter } from './routes/spotifyAuth';
import { spotifyApiRouter } from './routes/spotifyApi';
import { healthRouter } from './routes/health';

/** Orígenes permitidos: CLIENT_URL tal cual y su equivalente con localhost/127.0.0.1. */
export function getAllowedOrigins() {
  const clientUrl = process.env.CLIENT_URL;

  if (!clientUrl) {
    return true;
  }

  const origins = new Set([clientUrl.replace(/\/$/, '')]);

  for (const origin of Array.from(origins)) {
    origins.add(origin.replace('://127.0.0.1', '://localhost'));
    origins.add(origin.replace('://localhost', '://127.0.0.1'));
  }

  return Array.from(origins);
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: getAllowedOrigins(),
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth/spotify', spotifyAuthRouter);
  app.use('/api/spotify', spotifyApiRouter);

  return app;
}
