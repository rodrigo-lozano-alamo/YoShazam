import { Router } from 'express';
import {
  buildSpotifyAuthorizeUrl,
  consumeSpotifyState,
  exchangeSpotifyCodeForToken,
  generateSpotifyState,
  getFrontendUrl,
} from '../utils/spotifyOAuth';

export const spotifyAuthRouter = Router();

spotifyAuthRouter.get('/login', (_request, response) => {
  const state = generateSpotifyState();
  const authorizeUrl = buildSpotifyAuthorizeUrl(state);

  response.redirect(authorizeUrl);
});

spotifyAuthRouter.get('/callback', async (request, response) => {
  const error = typeof request.query.error === 'string' ? request.query.error : null;
  const code = typeof request.query.code === 'string' ? request.query.code : null;
  const state = typeof request.query.state === 'string' ? request.query.state : null;

  if (error) {
    return response.redirect(`${getFrontendUrl()}/?spotify_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !consumeSpotifyState(state)) {
    return response.redirect(`${getFrontendUrl()}/?spotify_error=state_mismatch`);
  }

  try {
    const token = await exchangeSpotifyCodeForToken(code);
    const redirectUrl = new URL(getFrontendUrl());

    redirectUrl.search = new URLSearchParams({
      access_token: token.access_token,
      token_type: token.token_type,
      scope: token.scope,
      expires_in: String(token.expires_in),
      refresh_token: token.refresh_token ?? '',
    }).toString();

    return response.redirect(redirectUrl.toString());
  } catch {
    return response.redirect(`${getFrontendUrl()}/?spotify_error=token_exchange_failed`);
  }
});