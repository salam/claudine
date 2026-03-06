import { ClaudineServer } from './server';

declare const CLAUDINE_VERSION: string;
const VERSION = CLAUDINE_VERSION;

const DEFAULT_PORT = 5147;
const DEFAULT_HOST = '127.0.0.1';

// ── Standalone subcommand ────────────────────────────────────────────

interface StandaloneArgs {
  port: number;
  host: string;
  open: boolean;
}

function parseStandaloneArgs(argv: string[]): StandaloneArgs {
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let open = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      const next = argv[++i];
      const parsed = parseInt(next, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Invalid port: ${next}`);
        process.exit(1);
      }
      port = parsed;
    } else if (arg === '--host') {
      host = argv[++i] || DEFAULT_HOST;
    } else if (arg === '--no-open') {
      open = false;
    } else if (arg === '--help' || arg === '-h') {
      printStandaloneHelp();
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return { port, host, open };
}

function printStandaloneHelp() {
  console.log(`
Usage: claudine standalone [options]

Start the Claudine web server and open the kanban board in your browser.

Options:
  -p, --port <number>   Port to listen on (default: ${DEFAULT_PORT})
  --host <address>      Host to bind to (default: ${DEFAULT_HOST})
  --no-open             Don't auto-open the browser
  -h, --help            Show this help
`);
}

async function openBrowser(url: string) {
  const { execFile } = await import('child_process');
  const platform = process.platform;

  if (platform === 'darwin') {
    execFile('open', [url]);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

async function runStandalone(argv: string[]) {
  const args = parseStandaloneArgs(argv);
  const server = new ClaudineServer();

  const shutdown = async () => {
    console.log('\nClaudine: Shutting down...');
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.start({ port: args.port, host: args.host });

  const url = `http://${args.host}:${args.port}`;

  if (args.open) {
    await openBrowser(url);
  }

  console.log(`\nOpen ${url} in your browser`);
  console.log('Press Ctrl+C to stop\n');
}

// ── Top-level CLI ────────────────────────────────────────────────────

function printHelp() {
  console.log(`
Claudine v${VERSION} — Kanban board for Claude Code conversations

Usage: claudine <command> [options]

Commands:
  standalone    Start the web server (browser-based board)

Options:
  -v, --version   Show version
  -h, --help      Show this help

Run claudine <command> --help for command-specific options.
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  if (command === 'standalone') {
    await runStandalone(args.slice(1));
    return;
  }

  console.error(`Unknown command: ${command}\n`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error('Claudine: Fatal error', err);
  process.exit(1);
});
