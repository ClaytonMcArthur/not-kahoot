// node-client/GameClient.js
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
      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        console.log('GameClient connected to TCP server');
        this.connected = true;
        this._setupListeners();
        resolve();
      });

      this.socket.on('error', (err) => {
        console.error('GameClient socket error:', err);
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('close', () => {
        console.log('GameClient connection closed');
        this.connected = false;
        this.emit('disconnect');
      });
    });
  }

  _setupListeners() {
    if (!this.socket) return;

    this.socket.on('data', (data) => {
      this.buffer += data.toString();
      let index;
      while ((index = this.buffer.indexOf('\n')) !== -1) {
        const raw = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!raw) continue;

        let msg;
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          console.error('GameClient failed to parse message:', raw, e);
          continue;
        }

        this.emit('message', msg);
        if (msg.type) this.emit(msg.type, msg);
      }
    });
  }

  _send(obj) {
    if (!this.socket || !this.connected) {
      throw new Error('GameClient is not connected');
    }
    this.socket.write(JSON.stringify(obj) + '\n');
  }

  register() {
    this._send({ type: 'REGISTER', username: this.username });
  }

  listGames() {
    this._send({ type: 'LIST_GAMES' });
  }

  createGame(options = {}) {
    this._send({ type: 'CREATE_GAME', ...options });
  }

  joinGame(pin, username) {
    const user = username || this.username;
    this._send({ type: 'JOIN_GAME', pin, username: user });
  }

  exitGame(pin) {
    this._send({ type: 'EXIT_GAME', pin });
  }

  startGame(pin, username) {
    const user = username || this.username;
    console.log('GameClient.startGame', { pin, username: user });
    this._send({ type: 'START_GAME', pin, username: user });
  }

  sendAnswer(pin, correct, username) {
    const user = username || this.username;
    this._send({ type: 'ANSWER', pin, correct: !!correct, username: user });
  }

  nextQuestion(pin, username) {
    const user = username || this.username;
    this._send({ type: 'NEXT_QUESTION', pin, username: user });
  }

  endGame(pin, username) {
    const user = username || this.username;
    this._send({ type: 'END_GAME', pin, username: user });
  }

  sendChat(pin, message, username) {
    const user = username || this.username;
    this._send({ type: 'CHAT', pin, message, username: user });
  }

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

  close() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

module.exports = GameClient;