import { io, type Socket } from 'socket.io-client';

const apiBaseUrl = (window as any).__YOSHZAM_BACKEND_BASE__ ?? `${window.location.protocol}//${window.location.hostname}:3001`;

export function createGameSocket(): Socket {
  return io(apiBaseUrl, {
    autoConnect: true,
    transports: ['websocket'],
  });
}