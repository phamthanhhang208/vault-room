import winston from 'winston';

const { combine, timestamp, colorize, printf } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts }) => {
  const time = typeof ts === 'string' ? ts.slice(11, 19) : '';
  return `[${time}] [${level.toUpperCase().padEnd(5)}] ${message}`;
});

export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: combine(
    timestamp(),
    colorize({ all: true }),
    logFormat,
  ),
  transports: [new winston.transports.Console()],
});
