export type Logger = {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
};

export function createLogger(enabled: boolean): Logger {
  const log = (level: 'debug' | 'info' | 'error', message: string, data?: unknown) => {
    if (level === 'debug' && !enabled) {
      return;
    }
    if (data !== undefined) {
      console.log(`[docright-refactor:${level}]`, message, data);
    } else {
      console.log(`[docright-refactor:${level}]`, message);
    }
  };

  return {
    debug: (message, data) => log('debug', message, data),
    info: (message, data) => log('info', message, data),
    error: (message, data) => log('error', message, data)
  };
}
