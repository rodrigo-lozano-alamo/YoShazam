import type { RoomGameState, RoomPlayerInternal, RoomPlayerPublic, RoomRoundPublic, RoomStatePublic } from '../types/rooms';

interface RoomRecord {
  code: string;
  hostSocketId: string;
  started: boolean;
  phase: 'lobby' | 'playing' | 'finished';
  players: RoomPlayerInternal[];
  mixedTracks: RoomGameState['mixedTracks'];
  currentTrackIndex: number;
  currentRound: RoomRoundPublic | null;
  currentCorrectAnswer: string | null;
  correctAnswerOrder: string[];
  roundGuesses: string[];
  roundTimeoutId: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomRecord>();

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

function createRoomCode() {
  return Array.from({ length: 6 }, () => Math.random().toString(36).slice(2, 3).toUpperCase()).join('');
}

function mapPlayers(room: RoomRecord): RoomPlayerPublic[] {
  return room.players.map((player) => ({
    socketId: player.socketId,
    name: player.name,
    isHost: player.socketId === room.hostSocketId,
    selectedPlaylist: player.selectedPlaylist,
    score: player.score,
  }));
}

function mapRanking(room: RoomRecord): RoomPlayerPublic[] {
  return mapPlayers(room).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.name.localeCompare(right.name);
  });
}

function toPublicRoom(room: RoomRecord): RoomStatePublic {
  return {
    code: room.code,
    hostSocketId: room.hostSocketId,
    started: room.started,
    phase: room.phase,
    players: mapPlayers(room),
    mixedTrackCount: room.mixedTracks.length,
    currentRound: room.currentRound,
    ranking: mapRanking(room),
  };
}

export function createRoom(payload: RoomPlayerInternal) {
  const code = createRoomCode();
  const room: RoomRecord = {
    code,
    hostSocketId: payload.socketId,
    started: false,
    phase: 'lobby',
    players: [payload],
    mixedTracks: [],
    currentTrackIndex: 0,
    currentRound: null,
    currentCorrectAnswer: null,
    correctAnswerOrder: [],
    roundGuesses: [],
    roundTimeoutId: null,
  };

  rooms.set(code, room);
  return toPublicRoom(room);
}

export function joinRoom(roomCode: string, payload: RoomPlayerInternal) {
  const normalizedCode = normalizeRoomCode(roomCode);
  const room = rooms.get(normalizedCode);

  if (!room) {
    return null;
  }

  const existingIndex = room.players.findIndex((player) => player.socketId === payload.socketId);

  if (existingIndex >= 0) {
    payload.score = room.players[existingIndex].score;
    room.players[existingIndex] = payload;
  } else {
    room.players.push(payload);
  }

  return toPublicRoom(room);
}

export function updatePlayerSelection(roomCode: string, socketId: string, selectedPlaylist: RoomPlayerInternal['selectedPlaylist']) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return null;
  }

  const player = room.players.find((entry) => entry.socketId === socketId);

  if (!player) {
    return null;
  }

  player.selectedPlaylist = selectedPlaylist;
  return toPublicRoom(room);
}

export function getRoom(roomCode: string) {
  const room = rooms.get(normalizeRoomCode(roomCode));
  return room ? toPublicRoom(room) : null;
}

export function getRoomRecord(roomCode: string) {
  return rooms.get(normalizeRoomCode(roomCode)) ?? null;
}

export function isRoomHost(roomCode: string, socketId: string) {
  return rooms.get(normalizeRoomCode(roomCode))?.hostSocketId === socketId;
}

export function removePlayer(socketId: string) {
  for (const [code, room] of rooms.entries()) {
    const nextPlayers = room.players.filter((player) => player.socketId !== socketId);

    if (nextPlayers.length === room.players.length) {
      continue;
    }

    if (!nextPlayers.length) {
      if (room.roundTimeoutId) {
        clearTimeout(room.roundTimeoutId);
      }
      rooms.delete(code);
      return { code, room: null as RoomStatePublic | null };
    }

    room.players = nextPlayers;

    if (room.hostSocketId === socketId) {
      room.hostSocketId = room.players[0].socketId;
    }

    return { code, room: toPublicRoom(room) };
  }

  return null;
}

export function setRoomStarted(roomCode: string, mixedTracks: RoomGameState['mixedTracks']) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return null;
  }

  room.started = true;
  room.phase = 'playing';
  room.mixedTracks = mixedTracks;
  room.currentTrackIndex = 0;
  room.currentRound = null;
  room.currentCorrectAnswer = null;
  room.correctAnswerOrder = [];
  return {
    ...toPublicRoom(room),
    mixedTracks,
  } satisfies RoomGameState;
}

export function setRoomCurrentRound(roomCode: string, currentRound: RoomRoundPublic | null) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return null;
  }

  room.currentRound = currentRound;
  return toPublicRoom(room);
}

export function setRoomCurrentCorrectAnswer(roomCode: string, correctAnswer: string | null) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return null;
  }

  room.currentCorrectAnswer = correctAnswer;
  room.correctAnswerOrder = [];
  room.roundGuesses = [];
  return room.currentCorrectAnswer;
}

export function getRoomCurrentCorrectAnswer(roomCode: string) {
  return rooms.get(normalizeRoomCode(roomCode))?.currentCorrectAnswer ?? null;
}

export function registerCorrectAnswer(roomCode: string, socketId: string) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return null;
  }

  if (room.correctAnswerOrder.includes(socketId)) {
    return { points: 0, player: null, room: toPublicRoom(room) };
  }

  room.correctAnswerOrder.push(socketId);

  const placement = room.correctAnswerOrder.length;
  const points = placement === 1 ? 100 : placement === 2 ? 80 : placement === 3 ? 60 : 40;
  const player = room.players.find((entry) => entry.socketId === socketId);

  if (!player) {
    return { points: 0, player: null, room: toPublicRoom(room) };
  }

  player.score += points;

  return {
    points,
    player: {
      socketId: player.socketId,
      name: player.name,
      isHost: player.socketId === room.hostSocketId,
      selectedPlaylist: player.selectedPlaylist,
      score: player.score,
    } satisfies RoomPlayerPublic,
    room: toPublicRoom(room),
  };
}

export function clearRoomRoundState(roomCode: string) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return;
  }

  room.currentRound = null;
  room.currentCorrectAnswer = null;
  room.correctAnswerOrder = [];
  room.roundGuesses = [];
}

/** Registra el intento de un jugador. Devuelve false si ya había respondido en esta ronda. */
export function registerGuessAttempt(roomCode: string, socketId: string) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room || room.roundGuesses.includes(socketId)) {
    return false;
  }

  room.roundGuesses.push(socketId);
  return true;
}

export function advanceRoomTrackIndex(roomCode: string) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return null;
  }

  room.currentTrackIndex += 1;
  return room.currentTrackIndex;
}

export function getRoomMixedTracks(roomCode: string) {
  return rooms.get(normalizeRoomCode(roomCode))?.mixedTracks ?? null;
}

export function setRoomFinished(roomCode: string) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return null;
  }

  room.phase = 'finished';
  room.currentRound = null;
  return toPublicRoom(room);
}

export function setRoomRoundTimer(roomCode: string, timeoutId: ReturnType<typeof setTimeout> | null) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room) {
    return;
  }

  room.roundTimeoutId = timeoutId;
}

export function clearRoomRoundTimer(roomCode: string) {
  const room = rooms.get(normalizeRoomCode(roomCode));

  if (!room?.roundTimeoutId) {
    return;
  }

  clearTimeout(room.roundTimeoutId);
  room.roundTimeoutId = null;
}
