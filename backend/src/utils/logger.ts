type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, event: string, message: string): void {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, message });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

export const logger = {
  info: (event: string, message: string) => write('info', event, message),
  warn: (event: string, message: string) => write('warn', event, message),
  error: (event: string, message: string) => write('error', event, message)
};
