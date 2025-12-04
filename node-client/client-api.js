// client-api.js
// Start the TCP game server (server.js)
require("./server");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const GameClient = require("./GameClient");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// TCP server connection for GameClient
const TCP_HOST = process.env.TCP_HOST || "127.0.0.1";
const TCP_PORT = process.env.TCP_PORT || 4000;

// Single GameClient instance for this process
let client = null;
let currentUsername = null;

// ===== SSE (Server-Sent Events) setup =====
const sseClients = new Set(); // each item is a res object

function broadcastSSE(msg) {
  const data = JSON.stringify(msg);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

// GET /api/events - SSE stream for game events
app.get("/api/events", (req, res) => {
  console.log("SSE /api/events connection opened");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);

  req.on("close", () => {
    console.log("SSE /api/events connection closed");
    sseClients.delete(res);
  });
});

// ===== HTTP API matching your frontend clientApi.js =====

// POST /api/connect { username }
app.post("/api/connect", async (req, res) => {
  const { username } = req.body;
  console.log("HTTP /api/connect", req.body);

  if (!username || !username.trim()) {
    return res.status(400).json({ ok: false, error: "Username is required" });
  }

  try {
    // If we already have a live GameClient, reuse it.
    if (client && client.connected) {
      console.log(
        `Reusing existing GameClient TCP connection (already registered as ${client.username})`
      );
      return res.json({ ok: true, reused: true });
    }

    currentUsername = username;
    client = new GameClient(TCP_HOST, TCP_PORT, username);

    // Avoid attaching multiple listeners if /connect is called again
    client.removeAllListeners("message");
    client.removeAllListeners("error");

    // Forward all messages from TCP server to SSE clients
    client.on("message", (msg) => {
      console.log("GameClient message from TCP:", msg);
      broadcastSSE(msg);
    });

    client.on("error", (err) => {
      console.error("GameClient error:", err);
      broadcastSSE({ type: "ERROR", message: err.message });
    });

    await client.connect();
    client.register();

    console.log(`Registered username on TCP server: ${username}`);
    return res.json({ ok: true, reused: false });
  } catch (err) {
    console.error("Failed to connect to TCP server in /api/connect:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listGames {}
app.post("/api/listGames", async (req, res) => {
  console.log("HTTP /api/listGames");
  if (!client) {
    console.log("listGames error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  try {
    const games = await new Promise((resolve, reject) => {
      let timeout;

      const handler = (msg) => {
        console.log("Received GAMES_LIST from TCP:", msg);
        clearTimeout(timeout);
        client.removeListener("GAMES_LIST", handler);
        resolve(msg.games || []);
      };

      timeout = setTimeout(() => {
        client.removeListener("GAMES_LIST", handler);
        reject(new Error("Timed out waiting for GAMES_LIST"));
      }, 5000);

      client.once("GAMES_LIST", handler);
      client.listGames();
    });

    return res.json({ success: true, games });
  } catch (err) {
    console.error("listGames error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/createGame { username, theme, isPublic, maxPlayers }
app.post("/api/createGame", async (req, res) => {
  console.log("HTTP /api/createGame", req.body);
  if (!client) {
    console.log("createGame error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const options = req.body || {};

  try {
    const game = await new Promise((resolve, reject) => {
      let timeout;

      const handler = (msg) => {
        console.log("Received GAME_CREATED from TCP:", msg);
        clearTimeout(timeout);
        client.removeListener("GAME_CREATED", handler);
        resolve(msg.game);
      };

      timeout = setTimeout(() => {
        client.removeListener("GAME_CREATED", handler);
        reject(new Error("Timed out waiting for GAME_CREATED"));
      }, 5000);

      client.once("GAME_CREATED", handler);
      client.createGame(options);
    });

    return res.json({ success: true, game });
  } catch (err) {
    console.error("createGame error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/removeGame { pin } (stub)
app.post("/api/removeGame", (req, res) => {
  console.log("HTTP /api/removeGame", req.body);
  // No-op for now
  return res.json({ ok: true });
});

// POST /api/startGame { pin, username }
app.post("/api/startGame", (req, res) => {
  const { pin, username } = req.body;
  console.log("startGame called with pin:", pin, "username:", username);

  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  if (!pin || !username) {
    return res
      .status(400)
      .json({ ok: false, error: "pin and username are required" });
  }

  client.startGame(pin, username);

  return res.json({ ok: true });
});

// POST /api/joinGame { gameId, username }
app.post("/api/joinGame", (req, res) => {
  console.log("HTTP /api/joinGame", req.body);
  if (!client) {
    console.log("joinGame error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { gameId, username } = req.body;
  if (!gameId || !username) {
    return res
      .status(400)
      .json({ ok: false, error: "gameId and username are required" });
  }

  client.joinGame(gameId, username);
  return res.json({ ok: true });
});

// POST /api/exitGame { gameId, username }
app.post("/api/exitGame", (req, res) => {
  console.log("HTTP /api/exitGame", req.body);
  if (!client) {
    console.log("exitGame error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { gameId, username } = req.body;
  if (!gameId || !username) {
    return res
      .status(400)
      .json({ ok: false, error: "gameId and username are required" });
  }

  client.exitGame(gameId, username);
  return res.json({ ok: true });
});

// POST /api/sendAnswer { gameId, questionId, answer, username }
app.post("/api/sendAnswer", (req, res) => {
  console.log("HTTP /api/sendAnswer", req.body);
  if (!client) {
    console.log("sendAnswer error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { gameId, questionId, answer, username } = req.body;
  if (!gameId || !username) {
    return res
      .status(400)
      .json({ ok: false, error: "gameId and username are required" });
  }

  const correct = !!answer; // can be adjusted later
  console.log(
    "sendAnswer mapping -> pin:",
    gameId,
    "correct:",
    correct,
    "questionId:",
    questionId,
    "username:",
    username
  );
  client.sendAnswer(gameId, correct, username);
  return res.json({ ok: true });
});

// POST /api/nextQuestion { gameId }
app.post("/api/nextQuestion", (req, res) => {
  console.log("HTTP /api/nextQuestion", req.body);
  const { gameId } = req.body;
  if (!gameId) {
    return res.status(400).json({ ok: false, error: "gameId is required" });
  }

  console.log("nextQuestion called for game:", gameId);
  broadcastSSE({ type: "NEXT_QUESTION", pin: gameId });
  return res.json({ ok: true });
});

// POST /api/chat { pin, message, username }
app.post("/api/chat", (req, res) => {
  console.log("HTTP /api/chat", req.body);
  if (!client) {
    console.log("chat error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { pin, message, username } = req.body;
  if (!pin || !message || !username) {
    return res
      .status(400)
      .json({ ok: false, error: "pin, message, and username are required" });
  }

  console.log("chat:", { pin, message, username });
  client.sendChat(pin, message, username);
  return res.json({ ok: true });
});

app.post("/api/submitQuestion", (req, res) => {
  console.log("HTTP /api/submitQuestion", req.body);
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { pin, question, username } = req.body;
  const answerTrue = !!req.body.answerTrue;

  if (!pin || !question || !username) {
    return res.status(400).json({
      ok: false,
      error: "pin, question, and username are required",
    });
  }

  client.submitQuestion(pin, question, answerTrue, username);

  return res.json({ ok: true });
});

// Optional: disconnect route if you ever want it
app.post("/api/disconnect", (req, res) => {
  console.log("HTTP /api/disconnect");
  if (client) {
    client.close();
    client = null;
    currentUsername = null;
  }
  return res.json({ ok: true });
});

// ===== Serve React static build =====
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath));

// Fallback to index.html for React Router
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

// ===== Start HTTP server (Render uses PORT env) =====
const HTTP_PORT = process.env.PORT || 3001;
app.listen(HTTP_PORT, () => {
  console.log(`HTTP API + static server listening on port ${HTTP_PORT}`);
  console.log(
    `TCP server expected at ${TCP_HOST}:${TCP_PORT} (started via require("./server"))`
  );
});