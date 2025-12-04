// src/api/clientApi.js
const API_BASE = process.env.REACT_APP_API_BASE || "";

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch (e) {}
    throw new Error(msg);
  }

  return res.json().catch(() => ({}));
}

// --- existing helpers like connect, listGames, createGame, joinGame, exitGame, etc. ---

export async function startGame(pin, username) {
  // this must match client-api.js (Node) route:
  // app.post("/api/startGame", (req, res) => { const { pin, username } = req.body; ... })
  return postJSON("/api/startGame", { pin, username });
}

export async function removeGame(pin) {
  return postJSON("/api/removeGame", { pin });
}

export async function sendAnswer(gameId, questionId, answer) {
  return postJSON("/api/sendAnswer", { gameId, questionId, answer });
}

export async function nextQuestion(gameId) {
  return postJSON("/api/nextQuestion", { gameId });
}

export function subscribeToGameEvents(callback) {
  const es = new EventSource(`${API_BASE}/api/events`);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      callback(data);
    } catch (e) {
      console.error("Failed to parse SSE event:", event.data, e);
    }
  };

  es.onerror = (err) => {
    console.error("SSE error:", err);
  };

  return () => {
    es.close();
  };
}