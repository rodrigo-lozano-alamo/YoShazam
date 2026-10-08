import type { SpotifyPlaylistSummary } from '../services/spotifyAuth';

export type GamePromptType = 'song' | 'artist';

export interface RoomRoundState {
  roundNumber: number;
  totalRounds: number;
  promptType: GamePromptType;
  previewUrl: string | null;
  trackTitle: string;
  trackArtist: string;
  options: string[];
  endsAt: number;
}

export interface RoomPlayer {
  socketId: string;
  name: string;
  isHost: boolean;
  selectedPlaylist: SpotifyPlaylistSummary | null;
}

export interface RoomState {
  code: string;
  hostSocketId: string;
  started: boolean;
  phase: 'lobby' | 'playing' | 'finished';
  players: RoomPlayer[];
  mixedTrackCount: number;
  currentRound: RoomRoundState | null;
}
