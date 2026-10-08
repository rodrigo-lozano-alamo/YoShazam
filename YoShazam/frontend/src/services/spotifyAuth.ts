const spotifySessionKey = 'yoshazam.spotify.session';
const selectedPlaylistKey = 'yoshazam.spotify.selectedPlaylist';

export interface SpotifySession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  ownerName: string;
  trackCount: number;
  url: string;
}

interface StoreResult {
  ok: boolean;
  errorMessage: string;
}

function getApiBaseUrl() {
  return (window as any).__YOSHZAM_BACKEND_BASE__ ?? `${window.location.protocol}//${window.location.hostname}:3001`;
}

export function getSpotifyLoginUrl() {
  return `${getApiBaseUrl()}/api/auth/spotify/login`;
}

export function getStoredSpotifySession() {
  const raw = window.localStorage.getItem(spotifySessionKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SpotifySession;
  } catch {
    return null;
  }
}

export function clearSpotifySession() {
  window.localStorage.removeItem(spotifySessionKey);
}

export function getStoredSpotifyPlaylist() {
  const raw = window.localStorage.getItem(selectedPlaylistKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SpotifyPlaylistSummary;
  } catch {
    return null;
  }
}

export function storeSpotifyPlaylist(playlist: SpotifyPlaylistSummary) {
  window.localStorage.setItem(selectedPlaylistKey, JSON.stringify(playlist));
}

export function storeSpotifySessionFromHash(hash: string): StoreResult {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const error = params.get('error');

  if (error) {
    return {
      ok: false,
      errorMessage: `Spotify devolvió un error: ${error}`,
    };
  }

  const accessToken = params.get('access_token');
  const tokenType = params.get('token_type');
  const scope = params.get('scope');
  const expiresIn = params.get('expires_in');

  if (!accessToken || !tokenType || !scope || !expiresIn) {
    return {
      ok: false,
      errorMessage: 'No se pudo leer el access token desde la respuesta de Spotify.',
    };
  }

  const refreshToken = params.get('refresh_token') ?? '';
  const session: SpotifySession = {
    accessToken,
    refreshToken,
    tokenType,
    scope,
    expiresAt: Date.now() + Number(expiresIn) * 1000,
  };

  window.localStorage.setItem(spotifySessionKey, JSON.stringify(session));
  return { ok: true, errorMessage: '' };
}