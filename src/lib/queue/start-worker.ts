/**
 * Worker Startup Script
 * Run this as a separate process to start processing meeting jobs.
 *
 * Usage: npx tsx src/lib/queue/start-worker.ts
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

// Dynamic import AFTER dotenv is loaded, so all services read correct env vars
async function main() {
  console.log('[MRMS Worker] Starting worker process...');
  console.log('[MRMS Worker] ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET');
  console.log('[MRMS Worker] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'set' : 'NOT SET');

  const { createWorker } = await import('./worker');
  const worker = createWorker();

  console.log('[MRMS Worker] Worker started. Waiting for jobs...');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[MRMS Worker] Received ${signal}. Shutting down gracefully...`);
    await worker.close();
    console.log('[MRMS Worker] Worker stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep the process alive
  process.on('unhandledRejection', (reason) => {
    console.error('[MRMS Worker] Unhandled rejection:', reason);
  });
}

main();
