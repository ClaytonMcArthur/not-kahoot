// server.js
const net = require("net");

// TCP port for the game server (inside the container only)
const TCP_PORT = process.env.TCP_PORT || 4000;

// All connected TCP clients
const tcpClients = new Set(); // { socket, username, currentPin }

// Games keyed by PIN, e.g. "483920"
const games = new Map(); // pin -> { pin, host, players: Set<string>, state, scores: Map<string, number> }

function generatePin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function serializeGame(game) {
  return {
    pin: game.pin,
    host: game.host,
    state: game.state,
    players: Array.from(game.players),
    scores: Object.fromEntries(game.scores.entries())
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
  console.log("TCP client connected");
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
      if (raw.startsWith("GET ") || raw.startsWith("HEAD ") || raw.startsWith("POST ")) {
        console.log("Ignoring HTTP probe on TCP port:", raw);
        // This is not a real game client; close the socket.
        socket.destroy();
        break;
      }

      // Ignore obviously non-JSON lines (e.g., headers like "Host:", "User-Agent:")
      if (!raw.startsWith("{") && !raw.startsWith("[")) {
        // Uncomment if you want to see them:
        // console.log("Ignoring non-JSON line on TCP port:", raw);
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

      handleMessage(client, msg);
    }
  });

  socket.on("close", () => {
    console.log("TCP client disconnected");
    // Remove from game if necessary
    if (client.currentPin && client.username) {
      const game = games.get(client.currentPin);
      if (game) {
        game.players.delete(client.username);
        game.scores.delete(client.username);
        broadcastToGame(game.pin, {
          type: "PLAYER_LEFT",
          pin: game.pin,
          game: serializeGame(game)
        });
        if (game.players.size === 0) {
          games.delete(game.pin);
        }
      }
    }
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
      const { username } = msg;
      client.username = username;
      send(client.socket, { type: "REGISTER_OK", username });
      break;
    }

    case "LIST_GAMES": {
      const list = Array.from(games.values()).map(serializeGame);
      send(client.socket, { type: "GAMES_LIST", games: list });
      break;
    }

    case "CREATE_GAME": {
      if (!client.username) {
        send(client.socket, { type: "ERROR", message: "Not registered" });
        return;
      }
      const pin = generatePin();
      const game = {
        pin,
        host: client.username,
        state: "lobby", // lobby | inProgress | ended
        players: new Set([client.username]),
        scores: new Map([[client.username, 0]])
      };
      games.set(pin, game);
      client.currentPin = pin;

      const payload = {
        type: "GAME_CREATED",
        game: serializeGame(game)
      };
      send(client.socket, payload);
      break;
    }

    case "JOIN_GAME": {
      if (!client.username) {
        send(client.socket, { type: "ERROR", message: "Not registered" });
        return;
      }
      const { pin } = msg;
      const game = games.get(pin);
      if (!game) {
        send(client.socket, { type: "ERROR", message: "Game not found" });
        return;
      }

      game.players.add(client.username);
      if (!game.scores.has(client.username)) {
        game.scores.set(client.username, 0);
      }
      client.currentPin = pin;

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
      if (!client.currentPin) return;
      const pin = client.currentPin;
      const game = games.get(pin);
      if (!game) return;
      if (game.host !== client.username) {
        send(client.socket, { type: "ERROR", message: "Only host can start" });
        return;
      }
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
      if (!client.currentPin || !client.username) return;
      const { pin, message } = msg;
      const game = games.get(pin);
      if (!game) return;
      broadcastToGame(pin, {
        type: "CHAT",
        pin,
        from: client.username,
        message
      });
      break;
    }

    default:
      send(client.socket, { type: "ERROR", message: `Unknown type: ${type}` });
  }
}

// Bind specifically to 127.0.0.1 so the TCP server is internal-only
server.listen(TCP_PORT, "127.0.0.1", () => {
  console.log(`TCP game server listening on 127.0.0.1:${TCP_PORT}`);
});