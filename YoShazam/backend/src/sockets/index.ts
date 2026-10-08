import type { Server, Socket } from 'socket.io';
import { handlePlayerGuess, startRoomGame } from '../utils/gameEngine';
import { createRoom, getRoomRecord, isRoomHost, joinRoom, removePlayer, updatePlayerSelection } from '../utils/roomManager';

function sanitizeName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().slice(0, 20) : '';
  return name || 'Jugador';
}

function leaveCurrentRoom(io: Server, socket: Socket) {
  const removed = removePlayer(socket.id);

  if (!removed?.code) {
    return;
  }

  socket.leave(removed.code);

  if (!removed.room) {
    io.to(removed.code).emit('room:deleted', { roomCode: removed.code });
    return;
  }

  io.to(removed.code).emit('room:state', removed.room);
}

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    socket.emit('connected', { socketId: socket.id });

    socket.on('room:create', ({ playerName, accessToken, selectedPlaylist }, ack) => {
      // Un socket solo puede estar en una sala a la vez.
      leaveCurrentRoom(io, socket);

      const room = createRoom({
        socketId: socket.id,
        name: sanitizeName(playerName),
        accessToken,
        selectedPlaylist,
        score: 0,
      });

      socket.join(room.code);
      ack?.({ ok: true, room });
      io.to(room.code).emit('room:state', room);
    });

    socket.on('room:join', ({ roomCode, playerName, accessToken, selectedPlaylist }, ack) => {
      const existing = typeof roomCode === 'string' ? getRoomRecord(roomCode) : null;

      if (!existing) {
        ack?.({ ok: false, message: 'Esa sala no existe. Revisa el código.' });
        return;
      }

      if (existing.phase !== 'lobby' && !existing.players.some((player) => player.socketId === socket.id)) {
        ack?.({ ok: false, message: 'La partida ya ha empezado. Espera a la siguiente.' });
        return;
      }

      leaveCurrentRoom(io, socket);

      const room = joinRoom(roomCode, {
        socketId: socket.id,
        name: sanitizeName(playerName),
        accessToken,
        selectedPlaylist,
        score: 0,
      });

      if (!room) {
        ack?.({ ok: false, message: 'Esa sala no existe. Revisa el código.' });
        return;
      }

      socket.join(room.code);
      ack?.({ ok: true, room });
      io.to(room.code).emit('room:state', room);
    });

    socket.on('room:leave', () => {
      leaveCurrentRoom(io, socket);
    });

    socket.on('room:select-playlist', ({ roomCode, selectedPlaylist }, ack) => {
      const room = updatePlayerSelection(roomCode, socket.id, selectedPlaylist);

      if (!room) {
        ack?.({ ok: false, message: 'No se pudo actualizar la playlist.' });
        return;
      }

      ack?.({ ok: true, room });
      io.to(room.code).emit('room:state', room);
    });

    socket.on('room:start', async ({ roomCode }, ack) => {
      const room = getRoomRecord(roomCode);

      if (!room) {
        ack?.({ ok: false, message: 'La sala no existe.' });
        return;
      }

      if (!isRoomHost(roomCode, socket.id)) {
        ack?.({ ok: false, message: 'Solo el anfitrión puede empezar.' });
        return;
      }

      if (room.phase !== 'lobby') {
        ack?.({ ok: false, message: 'La partida ya ha empezado.' });
        return;
      }

      if (room.players.some((player) => !player.selectedPlaylist)) {
        ack?.({ ok: false, message: 'Todos los jugadores deben elegir una playlist antes de empezar.' });
        return;
      }

      const noPreviewMessage = 'Ninguna canción de estas playlists tiene preview disponible en Spotify. Prueba con otra playlist.';

      try {
        const startedRoom = await startRoomGame(io, roomCode);

        if (!startedRoom) {
          ack?.({ ok: false, message: noPreviewMessage });
          return;
        }

        ack?.({ ok: true, room: startedRoom });
      } catch (error) {
        console.error('Failed to start game', error);
        ack?.({ ok: false, message: 'No se pudieron cargar las canciones de Spotify. Inténtalo de nuevo.' });
      }
    });

    socket.on('game:guess', ({ roomCode, answer }, ack) => {
      const result = handlePlayerGuess(io, roomCode, socket.id, answer);

      if (!result) {
        ack?.({ ok: false, message: 'Ya has respondido en esta ronda.' });
        return;
      }

      if (!result.correct) {
        ack?.({ ok: true, correct: false, points: 0, room: result.updatedRoom });
        return;
      }

      ack?.({ ok: true, correct: true, points: result.points, room: result.updatedRoom });
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom(io, socket);
    });
  });
}
