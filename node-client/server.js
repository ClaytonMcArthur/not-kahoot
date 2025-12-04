// server.js
const net = require("net");

// TCP port for the game server (inside the container only)
const TCP_PORT = process.env.TCP_PORT || 4000;

// All connected TCP clients
const tcpClients = new Set(); // { socket, username, currentPin }

// Games keyed by PIN, e.g. "483920"
// game = { pin, host, state, players: Set<string>, scores: Map<string, number>, questions: Array }
const games = new Map();

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
    questions: game.questions || [],
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
      if (
        raw.startsWith("GET ") ||
        raw.startsWith("HEAD ") ||
        raw.startsWith("POST ")
      ) {
        console.log("Ignoring HTTP probe on TCP port:", raw);
        // This is not a real game client; close the socket.
        socket.destroy();
        break;
      }

      // Ignore obviously non-JSON lines (e.g., headers like "Host:", "User-Agent:")
      if (!raw.startsWith("{") && !raw.startsWith("[")) {
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

      console.log("handleMessage type:", msg.type, "raw:", raw);
      handleMessage(client, msg);
    }
  });

  socket.on("close", () => {
    console.log("TCP client disconnected");
    // NOTE: this TCP client in Render is an aggregate pipe for many usernames.
    // If it closes, we *don't* try to remove any specific player here.
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
      // Optional extra info from the HTTP layer
      const { username, theme, isPublic, maxPlayers } = msg;
      const hostUser = username || client.username;
      if (!hostUser) {
        console.log("CREATE_GAME error: missing host username");
        send(client.socket, { type: "ERROR", message: "No host username" });
        return;
      }

      const pin = generatePin();
      const game = {
        pin,
        host: hostUser,
        state: "lobby", // lobby | inProgress | ended
        players: new Set([hostUser]),
        scores: new Map([[hostUser, 0]]),
        questions: [], // server owns the question list
        theme: theme || "",
        isPublic: !!isPublic,
        maxPlayers: maxPlayers || 20,
      };
      games.set(pin, game);
      client.currentPin = pin;

      console.log("CREATE_GAME created pin", pin, "host", hostUser);

      const payload = {
        type: "GAME_CREATED",
        game: serializeGame(game),
      };
      send(client.socket, payload);
      break;
    }

    case "JOIN_GAME": {
      const { pin, username } = msg;
      const user = username || client.username;
      if (!user) {
        console.log("JOIN_GAME error: missing username");
        send(client.socket, { type: "ERROR", message: "Username required" });
        return;
      }

      const game = games.get(pin);
      if (!game) {
        console.log("JOIN_GAME error: game not found for pin", pin);
        send(client.socket, { type: "ERROR", message: "Game not found" });
        return;
      }

      game.players.add(user);
      if (!game.scores.has(user)) {
        game.scores.set(user, 0);
      }

      client.currentPin = pin;

      console.log("JOIN_GAME success. pin", pin, "username", user);

      const gameData = serializeGame(game);
      send(client.socket, { type: "JOINED_GAME", game: gameData });
      broadcastToGame(pin, {
        type: "PLAYER_JOINED",
        pin,
        game: gameData,
      });
      break;
    }

    case "EXIT_GAME": {
      const { pin, username } = msg;
      if (!pin || !username) {
        console.log("EXIT_GAME missing pin or username", msg);
        return;
      }
      const game = games.get(pin);
      if (!game) return;

      console.log("EXIT_GAME pin", pin, "username", username);

      game.players.delete(username);
      game.scores.delete(username);

      const gameData = serializeGame(game);
      broadcastToGame(pin, {
        type: "PLAYER_LEFT",
        pin,
        game: gameData,
      });

      if (game.players.size === 0) {
        games.delete(pin);
      }
      break;
    }

    case "START_GAME": {
      const { pin, username } = msg;
      if (!pin) return;

      const game = games.get(pin);
      if (!game) {
        console.log("START_GAME error: game not found for pin", pin);
        send(client.socket, { type: "ERROR", message: "Game not found" });
        return;
      }

      const hostUser = username || client.username;
      if (game.host !== hostUser) {
        console.log(
          "START_GAME error: non-host tried to start. host=",
          game.host,
          "user=",
          hostUser
        );
        send(client.socket, { type: "ERROR", message: "Only host can start" });
        return;
      }

      const qCount = Array.isArray(game.questions)
        ? game.questions.length
        : 0;
      console.log(
        "START_GAME pin",
        pin,
        "host",
        hostUser,
        "questions:",
        qCount
      );

      game.state = "inProgress";

      broadcastToGame(pin, {
        type: "GAME_STARTED",
        pin,
        game: serializeGame(game),
      });
      break;
    }

    case "ANSWER": {
      const { pin, correct, username } = msg;
      if (!pin || !username) {
        console.log("ANSWER missing pin or username", msg);
        return;
      }
      const game = games.get(pin);
      if (!game) return;

      if (!game.scores.has(username)) {
        game.scores.set(username, 0);
      }
      if (correct) {
        game.scores.set(username, game.scores.get(username) + 1);
      }

      console.log(
        "ANSWER pin",
        pin,
        "username",
        username,
        "correct",
        !!correct
      );

      broadcastToGame(pin, {
        type: "SCORE_UPDATE",
        pin,
        game: serializeGame(game),
        answeredBy: username,
        correct: !!correct,
      });
      break;
    }

    case "CHAT": {
      const { pin, message, username } = msg;
      if (!pin || !message) return;
      const game = games.get(pin);
      if (!game) return;

      const from = username || client.username || "Unknown";

      console.log("CHAT pin", pin, "from", from, "message", message);

      broadcastToGame(pin, {
        type: "CHAT",
        pin,
        from,
        message,
      });
      break;
    }

    case "SUBMIT_QUESTION": {
      const { pin, question, answerTrue, username } = msg;
      if (!pin || !question) return;

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
        answerTrue: !!answerTrue,
      };

      console.log(
        "SUBMIT_QUESTION pin",
        pin,
        "from",
        from,
        "question:",
        question
      );

      // Store on the server so START_GAME can use them all
      game.questions.push(qObj);

      // Also broadcast so everyone can update their local UI
      broadcastToGame(pin, {
        type: "QUESTION_SUBMITTED",
        pin,
        username: from,
        question,
        answerTrue: !!answerTrue,
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