// node-client/GameClient.js

/**
 * GameClient
 * ---------
 * Thin TCP client wrapper used by the Node HTTP API to talk to the TCP game server.
 *
 * Key behaviors:
 * - Maintains a persistent TCP socket (net.Socket)
 * - Sends/receives newline-delimited JSON messages
 * - Emits:
 *    - 'message' for every decoded message
 *    - msg.type (e.g., 'REGISTER_OK') for convenient awaiting/listening
 *    - 'disconnect' when the socket closes
 *    - 'error' on socket errors / parse issues (parse issues are logged but not rethrown)
 */

const net = require('net');
const EventEmitter = require('events');

class GameClient extends EventEmitter {
  /**
   * @param {string} host - TCP server host
   * @param {number} port - TCP server port
   * @param {string} username - Primary username associated with this TCP session
   */
  constructor(host, port, username) {
    super();

    // Connection configuration
    this.host = host;
    this.port = port;

    // Identity associated with this TCP client (used as a default in messages)
    this.username = username;

    // Underlying TCP socket
    this.socket = null;

    // Buffer for assembling newline-delimited JSON frames
    this.buffer = '';

    // Tracks whether the socket is connected
    this.connected = false;

    // Guard to prevent attaching duplicate listeners to the same socket
    this._listenersSetup = false;
  }

  /**
   * Connect to the TCP server.
   * Resolves once the TCP connection is established and listeners are attached.
   *
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      // Establish a new TCP connection to the game server
      this.socket = net.createConnection(
        { host: this.host, port: this.port },
        () => {
          console.log('GameClient connected to TCP server');
          this.connected = true;

          // Attach data parsing and message dispatch listeners
          this._setupListeners();

          resolve();
        }
      );

      // Surface socket errors to callers and listeners
      this.socket.on('error', (err) => {
        console.error('GameClient socket error:', err);
        this.emit('error', err);
        reject(err);
      });

      // Close indicates the underlying connection ended (cleanly or abruptly)
      this.socket.on('close', () => {
        console.log('GameClient connection closed');
        this.connected = false;
        this.emit('disconnect');
      });
    });
  }

  /**
   * Attach socket listeners for incoming TCP data and parse newline-delimited JSON.
   * Safe to call multiple times; only attaches once per instance.
   *
   * Incoming framing:
   * - Server sends JSON objects separated by '\n'
   * - We accumulate into `this.buffer` until a newline is found
   */
  _setupListeners() {
    if (!this.socket) return;

    // Prevent accidentally attaching multiple data listeners
    if (this._listenersSetup) return;
    this._listenersSetup = true;

    this.socket.on('data', (data) => {
      // Append raw bytes to our buffer
      this.buffer += data.toString();

      let index;

      // Process complete frames delimited by '\n'
      while ((index = this.buffer.indexOf('\n')) !== -1) {
        const raw = this.buffer.slice(0, index).trim();

        // Remove processed frame (plus newline) from buffer
        this.buffer = this.buffer.slice(index + 1);

        // Ignore empty frames
        if (!raw) continue;

        let msg;
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          // Bad JSON should not crash the server; log and continue
          console.error('GameClient failed to parse message:', raw, e);
          continue;
        }

        // Emit a generic message event for all consumers
        this.emit('message', msg);

        // Also emit a typed event for convenience (e.g., 'REGISTER_OK', 'GAMES_LIST', etc.)
        if (msg.type) this.emit(msg.type, msg);
      }
    });
  }

  /**
   * Send a JSON message to the TCP server (newline-delimited).
   *
   * @param {Object} obj - Message object to send
   */
  _send(obj) {
    if (!this.socket || !this.connected) {
      throw new Error('GameClient is not connected');
    }

    // Server expects newline-delimited JSON frames
    this.socket.write(JSON.stringify(obj) + '\n');
  }

  /**
   * Register this connection's username with the TCP server.
   */
  register() {
    this._send({ type: 'REGISTER', username: this.username });
  }

  /**
   * Request a list of available games.
   */
  listGames() {
    this._send({ type: 'LIST_GAMES' });
  }

  /**
   * Create a new game using optional server-defined parameters.
   *
   * @param {Object} options
   */
  createGame(options = {}) {
    this._send({ type: 'CREATE_GAME', ...options });
  }

  /**
   * Join a game by PIN.
   *
   * @param {string|number} pin
   * @param {string} [username] - Optional override; defaults to this.username
   */
  joinGame(pin, username) {
    const user = username || this.username;
    this._send({ type: 'JOIN_GAME', pin, username: user });
  }

  /**
   * Exit a game by PIN.
   *
   * @param {string|number} pin
   */
  exitGame(pin) {
    this._send({ type: 'EXIT_GAME', pin });
  }

  /**
   * Start a game by PIN (typically host-only).
   *
   * @param {string|number} pin
   * @param {string} [username] - Optional override; defaults to this.username
   */
  startGame(pin, username) {
    const user = username || this.username;
    console.log('GameClient.startGame', { pin, username: user });
    this._send({ type: 'START_GAME', pin, username: user });
  }

  /**
   * Submit an answer result for a user.
   *
   * @param {string|number} pin
   * @param {boolean} correct
   * @param {string} [username] - Optional override; defaults to this.username
   */
  sendAnswer(pin, correct, username) {
    const user = username || this.username;
    this._send({ type: 'ANSWER', pin, correct: !!correct, username: user });
  }

  /**
   * Advance the game to the next question (typically host-only).
   *
   * @param {string|number} pin
   * @param {string} [username] - Optional override; defaults to this.username
   */
  nextQuestion(pin, username) {
    const user = username || this.username;
    this._send({ type: 'NEXT_QUESTION', pin, username: user });
  }

  /**
   * End the game (typically host-only).
   *
   * @param {string|number} pin
   * @param {string} [username] - Optional override; defaults to this.username
   */
  endGame(pin, username) {
    const user = username || this.username;
    this._send({ type: 'END_GAME', pin, username: user });
  }

  /**
   * Send a chat message to the game.
   *
   * @param {string|number} pin
   * @param {string} message
   * @param {string} [username] - Optional override; defaults to this.username
   */
  sendChat(pin, message, username) {
    const user = username || this.username;
    this._send({ type: 'CHAT', pin, message, username: user });
  }

  /**
   * Submit a question to the game.
   *
   * @param {string|number} pin
   * @param {string} question
   * @param {boolean} answerTrue
   * @param {string} [username] - Optional override; defaults to this.username
   */
  submitQuestion(pin, question, answerTrue, username) {
    const user = username || this.username;
    this._send({
      type: 'SUBMIT_QUESTION',
      pin,
      question,
      answerTrue: !!answerTrue,
      username: user,
    });
  }

  /**
   * Close the TCP connection.
   * Uses socket.end() for a graceful shutdown.
   */
  close() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

module.exports = GameClient;