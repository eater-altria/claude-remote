/* Minimal leveled logger with timestamps. */
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const envLevel = (process.env.CLAUDE_REMOTE_LOG_LEVEL as Level) || 'info';
const threshold = order[envLevel] ?? order.info;

function fmt(level: Level, scope: string, args: unknown[]): unknown[] {
  const ts = new Date().toISOString();
  return [`${ts} [${level.toUpperCase()}] (${scope})`, ...args];
}

export function createLogger(scope: string) {
  const log = (level: Level, args: unknown[]) => {
    if (order[level] < threshold) return;
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(...fmt(level, scope, args));
  };
  return {
    debug: (...a: unknown[]) => log('debug', a),
    info: (...a: unknown[]) => log('info', a),
    warn: (...a: unknown[]) => log('warn', a),
    error: (...a: unknown[]) => log('error', a),
  };
}

export type Logger = ReturnType<typeof createLogger>;
