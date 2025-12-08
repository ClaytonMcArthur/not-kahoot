// src/api/clientApi.js

/**
 * Base URL for all API requests.
 * - In production, the frontend and backend are assumed to be served from the same origin.
 * - In development, we hit the local Node API server directly.
 */
const BASE_URL =
  process.env.NODE_ENV === 'production'
    ? '/api'
    : 'http://localhost:3001/api';

/**
 * Builds standard headers for API requests.
 * - Includes JSON content type
 * - Optionally adds Bearer auth token
 * - Optionally adds X-Username for server-side identity continuity
 *
 * @param {Object} extra - Any additional headers to merge in.
 * @returns {Object} Headers object for fetch()
 */
function authHeaders(extra = {}) {
  // Persisted auth/session context (set during login/connect flows)
  const token = localStorage.getItem('authToken');
  const username = localStorage.getItem('username');

  return {
    'Content-Type': 'application/json',
    // Only send Authorization when we actually have a token
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // Only send username header when available
    ...(username ? { 'X-Username': username } : {}),
    // Allow callers to extend/override headers (e.g., custom content-types)
    ...extra,
  };
}

/**
 * Helper for POST requests to the API.
 * - Automatically injects username into the JSON body unless already provided
 * - Throws on non-2xx responses with a best-effort error message
 *
 * @param {string} path - API route path (e.g., "/login")
 * @param {Object} body - JSON payload
 * @returns {Promise<any>} Parsed JSON response
 */
async function post(path, body) {
  // Pull username once so POST bodies can include it consistently
  const username = localStorage.getItem('username');

  // Ensure we always send an object payload
  const payload = { ...(body || {}) };

  // Inject username unless the caller already provided one
  // (Prevents accidental overrides when callers explicitly set username)
  if (username && !('username' in payload)) payload.username = username;

  // Execute request
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  // Attempt to parse JSON; fall back to empty object if response body is not JSON
  const data = await res.json().catch(() => ({}));

  // Normalize errors so callers can handle with a simple try/catch
  if (!res.ok) throw new Error(data.error || 'Request failed');

  return data;
}

/**
 * Helper for GET requests to the API.
 * - Throws on non-2xx responses with a best-effort error message
 *
 * @param {string} path - API route path (e.g., "/scoreboard")
 * @returns {Promise<any>} Parsed JSON response
 */
async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  // Attempt to parse JSON; fall back to empty object if response body is not JSON
  const data = await res.json().catch(() => ({}));

  // Normalize errors so callers can handle with a simple try/catch
  if (!res.ok) throw new Error(data.error || 'Request failed');

  return data;
}

// ========== AUTH HELPERS ==========

/**
 * Create a new user account.
 * @returns {Promise<any>}
 */
export function signup(username, password) {
  return post('/signup', { username, password });
}

/**
 * Authenticate an existing user.
 * Expected response: { token, user }
 * @returns {Promise<any>}
 */
export function login(username, password) {
  return post('/login', { username, password }); // returns { token, user }
}

/**
 * IMPORTANT:
 * Store username so:
 * - SSE subscriptions know which stream to connect to
 * - authHeaders() can send X-Username consistently
 *
 * @param {string} username
 * @returns {Promise<any>}
 */
export async function connect(username) {
  // Only store a non-empty, trimmed username
  if (username && String(username).trim()) {
    localStorage.setItem('username', String(username).trim());
  }

  // Also send username to the backend connect route (keeps server-side session in sync)
  return post('/connect', { username });
}

/**
 * Fetch scoreboard / leaderboard snapshot.
 * @returns {Promise<any>}
 */
export function scoreboard() {
  return get('/scoreboard');
}

// ========== GAME HELPERS ==========

/**
 * List available games (server-defined semantics).
 * @returns {Promise<any>}
 */
export function listGames() {
  return post('/listGames');
}

/**
 * Create a new game with optional configuration.
 * @param {Object} options
 * @returns {Promise<any>}
 */
export function createGame(options) {
  return post('/createGame', options);
}

/**
 * Start a game by PIN.
 * @param {string|number} pin
 * @returns {Promise<any>}
 */
export function startGame(pin) {
  return post('/startGame', { pin });
}

/**
 * Join a game by its internal ID.
 * @param {string|number} gameId
 * @returns {Promise<any>}
 */
export function joinGame(gameId) {
  return post('/joinGame', { gameId });
}

/**
 * Exit/leave a game session.
 * @param {string|number} gameId
 * @returns {Promise<any>}
 */
export function exitGame(gameId) {
  return post('/exitGame', { gameId });
}

/**
 * Submit an answer for a specific question.
 * @param {string|number} gameId
 * @param {string|number} questionId
 * @param {any} answer
 * @returns {Promise<any>}
 */
export function sendAnswer(gameId, questionId, answer) {
  return post('/sendAnswer', { gameId, questionId, answer });
}

/**
 * Advance to the next question (typically host-only).
 * @param {string|number} gameId
 * @returns {Promise<any>}
 */
export function nextQuestion(gameId) {
  return post('/nextQuestion', { gameId });
}

/**
 * End the current game (typically host-only).
 * @param {string|number} gameId
 * @returns {Promise<any>}
 */
export function endGame(gameId) {
  return post('/endGame', { gameId });
}

/**
 * Submit a new question to a game (by PIN).
 * - If username isn't provided, we fall back to localStorage, then "Unknown".
 *
 * @param {string|number} pin
 * @param {string} question
 * @param {any} answerTrue
 * @param {string} [username]
 * @returns {Promise<any>}
 */
export function submitQuestion(pin, question, answerTrue, username) {
  // Ensure the server receives a username value even if the caller didn't pass one
  const finalUsername =
    username || localStorage.getItem('username') || 'Unknown';

  return post('/submitQuestion', {
    pin,
    question,
    answerTrue,
    username: finalUsername,
  });
}

/**
 * Award the winner for a game (server-defined semantics).
 * @param {string} username
 * @param {string|number} pin
 * @returns {Promise<any>}
 */
export function awardWinner(username, pin) {
  return post('/awardWinner', { username, pin });
}

/**
 * Send a chat message.
 * Note: This uses fetch directly rather than the `post()` helper so it can
 * control the exact route and payload without additional injection behavior changes.
 *
 * @param {string|number} pin
 * @param {string} message
 * @param {string} [username]
 * @returns {Promise<void>}
 */
export async function sendChat(pin, message, username) {
  // Ensure chat always includes some username
  const finalUsername =
    username || localStorage.getItem('username') || 'Unknown';

  await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ pin, message, username: finalUsername }),
  });
}

// ========== SSE (Server-Sent Events) ==========

/**
 * Single shared EventSource connection.
 * We keep it global to avoid multiple SSE streams per tab.
 */
let eventSource = null;

/**
 * Tracks which username the current EventSource is associated with.
 * If the username changes, we tear down and recreate the stream.
 */
let eventSourceUser = null;

/**
 * Subscribers are callbacks invoked for each SSE message payload.
 * Using a Set ensures:
 * - no duplicate callbacks
 * - cheap add/remove
 */
const subscribers = new Set();

/**
 * Ensure an active EventSource stream exists for the given username.
 * - Closes and recreates stream if username differs from current stream user
 * - Parses incoming SSE messages as JSON and broadcasts to subscribers
 *
 * @param {string} username
 */
function ensureEventSource(username) {
  // Convert BASE_URL (".../api") into the origin root ("...")
  // e.g. "http://localhost:3001/api" -> "http://localhost:3001"
  // e.g. "/api" -> "" (same-origin)
  const root = BASE_URL.replace('/api', '');

  // If we already have a stream for this user, do nothing
  if (eventSource && eventSourceUser === username) return;

  // Username changed (or first time):
  // Close previous stream cleanly so the server can release resources.
  if (eventSource) {
    try {
      eventSource.close();
    } catch (_) {
      // Ignore close errors; we'll re-establish a new stream regardless
    }
    eventSource = null;
    eventSourceUser = null;
  }

  // Create a new SSE stream bound to this username
  eventSourceUser = username;
  eventSource = new EventSource(
    `${root}/api/events?username=${encodeURIComponent(username)}`
  );

  // Fired for each server-sent message event
  eventSource.onmessage = (e) => {
    let msg;

    // SSE messages are strings; we expect JSON payloads
    try {
      msg = JSON.parse(e.data);
    } catch (err) {
      console.error('SSE parse error:', err, e.data);
      return;
    }

    // Fan-out to all current subscribers
    subscribers.forEach((cb) => cb(msg));
  };

  // Fired on stream errors (network blips, server restart, etc.)
  eventSource.onerror = (err) => {
    console.error('SSE error:', err);

    // If it fully closes, allow recreating later
    // readyState === 2 means CLOSED
    if (eventSource && eventSource.readyState === 2) {
      try {
        eventSource.close();
      } catch (_) {
        // Ignore close errors
      }
      eventSource = null;
      eventSourceUser = null;
    }
  };
}

/**
 * Subscribe to game event updates via SSE.
 * Returns an unsubscribe function.
 *
 * @param {(msg:any) => void} callback
 * @param {Object} [opts]
 * @param {string} [opts.username] - Optional override; otherwise uses localStorage
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToGameEvents(callback, opts = {}) {
  // Register callback
  subscribers.add(callback);

  // Determine username to bind the SSE stream to
  const username =
    (opts.username && String(opts.username).trim()) ||
    (localStorage.getItem('username') || '').trim();

  // If username is missing, keep the subscriber registered but don't attempt SSE.
  // Caller can still unsubscribe via the returned function.
  if (!username) {
    console.warn('subscribeToGameEvents: no username available for SSE');
    return () => subscribers.delete(callback);
  }

  // Ensure the SSE connection exists and is bound to the correct username
  ensureEventSource(username);

  // Return unsubscribe function
  return () => subscribers.delete(callback);
}