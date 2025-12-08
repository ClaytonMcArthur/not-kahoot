// node-client/client-api.js

/**
 * Client-facing HTTP API + SSE bridge for the game.
 *
 * Responsibilities:
 * - Serve REST-like endpoints used by the React frontend
 * - Maintain 1 persistent TCP GameClient per user (username -> TCP session)
 * - Fan out TCP server messages to the browser via per-user SSE streams
 * - Provide simple auth (signup/login/me) backed by SQLite
 * - Serve the React production build as static assets
 */

// Boot the TCP game server as a side-effect so the HTTP API can bridge to it.
// NOTE: This assumes `./server` starts listening immediately on TCP_HOST/TCP_PORT.
require('./server');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const GameClient = require('./GameClient');
const db = require('./db');

const app = express();

// Enable CORS for browser clients (dev/prod depending on deployment).
app.use(cors());

// Parse JSON bodies for API routes.
app.use(bodyParser.json());

// ===================== AUTH CONFIG + DB HELPERS =====================

/**
 * JWT signing secret.
 * - In production, set JWT_SECRET via environment variables.
 * - The fallback is for local development only.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-this';

/**
 * Prepared statements (SQLite) for consistent, safe DB access.
 * Using prepared statements avoids repeated SQL compilation and reduces injection risk.
 */
const insertUserStmt = db.prepare(`
  INSERT INTO users (username, password_hash)
  VALUES (?, ?)
`);

const findUserByUsernameStmt = db.prepare(`
  SELECT * FROM users WHERE username = ?
`);

const findUserByIdStmt = db.prepare(`
  SELECT id, username, created_at FROM users WHERE id = ?
`);

/**
 * Express middleware that requires a valid Bearer token.
 * On success:
 * - attaches req.userId (from JWT payload)
 * On failure:
 * - returns 401
 */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');

  // Authorization header must look like: "Bearer <token>"
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Resolve username from:
 *  1) Request body (username or nested username.username)
 *  2) X-Username header
 *  3) Bearer token -> userId -> DB lookup
 *
 * This supports multiple client shapes without breaking old callers.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function resolveUsername(req) {
  // Support body.username as a string OR body.username.username (legacy/alternate payload shapes)
  const bodyUser =
    typeof req.body?.username === 'string'
      ? req.body.username
      : typeof req.body?.username?.username === 'string'
        ? req.body.username.username
        : null;

  if (bodyUser && bodyUser.trim()) return bodyUser.trim();

  // Header-based identity (set by the browser client)
  const headerUser = req.headers['x-username'];
  if (typeof headerUser === 'string' && headerUser.trim()) return headerUser.trim();

  // Token-based identity (fallback when no explicit username is provided)
  const auth = req.headers.authorization || '';
  const [type, token] = auth.split(' ');
  if (type === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = findUserByIdStmt.get(payload.userId);
      if (user?.username) return user.username;
    } catch (_) {
      // Ignore verification/lookup errors and fall through to null
    }
  }

  return null;
}

// ===================== TCP + CLIENT POOL =====================

/**
 * TCP server connection config.
 * Defaults assume local co-located TCP server.
 */
const TCP_HOST = process.env.TCP_HOST || '127.0.0.1';
const TCP_PORT = process.env.TCP_PORT || 4000;

/**
 * One GameClient per username.
 * Each GameClient maintains a persistent TCP socket to the game server.
 *
 * Map: username -> GameClient instance
 */
const clientsByUser = new Map();

function getClientForUser(username) {
  return clientsByUser.get(username) || null;
}

// ===================== SSE (per-user) =====================

/**
 * Per-user SSE connection pool.
 * Map: username -> Set(res) where res is an Express Response kept open for streaming.
 */
const sseByUser = new Map();

function sseSet(username) {
  if (!sseByUser.has(username)) sseByUser.set(username, new Set());
  return sseByUser.get(username);
}

/**
 * Safe write helper for SSE.
 * Failing to write can occur when a connection is already closed.
 */
function safeWrite(res, payload) {
  try {
    // SSE format: each event is "data: <json>\n\n"
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (_) {
    // Ignore write errors (client likely disconnected)
  }
}

/**
 * Broadcast a message to all SSE listeners for a given user.
 */
function broadcastToUser(username, msg) {
  const set = sseByUser.get(username);
  if (!set) return;

  for (const res of set) safeWrite(res, msg);
}

/**
 * SSE endpoint (browser connects via EventSource).
 * GET /api/events?username=...
 *
 * Keeps the connection open and stores the response in the user's SSE set.
 */
app.get('/api/events', (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  if (!username) return res.status(400).end('username query param required');

  console.log('SSE /api/events connection opened for', username);

  // Required SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Flush headers immediately so the client considers the stream established
  res.flushHeaders();

  // Track this open SSE connection for the user
  sseSet(username).add(res);

  // Cleanup when client disconnects
  req.on('close', () => {
    console.log('SSE /api/events connection closed for', username);
    sseSet(username).delete(res);
  });
});

// ========================== AUTH ROUTES ============================

/**
 * POST /api/signup
 * Body: { username, password }
 * Creates a user with a bcrypt password hash.
 */
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  try {
    // bcrypt cost factor 10 is a common dev-friendly baseline
    const passwordHash = await bcrypt.hash(password, 10);
    insertUserStmt.run(username, passwordHash);
    return res.status(201).json({ ok: true });
  } catch (err) {
    // Unique constraint (username already exists)
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'username already taken' });
    }
    console.error('signup error', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

/**
 * POST /api/login
 * Body: { username, password }
 * Returns: { token, user: { id, username } }
 */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const user = findUserByUsernameStmt.get(username);
  if (!user) return res.status(401).json({ error: 'invalid username or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid username or password' });

  // Sign JWT so the client can authenticate future requests
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  return res.json({ token, user: { id: user.id, username: user.username } });
});

/**
 * GET /api/me
 * Requires Authorization: Bearer <token>
 * Returns: { user }
 */
app.get('/api/me', authRequired, (req, res) => {
  const user = findUserByIdStmt.get(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  return res.json({ user });
});

/**
 * GET /api/scoreboard
 * Returns top users by wins.
 */
app.get('/api/scoreboard', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT username, wins
      FROM users
      ORDER BY wins DESC, username ASC
      LIMIT 10
    `);
    const leaders = stmt.all();
    return res.json({ leaders });
  } catch (err) {
    console.error('scoreboard error: ', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

// ===================== GAME HELPERS =====================

/**
 * Ensure the request has:
 * - a resolved username AND
 * - an active GameClient for that username
 *
 * Returns a { client, username } tuple. If missing, responds with an error
 * and returns { client: null, username: null } so route handlers can early-return.
 */
function requireClient(req, res) {
  const username = resolveUsername(req);
  if (!username) {
    res
      .status(400)
      .json({ ok: false, error: 'username required (body, x-username, or auth token)' });
    return { client: null, username: null };
  }

  const client = getClientForUser(username);
  if (!client) {
    res.status(400).json({ ok: false, error: 'Not connected (call /api/connect first)' });
    return { client: null, username: null };
  }

  return { client, username };
}

/**
 * Await a specific GameClient event.
 * - Listens for `type` on the client (EventEmitter semantics)
 * - Resolves when predicate matches
 * - Rejects after timeoutMs
 *
 * @param {GameClient} client
 * @param {string} type
 * @param {(msg:any) => boolean} predicate
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function waitFor(client, type, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let timeout;

    const handler = (msg) => {
      try {
        if (!predicate || predicate(msg)) {
          clearTimeout(timeout);
          client.removeListener(type, handler);
          resolve(msg);
        }
      } catch (e) {
        // Predicate threw; ignore and keep listening until timeout
      }
    };

    timeout = setTimeout(() => {
      client.removeListener(type, handler);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    client.on(type, handler);
  });
}

// ===================== GAME ROUTES =====================

/**
 * POST /api/connect
 * Body: { username }
 *
 * Establishes (or reuses) a per-user TCP connection and registers the username
 * with the TCP server before allowing subsequent requests.
 */
app.post('/api/connect', async (req, res) => {
  const username = resolveUsername(req) || req.body?.username;
  console.log('HTTP /api/connect', req.body);

  if (!username || !username.trim()) {
    return res.status(400).json({ ok: false, error: 'Username is required' });
  }

  const user = username.trim();

  try {
    // If there is an already-connected client, reuse it
    const existing = clientsByUser.get(user);
    if (existing && existing.connected) {
      return res.json({ ok: true });
    }

    // If a stale/disconnected client exists, close/cleanup it
    if (existing && !existing.connected) {
      try {
        existing.close();
      } catch (_) {
        // Ignore close errors
      }
      clientsByUser.delete(user);
    }

    // Create a new TCP bridge client for this user
    const client = new GameClient(TCP_HOST, TCP_PORT, user);

    // Defensive: remove any prior listeners to avoid duplicate event fan-out
    client.removeAllListeners('message');
    client.removeAllListeners('error');

    // Forward all TCP messages to the browser via SSE
    client.on('message', (msg) => {
      console.log('GameClient message from TCP:', msg);
      broadcastToUser(user, msg);
    });

    // Forward TCP errors to the browser via SSE
    client.on('error', (err) => {
      console.error('GameClient error:', err);
      broadcastToUser(user, { type: 'ERROR', message: err.message });
    });

    // Optional lifecycle logging
    client.on('disconnect', () => {
      console.log('GameClient disconnected for', user);
    });

    // Open TCP socket connection
    await client.connect();

    // IMPORTANT:
    // Wait for REGISTER_OK so the TCP server has associated this socket with the username.
    const pendingRegister = waitFor(
      client,
      'REGISTER_OK',
      (m) => m?.username === user,
      5000
    );

    // Trigger registration handshake and wait for confirmation
    client.register();
    await pendingRegister;

    // Store the connected client in the per-user pool
    clientsByUser.set(user, client);

    console.log(`Registered username: ${user}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Failed to connect to TCP server in /api/connect:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/listGames
 * Requests current available games list from the TCP server.
 */
app.post('/api/listGames', async (req, res) => {
  console.log('HTTP /api/listGames');

  const { client } = requireClient(req, res);
  if (!client) return;

  try {
    const pending = waitFor(client, 'GAMES_LIST', () => true, 5000);
    client.listGames();
    const msg = await pending;

    return res.json({ success: true, games: msg.games || [] });
  } catch (err) {
    console.error('listGames error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/createGame
 * Body: options object (server-defined)
 */
app.post('/api/createGame', async (req, res) => {
  console.log('HTTP /api/createGame', req.body);

  const { client, username } = requireClient(req, res);
  if (!client) return;

  // Ensure username is present in options for server-side attribution
  const options = req.body || {};
  options.username = options.username || username;

  try {
    const pending = waitFor(client, 'GAME_CREATED', () => true, 5000);
    client.createGame(options);
    const msg = await pending;

    return res.json({ success: true, game: msg.game });
  } catch (err) {
    console.error('createGame error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/startGame
 * Body: { pin }
 */
app.post('/api/startGame', (req, res) => {
  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ ok: false, error: 'pin is required' });

  client.startGame(pin, username);
  return res.json({ ok: true });
});

/**
 * POST /api/joinGame
 * Body: { gameId }
 */
app.post('/api/joinGame', async (req, res) => {
  console.log('HTTP /api/joinGame', req.body);

  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  try {
    // Wait for JOINED_GAME confirmation matching the game pin/id
    const pending = waitFor(
      client,
      'JOINED_GAME',
      (m) => m?.game?.pin === gameId,
      5000
    );

    client.joinGame(gameId, username);
    const msg = await pending;

    return res.json({ ok: true, game: msg.game });
  } catch (err) {
    console.error('joinGame error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/exitGame
 * Body: { gameId }
 */
app.post('/api/exitGame', (req, res) => {
  console.log('HTTP /api/exitGame', req.body);

  const { client } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  client.exitGame(gameId);
  return res.json({ ok: true });
});

/**
 * POST /api/sendAnswer
 * Body: { gameId, questionId, answer }
 *
 * Note: This route intentionally normalizes "answer" into a boolean `correct`
 * expected by the TCP server API.
 */
app.post('/api/sendAnswer', (req, res) => {
  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId, answer } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  // Normalize various truthy representations to boolean
  const correct =
    answer === true || answer === 'true' || answer === 1 || answer === '1';

  console.log('sendAnswer ->', { pin: gameId, correct, username });
  client.sendAnswer(gameId, correct, username);

  return res.json({ ok: true });
});

/**
 * POST /api/nextQuestion
 * Body: { gameId }
 */
app.post('/api/nextQuestion', (req, res) => {
  console.log('HTTP /api/nextQuestion', req.body);

  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  client.nextQuestion(gameId, username);
  return res.json({ ok: true });
});

/**
 * POST /api/endGame
 * Body: { gameId }
 */
app.post('/api/endGame', (req, res) => {
  console.log('HTTP /api/endGame', req.body);

  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  client.endGame(gameId, username);
  return res.json({ ok: true });
});

/**
 * POST /api/awardWinner
 * Body: { pin, username }
 *
 * Increments the user's win count in the database.
 */
app.post('/api/awardWinner', (req, res) => {
  // Support both { username: "..." } and { username: { username: "..." } }
  const raw = req.body?.username;
  const name =
    typeof raw === 'string'
      ? raw
      : typeof raw?.username === 'string'
        ? raw.username
        : null;

  if (!name) return res.status(400).json({ ok: false, error: 'username required' });

  try {
    const stmt = db.prepare(`
      UPDATE users
      SET wins = wins + 1
      WHERE username = ?
    `);
    stmt.run(name);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Failed to award win: ', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/chat
 * Body: { pin, message }
 *
 * Forwards a chat message to the TCP server.
 */
app.post('/api/chat', (req, res) => {
  console.log('HTTP /api/chat', req.body);

  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { pin, message } = req.body || {};
  if (!pin || !message) {
    return res.status(400).json({ ok: false, error: 'pin and message are required' });
  }

  client.sendChat(pin, message, username);
  return res.json({ ok: true });
});

/**
 * POST /api/submitQuestion
 * Body: { pin, question, answerTrue }
 *
 * Forwards a question submission to the TCP server.
 */
app.post('/api/submitQuestion', (req, res) => {
  console.log('HTTP /api/submitQuestion', req.body);

  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { pin, question } = req.body || {};
  const answerTrue = !!req.body?.answerTrue;

  if (!pin || !question) {
    return res.status(400).json({ ok: false, error: 'pin and question are required' });
  }

  client.submitQuestion(pin, question, answerTrue, username);
  return res.json({ ok: true });
});

// ===== Serve React static build =====

/**
 * Serve the React production build from /build.
 * This assumes the build output is located at: node-client/build
 */
const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));

/**
 * SPA fallback: for any non-API route, return index.html so React Router can handle it client-side.
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// ===== Start HTTP server (Render uses PORT env) =====

/**
 * Start the HTTP server.
 * - Render (and many platforms) provide PORT via environment variable.
 * - Logs both HTTP port and expected TCP server endpoint for debugging.
 */
const HTTP_PORT = process.env.PORT || 3001;
app.listen(HTTP_PORT, () => {
  console.log(`HTTP API + static server listening on port ${HTTP_PORT}`);
  console.log(
    `TCP server expected at ${TCP_HOST}:${TCP_PORT} (started via require('./server'))`
  );
});