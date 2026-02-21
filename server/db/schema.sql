-- server/db/schema.sql

CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  season INTEGER DEFAULT 0,
  day INTEGER DEFAULT 1,
  hour REAL DEFAULT 6.0,
  weather INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  x REAL DEFAULT 32,
  z REAL DEFAULT 32,
  coins INTEGER DEFAULT 500,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  energy REAL DEFAULT 100,
  max_energy REAL DEFAULT 100,
  professions TEXT DEFAULT '{}',
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS player_skills (
  player_id TEXT NOT NULL,
  skill TEXT NOT NULL CHECK(skill IN ('farming','fishing','mining','foraging','combat')),
  level INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  PRIMARY KEY (player_id, skill),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  quality INTEGER DEFAULT 0,
  slot INTEGER,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS tiles (
  world_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  z INTEGER NOT NULL,
  type INTEGER NOT NULL,
  height REAL DEFAULT 0,
  PRIMARY KEY (world_id, x, z),
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS crops (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_z INTEGER NOT NULL,
  crop_type TEXT NOT NULL,
  stage INTEGER DEFAULT 0,
  growth REAL DEFAULT 0,
  watered INTEGER DEFAULT 0,
  planted_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS animals (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  x REAL, z REAL,
  happiness REAL DEFAULT 50,
  fed_today INTEGER DEFAULT 0,
  product_ready INTEGER DEFAULT 0,
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  energy REAL DEFAULT 100,
  happiness REAL DEFAULT 50,
  loyalty REAL DEFAULT 0,
  skill REAL DEFAULT 0,
  body_size REAL DEFAULT 0.25,
  ear_size REAL DEFAULT 0.1,
  tail_length REAL DEFAULT 0.2,
  color INTEGER DEFAULT 0,
  FOREIGN KEY (owner_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS npc_relationships (
  player_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  hearts REAL DEFAULT 0,
  talked_today INTEGER DEFAULT 0,
  gifted_today INTEGER DEFAULT 0,
  PRIMARY KEY (player_id, npc_id),
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  npc_id TEXT,
  type TEXT NOT NULL,
  description TEXT,
  target_item TEXT,
  target_count INTEGER DEFAULT 1,
  current_count INTEGER DEFAULT 0,
  reward_coins INTEGER DEFAULT 0,
  reward_xp INTEGER DEFAULT 0,
  reward_item TEXT,
  completed INTEGER DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  tile_x INTEGER, tile_z INTEGER,
  processing_recipe TEXT,
  processing_start TEXT,
  processing_done INTEGER DEFAULT 0,
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);
