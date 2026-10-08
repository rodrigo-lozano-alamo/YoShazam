import type { SpotifyPlaylistSummary, SpotifySession } from './spotifyAuth';

const apiBaseUrl = (window as any).__YOSHZAM_BACKEND_BASE__ ?? `${window.location.protocol}//${window.location.hostname}:3001`;

async function readSpotifyPlaylistsResponse(response: Response, fallbackMessage: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string; detail?: string; playlists?: SpotifyPlaylistSummary[] } | null;

  if (!response.ok) {
    throw new Error(payload?.detail ?? payload?.message ?? fallbackMessage);
  }

  return payload?.playlists ?? [];
}

async function readSpotifyPlaylistResponse(response: Response, fallbackMessage: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string; detail?: string; playlist?: SpotifyPlaylistSummary } | null;

  if (!response.ok) {
    throw new Error(payload?.detail ?? payload?.message ?? fallbackMessage);
  }

  return payload?.playlist ?? null;
}

export async function fetchPublicSpotifyPlaylist(reference: string) {
  const response = await fetch(`${apiBaseUrl}/api/spotify/public-playlist?url=${encodeURIComponent(reference)}`);
  return readSpotifyPlaylistResponse(response, 'No se pudo cargar esa playlist pública.');
}

export async function searchPublicSpotifyPlaylists(query: string) {
  const response = await fetch(`${apiBaseUrl}/api/spotify/search-playlists?q=${encodeURIComponent(query)}`);
  return readSpotifyPlaylistsResponse(response, 'No se pudieron buscar playlists públicas.');
}

export async function fetchSpotifyPlaylists(session: SpotifySession) {
  const response = await fetch(`${apiBaseUrl}/api/spotify/playlists`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  return readSpotifyPlaylistsResponse(response, 'No se pudieron cargar las playlists de Spotify.');
}