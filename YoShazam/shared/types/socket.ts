export type GameMode = 'artist' | 'song';

export interface PlayerScore {
  id: string;
  name: string;
  score: number;
}

export interface SongOption {
  id: string;
  title: string;
  artist: string;
  previewUrl?: string | null;
}

export interface RoomState {
  id: string;
  hostId: string;
  players: PlayerScore[];
  mode: GameMode;
}
