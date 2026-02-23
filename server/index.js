// server/index.js
// Express HTTP server + Socket.io WebSocket server.
// Serves the client and runs the authoritative game world.

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { ACTIONS } from '../shared/constants.js';
import { GameWorld } from './game/GameWorld.js';
import { closeDB } from './db/database.js';
import { logger } from './utils/Logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

const PORT = process.env.PORT || 3000;

// Parse JSON bodies for debug endpoints
app.use(express.json());

// Serve static client files (production)
app.use(express.static(join(__dirname, '../dist')));

// Health check
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    players: world.players.size,
    uptime: Math.floor(uptime),
    memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB', rss: Math.round(mem.rss / 1024 / 1024) + 'MB' },
    time: world.time?.getState(),
    debug: logger.isDebug,
  });
});

// --- Debug API endpoints (active in both modes, detailed in debug) ---

// Receive client-side errors
app.post('/api/debug/client-error', (req, res) => {
  logger.clientError(req.body);
  res.json({ received: true });
});

// Get current game state snapshot
app.get('/api/debug/state', (req, res) => {
  res.json({
    players: Array.from(world.players.values()).map(p => p.getState()),
    maps: world.maps.size,
    farmCrops: world.maps.get('farm')?.crops.size,
    farmAnimals: world.maps.get('farm')?.animals.size,
    farmPets: world.maps.get('farm')?.pets.size,
    townNpcs: world.maps.get('town')?.npcs.length,
    time: world.time?.getState(),
    weather: world.weather?.getState(),
  });
});

// List available log files
app.get('/api/debug/logs', (req, res) => {
  const paths = logger.getLogPaths();
  if (!paths.debug) {
    return res.json({ debug: false, message: 'Start with start-debug.bat for full logging' });
  }
  const logDir = paths.logDir;
  let files = [];
  if (existsSync(logDir)) {
    files = readdirSync(logDir).map(f => ({
      name: f,
      path: join(logDir, f),
    }));
  }
  res.json({ debug: true, sessionId: paths.sessionId, files, paths });
});

// Read a specific log file (tail N lines)
app.get('/api/debug/logs/:filename', (req, res) => {
  const paths = logger.getLogPaths();
  if (!paths.debug) return res.status(404).json({ error: 'Debug mode not active' });

  const filePath = join(paths.logDir, req.params.filename);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Log file not found' });

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const tail = parseInt(req.query.tail) || 200;
  const tailLines = lines.slice(-tail);

  res.type('text/plain').send(tailLines.join('\n'));
});

// Create game world
logger.info('SERVER', 'Initializing GameWorld...');
const world = new GameWorld(io);
logger.info('SERVER', 'GameWorld initialized', {
  maps: world.maps.size,
  farmTiles: world.maps.get('farm')?.tiles.length,
  townNpcs: world.maps.get('town')?.npcs.length,
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('SOCKET', `Connected: ${socket.id}`, { transport: socket.conn.transport.name });

  // Wrap each handler with error catching and action logging
  const wrap = (name, handler) => {
    socket.on(name, (data) => {
      try {
        handler(data);
        logger.action(socket.id, name, data, 'ok');
      } catch (err) {
        logger.error('SOCKET', `Error in ${name}`, { error: err.message, stack: err.stack, data });
      }
    });
  };

  // Player join
  wrap(ACTIONS.PLAYER_JOIN, (data) => world.handlePlayerJoin(socket, data));

  // Player movement (high frequency — only log in debug)
  socket.on(ACTIONS.PLAYER_MOVE, (data) => {
    try {
      world.handlePlayerMove(socket.id, data);
    } catch (err) {
      logger.error('SOCKET', 'Error in player:move', { error: err.message, data });
    }
  });

  // Farming actions
  wrap(ACTIONS.FARM_TILL, (data) => world.handleTill(socket.id, data));
  wrap(ACTIONS.FARM_PLANT, (data) => world.handlePlant(socket.id, data));
  wrap(ACTIONS.FARM_WATER, (data) => world.handleWater(socket.id, data));
  wrap(ACTIONS.FARM_HARVEST, (data) => world.handleHarvest(socket.id, data));

  // Fishing
  wrap(ACTIONS.FISH_CAST, (data) => world.handleFishCast(socket.id, data));
  wrap(ACTIONS.FISH_REEL, (data) => world.handleFishReel(socket.id, data));

  // NPC interaction
  wrap(ACTIONS.NPC_TALK, (data) => world.handleNPCTalk(socket.id, data));
  wrap(ACTIONS.NPC_GIFT, (data) => world.handleNPCGift(socket.id, data));

  // Animal interaction
  wrap(ACTIONS.ANIMAL_FEED, (data) => world.handleAnimalFeed(socket.id, data));
  wrap(ACTIONS.ANIMAL_COLLECT, (data) => world.handleAnimalCollect(socket.id, data));

  // Pet interaction
  wrap(ACTIONS.PET_INTERACT, (data) => world.handlePetInteract(socket.id, data));
  wrap(ACTIONS.PET_GROOM, (data) => world.handlePetGroom(socket.id, data));

  // Crafting
  wrap(ACTIONS.CRAFT_START, (data) => world.handleCraftStart(socket.id, data));
  wrap(ACTIONS.CRAFT_COLLECT, (data) => world.handleCraftCollect(socket.id, data));

  // Shop
  wrap(ACTIONS.SHOP_BUY, (data) => world.handleShopBuy(socket.id, data));
  wrap(ACTIONS.SHOP_SELL, (data) => world.handleShopSell(socket.id, data));

  // Tool upgrade
  wrap(ACTIONS.TOOL_UPGRADE, (data) => world.handleToolUpgrade(socket.id, data));

  // Sprinkler placement
  wrap(ACTIONS.PLACE_SPRINKLER, (data) => world.handlePlaceSprinkler(socket.id, data));

  // Fertilizer application
  wrap(ACTIONS.APPLY_FERTILIZER, (data) => world.handleApplyFertilizer(socket.id, data));

  // Processing machines
  wrap(ACTIONS.PLACE_MACHINE, (data) => world.handlePlaceMachine(socket.id, data));
  wrap(ACTIONS.MACHINE_INPUT, (data) => world.handleMachineInput(socket.id, data));
  wrap(ACTIONS.MACHINE_COLLECT, (data) => world.handleMachineCollect(socket.id, data));

  // Foraging
  wrap(ACTIONS.FORAGE_COLLECT, (data) => world.handleForageCollect(socket.id, data));

  // Resources (trees/rocks)
  wrap(ACTIONS.RESOURCE_HIT, (data) => world.handleResourceHit(socket.id, data));

  // Multi-tile actions
  wrap(ACTIONS.MULTI_TILL, (data) => world.handleMultiTill(socket.id, data));
  wrap(ACTIONS.MULTI_WATER, (data) => world.handleMultiWater(socket.id, data));
  wrap(ACTIONS.MULTI_PLANT, (data) => world.handleMultiPlant(socket.id, data));

  // Rest at house
  wrap(ACTIONS.REST_AT_HOUSE, () => world.handleRestAtHouse(socket.id));

  // Profession choice
  wrap(ACTIONS.PROFESSION_CHOICE, (data) => world.handleProfessionChoice(socket.id, data));

  // Shipping bin
  wrap(ACTIONS.SHIP_ITEM, (data) => {
    const player = world.players.get(socket.id);
    if (player) {
      world.handleShipItem(player, data.itemId, data.quantity || 1);
    }
  });

  // Disconnect
  socket.on('disconnect', (reason) => {
    logger.info('SOCKET', `Disconnected: ${socket.id}`, { reason });
    world.handlePlayerLeave(socket.id);
  });
});

// Start server
world.start();
httpServer.listen(PORT, () => {
  logger.info('SERVER', `OurFarm running on http://localhost:${PORT}`, { debug: logger.isDebug });
  if (logger.isDebug) {
    const paths = logger.getLogPaths();
    logger.info('SERVER', `Log files:`, {
      server: paths.server,
      actions: paths.actions,
      client: paths.client,
    });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('SERVER', 'Shutting down (SIGINT)...');
  world.stop();
  closeDB();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('SERVER', 'Shutting down (SIGTERM)...');
  world.stop();
  closeDB();
  process.exit(0);
});
