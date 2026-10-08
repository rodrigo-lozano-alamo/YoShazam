import type { SpotifyPlaylistSummary, SpotifyTrackSummary } from '../utils/spotifyApi';

export type GamePromptType = 'song' | 'artist';

export interface RoomRoundPublic {
  roundNumber: number;
  totalRounds: number;
  promptType: GamePromptType;
  previewUrl: string | null;
  /** Pista visible: el título si se pregunta el artista, o el artista si se pregunta la canción. */
  hint: string;
  options: string[];
  endsAt: number;
}

export interface RoomPlayerInternal {
  socketId: string;
  name: string;
  accessToken: string;
  selectedPlaylist: SpotifyPlaylistSummary | null;
  score: number;
}

export interface RoomPlayerPublic {
  socketId: string;
  name: string;
  isHost: boolean;
  selectedPlaylist: SpotifyPlaylistSummary | null;
  score: number;
}

export interface RoomStatePublic {
  code: string;
  hostSocketId: string;
  started: boolean;
  phase: 'lobby' | 'playing' | 'finished';
  players: RoomPlayerPublic[];
  mixedTrackCount: number;
  currentRound: RoomRoundPublic | null;
  ranking: RoomPlayerPublic[];
}

export interface RoomGameState extends RoomStatePublic {
  mixedTracks: SpotifyTrackSummary[];
}
