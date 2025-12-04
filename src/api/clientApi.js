// src/api/clientApi.js
const API_BASE = process.env.REACT_APP_API_BASE || "";

// Helper for JSON POST
async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request to ${path} failed`);
  }
  return data;
}

// ===== Connection & games =====

export async function connect(username) {
  return postJSON("/api/connect", { username });
}

export async function listGames() {
  return postJSON("/api/listGames", {});
}

export async function createGame({ username, theme, isPublic, maxPlayers }) {
  const result = await postJSON("/api/createGame", {
    username,
    theme,
    isPublic,
    maxPlayers,
  });
  return result.game;
}

export async function joinGame(pin, username) {
  return postJSON("/api/joinGame", { gameId: pin, username });
}

export async function exitGame(pin, username) {
  return postJSON("/api/exitGame", { gameId: pin, username });
}

export async function startGame(pin, username) {
  return postJSON("/api/startGame", { pin, username });
}

// ===== Gameplay =====

export async function sendAnswer(pin, questionId, answer, username) {
  return postJSON("/api/sendAnswer", {
    gameId: pin,
    questionId,
    answer,
    username,
  });
}

export async function nextQuestion(pin) {
  return postJSON("/api/nextQuestion", { gameId: pin });
}

export async function submitQuestion(pin, question, answerTrue, username) {
  return postJSON("/api/submitQuestion", {
    pin,
    question,
    answerTrue,
    username,
  });
}

export async function removeGame(pin) {
    return postJSON("/api/removeGame", { pin });
}

// ===== Chat & events =====

export async function sendChat(pin, message, username) {
  return postJSON("/api/chat", { pin, message, username });
}

// Shared SSE stream
export function subscribeToGameEvents(callback) {
  const source = new EventSource("/api/events");

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      callback(data);
    } catch (e) {
      console.error("Failed to parse SSE message:", e);
    }
  };

  source.onerror = (err) => {
    console.error("SSE error:", err);
  };

  return () => {
    source.close();
  };
}