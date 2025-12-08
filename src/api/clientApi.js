// src/api/clientApi.js
const BASE_URL =
  process.env.NODE_ENV === 'production'
    ? '/api'
    : 'http://localhost:3001/api';

function authHeaders(extra = {}) {
  const token = localStorage.getItem('authToken');
  const username = localStorage.getItem('username');

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(username ? { 'X-Username': username } : {}),
    ...extra,
  };
}

async function post(path, body) {
  const username = localStorage.getItem('username');
  const payload = { ...(body || {}) };

  // inject username unless the caller already provided one
  if (username && !('username' in payload)) payload.username = username;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ========== AUTH HELPERS ==========
export function signup(username, password) {
  return post('/signup', { username, password });
}

export function login(username, password) {
  return post('/login', { username, password }); // returns { token, user }
}

// IMPORTANT: store username so SSE + headers are consistent
export async function connect(username) {
  if (username && String(username).trim()) {
    localStorage.setItem('username', String(username).trim());
  }
  return post('/connect', { username });
}

export function scoreboard() {
  return get('/scoreboard');
}

// ========== GAME HELPERS ==========
export function listGames() {
  return post('/listGames');
}

export function createGame(options) {
  return post('/createGame', options);
}

export function startGame(pin) {
  return post('/startGame', { pin });
}

export function joinGame(gameId) {
  return post('/joinGame', { gameId });
}

export function exitGame(gameId) {
  return post('/exitGame', { gameId });
}

export function sendAnswer(gameId, questionId, answer) {
  return post('/sendAnswer', { gameId, questionId, answer });
}

export function nextQuestion(gameId) {
  return post('/nextQuestion', { gameId });
}

export function endGame(gameId) {
  return post('/endGame', { gameId });
}

export function submitQuestion(pin, question, answerTrue, username) {
  const finalUsername =
    username || localStorage.getItem('username') || 'Unknown';

  return post('/submitQuestion', {
    pin,
    question,
    answerTrue,
    username: finalUsername,
  });
}

export function awardWinner(username, pin) {
  return post('/awardWinner', { username, pin });
}

export async function sendChat(pin, message, username) {
  const finalUsername =
    username || localStorage.getItem('username') || 'Unknown';

  await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ pin, message, username: finalUsername }),
  });
}

// ========== SSE ==========
let eventSource = null;
let eventSourceUser = null;
const subscribers = new Set();

function ensureEventSource(username) {
  const root = BASE_URL.replace('/api', '');

  if (eventSource && eventSourceUser === username) return;

  // username changed or first time
  if (eventSource) {
    try { eventSource.close(); } catch (_) {}
    eventSource = null;
    eventSourceUser = null;
  }

  eventSourceUser = username;
  eventSource = new EventSource(
    `${root}/api/events?username=${encodeURIComponent(username)}`
  );

  eventSource.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch (err) {
      console.error('SSE parse error:', err, e.data);
      return;
    }
    subscribers.forEach((cb) => cb(msg));
  };

  eventSource.onerror = (err) => {
    console.error('SSE error:', err);
    // If it fully closes, allow recreating later
    if (eventSource && eventSource.readyState === 2) {
      try { eventSource.close(); } catch (_) {}
      eventSource = null;
      eventSourceUser = null;
    }
  };
}

export function subscribeToGameEvents(callback, opts = {}) {
  subscribers.add(callback);

  const username =
    (opts.username && String(opts.username).trim()) ||
    (localStorage.getItem('username') || '').trim();

  if (!username) {
    console.warn('subscribeToGameEvents: no username available for SSE');
    return () => subscribers.delete(callback);
  }

  ensureEventSource(username);

  return () => subscribers.delete(callback);
}