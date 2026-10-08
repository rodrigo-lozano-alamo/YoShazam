const spotifyStateStore = new Map<string, number>();
const stateTtlMs = 10 * 60 * 1000;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getFrontendUrl() {
  return process.env.FRONTEND_URL ?? process.env.CLIENT_URL ?? 'http://127.0.0.1:5500';
}

export function generateSpotifyState() {
  const state = crypto.randomUUID();
  spotifyStateStore.set(state, Date.now() + stateTtlMs);
  return state;
}

export function consumeSpotifyState(state: string) {
  const expiresAt = spotifyStateStore.get(state);
  spotifyStateStore.delete(state);

  return typeof expiresAt === 'number' && expiresAt > Date.now();
}

export function buildSpotifyAuthorizeUrl(state: string) {
  const clientId = getRequiredEnv('SPOTIFY_CLIENT_ID');
  const redirectUri = getRequiredEnv('SPOTIFY_REDIRECT_URI');
  const scope = [
    'user-read-email',
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'true',
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export async function exchangeSpotifyCodeForToken(code: string): Promise<SpotifyTokenResponse> {
  const clientId = getRequiredEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = getRequiredEnv('SPOTIFY_CLIENT_SECRET');
  const redirectUri = getRequiredEnv('SPOTIFY_REDIRECT_URI');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error('Spotify token exchange failed');
  }

  return (await response.json()) as SpotifyTokenResponse;
}