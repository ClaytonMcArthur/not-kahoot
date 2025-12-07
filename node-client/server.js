// server.js
const net = require("net");

// TCP port for the game server (inside the container only)
const TCP_PORT = process.env.TCP_PORT || 4000;

// All connected TCP clients
// client = { socket, username, currentPin, buffer }
const tcpClients = new Set();

// Games keyed by PIN, e.g. "483920"
// game = { pin, host, state, players: Set<string>, scores: Map<string, number>, questions: Array }
const games = new Map();

// 🔹 Guest name counter for auto-generated usernames (fallback safety)
let guestCounter = 1;

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function serializeGame(game) {
  return {
    pin: game.pin,
    host: game.host,
    state: game.state,
    players: Array.from(game.players),
    scores: Object.fromEntries(game.scores.entries()),
    questions: game.questions || []
  };
}

function send(socket, msg) {
  try {
    socket.write(JSON.stringify(msg) + "\n");
  } catch (e) {
    console.error("Failed to send to client:", e);
  }
}

function broadcastToGame(pin, msg) {
  for (const client of tcpClients) {
    if (client.currentPin === pin) {
      send(client.socket, msg);
    }
  }
}

const server = net.createServer((socket) => {
  const client = { socket, username: null, currentPin: null, buffer: "" };
  tcpClients.add(client);

  socket.on("data", (data) => {
    client.buffer += data.toString();
    let index;
    while ((index = client.buffer.indexOf("\n")) !== -1) {
      let raw = client.buffer.slice(0, index);
      client.buffer = client.buffer.slice(index + 1);
      raw = raw.trim();
      if (!raw) continue;

      // ----- Ignore Render's HTTP health checks / probes -----
      if (
        raw.startsWith("GET ") ||
        raw.startsWith("HEAD ") ||
        raw.startsWith("POST ")
      ) {
        socket.destroy();
        break;
      }

      if (!raw.startsWith("{") && !raw.startsWith("[")) {
        continue;
      }
      // -------------------------------------------------------

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        console.error("Invalid JSON from client:", raw);
        continue;
      }

      console.log("handleMessage type:", msg.type, "raw:", raw);
      handleMessage(client, msg);
    }
  });

  socket.on("close", () => {
    tcpClients.delete(client);
  });

  socket.on("error", (err) => {
    console.error("TCP client error:", err);
  });
});

function handleMessage(client, msg) {
  const type = msg.type;

  switch (type) {
    case "REGISTER": {
      let { username } = msg;

      // 🔹 Fallback: if username missing/blank, assign a guest name
      if (!username || !String(username).trim()) {
        username = `Guest-${guestCounter++}`;
      }
      username = String(username).trim();

      client.username = username;
      console.log("REGISTER from", username);
      send(client.socket, { type: "REGISTER_OK", username });
      break;
    }

    case "LIST_GAMES": {
      console.log("LIST_GAMES request");
      const list = Array.from(games.values()).map(serializeGame);
      send(client.socket, { type: "GAMES_LIST", games: list });
      break;
    }

    case "CREATE_GAME": {
      if (!client.username) {
        console.log("CREATE_GAME error: not registered");
        send(client.socket, { type: "ERROR", message: "Not registered" });
        return;
      }

      const { username, theme, isPublic, maxPlayers } = msg;
      const hostUser = username || client.username;

      const pin = generatePin();
      const game = {
        pin,
        host: hostUser,
        state: "lobby", // lobby | inProgress | ended
        players: new Set([hostUser]),
        scores: new Map([[hostUser, 0]]),
        questions: []
      };
      games.set(pin, game);
      client.currentPin = pin;

      console.log("CREATE_GAME created pin", pin, "host", hostUser);

      const payload = {
        type: "GAME_CREATED",
        game: serializeGame(game)
      };
      send(client.socket, payload);
      break;
    }

    case "JOIN_GAME": {
      if (!client.username) {
        console.log("JOIN_GAME error: not registered");
        send(client.socket, { type: "ERROR", message: "Not registered" });
        return;
      }
      const { pin } = msg;
      const game = games.get(pin);
      if (!game) {
        console.log("JOIN_GAME error: game not found for pin", pin);
        send(client.socket, { type: "ERROR", message: "Game not found" });
        return;
      }

      game.players.add(client.username);
      if (!game.scores.has(client.username)) {
        game.scores.set(client.username, 0);
      }
      client.currentPin = pin;

      console.log("JOIN_GAME success. pin", pin, "username", client.username);

      const gameData = serializeGame(game);
      send(client.socket, { type: "JOINED_GAME", game: gameData });
      broadcastToGame(pin, {
        type: "PLAYER_JOINED",
        pin,
        game: gameData
      });
      break;
    }

    case "EXIT_GAME": {
      if (!client.currentPin || !client.username) return;
      const pin = client.currentPin;
      const game = games.get(pin);
      if (!game) return;

      console.log("EXIT_GAME pin", pin, "username", client.username);

      game.players.delete(client.username);
      game.scores.delete(client.username);
      client.currentPin = null;

      const gameData = serializeGame(game);
      broadcastToGame(pin, {
        type: "PLAYER_LEFT",
        pin,
        game: gameData
      });

      if (game.players.size === 0) {
        games.delete(pin);
      }
      break;
    }

    case "START_GAME": {
      const pin = msg.pin || client.currentPin;
      if (!pin) return;

      const game = games.get(pin);
      if (!game) {
        console.log("START_GAME error: game not found for pin", pin);
        send(client.socket, { type: "ERROR", message: "Game not found" });
        return;
      }

      const actor = msg.username || client.username || "Unknown";

      if (game.host !== actor) {
        console.log(
          "START_GAME error: non-host tried to start. host=",
          game.host,
          "user=",
          actor
        );
        send(client.socket, { type: "ERROR", message: "Only host can start" });
        return;
      }

      const qCount = Array.isArray(game.questions) ? game.questions.length : 0;
      console.log("START_GAME pin", pin, "host", actor, "questions:", qCount);

      game.state = "inProgress";

      broadcastToGame(pin, {
        type: "GAME_STARTED",
        pin,
        game: serializeGame(game)
      });
      break;
    }

    case "ANSWER": {
      if (!client.currentPin || !client.username) return;
      const { pin, correct } = msg;
      const game = games.get(pin);
      if (!game) return;
      if (!game.scores.has(client.username)) {
        game.scores.set(client.username, 0);
      }
      if (correct) {
        game.scores.set(client.username, game.scores.get(client.username) + 1);
      }

      console.log(
        "ANSWER pin",
        pin,
        "username",
        client.username,
        "correct",
        !!correct
      );

      broadcastToGame(pin, {
        type: "SCORE_UPDATE",
        pin,
        game: serializeGame(game),
        answeredBy: client.username,
        correct: !!correct
      });
      break;
    }

    case "CHAT": {
      if (!client.currentPin) return;
      const { pin, message, username } = msg;
      const game = games.get(pin);
      if (!game) return;

      const from = username || client.username || "Unknown";

      console.log("CHAT pin", pin, "from", from, "message", message);

      broadcastToGame(pin, {
        type: "CHAT",
        pin,
        from,
        message
      });
      break;
    }

    case "SUBMIT_QUESTION": {
      if (!client.currentPin) return;
      const { pin, question, answerTrue, username } = msg;
      const game = games.get(pin);
      if (!game) {
        console.log("SUBMIT_QUESTION error: game not found for pin", pin);
        send(client.socket, { type: "ERROR", message: "Game not found" });
        return;
      }

      const from = username || client.username || "Unknown";

      if (!Array.isArray(game.questions)) {
        game.questions = [];
      }

      const qObj = {
        username: from,
        question,
        answerTrue: !!answerTrue
      };

      console.log(
        "SUBMIT_QUESTION pin",
        pin,
        "from",
        from,
        "question:",
        question
      );

      game.questions.push(qObj);

      broadcastToGame(pin, {
        type: "QUESTION_SUBMITTED",
        pin,
        username: from,
        question,
        answerTrue: !!answerTrue
      });
      break;
    }

    default:
      console.log("Unknown message type:", type);
      send(client.socket, { type: "ERROR", message: `Unknown type: ${type}` });
  }
}

// Bind specifically to 127.0.0.1 so the TCP server is internal-only
server.listen(TCP_PORT, "127.0.0.1", () => {
  console.log(`TCP game server listening on 127.0.0.1:${TCP_PORT}`);
});
