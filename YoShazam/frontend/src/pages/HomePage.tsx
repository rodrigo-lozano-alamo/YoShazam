import { getSpotifyLoginUrl, getStoredSpotifySession } from '../services/spotifyAuth';

export function HomePage() {
  const session = getStoredSpotifySession();

  return (
    <section className="flex flex-1 items-center justify-center py-8">
      <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 px-6 py-10 shadow-2xl shadow-emerald-950/30 backdrop-blur md:px-10 md:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.16),transparent_28%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.5em] text-emerald-300">YoShazam</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-none text-white md:text-7xl">
              Adivina la canción antes que nadie.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
              Un juego musical multijugador con Spotify, salas en tiempo real y rondas rápidas donde cada segundo cuenta.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a
                href={getSpotifyLoginUrl()}
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-emerald-300"
              >
                Iniciar sesión con Spotify
              </a>
              <div className="rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm text-slate-300">
                {session ? 'Sesión detectada: listo para entrar al dashboard' : 'Primero inicia sesión para cargar tus playlists'}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Modo sala</p>
              <p className="mt-3 text-2xl font-semibold text-white">Crea o únete con código</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Salas privadas, lista de jugadores y espera hasta que el anfitrión comience.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Spotify</p>
              <p className="mt-3 text-2xl font-semibold text-white">Playlists por jugador</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Cada jugador elige una playlist y el servidor las mezcla sin repetir canciones.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
