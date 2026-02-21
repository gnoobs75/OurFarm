// server/index.js
// Express HTTP server + Socket.io WebSocket server.
// Serves the client and runs the authoritative game world.

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ACTIONS } from '../shared/constants.js';
import { GameWorld } from './game/GameWorld.js';
import { closeDB } from './db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

const PORT = process.env.PORT || 3000;

// Serve static client files (production)
app.use(express.static(join(__dirname, '../dist')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', players: world.players.size });
});

// Create game world
const world = new GameWorld(io);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Player join
  socket.on(ACTIONS.PLAYER_JOIN, (data) => world.handlePlayerJoin(socket, data));

  // Player movement
  socket.on(ACTIONS.PLAYER_MOVE, (data) => world.handlePlayerMove(socket.id, data));

  // Farming actions
  socket.on(ACTIONS.FARM_TILL, (data) => world.handleTill(socket.id, data));
  socket.on(ACTIONS.FARM_PLANT, (data) => world.handlePlant(socket.id, data));
  socket.on(ACTIONS.FARM_WATER, (data) => world.handleWater(socket.id, data));
  socket.on(ACTIONS.FARM_HARVEST, (data) => world.handleHarvest(socket.id, data));

  // Fishing
  socket.on(ACTIONS.FISH_CAST, (data) => world.handleFishCast(socket.id, data));

  // NPC interaction
  socket.on(ACTIONS.NPC_TALK, (data) => world.handleNPCTalk(socket.id, data));

  // Shop
  socket.on(ACTIONS.SHOP_BUY, (data) => world.handleShopBuy(socket.id, data));
  socket.on(ACTIONS.SHOP_SELL, (data) => world.handleShopSell(socket.id, data));

  // Disconnect
  socket.on('disconnect', () => {
    world.handlePlayerLeave(socket.id);
  });
});

// Start server
world.start();
httpServer.listen(PORT, () => {
  console.log(`OurFarm server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  world.stop();
  closeDB();
  process.exit(0);
});
