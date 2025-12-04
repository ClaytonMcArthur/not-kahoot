// client-api.js
require("./server"); // start the TCP game server first

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const GameClient = require("./GameClient");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// TCP server connection settings (internal)
const TCP_HOST = process.env.TCP_HOST || "127.0.0.1";
const TCP_PORT = process.env.TCP_PORT || 4000;

// Single GameClient instance for this process
let client = null;
let currentUsername = null;

// SSE clients
const sseClients = new Set(); // res objects

function broadcastSSE(msg) {
  const data = JSON.stringify(msg);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

// SSE endpoint for frontend
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

// Connect & register a user
app.post("/api/connect", async (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ ok: false, error: "Username is required" });
  }

  try {
    // Close existing client if any
    if (client) {
      client.close();
      client = null;
    }

    currentUsername = username;
    client = new GameClient(TCP_HOST, TCP_PORT, username);

    // Wire events to SSE
    client.on("message", (msg) => {
      broadcastSSE(msg);
    });

    client.on("error", (err) => {
      console.error("GameClient error:", err);
      broadcastSSE({ type: "ERROR", message: err.message });
    });

    await client.connect();
    client.register();

    return res.json({ ok: true });
  } catch (err) {
    console.error("Failed to connect to TCP server:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Ask server for list of games
app.post("/api/list-games", (req, res) => {
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }
  client.listGames();
  // Actual list will arrive via SSE as GAMES_LIST
  return res.json({ ok: true });
});

// Host creates a game
app.post("/api/create-game", (req, res) => {
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { name } = req.body; // optional, not used in server yet
  client.createGame({ name });
  return res.json({ ok: true });
});

// Join a game by PIN
app.post("/api/join-game", (req, res) => {
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ ok: false, error: "pin is required" });
  }

  client.joinGame(pin);
  return res.json({ ok: true });
});

// Exit game
app.post("/api/exit-game", (req, res) => {
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ ok: false, error: "pin is required" });
  }

  client.exitGame(pin);
  return res.json({ ok: true });
});

// Start game (host)
app.post("/api/start-game", (req, res) => {
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ ok: false, error: "pin is required" });
  }

  client.startGame(pin);
  return res.json({ ok: true });
});

// Submit answer
app.post("/api/answer", (req, res) => {
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { pin, correct } = req.body;
  if (!pin) {
    return res.status(400).json({ ok: false, error: "pin is required" });
  }

  client.sendAnswer(pin, !!correct);
  return res.json({ ok: true });
});

// Chat
app.post("/api/chat", (req, res) => {
  if (!client) {
    return res.status(400).json({ ok: false, error: "Not connected" });
  }

  const { pin, message } = req.body;
  if (!pin || !message) {
    return res.status(400).json({ ok: false, error: "pin and message are required" });
  }

  client.sendChat(pin, message);
  return res.json({ ok: true });
});

// Optional disconnect
app.post("/api/disconnect", (req, res) => {
  if (client) {
    client.close();
    client = null;
    currentUsername = null;
  }
  return res.json({ ok: true });
});

// Serve React build
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath));

// Fallback to index.html for React Router
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

// HTTP port for Render
const HTTP_PORT = process.env.PORT || 3001;
app.listen(HTTP_PORT, () => {
  console.log(`HTTP API + static server listening on port ${HTTP_PORT}`);
});