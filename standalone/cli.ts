import { ClaudineServer } from './server';

const DEFAULT_PORT = 5147;
const DEFAULT_HOST = '127.0.0.1';

function parseArgs(argv: string[]): { port: number; host: string; open: boolean; help: boolean } {
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let open = true;
  let help = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--no-open') {
      open = false;
    } else if (arg === '--port' || arg === '-p') {
      const next = argv[++i];
      const parsed = parseInt(next, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Invalid port: ${next}`);
        process.exit(1);
      }
      port = parsed;
    } else if (arg === '--host') {
      host = argv[++i] || DEFAULT_HOST;
    } else if (arg === 'standalone') {
      // Ignored — for compatibility with `claudine standalone`
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return { port, host, open, help };
}

function printHelp() {
  console.log(`
Claudine — Kanban board for Claude Code conversations

Usage: claudine [options]

Options:
  -p, --port <number>   Port to listen on (default: ${DEFAULT_PORT})
  --host <address>      Host to bind to (default: ${DEFAULT_HOST})
  --no-open             Don't auto-open browser
  -h, --help            Show this help

Examples:
  claudine                    Start server and open browser
  claudine --port 8080        Use custom port
  claudine --no-open          Start without opening browser
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

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const server = new ClaudineServer();

  // Graceful shutdown
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

main().catch((err) => {
  console.error('Claudine: Fatal error', err);
  process.exit(1);
});
