"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const DEFAULT_PORT = 5147;
const DEFAULT_HOST = '127.0.0.1';
function parseArgs(argv) {
    let port = DEFAULT_PORT;
    let host = DEFAULT_HOST;
    let open = true;
    let help = false;
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            help = true;
        }
        else if (arg === '--no-open') {
            open = false;
        }
        else if (arg === '--port' || arg === '-p') {
            const next = argv[++i];
            const parsed = parseInt(next, 10);
            if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
                console.error(`Invalid port: ${next}`);
                process.exit(1);
            }
            port = parsed;
        }
        else if (arg === '--host') {
            host = argv[++i] || DEFAULT_HOST;
        }
        else if (arg === 'standalone') {
            // Ignored — for compatibility with `claudine standalone`
        }
        else {
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
async function openBrowser(url) {
    const { execFile } = await Promise.resolve().then(() => __importStar(require('child_process')));
    const platform = process.platform;
    if (platform === 'darwin') {
        execFile('open', [url]);
    }
    else if (platform === 'win32') {
        execFile('cmd', ['/c', 'start', url]);
    }
    else {
        execFile('xdg-open', [url]);
    }
}
async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        process.exit(0);
    }
    const server = new server_1.ClaudineServer();
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
//# sourceMappingURL=cli.js.map