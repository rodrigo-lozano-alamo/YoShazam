import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { createGameSocket } from '../services/socket';
import {
  getStoredSpotifyPlaylist,
  getStoredSpotifySession,
  type SpotifyPlaylistSummary,
} from '../services/spotifyAuth';
import type { RoomRoundState, RoomState } from '../types/room';

interface RoomAck {
  ok: boolean;
  room?: RoomState;
  message?: string;
}

export function RoomPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState(params.roomCode === 'new' ? '' : params.roomCode?.toUpperCase() ?? '');
  const [statusMessage, setStatusMessage] = useState('Conéctate a una sala para empezar.');
  const [isJoining, setIsJoining] = useState(false);
  const [currentRound, setCurrentRound] = useState<RoomRoundState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [selectedAnswer, setSelectedAnswer] = useState('');

  const session = getStoredSpotifySession();
  const selectedPlaylist = getStoredSpotifyPlaylist();

  useEffect(() => {
    if (!session || !selectedPlaylist) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const nextSocket = createGameSocket();

    nextSocket.on('room:state', (nextRoom: RoomState) => {
      setRoom(nextRoom);
      setRoomCode(nextRoom.code);
      setCurrentRound(nextRoom.currentRound);
    });

    nextSocket.on('room:started', (nextRoom: RoomState) => {
      setRoom(nextRoom);
      setRoomCode(nextRoom.code);
      setStatusMessage(`La partida comenzó con ${nextRoom.mixedTrackCount} canciones mezcladas.`);
    });

    nextSocket.on('game:round', (round: RoomRoundState) => {
      setCurrentRound(round);
      setSecondsLeft(15);
      setSelectedAnswer('');
      setStatusMessage(
        round.promptType === 'artist'
          ? `Adivina el artista de ${round.trackTitle}`
          : `Adivina la canción de ${round.trackArtist}`,
      );
    });

    nextSocket.on('game:round-ended', ({ roundNumber, correctAnswer }) => {
      setStatusMessage(`Ronda ${roundNumber} terminada. Respuesta correcta: ${correctAnswer}`);
    });

    nextSocket.on('game:finished', (nextRoom: RoomState) => {
      setRoom(nextRoom);
      setCurrentRound(null);
      setStatusMessage('La partida terminó.');
    });

    nextSocket.on('room:deleted', () => {
      setRoom(null);
      setRoomCode('');
      setStatusMessage('La sala fue cerrada porque el anfitrión salió.');
    });

    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
    };
  }, [navigate, selectedPlaylist, session]);

  const selectedSummary = useMemo<SpotifyPlaylistSummary | null>(() => selectedPlaylist, [selectedPlaylist]);

  useEffect(() => {
    if (!currentRound) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const remainingSeconds = Math.max(15 - elapsedSeconds, 0);
      setSecondsLeft(remainingSeconds);

      if (remainingSeconds <= 0) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentRound]);

  function emitCreateRoom() {
    if (!socket || !playerName.trim() || !session || !selectedSummary) {
      return;
    }

    setIsJoining(true);
    socket.emit(
      'room:create',
      {
        playerName: playerName.trim(),
        accessToken: session.accessToken,
        selectedPlaylist: selectedSummary,
      },
      (ack: RoomAck) => {
        setIsJoining(false);

        if (!ack.ok || !ack.room) {
          setStatusMessage(ack.message ?? 'No se pudo crear la sala.');
          return;
        }

        setRoom(ack.room);
        setRoomCode(ack.room.code);
        setStatusMessage(`Sala creada con código ${ack.room.code}`);
        navigate(`/room/${ack.room.code}`, { replace: true });
      },
    );
  }

  function emitJoinRoom() {
    if (!socket || !playerName.trim() || !roomCodeInput.trim() || !session || !selectedSummary) {
      return;
    }

    setIsJoining(true);
    socket.emit(
      'room:join',
      {
        roomCode: roomCodeInput.trim().toUpperCase(),
        playerName: playerName.trim(),
        accessToken: session.accessToken,
        selectedPlaylist: selectedSummary,
      },
      (ack: RoomAck) => {
        setIsJoining(false);

        if (!ack.ok || !ack.room) {
          setStatusMessage(ack.message ?? 'No se pudo unir a la sala.');
          return;
        }

        setRoom(ack.room);
        setRoomCode(ack.room.code);
        setStatusMessage(`Te uniste a la sala ${ack.room.code}`);
        navigate(`/room/${ack.room.code}`, { replace: true });
      },
    );
  }

  function emitStartGame() {
    if (!socket || !roomCode || !room) {
      return;
    }

    socket.emit('room:start', { roomCode }, (ack: RoomAck) => {
      if (!ack.ok || !ack.room) {
        setStatusMessage(ack.message ?? 'No se pudo iniciar la partida.');
        return;
      }

      setRoom(ack.room);
      setStatusMessage('La partida ya comenzó.');
    });
  }

  return (
    <section className="grid flex-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur md:p-8">
        <p className="text-sm uppercase tracking-[0.4em] text-emerald-300">Lobby</p>
        <h1 className="mt-3 text-4xl font-black text-white md:text-5xl">Sala multijugador</h1>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          Usa un código para unir jugadores, revisa quién está conectado y espera al anfitrión.
        </p>

        {!room ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <label className="mb-2 block text-sm text-slate-300">Tu nombre</label>
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Ej. Rodrigo"
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-400"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                disabled={!playerName.trim() || !selectedPlaylist || isJoining}
                onClick={emitCreateRoom}
                className="rounded-full bg-emerald-400 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Crear sala
              </button>
              <button
                type="button"
                disabled={!playerName.trim() || !roomCodeInput.trim() || !selectedPlaylist || isJoining}
                onClick={emitJoinRoom}
                className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                Unirse por código
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <label className="mb-2 block text-sm text-slate-300">Código de la sala</label>
              <input
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                placeholder="AB12CD"
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
              />
              <p className="mt-3 text-sm text-slate-400">Solicita un código al anfitrión o crea una nueva sala.</p>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-100">
              Sala activa: <span className="font-bold">{room.code}</span>
            </div>
            <button
              type="button"
              onClick={emitStartGame}
              className="rounded-full bg-amber-300 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-200"
            >
              Comenzar
            </button>
          </div>
        )}

        <p className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">{statusMessage}</p>
      </div>

      <div className="space-y-6 rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 backdrop-blur md:p-8">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">Jugadores</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Conectados en la sala</h2>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-400">Playlist seleccionada</p>
          <p className="mt-2 text-lg font-semibold text-white">{selectedPlaylist?.name ?? 'Sin selección'}</p>
          <p className="mt-1 text-sm text-slate-400">{selectedPlaylist?.ownerName ?? 'Selecciona una playlist antes de entrar'}</p>
        </div>

        <div className="space-y-3">
          {(room?.players ?? []).map((player) => (
            <div key={player.socketId} className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-white">{player.name}</p>
                  <p className="text-sm text-slate-400">{player.isHost ? 'Anfitrión' : 'Jugador'}</p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                  {player.selectedPlaylist ? 'Playlist elegida' : 'Sin playlist'}
                </span>
              </div>
              {player.selectedPlaylist ? <p className="mt-3 text-sm text-slate-300">{player.selectedPlaylist.name}</p> : null}
            </div>
          ))}

          {!room?.players?.length ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-slate-400">
              Aún no hay jugadores en la sala.
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-400/10 to-cyan-400/10 p-5 text-sm text-slate-300">
          Cuando el anfitrión pulse <span className="font-semibold text-white">Comenzar</span>, el servidor mezclará las canciones de todas las playlists seleccionadas.
        </div>

        {room?.started ? (
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-100">
            Partida iniciada. Canciones mezcladas: <span className="font-bold">{room.mixedTrackCount}</span>
          </div>
        ) : null}

        {currentRound ? (
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 backdrop-blur md:p-8 lg:col-span-2">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-amber-300">
                  Ronda {currentRound.roundNumber} / {currentRound.totalRounds}
                </p>
                <h2 className="mt-3 text-3xl font-black text-white">
                  {currentRound.promptType === 'artist' ? 'Adivina el artista' : 'Adivina la canción'}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Se reproducen 15 segundos de la pista y todos reciben las mismas cuatro opciones.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-center text-emerald-100">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Tiempo</p>
                <p className="text-3xl font-black">{secondsLeft}s</p>
              </div>
            </div>

            {currentRound.previewUrl ? (
              <audio className="mt-6 w-full" controls autoPlay src={currentRound.previewUrl} />
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/5 p-5 text-slate-400">
                Esta canción no tiene preview disponible en Spotify.
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {currentRound.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedAnswer(option)}
                  className={`rounded-3xl border px-5 py-4 text-left transition hover:-translate-y-0.5 ${
                    selectedAnswer === option
                      ? 'border-emerald-400 bg-emerald-400/10 text-white'
                      : 'border-white/10 bg-white/5 text-slate-200'
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Respuesta</p>
                  <p className="mt-2 text-lg font-semibold">{option}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
              Seleccionaste: {selectedAnswer || 'ninguna respuesta todavía'}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}