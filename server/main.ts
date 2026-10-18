/**
 * Entry point of the online server (`npm run server`, or the bundled
 * dist-server/index.js under a process manager such as systemd, Docker or
 * Plesk/Passenger). Configuration comes from environment variables, see
 * DEPLOY.md.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './index';
import { DIFFICULTIES, type DifficultyId } from '../src/sim/data/difficulty';

const difficulty = (process.env.NEON_DIFFICULTY ?? 'standard') as DifficultyId;
const staticDir = process.env.NEON_STATIC ? resolve(process.env.NEON_STATIC) : existsSync(resolve('dist')) ? resolve('dist') : null;

void startServer({
  port: Number(process.env.PORT ?? 8787),
  dataDir: resolve(process.env.NEON_DATA ?? 'data'),
  seed: process.env.NEON_SEED ?? 'nova-eclipse-online',
  citySize: Number(process.env.NEON_CITY_SIZE ?? 128),
  difficulty: difficulty in DIFFICULTIES ? difficulty : 'standard',
  speed: Number(process.env.NEON_SPEED ?? 1),
  autosaveSeconds: Number(process.env.NEON_AUTOSAVE ?? 30),
  staticDir,
}).then((server) => {
  const shutdown = (): void => {
    console.log('Speichere Welt und beende …');
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
