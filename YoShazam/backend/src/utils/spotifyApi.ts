export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  ownerName: string;
  trackCount: number;
  url: string;
}

interface SpotifyPaginatedResponse<T> {
  items: Array<T | null>;
  next: string | null;
}

interface SpotifySearchPlaylistsResponse {
  playlists: SpotifyPaginatedResponse<SpotifyPlaylistItem>;
}

interface SpotifyPlaylistItem {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  images?: Array<{ url: string }> | null;
  owner?: { display_name: string | null } | null;
  tracks?: { total: number } | null;
  external_urls?: { spotify?: string } | null;
}

interface SpotifyTrackItem {
  track: {
    id: string | null;
    name: string;
    preview_url: string | null;
    artists: Array<{ name: string }>;
    album: { images: Array<{ url: string }> };
  } | null;
}

interface SpotifyClientCredentialsResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SpotifyTrackSummary {
  id: string;
  title: string;
  artists: string;
  previewUrl: string | null;
  albumImageUrl: string | null;
  sourcePlaylistId: string;
}

export interface SpotifyProfileSummary {
  id: string;
  displayName: string | null;
  email?: string;
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: string,
  ) {
    super(message);
  }
}

let clientCredentialsToken: { accessToken: string; expiresAt: number } | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function parseSpotifyPlaylistId(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(/playlist\/([A-Za-z0-9]+)/);

  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);

  if (uriMatch?.[1]) {
    return uriMatch[1];
  }

  return /^[A-Za-z0-9]+$/.test(trimmed) ? trimmed : null;
}

async function getClientCredentialsToken() {
  if (clientCredentialsToken && clientCredentialsToken.expiresAt > Date.now() + 30_000) {
    return clientCredentialsToken.accessToken;
  }

  const clientId = getRequiredEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = getRequiredEnv('SPOTIFY_CLIENT_SECRET');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SpotifyApiError(`Spotify client credentials failed: ${response.status}`, response.status, details);
  }

  const payload = (await response.json()) as SpotifyClientCredentialsResponse;
  clientCredentialsToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return clientCredentialsToken.accessToken;
}

async function fetchSpotifyJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new SpotifyApiError(`Spotify request failed: ${response.status}`, response.status, details);
  }

  return (await response.json()) as T;
}

function toPlaylistSummary(playlist: SpotifyPlaylistItem | null): SpotifyPlaylistSummary | null {
  if (!playlist?.id || !playlist.name) {
    return null;
  }

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? '',
    imageUrl: playlist.images?.[0]?.url ?? null,
    ownerName: playlist.owner?.display_name ?? 'Spotify',
    trackCount: playlist.tracks?.total ?? 0,
    url: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
  };
}

function isPlaylistSummary(playlist: SpotifyPlaylistSummary | null): playlist is SpotifyPlaylistSummary {
  return Boolean(playlist);
}

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfileSummary> {
  const profile = await fetchSpotifyJson<{ id: string; display_name: string | null; email?: string }>('https://api.spotify.com/v1/me', accessToken);

  return {
    id: profile.id,
    displayName: profile.display_name,
    email: profile.email,
  };
}

export async function fetchSpotifyProfilePlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
  let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';
  const playlists: SpotifyPlaylistSummary[] = [];

  while (url) {
    const requestUrl = url;
    const payload: SpotifyPaginatedResponse<SpotifyPlaylistItem> = await fetchSpotifyJson(requestUrl, accessToken);

    playlists.push(...payload.items.map(toPlaylistSummary).filter(isPlaylistSummary));
    url = payload.next;
  }

  return playlists;
}

export async function searchPublicPlaylists(query: string): Promise<SpotifyPlaylistSummary[]> {
  const trimmedQuery = query.trim() || 'top hits';
  const accessToken = await getClientCredentialsToken();
  const params = new URLSearchParams({
    q: trimmedQuery,
    type: 'playlist',
    limit: '24',
  });
  const payload = await fetchSpotifyJson<SpotifySearchPlaylistsResponse>(
    `https://api.spotify.com/v1/search?${params.toString()}`,
    accessToken,
  );

  return payload.playlists.items.map(toPlaylistSummary).filter(isPlaylistSummary);
}

export async function fetchPublicPlaylistSummary(playlistInput: string): Promise<SpotifyPlaylistSummary> {
  const playlistId = parseSpotifyPlaylistId(playlistInput);

  if (!playlistId) {
    throw new SpotifyApiError('Invalid Spotify playlist URL or ID', 400, 'Invalid playlist URL or ID');
  }

  const accessToken = await getClientCredentialsToken();
  const playlist = await fetchSpotifyJson<SpotifyPlaylistItem>(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,owner(display_name),tracks(total),external_urls`,
    accessToken,
  );
  const summary = toPlaylistSummary(playlist);

  if (!summary) {
    throw new SpotifyApiError('Invalid Spotify playlist response', 502, 'Invalid Spotify playlist response');
  }

  return summary;
}

async function fetchPlaylistTracksWithToken(accessToken: string, playlistId: string): Promise<SpotifyTrackSummary[]> {
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  const tracks: SpotifyTrackSummary[] = [];

  while (url) {
    const requestUrl = url;
    const payload: SpotifyPaginatedResponse<SpotifyTrackItem> = await fetchSpotifyJson(requestUrl, accessToken);

    tracks.push(
      ...payload.items
        .map((item) => item?.track ?? null)
        .filter((track): track is NonNullable<SpotifyTrackItem['track']> => Boolean(track?.id))
        .map((track) => ({
          id: track.id as string,
          title: track.name,
          artists: track.artists.map((artist) => artist.name).join(', '),
          previewUrl: track.preview_url,
          albumImageUrl: track.album.images[0]?.url ?? null,
          sourcePlaylistId: playlistId,
        })),
    );

    url = payload.next;
  }

  return tracks;
}

export async function fetchPlaylistTracks(accessToken: string, playlistId: string): Promise<SpotifyTrackSummary[]> {
  try {
    return await fetchPlaylistTracksWithToken(accessToken, playlistId);
  } catch (error) {
    if (error instanceof SpotifyApiError && (error.status === 401 || error.status === 403)) {
      const clientAccessToken = await getClientCredentialsToken();
      return fetchPlaylistTracksWithToken(clientAccessToken, playlistId);
    }

    throw error;
  }
}