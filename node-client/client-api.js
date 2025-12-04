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
    // Close previous client if any
    if (client) {
      console.log("Closing existing GameClient before reconnect");
      client.close();
      client = null;
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

    console.log(`Registered username: ${username}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Failed to connect to TCP server in /api/connect:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/listGames {}
app.post("/api/listGames", (req, res) => {
  console.log("HTTP /api/listGames");
  if (!client) {
    console.log("listGames error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }
  client.listGames();
  return res.json({ ok: true });
});

// POST /api/createGame { ...options }
app.post("/api/createGame", (req, res) => {
  console.log("HTTP /api/createGame", req.body);
  if (!client) {
    console.log("createGame error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }
  const options = req.body || {};
  client.createGame(options);
  return res.json({ ok: true });
});

// POST /api/removeGame { pin } (stub)
app.post("/api/removeGame", (req, res) => {
  console.log("HTTP /api/removeGame", req.body);
  // You can later add a message type to server.js if you want to implement this.
  return res.json({ ok: true });
});

// POST /api/startGame { pin or gameId, questions? }
app.post("/api/startGame", (req, res) => {
  console.log("HTTP /api/startGame", req.body);
  if (!client) {
    console.log("startGame error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { gameId, pin, questions } = req.body;
  const chosenPin = pin || gameId;
  if (!chosenPin) {
    return res.status(400).json({ ok: false, error: "pin or gameId is required" });
  }

  console.log("startGame called with pin:", chosenPin, "questions:", questions?.length || 0);
  client.startGame(chosenPin);
  return res.json({ ok: true });
});

// POST /api/joinGame { gameId }
app.post("/api/joinGame", (req, res) => {
  console.log("HTTP /api/joinGame", req.body);
  if (!client) {
    console.log("joinGame error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { gameId } = req.body;
  if (!gameId) {
    return res.status(400).json({ ok: false, error: "gameId is required" });
  }

  client.joinGame(gameId);
  return res.json({ ok: true });
});

// POST /api/exitGame { gameId }
app.post("/api/exitGame", (req, res) => {
  console.log("HTTP /api/exitGame", req.body);
  if (!client) {
    console.log("exitGame error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { gameId } = req.body;
  if (!gameId) {
    return res.status(400).json({ ok: false, error: "gameId is required" });
  }

  client.exitGame(gameId);
  return res.json({ ok: true });
});

// POST /api/sendAnswer { gameId, questionId, answer }
app.post("/api/sendAnswer", (req, res) => {
  console.log("HTTP /api/sendAnswer", req.body);
  if (!client) {
    console.log("sendAnswer error: no GameClient");
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { gameId, questionId, answer } = req.body;
  if (!gameId) {
    return res.status(400).json({ ok: false, error: "gameId is required" });
  }

  const correct = !!answer; // you can adjust this mapping later if needed
  console.log("sendAnswer mapping -> pin:", gameId, "correct:", correct, "questionId:", questionId);
  client.sendAnswer(gameId, correct);
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
  if (!pin || !message) {
    return res
      .status(400)
      .json({ ok: false, error: "pin and message are required" });
  }

  console.log("chat:", { pin, message, username });
  client.sendChat(pin, message);
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
  console.log(`TCP server expected at ${TCP_HOST}:${TCP_PORT} (started via require("./server"))`);
});