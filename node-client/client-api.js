// node-client/client-api.js
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
app.use(cors());
app.use(bodyParser.json());

// ===================== AUTH CONFIG + DB HELPERS =====================
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-this';

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

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Resolve username from (1) body, (2) header, (3) JWT userId -> DB lookup
function resolveUsername(req) {
  const bodyUser =
    typeof req.body?.username === 'string'
      ? req.body.username
      : typeof req.body?.username?.username === 'string'
        ? req.body.username.username
        : null;

  if (bodyUser && bodyUser.trim()) return bodyUser.trim();

  const headerUser = req.headers['x-username'];
  if (typeof headerUser === 'string' && headerUser.trim()) return headerUser.trim();

  const auth = req.headers.authorization || '';
  const [type, token] = auth.split(' ');
  if (type === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = findUserByIdStmt.get(payload.userId);
      if (user?.username) return user.username;
    } catch (_) {}
  }

  return null;
}

// ===================== TCP + CLIENT POOL =====================
const TCP_HOST = process.env.TCP_HOST || '127.0.0.1';
const TCP_PORT = process.env.TCP_PORT || 4000;

// One GameClient PER USERNAME
const clientsByUser = new Map(); // username -> GameClient

function getClientForUser(username) {
  return clientsByUser.get(username) || null;
}

// ===================== SSE (per-user) =====================
const sseByUser = new Map(); // username -> Set(res)

function sseSet(username) {
  if (!sseByUser.has(username)) sseByUser.set(username, new Set());
  return sseByUser.get(username);
}

function safeWrite(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (_) {}
}

function broadcastToUser(username, msg) {
  const set = sseByUser.get(username);
  if (!set) return;
  for (const res of set) safeWrite(res, msg);
}

// GET /api/events?username=...
app.get('/api/events', (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  if (!username) return res.status(400).end('username query param required');

  console.log('SSE /api/events connection opened for', username);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseSet(username).add(res);

  req.on('close', () => {
    console.log('SSE /api/events connection closed for', username);
    sseSet(username).delete(res);
  });
});

// ========================== AUTH ROUTES ============================

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    insertUserStmt.run(username, passwordHash);
    return res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'username already taken' });
    }
    console.error('signup error', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const user = findUserByUsernameStmt.get(username);
  if (!user) return res.status(401).json({ error: 'invalid username or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid username or password' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  return res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/api/me', authRequired, (req, res) => {
  const user = findUserByIdStmt.get(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  return res.json({ user });
});

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
function requireClient(req, res) {
  const username = resolveUsername(req);
  if (!username) {
    res.status(400).json({ ok: false, error: 'username required (body, x-username, or auth token)' });
    return { client: null, username: null };
  }

  const client = getClientForUser(username);
  if (!client) {
    res.status(400).json({ ok: false, error: 'Not connected (call /api/connect first)' });
    return { client: null, username: null };
  }

  return { client, username };
}

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
        // predicate threw
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

// POST /api/connect { username }
app.post('/api/connect', async (req, res) => {
  const username = resolveUsername(req) || req.body?.username;
  console.log('HTTP /api/connect', req.body);

  if (!username || !username.trim()) {
    return res.status(400).json({ ok: false, error: 'Username is required' });
  }

  const user = username.trim();

  try {
    const existing = clientsByUser.get(user);
    if (existing && existing.connected) {
      return res.json({ ok: true });
    }

    if (existing && !existing.connected) {
      // kill old socket if any
      try { existing.close(); } catch (_) {}
      clientsByUser.delete(user);
    }

    const client = new GameClient(TCP_HOST, TCP_PORT, user);

    client.removeAllListeners('message');
    client.removeAllListeners('error');

    client.on('message', (msg) => {
      console.log('GameClient message from TCP:', msg);
      broadcastToUser(user, msg);
    });

    client.on('error', (err) => {
      console.error('GameClient error:', err);
      broadcastToUser(user, { type: 'ERROR', message: err.message });
    });

    client.on('disconnect', () => {
      console.log('GameClient disconnected for', user);
    });

    await client.connect();
    client.register();

    clientsByUser.set(user, client);

    console.log(`Registered username: ${user}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Failed to connect to TCP server in /api/connect:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listGames
app.post('/api/listGames', async (req, res) => {
  console.log('HTTP /api/listGames');
  const { client } = requireClient(req, res);
  if (!client) return;

  try {
    const msg = await waitFor(client, 'GAMES_LIST', () => true, 5000);
    return res.json({ success: true, games: msg.games || [] });
  } catch (err) {
    console.error('listGames error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.listGames();
  }
});

// POST /api/createGame
app.post('/api/createGame', async (req, res) => {
  console.log('HTTP /api/createGame', req.body);
  const { client, username } = requireClient(req, res);
  if (!client) return;

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

// POST /api/startGame { pin }
app.post('/api/startGame', (req, res) => {
  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ ok: false, error: 'pin is required' });

  client.startGame(pin, username);
  return res.json({ ok: true });
});

// POST /api/joinGame { gameId }
app.post('/api/joinGame', async (req, res) => {
  console.log('HTTP /api/joinGame', req.body);
  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  try {
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

// POST /api/exitGame { gameId }
app.post('/api/exitGame', (req, res) => {
  console.log('HTTP /api/exitGame', req.body);
  const { client } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  client.exitGame(gameId);
  return res.json({ ok: true });
});

// POST /api/sendAnswer { gameId, questionId, answer }
app.post('/api/sendAnswer', (req, res) => {
  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId, answer } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  const correct =
    answer === true || answer === 'true' || answer === 1 || answer === '1';

  console.log('sendAnswer ->', { pin: gameId, correct, username });
  client.sendAnswer(gameId, correct, username);

  return res.json({ ok: true });
});

// POST /api/nextQuestion { gameId }
app.post('/api/nextQuestion', (req, res) => {
  console.log('HTTP /api/nextQuestion', req.body);
  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  client.nextQuestion(gameId, username);
  return res.json({ ok: true });
});

// POST /api/endGame { gameId }
app.post('/api/endGame', (req, res) => {
  console.log('HTTP /api/endGame', req.body);
  const { client, username } = requireClient(req, res);
  if (!client) return;

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId is required' });

  client.endGame(gameId, username);
  return res.json({ ok: true });
});

// POST /api/awardWinner { pin, username }
app.post('/api/awardWinner', (req, res) => {
  const raw = req.body?.username;
  const name =
    typeof raw === 'string' ? raw :
    typeof raw?.username === 'string' ? raw.username :
    null;

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

// POST /api/chat { pin, message }
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

// POST /api/submitQuestion { pin, question, answerTrue }
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
const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));

// Fallback to index.html for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// ===== Start HTTP server (Render uses PORT env) =====
const HTTP_PORT = process.env.PORT || 3001;
app.listen(HTTP_PORT, () => {
  console.log(`HTTP API + static server listening on port ${HTTP_PORT}`);
  console.log(`TCP server expected at ${TCP_HOST}:${TCP_PORT} (started via require('./server'))`);
});