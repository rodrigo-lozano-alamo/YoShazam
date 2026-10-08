import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeSpotifySessionFromHash } from '../services/spotifyAuth';

export function SpotifyCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Procesando tu sesión de Spotify...');

  useEffect(() => {
    const result = storeSpotifySessionFromHash(window.location.hash);

    if (!result.ok) {
      setMessage(result.errorMessage);
      return;
    }

    setMessage('Sesión iniciada correctamente. Redirigiendo...');
    window.setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, 1200);
  }, [navigate]);

  return (
    <section className="flex flex-1 items-center justify-center">
      <div className="max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">Spotify OAuth</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">Inicio de sesión</h1>
        <p className="mt-4 text-slate-300">{message}</p>
      </div>
    </section>
  );
}