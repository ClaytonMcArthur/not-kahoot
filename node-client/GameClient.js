// GameClient.js
const net = require('net');
const EventEmitter = require('events');

class GameClient extends EventEmitter {
  constructor(host, port, username) {
    super();
    this.host = host;
    this.port = port;
    this.username = username;
    this.socket = null;
    this.buffer = '';
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(
        { host: this.host, port: this.port },
        () => {
          console.log('GameClient connected to TCP server');
          this.connected = true;
          this._setupListeners();
          resolve();
        }
      );

      this.socket.on('error', (err) => {
        console.error('GameClient socket error:', err);
        this.emit('error', err);
        if (!this.connected) {
          reject(err);
        }
      });

      this.socket.on('close', () => {
        console.log('GameClient connection closed');
        this.connected = false;
        this.emit('disconnect');
      });
    });
  }

  _setupListeners() {
    this.socket.on('data', (data) => {
      this.buffer += data.toString();
      let index;
      while ((index = this.buffer.indexOf('\n')) !== -1) {
        const raw = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        if (!raw.trim()) continue;

        let msg;
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          console.error('GameClient failed to parse message:', raw, e);
          continue;
        }

        // Emit a generic event and a type-specific event
        this.emit('message', msg);
        if (msg.type) {
          this.emit(msg.type, msg);
        }
      }
    });
  }

  _send(obj) {
    if (!this.socket || !this.connected) {
      console.error('GameClient cannot send, not connected');
      return;
    }
    const str = JSON.stringify(obj) + '\n';
    this.socket.write(str);
  }

  // Protocol helpers

  register() {
    this._send({
      type: 'REGISTER',
      username: this.username,
    });
  }

  listGames() {
    this._send({
      type: 'LIST_GAMES',
    });
  }

  createGame(options = {}) {
    this._send({
      type: 'CREATE_GAME',
      ...options,
    });
  }

  joinGame(pin) {
    this._send({
      type: 'JOIN_GAME',
      pin,
    });
  }

  exitGame(pin) {
    this._send({
      type: 'EXIT_GAME',
      pin,
    });
  }

  /**
   * Start a game as the host.
   * Called from client-api.js as: client.startGame(pin, username)
   */
  startGame(pin, username, questions) {
    const user = username || this.username;
    const qCount = Array.isArray(questions) ? questions.length : 0;

    console.log('GameClient.startGame', {
      pin,
      username: user,
      questionsCount: qCount,
    });

    // Server-side START_GAME now ignores questions from the message and uses
    // the questions accumulated from SUBMIT_QUESTION, so we just send pin + username.
    this._send({
      type: 'START_GAME',
      pin,
      username: user,
      // questions: questions || []  // optional, safe to omit since server ignores it
    });
  }

  sendAnswer(pin, correct) {
    this._send({
      type: 'ANSWER',
      pin,
      correct,
    });
  }

  sendChat(pin, message, username) {
    this._send({
      type: 'CHAT',
      pin,
      message,
      username,
    });
  }

  /**
   * Submit a question for the current game.
   * Called from client-api.js as:
   *   client.submitQuestion(pin, question, answerTrue, username)
   */
  submitQuestion(pin, question, answerTrue, username) {
    const user = username || this.username;

    console.log('GameClient.submitQuestion', {
      pin,
      username: user,
      question,
      answerTrue: !!answerTrue,
    });

    this._send({
      type: 'SUBMIT_QUESTION',
      pin,
      question,
      answerTrue: !!answerTrue,
      username: user,
    });
  }

  close() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

module.exports = GameClient;