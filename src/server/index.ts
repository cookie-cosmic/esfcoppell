import app from './app.js';
import { flushCloudSnapshot } from './db.js';

const PORT = Number(process.env.PORT || 8080);
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Endless Smiles Coppell server listening on :${PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}; flushing persistence before shutdown`);
  server.close(async (error) => {
    if (error) {
      console.error('[server] failed to close cleanly', error);
      process.exitCode = 1;
    }
    await flushCloudSnapshot();
    process.exit();
  });
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
