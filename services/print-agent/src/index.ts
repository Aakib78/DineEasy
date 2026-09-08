import { DineEasyApiClient, PrinterRecord } from './api-client';
import { loadConfigFromEnv } from './config';
import { consoleLogger, startPollLoop } from './poll-loop';
import { sendToPrinter } from './printer-socket';

/**
 * Entry point for the standalone LAN print agent — see README.md for what this process is,
 * why it exists as its own thing rather than a feature of `services/api`, and how to run it.
 * Deliberately thin: config parsing, wiring the real API client + real TCP sender into
 * `startPollLoop`, and turning process signals into a clean shutdown. All the actual decisions
 * (which printer, what counts as a job, how failures get reported) live in `poll-loop.ts`,
 * where they're unit-tested; this file has no logic worth testing on its own.
 */
async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  const client = new DineEasyApiClient(config.apiBaseUrl);

  consoleLogger.log(`Logging in to ${config.apiBaseUrl} as ${config.email}...`);
  await client.login(config.email, config.password, config.deviceInfo);
  consoleLogger.log('Logged in. Starting poll loop.');

  const stop = startPollLoop(
    {
      client,
      send: (ticket, printer: PrinterRecord) =>
        sendToPrinter(ticket, {
          host: printer.ipAddress as string,
          port: printer.port as number,
          timeoutMs: config.jobTimeoutMs,
        }),
      logger: consoleLogger,
    },
    config.pollIntervalMs,
  );

  const shutdown = (signal: string) => {
    consoleLogger.log(`Received ${signal}, stopping poll loop...`);
    stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`Print agent failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
