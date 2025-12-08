// src/pages/open-game/open-game.js
import './open-game.scss';
import { DisplayUsers } from '../../components/DisplayUsers/DisplayUsers';
import { Button } from '../../components/Button/Button';
import { Chat } from '../../components/Chat/Chat';
import { AddQuestionModal } from '../../components/AddQuestionModal/AddQuestionModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import {
  sendChat,
  startGame,
  subscribeToGameEvents,
  exitGame,
  submitQuestion,
  endGame,
} from '../../api/clientApi';
import { BackgroundMusic } from '../../components/BackgroundMusic/BackgroundMusic';

export const OpenGame = () => {
  const [questionsByPlayer, setQuestionsByPlayer] = useState({});
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state || {};
  const username = state.username || localStorage.getItem('username') || 'Unknown';

  const [game, setGame] = useState(state.game || null);
  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState(
    (state.game?.players || []).map((p) => (typeof p === 'string' ? { username: p } : p))
  );

  const isHost = useMemo(() => {
    return !!game && username === game.host;
  }, [game, username]);

  const buildQuestionsByPlayer = (g) => {
    const out = {};
    (g?.questions || []).forEach((q) => {
      if (!q?.username) return;
      out[q.username] = { question: q.question, answerTrue: !!q.answerTrue };
    });
    return out;
  };

  useEffect(() => {
    if (!game) return;

    const unsubscribe = subscribeToGameEvents((msg) => {
      if (!msg.pin || msg.pin !== game.pin) return;

      switch (msg.type) {
        case 'JOINED_GAME':
          if (msg.game) {
            setGame(msg.game);
            setPlayers((msg.game.players || []).map((p) => (typeof p === 'string' ? { username: p } : p)));
            setQuestionsByPlayer(buildQuestionsByPlayer(msg.game));
          }
          break;

        case 'PLAYER_JOINED':
        case 'PLAYER_LEFT':
        case 'SCORE_UPDATE': {
          if (msg.game) {
            setGame(msg.game);
            const playersFromGame = (msg.game.players || []).map((p) =>
              typeof p === 'string' ? { username: p } : p
            );
            setPlayers(playersFromGame);
            setQuestionsByPlayer(buildQuestionsByPlayer(msg.game));
          }
          break;
        }

        case 'QUESTION_SUBMITTED': {
          setQuestionsByPlayer((prev) => ({
            ...prev,
            [msg.username]: { question: msg.question, answerTrue: msg.answerTrue },
          }));
          break;
        }

        case 'CHAT': {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), player: msg.from, text: msg.message },
          ]);
          break;
        }

        case 'GAME_STARTED': {
          navigate('/active-game', { state: { game: msg.game, username } });
          break;
        }

        case 'GAME_ENDED': {
          // If host ends it in lobby for some reason
          navigate('/home');
          break;
        }

        default:
          break;
      }
    }, { username });

    return () => unsubscribe();
  }, [game?.pin, navigate, username]);

  const handleSendMessage = (messageText) => {
    if (!game) return;
    sendChat(game.pin, messageText, username);
  };

  const handleEndGame = async () => {
    if (!game) return;
    try {
      await endGame(game.pin);
    } catch (err) {
      console.error('Failed to end game:', err);
    }
    navigate('/home');
  };

  const handleExitGame = async () => {
    if (!game) return;
    try {
      await exitGame(game.pin);
    } catch (err) {
      console.error('Failed to exit game:', err);
    }
    navigate('/home');
  };

  if (!game) return <main className='open-game'>No game data found.</main>;

  return (
    <main className='open-game'>
      <AddQuestionModal
        isOpen={isQuestionModalOpen}
        onClose={() => setIsQuestionModalOpen(false)}
        onSubmitQuestion={async (q) => {
          try {
            await submitQuestion(game.pin, q.question, q.answerTrue, username);
          } catch (err) {
            console.error('Failed to submit question:', err);
          }

          setQuestionsByPlayer((prev) => ({
            ...prev,
            [username]: { question: q.question, answerTrue: q.answerTrue },
          }));
          setIsQuestionModalOpen(false);
        }}
      />

      <h3 className='number-players'>
        Players: {players.length}/{game.maxPlayers ?? '—'}
      </h3>
      <h1>Waiting for players...</h1>
      <h2 className='game-theme'>Theme: {game.theme ?? '—'}</h2>
      <h2 className='game-pin'>Game PIN: {game.pin}</h2>

      <div className='question-submission'>
        <Button
          buttonText='Add Question'
          buttonEvent={() => setIsQuestionModalOpen(true)}
          disabled={!!questionsByPlayer[username]}
        />
      </div>

      <DisplayUsers
        users={players.map((p) => ({
          username: p.username,
          submitted: !!questionsByPlayer[p.username],
        }))}
      />

      <Chat messages={messages} user={username} onSendMessage={handleSendMessage} />

      {isHost ? (
        <div className='host-controls'>
          <div className='start-game'>
            <Button
              buttonText='Start game'
              buttonEvent={async () => {
                try {
                  await startGame(game.pin);
                } catch (err) {
                  console.error('Failed to start game:', err);
                  alert(err.message);
                }
              }}
            />
          </div>
          <div className='end-game'>
            <Button buttonText='End game' buttonEvent={handleEndGame} />
          </div>
        </div>
      ) : (
        <Button buttonText='Exit' buttonEvent={handleExitGame} />
      )}

      <BackgroundMusic />
    </main>
  );
};