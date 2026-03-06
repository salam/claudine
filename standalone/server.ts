import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { StandaloneAdapter } from '../src/platform/StandaloneAdapter';
import { StateManager } from '../src/services/StateManager';
import { StorageService } from '../src/services/StorageService';
import { ImageGenerator } from '../src/services/ImageGenerator';
import { ClaudeCodeWatcher } from '../src/providers/ClaudeCodeWatcher';
import { CodexWatcher } from '../src/providers/CodexWatcher';
import { CompositeConversationProvider } from '../src/providers/CompositeConversationProvider';
import { IConversationProvider } from '../src/providers/IConversationProvider';
import { CommandProcessor } from '../src/services/CommandProcessor';
import { StandaloneMessageHandler } from './StandaloneMessageHandler';
import { ExtensionToWebviewMessage } from '../src/types';
import { ARCHIVE_CHECK_INTERVAL_MS, NONCE_BYTES } from '../src/constants';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface ServerOptions {
  port: number;
  host: string;
}

export class ClaudineServer {
  private _httpServer: http.Server | undefined;
  private _wss: WebSocketServer | undefined;
  private _platform: StandaloneAdapter;
  private _stateManager!: StateManager;
  private _storageService!: StorageService;
  private _imageGenerator!: ImageGenerator;
  private _provider!: IConversationProvider;
  /** Concrete Claude Code watcher — kept for static utility methods. */
  private _claudeCodeWatcher!: ClaudeCodeWatcher;
  private _commandProcessor!: CommandProcessor;
  private _messageHandler!: StandaloneMessageHandler;
  private _archiveTimer: ReturnType<typeof setInterval> | undefined;
  private _authToken: string;
  private _version: string;
  private _clients = new Set<WebSocket>();

  constructor() {
    this._platform = new StandaloneAdapter();
    this._authToken = crypto.randomBytes(NONCE_BYTES).toString('hex');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    this._version = pkg.version ?? '';
  }

  async start(options: ServerOptions): Promise<void> {
    // Initialize async dependencies (chokidar)
    await this._platform.initAsync();

    // Initialize services
    this._storageService = new StorageService(this._platform);
    this._stateManager = new StateManager(this._storageService, this._platform);
    this._imageGenerator = new ImageGenerator(this._storageService, this._platform);
    this._claudeCodeWatcher = new ClaudeCodeWatcher(this._stateManager, this._platform, this._imageGenerator);
    if (CodexWatcher.isAvailable(this._platform)) {
      const codexWatcher = new CodexWatcher(this._stateManager, this._platform);
      this._provider = new CompositeConversationProvider([this._claudeCodeWatcher, codexWatcher]);
      console.log('Claudine: Codex sessions detected — multi-provider mode');
    } else {
      this._provider = this._claudeCodeWatcher;
    }

    await this._stateManager.ready;

    this._commandProcessor = new CommandProcessor(this._stateManager, this._platform);

    // Create message handler
    this._messageHandler = new StandaloneMessageHandler(
      this._stateManager,
      this._provider,
      this._platform,
      (msg) => this.broadcast(msg)
    );

    // Listen for conversation changes and push to all clients
    this._stateManager.onConversationsChanged((conversations) => {
      this.broadcast({ type: 'updateConversations', conversations });
    });

    // Periodic archive check
    this._archiveTimer = setInterval(() => {
      this._stateManager.archiveStaleConversations();
    }, ARCHIVE_CHECK_INTERVAL_MS);

    // Resolve paths for serving static files
    const webviewDist = this.resolveWebviewDist();

    // Create HTTP server
    this._httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res, webviewDist);
    });

    // Create WebSocket server
    this._wss = new WebSocketServer({ server: this._httpServer });
    this._wss.on('connection', (ws) => this.handleWsConnection(ws));

    // Set up file watcher (without initial scan — the progressive scan
    // is triggered by the first 'ready' message from a client)
    this._provider.setupFileWatcher();
    this._commandProcessor.startWatching();

    // Start listening
    return new Promise((resolve) => {
      this._httpServer!.listen(options.port, options.host, () => {
        console.log(`Claudine server running at http://${options.host}:${options.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this._archiveTimer) {
      clearInterval(this._archiveTimer);
      this._archiveTimer = undefined;
    }

    this._provider?.stopWatching();
    this._commandProcessor?.stopWatching();
    this._stateManager?.flushSave();

    // Close all WebSocket clients
    for (const ws of this._clients) {
      ws.close();
    }
    this._clients.clear();

    this._wss?.close();

    return new Promise((resolve) => {
      if (this._httpServer) {
        this._httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private resolveWebviewDist(): string {
    // When running from compiled output, webview/dist should be relative to project root
    // Try multiple candidate paths
    const candidates = [
      path.resolve(__dirname, '..', 'webview', 'dist'),
      path.resolve(__dirname, '..', '..', 'webview', 'dist'),
      path.resolve(process.cwd(), 'webview', 'dist'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, 'assets', 'index.js'))) {
        return candidate;
      }
    }

    console.warn('Claudine: Could not locate webview/dist — falling back to cwd');
    return path.resolve(process.cwd(), 'webview', 'dist');
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse, webviewDist: string) {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Serve theme CSS
    if (pathname.startsWith('/themes/')) {
      const themePath = path.join(__dirname, pathname);
      return this.serveStaticFile(themePath, res);
    }

    // Serve webview assets
    if (pathname.startsWith('/assets/')) {
      const filePath = path.join(webviewDist, pathname);
      return this.serveStaticFile(filePath, res);
    }

    // Root — serve the SPA shell
    if (pathname === '/' || pathname === '/index.html') {
      return this.serveIndexHtml(res);
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private serveStaticFile(filePath: string, res: http.ServerResponse) {
    // Prevent directory traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(__dirname)) && !resolved.includes('webview')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(resolved)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolved);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const data = fs.readFileSync(resolved);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(data);
  }

  private serveIndexHtml(res: http.ServerResponse) {
    const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claudine</title>
  <link rel="stylesheet" href="/themes/dark.css">
  <link rel="stylesheet" href="/themes/light.css">
  <link rel="stylesheet" href="/assets/index.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
  </style>
  <script>
    // Apply saved theme (or detect system preference) before first paint to avoid flash
    (function() {
      var saved = localStorage.getItem('claudine-theme-pref');
      var theme = 'dark';
      if (saved === 'light') theme = 'light';
      else if (saved === 'dark') theme = 'dark';
      else if (saved === 'auto' || !saved) {
        theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
<body>
  <div id="app"></div>
  <script>
    window.__CLAUDINE_TOKEN__ = '${this._authToken}';
    window.__CLAUDINE_STANDALONE__ = true;
    window.__CLAUDINE_WS_URL__ = 'ws://' + location.host;
    window.__CLAUDINE_VERSION__ = '${this._version}';

  </script>
  <script src="/assets/index.js"></script>
</body>
</html>`;

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache',
    });
    res.end(html);
  }

  private handleWsConnection(ws: WebSocket) {
    let authenticated = false;
    this._clients.add(ws);

    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        // Validate auth token
        if (message._token !== this._authToken) {
          if (!authenticated) {
            ws.close(4001, 'Invalid auth token');
          }
          return;
        }

        authenticated = true;
        this._messageHandler.handleMessage(message);
      } catch (err) {
        console.error('Claudine: Error processing WebSocket message', err);
      }
    });

    ws.on('close', () => {
      this._clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('Claudine: WebSocket error', err);
      this._clients.delete(ws);
    });
  }

  private broadcast(message: ExtensionToWebviewMessage) {
    const data = JSON.stringify(message);
    for (const ws of this._clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}
