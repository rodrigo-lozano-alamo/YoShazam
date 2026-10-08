import { Router } from 'express';
import { fetchSpotifyProfile, fetchSpotifyProfilePlaylists, SpotifyApiError } from '../utils/spotifyApi';

export const spotifyApiRouter = Router();

function getAccessToken(authHeader: string) {
  return authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
}

spotifyApiRouter.get('/playlists', async (request, response) => {
  const accessToken = getAccessToken(request.header('authorization') ?? '');

  if (!accessToken) {
    return response.status(401).json({ message: 'Missing Spotify access token' });
  }

  try {
    const playlists = await fetchSpotifyProfilePlaylists(accessToken);
    return response.json({ playlists });
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      console.error('Spotify playlists request failed', error.status, error.details);
      const detail = error.status === 403
        ? 'Spotify responded with 403. Comprueba que la cuenta propietaria de la app tenga Premium activo y que el usuario esté añadido en Users Management.'
        : `Spotify responded with ${error.status}`;

      return response.status(error.status).json({
        message: 'Unable to fetch Spotify playlists',
        detail,
        spotifyDetails: error.details,
      });
    }

    console.error('Unexpected playlists request failed', error);
    const detail = error instanceof Error ? error.message : 'Unknown backend error';
    return response.status(502).json({ message: 'Unable to fetch Spotify playlists', detail });
  }
});

spotifyApiRouter.get('/me', async (request, response) => {
  const accessToken = getAccessToken(request.header('authorization') ?? '');

  if (!accessToken) {
    return response.status(401).json({ message: 'Missing Spotify access token' });
  }

  try {
    const profile = await fetchSpotifyProfile(accessToken);
    return response.json({ profile });
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      console.error('Spotify profile request failed', error.status, error.details);
      return response.status(error.status).json({
        message: 'Unable to fetch Spotify profile',
        detail: `Spotify responded with ${error.status}`,
        spotifyDetails: error.details,
      });
    }

    console.error('Unexpected Spotify profile request failed', error);
    const detail = error instanceof Error ? error.message : 'Unknown backend error';
    return response.status(502).json({ message: 'Unable to fetch Spotify profile', detail });
  }
});