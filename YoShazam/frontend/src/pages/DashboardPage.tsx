import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPublicSpotifyPlaylist, searchPublicSpotifyPlaylists } from '../services/spotifyApi';
import {
  getStoredSpotifyPlaylist,
  getStoredSpotifySession,
  storeSpotifyPlaylist,
  type SpotifyPlaylistSummary,
} from '../services/spotifyAuth';

function isSpotifyPlaylistReference(value: string) {
  return /playlist\/|^spotify:playlist:|^[A-Za-z0-9]{22}$/.test(value);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const session = getStoredSpotifySession();
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylistSummary | null>(getStoredSpotifyPlaylist());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
      return;
    }
  }, [navigate, session]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();

    if (!query) {
      setErrorMessage('Pega una URL de playlist o escribe un nombre para buscar.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const items = isSpotifyPlaylistReference(query)
        ? [await fetchPublicSpotifyPlaylist(query)].filter((item): item is SpotifyPlaylistSummary => item !== null)
        : await searchPublicSpotifyPlaylists(query);

      setPlaylists(items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo buscar esa playlist pública.');
    } finally {
      setLoading(false);
    }
  }

  const helperText = useMemo(() => {
    if (!selectedPlaylist) {
      return 'Selecciona una playlist para usarla en la sala.';
    }

    return `Playlist seleccionada: ${selectedPlaylist.name}`;
  }, [selectedPlaylist]);

  return (
    <section className="grid flex-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-emerald-300">Playlists públicas</p>
            <h1 className="mt-3 text-4xl font-black text-white md:text-5xl">Busca y elige una playlist</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              Pega una URL de playlist pública o busca por nombre. No hace falta Premium para estas playlists.
            </p>
          </div>
        </div>

        <form className="mt-6 flex flex-col gap-3 md:flex-row" onSubmit={handleSearch}>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar por nombre o pegar URL/ID de Spotify"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-slate-950/70 px-5 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-emerald-400/40"
          />
          <button
            type="submit"
            className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            disabled={loading}
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {helperText}
        </div>

        {loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-48 animate-pulse rounded-3xl bg-white/5" />
            ))}
          </div>
        ) : errorMessage ? (
          <div className="mt-8 rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">
            {errorMessage}
          </div>
        ) : playlists.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {playlists.map((playlist) => {
              const isSelected = selectedPlaylist?.id === playlist.id;

              return (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlaylist(playlist);
                    storeSpotifyPlaylist(playlist);
                  }}
                  className={`group overflow-hidden rounded-3xl border text-left transition hover:-translate-y-1 hover:border-emerald-400/40 ${
                    isSelected ? 'border-emerald-400 bg-emerald-400/10' : 'border-white/10 bg-slate-950/50'
                  }`}
                >
                  <div className="aspect-[16/10] bg-slate-900">
                    {playlist.imageUrl ? (
                      <img src={playlist.imageUrl} alt={playlist.name} className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-500/40 to-cyan-500/40 text-5xl font-black text-white">
                        {playlist.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-white">{playlist.name}</h2>
                        <p className="text-sm text-slate-400">{playlist.ownerName}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                        {playlist.trackCount} temas
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm leading-6 text-slate-300">{playlist.description || 'Playlist sin descripción.'}</p>
                    <div className="pt-2 text-sm font-medium text-emerald-300">
                      {isSelected ? 'Seleccionada' : 'Toca para elegirla'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">
            No hay resultados todavía. Busca una playlist pública o pega su URL para cargarla.
          </div>
        )}
      </div>

      <aside className="space-y-6 rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 backdrop-blur md:p-8">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">Siguiente paso</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Crea o únete a una sala</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Elige tu playlist y luego entra a un lobby compartido con el resto de jugadores.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">Estado</p>
          <p className="mt-3 text-base text-slate-200">
            {selectedPlaylist ? `${selectedPlaylist.name} está lista para jugar.` : 'No has seleccionado ninguna playlist.'}
          </p>
        </div>

        <button
          type="button"
          disabled={!selectedPlaylist}
          onClick={() => navigate('/room/new')}
          className="w-full rounded-full bg-emerald-400 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Ir al lobby
        </button>
      </aside>
    </section>
  );
}