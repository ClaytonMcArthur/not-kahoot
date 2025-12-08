// node-client/server.js
const net = require('net');

const TCP_PORT = process.env.TCP_PORT || 4000;

// client = { socket, username, currentPin, buffer }
const tcpClients = new Set();

// game = {
//   pin, host, state,
//   theme, isPublic, maxPlayers,
//   players: Set<string>,
//   scores: Map<string, number>,
//   questions: Array,
//   currentQuestionIndex: number,
//   answeredByIndex: Map<number, Set<string>>
//   createdAt, endedAt
// }
const games = new Map();

const ENDED_TTL_MS = 2 * 60 * 1000; // keep ended games for a short time (clients can finish UI)

function now() {
  return Date.now();
}

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

function send(socket, msg) {
  try {
    socket.write(JSON.stringify(msg) + '\n');
  } catch (e) {
    console.error('Failed to send to client:', e);
  }
}

function broadcastToGame(pin, msg) {
  for (const client of tcpClients) {
    if (client.currentPin === pin) {
      send(client.socket, msg);
    }
  }
}

function requireGame(pin, socket) {
  const game = games.get(pin);
  if (!game) {
    send(socket, { type: 'ERROR', message: 'Game not found' });
    return null;
  }
  return game;
}

function isHost(game, actor) {
  return game.host === actor;
}

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

function endGame(pin, game) {
  game.state = 'ended';
  game.endedAt = now();
  broadcastToGame(pin, { type: 'GAME_ENDED', pin, game: serializeGame(game) });
}

const server = net.createServer((socket) => {
  const client = { socket, username: null, currentPin: null, buffer: '' };
  tcpClients.add(client);

  socket.on('data', (data) => {
    client.buffer += data.toString();
    let index;
    while ((index = client.buffer.indexOf('\n')) !== -1) {
      let raw = client.buffer.slice(0, index);
      client.buffer = client.buffer.slice(index + 1);
      raw = raw.trim();
      if (!raw) continue;

      // Ignore Render / HTTP probes
      if (raw.startsWith('GET ') || raw.startsWith('HEAD ') || raw.startsWith('POST ')) {
        socket.destroy();
        break;
      }
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

  socket.on('close', () => {
    tcpClients.delete(client);
  });

  socket.on('error', (err) => {
    console.error('TCP client error:', err);
  });
});

function handleMessage(client, msg) {
  switch (msg.type) {
    case 'REGISTER': {
      const { username } = msg;
      client.username = username;
      console.log('REGISTER from', username);
      send(client.socket, { type: 'REGISTER_OK', username });
      break;
    }

    case 'LIST_GAMES': {
      cleanupEndedGames();

      // Only show joinable games (lobby, public)
      const list = Array.from(games.values())
        .filter((g) => g.state === 'lobby')
        .map(serializeGame);

      send(client.socket, { type: 'GAMES_LIST', games: list });
      break;
    }

    case 'CREATE_GAME': {
      if (!client.username) {
        send(client.socket, { type: 'ERROR', message: 'Not registered' });
        return;
      }

      const {
        username,
        theme = '',
        isPublic = true,
        maxPlayers = 20,
      } = msg;

      const hostUser = username || client.username;
      const pin = generatePin();

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
      client.currentPin = pin;

      console.log('CREATE_GAME created pin', pin, 'host', hostUser);
      send(client.socket, { type: 'GAME_CREATED', game: serializeGame(game) });
      break;
    }

    case 'JOIN_GAME': {
      const { pin, username } = msg;
      const game = requireGame(pin, client.socket);
      if (!game) return;

      if (game.state !== 'lobby') {
        send(client.socket, { type: 'ERROR', message: 'Game is not joinable (already started/ended)' });
        return;
      }

      const user = username || client.username;
      if (!user) {
        send(client.socket, { type: 'ERROR', message: 'Username is required' });
        return;
      }

      if (game.players.size >= (game.maxPlayers ?? 20)) {
        send(client.socket, { type: 'ERROR', message: 'Game is full' });
        return;
      }

      game.players.add(user);
      if (!game.scores.has(user)) game.scores.set(user, 0);

      client.currentPin = pin;

      const gameData = serializeGame(game);
      send(client.socket, { type: 'JOINED_GAME', game: gameData });
      broadcastToGame(pin, { type: 'PLAYER_JOINED', pin, game: gameData });
      break;
    }

    case 'EXIT_GAME': {
      const pin = msg.pin || client.currentPin;
      const user = client.username;
      if (!pin || !user) return;

      const game = games.get(pin);
      if (!game) return;

      game.players.delete(user);
      game.scores.delete(user);
      client.currentPin = null;

      // If host left, reassign host if possible
      if (game.host === user && game.players.size > 0) {
        game.host = Array.from(game.players)[0];
      }

      const gameData = serializeGame(game);
      broadcastToGame(pin, { type: 'PLAYER_LEFT', pin, game: gameData });

      if (game.players.size === 0) {
        games.delete(pin);
      }
      break;
    }

    case 'SUBMIT_QUESTION': {
      const { pin, question, answerTrue, username } = msg;
      const game = requireGame(pin, client.socket);
      if (!game) return;

      if (game.state !== 'lobby') {
        send(client.socket, { type: 'ERROR', message: 'Cannot submit questions after game starts' });
        return;
      }

      const from = username || client.username || 'Unknown';
      if (!Array.isArray(game.questions)) game.questions = [];

      game.questions.push({
        username: from,
        question,
        answerTrue: !!answerTrue,
      });

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

      const actor = msg.username || client.username || 'Unknown';
      if (!isHost(game, actor)) {
        send(client.socket, { type: 'ERROR', message: 'Only host can start' });
        return;
      }

      const total = Array.isArray(game.questions) ? game.questions.length : 0;
      if (total <= 0) {
        send(client.socket, { type: 'ERROR', message: 'Add at least 1 question before starting' });
        return;
      }

      game.state = 'inProgress';
      game.currentQuestionIndex = 0;
      game.answeredByIndex = new Map();
      game.endedAt = null;

      broadcastToGame(pin, { type: 'GAME_STARTED', pin, game: serializeGame(game) });
      break;
    }

    case 'ANSWER': {
      const { pin, correct, username } = msg;
      const game = requireGame(pin, client.socket);
      if (!game) return;

      if (game.state !== 'inProgress') return;

      const user = username || client.username;
      if (!user) return;

      if (!game.players.has(user)) {
        game.players.add(user);
        if (!game.scores.has(user)) game.scores.set(user, 0);
      }

      const idx = game.currentQuestionIndex ?? 0;
      if (!game.answeredByIndex.has(idx)) game.answeredByIndex.set(idx, new Set());
      const answeredSet = game.answeredByIndex.get(idx);

      // prevent double-scoring
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

      const isCorrect =
        correct === true || correct === 'true' || correct === 1 || correct === '1';

      answeredSet.add(user);

      if (!game.scores.has(user)) game.scores.set(user, 0);
      if (isCorrect) {
        game.scores.set(user, game.scores.get(user) + 100);
      }

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

      const actor = username || client.username || 'Unknown';
      if (!isHost(game, actor)) {
        send(client.socket, { type: 'ERROR', message: 'Only host can advance questions' });
        return;
      }

      const total = Array.isArray(game.questions) ? game.questions.length : 0;
      const nextIdx = (game.currentQuestionIndex ?? 0) + 1;
      game.currentQuestionIndex = nextIdx;

      if (total > 0 && nextIdx >= total) {
        endGame(pin, game);
        return;
      }

      broadcastToGame(pin, { type: 'NEXT_QUESTION', pin, game: serializeGame(game) });
      break;
    }

    case 'END_GAME': {
      const { pin, username } = msg;
      const game = requireGame(pin, client.socket);
      if (!game) return;

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

      const from = username || client.username || 'Unknown';
      broadcastToGame(pin, { type: 'CHAT', pin, from, message });
      break;
    }

    default:
      send(client.socket, { type: 'ERROR', message: `Unknown type: ${msg.type}` });
  }
}

// Bind specifically to 127.0.0.1 so the TCP server is internal-only
server.listen(TCP_PORT, '127.0.0.1', () => {
  console.log(`TCP game server listening on 127.0.0.1:${TCP_PORT}`);
});