// client/src/utils/DebugClient.js
// Client-side debug instrumentation.
// Captures JS errors, unhandled rejections, and console.error calls,
// then forwards them to the server debug endpoint for log file capture.

const DEBUG_ENDPOINT = '/api/debug/client-error';

class DebugClient {
  constructor() {
    this.playerId = null;
    this.errors = [];
    this.maxErrors = 100; // Keep last 100 errors in memory
    this.enabled = false;
  }

  /** Call once during init to start capturing errors */
  init(playerId) {
    this.playerId = playerId;
    this.enabled = true;

    // Capture uncaught errors
    window.onerror = (message, source, line, col, error) => {
      this._report({
        type: 'uncaught',
        message: String(message),
        source,
        line,
        col,
        stack: error?.stack || '',
      });
    };

    // Capture unhandled promise rejections
    window.onunhandledrejection = (event) => {
      const reason = event.reason;
      this._report({
        type: 'unhandledRejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : '',
      });
    };

    // Intercept console.error to also capture logged errors
    const originalError = console.error.bind(console);
    console.error = (...args) => {
      originalError(...args);
      this._report({
        type: 'console.error',
        message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      });
    };

    // Intercept console.warn for visibility
    const originalWarn = console.warn.bind(console);
    console.warn = (...args) => {
      originalWarn(...args);
      this._report({
        type: 'console.warn',
        message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      });
    };

    // Performance: log long frames
    this._monitorFrameRate();

    console.log('[Debug] Client debug instrumentation active');
  }

  /** Send error to server */
  _report(errorInfo) {
    const entry = {
      ...errorInfo,
      timestamp: new Date().toISOString(),
      playerId: this.playerId,
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    this.errors.push(entry);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Fire-and-forget POST to server
    try {
      fetch(DEBUG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).catch(() => { /* server might be down, ignore */ });
    } catch { /* ignore */ }
  }

  /** Monitor for frame drops (log if frame takes >50ms) */
  _monitorFrameRate() {
    let lastFrame = performance.now();
    let longFrameCount = 0;

    const check = () => {
      const now = performance.now();
      const frameDuration = now - lastFrame;

      // Log if frame took more than 50ms (under 20fps)
      if (frameDuration > 50 && this.enabled) {
        longFrameCount++;
        // Only report every 10th long frame to avoid spam
        if (longFrameCount % 10 === 1) {
          this._report({
            type: 'performance',
            message: `Long frame: ${Math.round(frameDuration)}ms (${longFrameCount} total long frames)`,
          });
        }
      }

      lastFrame = now;
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  /** Log a custom debug event */
  log(category, message, data) {
    if (!this.enabled) return;
    this._report({
      type: 'custom',
      message: `[${category}] ${message}`,
      data,
    });
  }

  /** Get all captured errors (for in-browser inspection) */
  getErrors() {
    return [...this.errors];
  }
}

// Singleton
export const debugClient = new DebugClient();

// Make accessible from browser console for manual inspection
if (typeof window !== 'undefined') {
  window.__ourfarmDebug = {
    getErrors: () => debugClient.getErrors(),
    getState: async () => {
      const res = await fetch('/api/debug/state');
      return res.json();
    },
    getHealth: async () => {
      const res = await fetch('/api/health');
      return res.json();
    },
  };
}
