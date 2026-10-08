import 'dotenv/config';
import { Server } from 'socket.io';
import { createApp, getAllowedOrigins } from './app';
import { registerSocketHandlers } from './sockets';

const port = Number(process.env.PORT ?? 3001);
const app = createApp();
const httpServer = app.listen(port, () => {
  console.log(`YoShazam backend running on port ${port}`);
});
const io = new Server(httpServer, {
  cors: {
    origin: getAllowedOrigins(),
    credentials: true,
  },
});

registerSocketHandlers(io);
