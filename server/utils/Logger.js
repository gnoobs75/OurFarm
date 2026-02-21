// server/utils/Logger.js
// Structured logger that writes to console AND log files when debug mode is on.
// Activated by OURFARM_DEBUG=1 environment variable.

import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const LOG_DIR = join(PROJECT_ROOT, 'logs');

const DEBUG = process.env.OURFARM_DEBUG === '1';
const LOG_LEVEL = process.env.OURFARM_LOG_LEVEL || (DEBUG ? 'debug' : 'info');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

// Session start timestamp used in log filenames
const SESSION_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

let serverLogPath = null;
let clientLogPath = null;
let actionLogPath = null;

// Ensure log directory exists and init files
if (DEBUG) {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

  serverLogPath = join(LOG_DIR, `server-${SESSION_ID}.log`);
  clientLogPath = join(LOG_DIR, `client-errors.log`);
  actionLogPath = join(LOG_DIR, `actions-${SESSION_ID}.log`);

  // Write session header
  const header = [
    '═'.repeat(70),
    `  OurFarm Debug Session: ${new Date().toISOString()}`,
    `  PID: ${process.pid}  |  Node: ${process.version}  |  Platform: ${process.platform}`,
    `  Log Level: ${LOG_LEVEL}`,
    '═'.repeat(70),
    '',
  ].join('\n');

  writeFileSync(serverLogPath, header);
  writeFileSync(actionLogPath, header.replace('Debug Session', 'Action Log'));

  // Only create client log if it doesn't exist (append across sessions)
  if (!existsSync(clientLogPath)) {
    writeFileSync(clientLogPath, '');
  }
  appendFileSync(clientLogPath, `\n${'═'.repeat(70)}\n  Client Error Log — Session ${SESSION_ID}\n${'═'.repeat(70)}\n`);
}

function timestamp() {
  const d = new Date();
  return d.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function formatMsg(level, category, message, data) {
  const ts = timestamp();
  const lvl = level.toUpperCase().padEnd(5);
  const cat = category ? `[${category}]` : '';
  let line = `${ts} ${lvl} ${cat} ${message}`;
  if (data !== undefined) {
    try {
      const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, 0);
      // Truncate very long data in logs
      line += ' | ' + (serialized.length > 500 ? serialized.slice(0, 500) + '...(truncated)' : serialized);
    } catch {
      line += ' | [unserializable data]';
    }
  }
  return line;
}

function writeToFile(filePath, line) {
  if (!filePath) return;
  try {
    appendFileSync(filePath, line + '\n');
  } catch { /* ignore write errors */ }
}

function log(level, category, message, data) {
  if (LEVELS[level] < currentLevel) return;

  const formatted = formatMsg(level, category, message, data);

  // Console output (always)
  switch (level) {
    case 'error': console.error(formatted); break;
    case 'warn': console.warn(formatted); break;
    default: console.log(formatted); break;
  }

  // File output (debug mode only)
  if (DEBUG) {
    writeToFile(serverLogPath, formatted);
  }
}

// Public API
export const logger = {
  debug: (category, msg, data) => log('debug', category, msg, data),
  info: (category, msg, data) => log('info', category, msg, data),
  warn: (category, msg, data) => log('warn', category, msg, data),
  error: (category, msg, data) => log('error', category, msg, data),

  /** Log a player/game action — always written to action log in debug mode */
  action: (socketId, actionName, data, result) => {
    const line = formatMsg('info', 'ACTION', `${actionName} from=${socketId}`, { data, result });
    if (DEBUG) writeToFile(actionLogPath, line);
    if (currentLevel <= LEVELS.debug) console.log(line);
  },

  /** Log a client-side error forwarded from the browser */
  clientError: (errorData) => {
    const line = formatMsg('error', 'CLIENT', errorData.message, {
      source: errorData.source,
      line: errorData.line,
      col: errorData.col,
      stack: errorData.stack,
      userAgent: errorData.userAgent,
      playerId: errorData.playerId,
    });
    console.error(line);
    if (DEBUG) writeToFile(clientLogPath, line);
  },

  /** Return paths to current log files (for the debug API) */
  getLogPaths: () => ({
    server: serverLogPath,
    client: clientLogPath,
    actions: actionLogPath,
    logDir: LOG_DIR,
    debug: DEBUG,
    sessionId: SESSION_ID,
  }),

  isDebug: DEBUG,
};

// Intercept uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  logger.error('FATAL', 'Uncaught exception', { message: err.message, stack: err.stack });
  if (DEBUG) {
    writeToFile(serverLogPath, `\n!!! FATAL CRASH !!!\n${err.stack}\n`);
  }
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  logger.error('FATAL', 'Unhandled rejection', { message: msg, stack });
});
