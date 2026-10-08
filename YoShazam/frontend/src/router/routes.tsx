import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { HomePage } from '../pages/HomePage';
import { DashboardPage } from '../pages/DashboardPage';
import { RoomPage } from '../pages/RoomPage';
import { SpotifyCallbackPage } from '../pages/SpotifyCallbackPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/room/:roomCode" element={<RoomPage />} />
        <Route path="/auth/spotify/callback" element={<SpotifyCallbackPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="/home" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
