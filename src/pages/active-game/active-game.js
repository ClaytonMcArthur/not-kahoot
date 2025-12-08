import './active-game.scss';
import { AllQuestions } from '../../components/AllQuestions/AllQuestions';
import { Button } from '../../components/Button/Button';
import { Chat } from '../../components/Chat/Chat';
import {
  sendChat,
  subscribeToGameEvents,
  exitGame,
  endGame,
  awardWinner,
} from '../../api/clientApi';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BackgroundMusic } from '../../components/BackgroundMusic/BackgroundMusic';

export const ActiveGame = () => {
  const location = useLocation();
  const { game: initialGame, username: stateUsername } = location.state || {};
  const username = stateUsername || localStorage.getItem('username') || 'Unknown';

  const [messages, setMessages] = useState([]);
  const [scores, setScores] = useState(initialGame?.scores || {});
  const [gameState, setGameState] = useState(initialGame || null);

  const [advanceTick, setAdvanceTick] = useState(0);
  const [ended, setEnded] = useState(false);

  const navigate = useNavigate();
  const awardedRef = useRef(false);

  const game = gameState;

  const isHost = useMemo(() => !!game && username === game.host, [game, username]);

  useEffect(() => {
    if (!game) return;

    const unsubscribe = subscribeToGameEvents((msg) => {
      if (!msg.pin || msg.pin !== game.pin) return;

      switch (msg.type) {
        case 'CHAT':
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), player: msg.from, text: msg.message },
          ]);
          break;

        case 'SCORE_UPDATE':
          if (msg.game) setGameState(msg.game);
          if (msg.game?.scores) setScores(msg.game.scores);
          break;

        case 'NEXT_QUESTION':
          if (msg.game) setGameState(msg.game);
          setAdvanceTick((t) => t + 1);
          break;

        case 'GAME_ENDED': {
          if (msg.game) setGameState(msg.game);
          if (msg.game?.scores) setScores(msg.game.scores);
          setEnded(true);

          // Host awards winner once
          if (!awardedRef.current && isHost && msg.game?.scores) {
            awardedRef.current = true;

            const entries = Object.entries(msg.game.scores || {});
            entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
            const winner = entries[0]?.[0];

            if (winner) {
              awardWinner(winner, msg.pin).catch((e) =>
                console.error('awardWinner failed:', e)
              );
            }
          }
          break;
        }

        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [game?.pin, isHost]);

  const handleSendMessage = (messageText) => {
    if (!game) return;
    sendChat(game.pin, messageText, username);
  };

  const handleExitGame = async () => {
    try {
      await exitGame(game.pin);
    } catch (err) {
      console.error('Failed to exit game:', err);
    }
    navigate('/home');
  };

  const handleEndGame = async () => {
    try {
      await endGame(game.pin);
    } catch (err) {
      console.error('Failed to end game:', err);
    }
    navigate('/home');
  };

  if (!game) return <div>Please join a game first.</div>;

  if (ended) {
    const sorted = Object.entries(scores || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return (
      <main className='active-game'>
        <h1>Game Over</h1>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          {sorted.map(([name, score]) => (
            <div
              key={name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
              }}
            >
              <strong>{name}</strong>
              <span>{score}</span>
            </div>
          ))}
        </div>
        <Button buttonEvent={() => navigate('/home')} buttonText='Return Home' />
      </main>
    );
  }

  return (
    <main className='active-game'>
      {isHost ? (
        <Button buttonEvent={handleEndGame} buttonText='End Game' />
      ) : (
        <Button buttonEvent={handleExitGame} buttonText='Exit' />
      )}

      <AllQuestions
        gameQuestions={game.questions || []}
        gamePin={game.pin}
        username={username}
        isHost={isHost}
        scores={scores}
        currentQuestionIndex={game.currentQuestionIndex ?? 0}
        advanceTick={advanceTick}
      />

      <Chat messages={messages} user={username} onSendMessage={handleSendMessage} />
      <BackgroundMusic />
    </main>
  );
};