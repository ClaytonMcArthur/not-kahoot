// node-client/server.js

/**
 * TCP Game Server (authoritative game state)
 * -----------------------------------------
 * This server speaks a simple newline-delimited JSON protocol over raw TCP.
 *
 * Responsibilities:
 * - Accept TCP client connections (one per browser user via the Node HTTP bridge)
 * - Track connected clients (username, current game PIN, framing buffer)
 * - Maintain all game state in memory (games map)
 * - Broadcast state updates to all clients in the same game (by PIN)
 *
 * Notes:
 * - Incoming messages must be valid JSON objects/arrays and delimited by '\n'
 * - This server is bound to 127.0.0.1 for internal-only access (the Node HTTP API bridges to it)
 */

const net = require('net');

// TCP server port (default 4000)
const TCP_PORT = process.env.TCP_PORT || 4000;

// client = { socket, username, currentPin, buffer }
// - socket: net.Socket
// - username: string|null (set after REGISTER)
// - currentPin: string|null (game the client is currently "in")
// - buffer: string (accumulates incoming TCP data for newline framing)
const tcpClients = new Set();

/**
 * games Map
 * ---------
 * pin -> game
 *
 * game = {
 *   pin, host, state,
 *   theme, isPublic, maxPlayers,
 *   players: Set<string>,
 *   scores: Map<string, number>,
 *   questions: Array,
 *   currentQuestionIndex: number,
 *   answeredByIndex: Map<number, Set<string>>,
 *   createdAt, endedAt
 * }
 */
const games = new Map();

// Keep ended games around briefly so clients can finish UI / end screens.
const ENDED_TTL_MS = 2 * 60 * 1000;

function now() {
  return Date.now();
}

/**
 * Generate a 6-digit PIN as a string.
 */
function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Convert internal game object (with Sets/Maps) to a plain JSON-safe object.
 * This is what we ship to clients.
 */
function serializeGame(game) {
  return {
    pin: game.pin,
    host: game.host,
    state: game.state,
    theme: game.theme ?? '',
    isPublic: !!game.isPublic,
    maxPlayers: game.maxPlayers ?? 20,
    players: Array.from(game.players),
    scores: Object.fromEntries(game.scores.entries()),
    questions: game.questions || [],
    currentQuestionIndex: game.currentQuestionIndex ?? 0,
  };
}

/**
 * Send a message to a specific TCP socket (newline-delimited JSON).
 * Errors are logged; send failures are non-fatal for server loop.
 */
function send(socket, msg) {
  try {
    socket.write(JSON.stringify(msg) + '\n');
  } catch (e) {
    console.error('Failed to send to client:', e);
  }
}

/**
 * Broadcast a message to all connected clients currently in the given game PIN.
 */
function broadcastToGame(pin, msg) {
  for (const client of tcpClients) {
    if (client.currentPin === pin) {
      send(client.socket, msg);
    }
  }
}

/**
 * Look up a game by pin. If missing, send an error to the requesting client.
 *
 * @returns {Object|null} game
 */
function requireGame(pin, socket) {
  const game = games.get(pin);
  if (!game) {
    send(socket, { type: 'ERROR', message: 'Game not found' });
    return null;
  }
  return game;
}

/**
 * Host check helper.
 */
function isHost(game, actor) {
  return game.host === actor;
}

/**
 * Remove ended games after a TTL so memory doesn't grow indefinitely.
 */
function cleanupEndedGames() {
  const t = now();
  for (const [pin, game] of games.entries()) {
    if (game.state === 'ended') {
      const endedAt = game.endedAt ?? 0;
      if (endedAt && t - endedAt > ENDED_TTL_MS) {
        games.delete(pin);
      }
    }
  }
}

/**
 * End a game (idempotent) and notify all players.
 */
function endGame(pin, game) {
  // idempotent: if already ended, do nothing
  if (game.state === 'ended') return;

  game.state = 'ended';
  game.endedAt = now();

  broadcastToGame(pin, {
    type: 'GAME_ENDED',
    pin,
    game: serializeGame(game),
  });
}

/**
 * TCP server: accept connections and parse newline-delimited JSON frames.
 */
const server = net.createServer((socket) => {
  // Track client connection state in-memory
  const client = { socket, username: null, currentPin: null, buffer: '' };
  tcpClients.add(client);

  /**
   * Incoming data handler:
   * - Accumulate data into buffer
   * - Split on '\n'
   * - Parse each frame as JSON
   * - Dispatch to handleMessage()
   */
  socket.on('data', (data) => {
    client.buffer += data.toString();

    let index;
    while ((index = client.buffer.indexOf('\n')) !== -1) {
      let raw = client.buffer.slice(0, index);
      client.buffer = client.buffer.slice(index + 1);

      raw = raw.trim();
      if (!raw) continue;

      // Ignore Render / HTTP probes that might hit the TCP port.
      // If detected, destroy socket to avoid leaving half-open connections.
      if (
        raw.startsWith('GET ') ||
        raw.startsWith('HEAD ') ||
        raw.startsWith('POST ')
      ) {
        socket.destroy();
        break;
      }

      // Only attempt to parse likely JSON payloads
      if (!raw.startsWith('{') && !raw.startsWith('[')) continue;

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        console.error('Invalid JSON from client:', raw);
        continue;
      }

      console.log('handleMessage type:', msg.type, 'raw:', raw);
      handleMessage(client, msg);
    }
  });

  // Cleanup on disconnect
  socket.on('close', () => {
    tcpClients.delete(client);
  });

  // Log socket-level errors (connection reset, etc.)
  socket.on('error', (err) => {
    console.error('TCP client error:', err);
  });
});

/**
 * Protocol message handler.
 * Each case implements one application-layer message type.
 *
 * @param {{socket:any, username:string|null, currentPin:string|null, buffer:string}} client
 * @param {any} msg
 */
function handleMessage(client, msg) {
  switch (msg.type) {
    case 'REGISTER': {
      // Associate this TCP connection with a username
      const { username } = msg;
      client.username = username;

      console.log('REGISTER from', username);

      // Acknowledge so the HTTP bridge can safely proceed with subsequent calls
      send(client.socket, { type: 'REGISTER_OK', username });
      break;
    }

    case 'LIST_GAMES': {
      // Remove stale ended games before listing
      cleanupEndedGames();

      // Only show joinable games (lobby + public)
      const list = Array.from(games.values())
        .filter((g) => g.state === 'lobby' && g.isPublic)
        .map(serializeGame);

      send(client.socket, { type: 'GAMES_LIST', games: list });
      break;
    }

    case 'CREATE_GAME': {
      // Must register before creating games
      if (!client.username) {
        send(client.socket, { type: 'ERROR', message: 'Not registered' });
        return;
      }

      // Accept optional config fields from the client
      const { username, theme = '', isPublic = true, maxPlayers = 20 } = msg;

      // Prefer explicit username, otherwise fall back to the registered connection username
      const hostUser = username || client.username;

      // Allocate a new game pin
      const pin = generatePin();

      // Initialize game state (in-memory, authoritative)
      const game = {
        pin,
        host: hostUser,
        state: 'lobby',
        theme,
        isPublic: !!isPublic,
        maxPlayers: Number(maxPlayers) || 20,
        players: new Set([hostUser]),
        scores: new Map([[hostUser, 0]]),
        questions: [],
        currentQuestionIndex: 0,
        answeredByIndex: new Map(),
        createdAt: now(),
        endedAt: null,
      };

      games.set(pin, game);

      // Place creator into this game context for future broadcasts
      client.currentPin = pin;

      console.log('CREATE_GAME created pin', pin, 'host', hostUser);
      send(client.socket, { type: 'GAME_CREATED', game: serializeGame(game) });
      break;
    }

    case 'JOIN_GAME': {
      const { pin, username } = msg;

      const game = requireGame(pin, client.socket);
      if (!game) return;

      // Can only join while in lobby
      if (game.state !== 'lobby') {
        send(client.socket, {
          type: 'ERROR',
          message: 'Game is not joinable (already started/ended)',
        });
        return;
      }

      const user = username || client.username;
      if (!user) {
        send(client.socket, { type: 'ERROR', message: 'Username is required' });
        return;
      }

      // Enforce max players
      if (game.players.size >= (game.maxPlayers ?? 20)) {
        send(client.socket, { type: 'ERROR', message: 'Game is full' });
        return;
      }

      // Add player and initialize score if needed
      game.players.add(user);
      if (!game.scores.has(user)) game.scores.set(user, 0);

      // Track which game this client is in
      client.currentPin = pin;

      const gameData = serializeGame(game);

      // Confirm join to the joining client
      send(client.socket, { type: 'JOINED_GAME', game: gameData });

      // Notify all players in the game
      broadcastToGame(pin, { type: 'PLAYER_JOINED', pin, game: gameData });
      break;
    }

    case 'EXIT_GAME': {
      // Prefer explicit pin, otherwise use client's current pin
      const pin = msg.pin || client.currentPin;
      const user = client.username;

      // Nothing to do if we don't know which game/user
      if (!pin || !user) return;

      const game = games.get(pin);
      if (!game) return;

      // Remove player from the game
      game.players.delete(user);

      // Keep scores once the game has started so end screens don't "lose" players.
      // If in lobby, remove score entry as well.
      if (game.state === 'lobby') {
        game.scores.delete(user);
      }

      // Clear client game context
      client.currentPin = null;

      // If host left, reassign host if possible
      if (game.host === user && game.players.size > 0) {
        game.host = Array.from(game.players)[0];
      }

      const gameData = serializeGame(game);
      broadcastToGame(pin, { type: 'PLAYER_LEFT', pin, game: gameData });

      // If no players remain, delete the game immediately
      if (game.players.size === 0) {
        games.delete(pin);
      }
      break;
    }

    case 'SUBMIT_QUESTION': {
      const { pin, question, answerTrue, username } = msg;

      const game = requireGame(pin, client.socket);
      if (!game) return;

      // Only allow submissions before the game starts
      if (game.state !== 'lobby') {
        send(client.socket, {
          type: 'ERROR',
          message: 'Cannot submit questions after game starts',
        });
        return;
      }

      const from = username || client.username || 'Unknown';
      if (!Array.isArray(game.questions)) game.questions = [];

      // Store question in the game
      game.questions.push({
        username: from,
        question,
        answerTrue: !!answerTrue,
      });

      // Broadcast to lobby so host/players can see question count updates
      broadcastToGame(pin, {
        type: 'QUESTION_SUBMITTED',
        pin,
        username: from,
        question,
        answerTrue: !!answerTrue,
      });
      break;
    }

    case 'START_GAME': {
      const pin = msg.pin || client.currentPin;
      if (!pin) return;

      const game = requireGame(pin, client.socket);
      if (!game) return;

      // Prevent repeated start spam / weird client states
      if (game.state !== 'lobby') {
        send(client.socket, {
          type: 'ERROR',
          message: 'Game already started (or ended)',
        });
        return;
      }

      // Only host can start
      const actor = msg.username || client.username || 'Unknown';
      if (!isHost(game, actor)) {
        send(client.socket, { type: 'ERROR', message: 'Only host can start' });
        return;
      }

      // Must have at least 1 question to start
      const total = Array.isArray(game.questions) ? game.questions.length : 0;
      if (total <= 0) {
        send(client.socket, {
          type: 'ERROR',
          message: 'Add at least 1 question before starting',
        });
        return;
      }

      // Initialize in-progress state
      game.state = 'inProgress';
      game.currentQuestionIndex = 0;
      game.answeredByIndex = new Map();
      game.endedAt = null;

      broadcastToGame(pin, {
        type: 'GAME_STARTED',
        pin,
        game: serializeGame(game),
      });
      break;
    }

    case 'ANSWER': {
      const { pin, correct, username } = msg;

      const game = requireGame(pin, client.socket);
      if (!game) return;

      // Ignore answers outside active gameplay
      if (game.state !== 'inProgress') return;

      const user = username || client.username;
      if (!user) return;

      // Ensure player exists in state (useful if a client reconnects mid-game)
      if (!game.players.has(user)) {
        game.players.add(user);
        if (!game.scores.has(user)) game.scores.set(user, 0);
      }

      // Determine current question index
      const idx = game.currentQuestionIndex ?? 0;

      // Track who has answered per question to prevent double scoring
      if (!game.answeredByIndex.has(idx)) game.answeredByIndex.set(idx, new Set());
      const answeredSet = game.answeredByIndex.get(idx);

      // Prevent double-scoring
      if (answeredSet.has(user)) {
        broadcastToGame(pin, {
          type: 'SCORE_UPDATE',
          pin,
          game: serializeGame(game),
          answeredBy: user,
          correct: false,
          duplicate: true,
        });
        return;
      }

      // Normalize "correct" into a boolean
      const isCorrect =
        correct === true || correct === 'true' || correct === 1 || correct === '1';

      answeredSet.add(user);

      // Initialize score slot if missing
      if (!game.scores.has(user)) game.scores.set(user, 0);

      // Award points for correct answer
      if (isCorrect) {
        game.scores.set(user, game.scores.get(user) + 100);
      }

      // Broadcast updated scores/state
      broadcastToGame(pin, {
        type: 'SCORE_UPDATE',
        pin,
        game: serializeGame(game),
        answeredBy: user,
        correct: isCorrect,
      });

      break;
    }

    case 'NEXT_QUESTION': {
      const { pin, username } = msg;

      const game = requireGame(pin, client.socket);
      if (!game) return;

      if (game.state !== 'inProgress') {
        send(client.socket, { type: 'ERROR', message: 'Game is not in progress' });
        return;
      }

      // Only host can advance
      const actor = username || client.username || 'Unknown';
      if (!isHost(game, actor)) {
        send(client.socket, {
          type: 'ERROR',
          message: 'Only host can advance questions',
        });
        return;
      }

      const total = Array.isArray(game.questions) ? game.questions.length : 0;

      // Increment question index
      const nextIdx = (game.currentQuestionIndex ?? 0) + 1;
      game.currentQuestionIndex = nextIdx;

      // If past the last question, end the game
      if (total > 0 && nextIdx >= total) {
        endGame(pin, game);
        return;
      }

      // Otherwise broadcast updated index
      broadcastToGame(pin, {
        type: 'NEXT_QUESTION',
        pin,
        game: serializeGame(game),
      });
      break;
    }

    case 'END_GAME': {
      const { pin, username } = msg;

      const game = requireGame(pin, client.socket);
      if (!game) return;

      // Only host can end the game early
      const actor = username || client.username || 'Unknown';
      if (!isHost(game, actor)) {
        send(client.socket, { type: 'ERROR', message: 'Only host can end the game' });
        return;
      }

      endGame(pin, game);
      break;
    }

    case 'CHAT': {
      const { pin, message, username } = msg;

      const game = requireGame(pin, client.socket);
      if (!game) return;

      // Prefer explicit username, otherwise fall back to registered connection username
      const from = username || client.username || 'Unknown';

      broadcastToGame(pin, { type: 'CHAT', pin, from, message });
      break;
    }

    default:
      // Unknown / unsupported protocol message type
      send(client.socket, { type: 'ERROR', message: `Unknown type: ${msg.type}` });
  }
}

// Bind specifically to 127.0.0.1 so the TCP server is internal-only
server.listen(TCP_PORT, '127.0.0.1', () => {
  console.log(`TCP game server listening on 127.0.0.1:${TCP_PORT}`);
});