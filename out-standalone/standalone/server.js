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
exports.ClaudineServer = void 0;
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const ws_1 = require("ws");
const StandaloneAdapter_1 = require("../src/platform/StandaloneAdapter");
const StateManager_1 = require("../src/services/StateManager");
const StorageService_1 = require("../src/services/StorageService");
const ImageGenerator_1 = require("../src/services/ImageGenerator");
const ClaudeCodeWatcher_1 = require("../src/providers/ClaudeCodeWatcher");
const CommandProcessor_1 = require("../src/services/CommandProcessor");
const StandaloneMessageHandler_1 = require("./StandaloneMessageHandler");
const constants_1 = require("../src/constants");
const MIME_TYPES = {
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
class ClaudineServer {
    _httpServer;
    _wss;
    _platform;
    _stateManager;
    _storageService;
    _imageGenerator;
    _claudeCodeWatcher;
    _commandProcessor;
    _messageHandler;
    _archiveTimer;
    _authToken;
    _clients = new Set();
    constructor() {
        this._platform = new StandaloneAdapter_1.StandaloneAdapter();
        this._authToken = crypto.randomBytes(constants_1.NONCE_BYTES).toString('hex');
    }
    async start(options) {
        // Initialize async dependencies (chokidar)
        await this._platform.initAsync();
        // Initialize services
        this._storageService = new StorageService_1.StorageService(this._platform);
        this._stateManager = new StateManager_1.StateManager(this._storageService, this._platform);
        this._imageGenerator = new ImageGenerator_1.ImageGenerator(this._storageService, this._platform);
        this._claudeCodeWatcher = new ClaudeCodeWatcher_1.ClaudeCodeWatcher(this._stateManager, this._platform, this._imageGenerator);
        await this._stateManager.ready;
        this._commandProcessor = new CommandProcessor_1.CommandProcessor(this._stateManager, this._platform);
        // Create message handler
        this._messageHandler = new StandaloneMessageHandler_1.StandaloneMessageHandler(this._stateManager, this._claudeCodeWatcher, this._platform, (msg) => this.broadcast(msg));
        // Listen for conversation changes and push to all clients
        this._stateManager.onConversationsChanged((conversations) => {
            this.broadcast({ type: 'updateConversations', conversations });
        });
        // Periodic archive check
        this._archiveTimer = setInterval(() => {
            this._stateManager.archiveStaleConversations();
        }, constants_1.ARCHIVE_CHECK_INTERVAL_MS);
        // Resolve paths for serving static files
        const webviewDist = this.resolveWebviewDist();
        // Create HTTP server
        this._httpServer = http.createServer((req, res) => {
            this.handleHttpRequest(req, res, webviewDist);
        });
        // Create WebSocket server
        this._wss = new ws_1.WebSocketServer({ server: this._httpServer });
        this._wss.on('connection', (ws) => this.handleWsConnection(ws));
        // Set up file watcher (without initial scan — the progressive scan
        // is triggered by the first 'ready' message from a client)
        this._claudeCodeWatcher.setupFileWatcher();
        this._commandProcessor.startWatching();
        // Start listening
        return new Promise((resolve) => {
            this._httpServer.listen(options.port, options.host, () => {
                console.log(`Claudine server running at http://${options.host}:${options.port}`);
                resolve();
            });
        });
    }
    async stop() {
        if (this._archiveTimer) {
            clearInterval(this._archiveTimer);
            this._archiveTimer = undefined;
        }
        this._claudeCodeWatcher?.stopWatching();
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
            }
            else {
                resolve();
            }
        });
    }
    resolveWebviewDist() {
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
    handleHttpRequest(req, res, webviewDist) {
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
    serveStaticFile(filePath, res) {
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
    serveIndexHtml(res) {
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
    handleWsConnection(ws) {
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
            }
            catch (err) {
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
    broadcast(message) {
        const data = JSON.stringify(message);
        for (const ws of this._clients) {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }
}
exports.ClaudineServer = ClaudineServer;
//# sourceMappingURL=server.js.map