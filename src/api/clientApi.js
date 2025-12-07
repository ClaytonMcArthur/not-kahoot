// src/api/clientApi.js
const BASE_URL =
    process.env.NODE_ENV === 'production'
        ? '/api'
        : 'http://localhost:3001/api';

async function post(path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

// ========== AUTH HELPERS ==========

export function signup(username, password) {
    return post('/signup', { username, password });
}

export function login(username, password) {
    // returns { token, user: { id, username } }
    return post('/login', { username, password });
}

export function connect(username) {
    return post('/connect', { username });
}

export function listGames() {
    return post('/listGames');
}

export function createGame(options) {
    return post('/createGame', options);
}

export function removeGame(pin) {
    return post('/removeGame', { pin });
}

export function startGame(pin, username) {
    return post('/startGame', { pin, username });
}

export function joinGame(gameId) {
  const username = localStorage.getItem("username") || "Unknown";
  return post("/joinGame", { gameId, username });
}

export function exitGame(gameId) {
    return post('/exitGame', { gameId });
}

export function sendAnswer(gameId, questionId, answer) {
  const username = localStorage.getItem("username") || "Unknown";
  return post("/sendAnswer", { gameId, questionId, answer, username });
}

export function nextQuestion(gameId) {
    return post('/nextQuestion', { gameId });
}

export function submitQuestion(pin, question, answerTrue, username) {
    const finalUsername =
        username ||
        localStorage.getItem('username') ||
        'Unknown';

    return post('/submitQuestion', {
        pin,
        question,
        answerTrue,
        username: finalUsername
    });
}

export async function sendChat(pin, message, username) {
    const finalUsername =
        username ||
        localStorage.getItem('username') ||
        'Unknown';

    await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, message, username: finalUsername })
    });
}

// Frontend SSE subscription to receive live game events
let eventSource = null;
const subscribers = new Set();

export function subscribeToGameEvents(callback) {
    subscribers.add(callback);

    if (!eventSource) {
        eventSource = new EventSource(`${BASE_URL.replace('/api', '')}/api/events`);
        eventSource.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            subscribers.forEach(cb => cb(msg));
        };
        eventSource.onerror = (err) => {
            console.error('SSE error:', err);
        };
    }

    return () => subscribers.delete(callback);
}