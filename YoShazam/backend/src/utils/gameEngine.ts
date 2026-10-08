import type { Server } from 'socket.io';
import type { RoomRoundPublic } from '../types/rooms';
import { fetchPlaylistTracks, type SpotifyTrackSummary } from './spotifyApi';
import {
  advanceRoomTrackIndex,
  clearRoomRoundState,
  clearRoomRoundTimer,
  getRoom,
  getRoomRecord,
  getRoomCurrentCorrectAnswer,
  registerCorrectAnswer,
  registerGuessAttempt,
  setRoomCurrentRound,
  setRoomCurrentCorrectAnswer,
  setRoomFinished,
  setRoomRoundTimer,
  setRoomStarted,
} from './roomManager';

const roundDurationMs = 15_000;
const revealDurationMs = 3_500;

function shuffle<T>(items: T[]) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function uniqueValues(tracks: SpotifyTrackSummary[], selector: (track: SpotifyTrackSummary) => string, correctValue: string) {
  const values = new Set<string>();

  for (const track of tracks) {
    const value = selector(track).trim();

    if (value && value !== correctValue.trim()) {
      values.add(value);
    }
  }

  return shuffle(Array.from(values)).slice(0, 3);
}

async function buildMixedTracks(roomCode: string) {
  const room = getRoomRecord(roomCode);

  if (!room) {
    return null;
  }

  const mergedTracks = new Map<string, SpotifyTrackSummary>();

  for (const player of room.players) {
    if (!player.selectedPlaylist) {
      continue;
    }

    const playlistTracks = await fetchPlaylistTracks(player.accessToken, player.selectedPlaylist.id);

    for (const track of playlistTracks) {
      if (!track.previewUrl) {
        continue;
      }

      if (!mergedTracks.has(track.id)) {
        mergedTracks.set(track.id, track);
      }
    }
  }

  return shuffle(Array.from(mergedTracks.values()));
}

function createRound(roomCode: string, track: SpotifyTrackSummary, roundNumber: number, totalRounds: number) {
  const promptType = Math.random() > 0.5 ? 'artist' : 'song';
  const correctAnswer = promptType === 'artist' ? track.artists : track.title;
  const mergedTracks = getRoomRecord(roomCode)?.mixedTracks ?? [];
  const wrongAnswers = promptType === 'artist'
    ? uniqueValues(mergedTracks, (item) => item.artists, correctAnswer)
    : uniqueValues(mergedTracks, (item) => item.title, correctAnswer);

  const round: RoomRoundPublic = {
    roundNumber,
    totalRounds,
    promptType,
    previewUrl: track.previewUrl,
    // Solo se envía la pista, nunca la respuesta correcta.
    hint: promptType === 'artist' ? track.title : track.artists,
    options: shuffle([correctAnswer, ...wrongAnswers]),
    endsAt: Date.now() + roundDurationMs,
  };

  return { round, correctAnswer };
}

/** Lanza la ronda del índice de pista indicado o termina la partida si no quedan pistas. */
function playRound(io: Server, roomCode: string, trackIndex: number) {
  const room = getRoomRecord(roomCode);

  if (!room) {
    return null;
  }

  const mixedTracks = room.mixedTracks;

  if (trackIndex >= mixedTracks.length) {
    const finishedRoom = setRoomFinished(roomCode);

    if (finishedRoom) {
      io.to(roomCode).emit('game:finished', finishedRoom);
      io.to(roomCode).emit('room:state', finishedRoom);
    }

    return null;
  }

  const { round, correctAnswer } = createRound(roomCode, mixedTracks[trackIndex], trackIndex + 1, mixedTracks.length);
  setRoomCurrentCorrectAnswer(roomCode, correctAnswer);
  const updatedRoom = setRoomCurrentRound(roomCode, round);

  if (!updatedRoom) {
    return null;
  }

  io.to(roomCode).emit('game:round', round);
  io.to(roomCode).emit('room:state', updatedRoom);

  const roundTimeoutId = setTimeout(() => {
    io.to(roomCode).emit('game:round-ended', {
      roundNumber: round.roundNumber,
      correctAnswer,
    });

    clearRoomRoundState(roomCode);

    // Pausa breve para que los jugadores vean la respuesta correcta.
    const revealTimeoutId = setTimeout(() => {
      const nextTrackIndex = advanceRoomTrackIndex(roomCode);

      if (nextTrackIndex !== null) {
        playRound(io, roomCode, nextTrackIndex);
      }
    }, revealDurationMs);

    setRoomRoundTimer(roomCode, revealTimeoutId);
  }, roundDurationMs);

  setRoomRoundTimer(roomCode, roundTimeoutId);
  return updatedRoom;
}

export async function startRoomGame(io: Server, roomCode: string) {
  const room = getRoomRecord(roomCode);

  if (!room) {
    return null;
  }

  clearRoomRoundTimer(roomCode);

  const mixedTracks = await buildMixedTracks(roomCode);

  if (!mixedTracks?.length) {
    return null;
  }

  const startedRoom = setRoomStarted(roomCode, mixedTracks);

  if (!startedRoom) {
    return null;
  }

  // No se envían las pistas completas al cliente: incluyen las respuestas.
  const { mixedTracks: _hidden, ...publicRoom } = startedRoom;
  io.to(roomCode).emit('room:started', publicRoom);

  return playRound(io, roomCode, 0);
}

export function handlePlayerGuess(io: Server, roomCode: string, socketId: string, answer: string) {
  const room = getRoomRecord(roomCode);
  const correctAnswer = getRoomCurrentCorrectAnswer(roomCode);

  if (!room || !correctAnswer || room.phase !== 'playing' || typeof answer !== 'string') {
    return null;
  }

  if (!registerGuessAttempt(roomCode, socketId)) {
    return null;
  }

  if (answer.trim().toLowerCase() !== correctAnswer.trim().toLowerCase()) {
    return { correct: false, updatedRoom: getRoom(roomCode) };
  }

  const result = registerCorrectAnswer(roomCode, socketId);

  if (!result?.room) {
    return null;
  }

  io.to(roomCode).emit('game:score-update', {
    roomCode,
    player: result.player,
    points: result.points,
    ranking: result.room.ranking,
  });

  io.to(roomCode).emit('room:state', result.room);
  return { correct: true, updatedRoom: result.room, points: result.points };
}
