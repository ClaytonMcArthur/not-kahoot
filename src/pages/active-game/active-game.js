import "./active-game.scss";
import { AllQuestions } from "../../components/AllQuestions/AllQuestions";
import { Button } from "../../components/Button/Button";
import { Chat } from "../../components/Chat/Chat";
import {
  sendChat,
  subscribeToGameEvents,
  exitGame,
  nextQuestion, // ⬅️ make sure this exists in your frontend clientApi
} from "../../api/clientApi";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const ActiveGame = () => {
  const location = useLocation();
  const { game: initialGame, username } = location.state || {};

  const [game, setGame] = useState(initialGame || null);
  const [messages, setMessages] = useState([]);
  const [scores, setScores] = useState(initialGame?.scores || {});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const navigate = useNavigate();

  // Ensure we have a valid game + username
  if (!initialGame) {
    return <div>Please join a game first.</div>;
  }
  if (!username) {
    return <div>Username not found. Please re-join the game.</div>;
  }

  const isHost = username === initialGame.host;

  // Initialize local game state once from location.state
  useEffect(() => {
    if (!initialGame) return;

    setGame(initialGame);
    setScores(initialGame.scores || {});
    setCurrentQuestionIndex(0);
  }, [initialGame]);

  // Subscribe to SSE events for this game's updates
  useEffect(() => {
    if (!game) return;

    const pin = game.pin;

    const unsubscribe = subscribeToGameEvents((msg) => {
      if (!msg.pin || msg.pin !== pin) return; // ignore other games

      switch (msg.type) {
        case "CHAT": {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              player: msg.from,
              text: msg.message,
            },
          ]);
          break;
        }

        case "SCORE_UPDATE": {
          if (msg.game && msg.game.scores) {
            setScores(msg.game.scores);
          }
          break;
        }

        case "GAME_STARTED": {
          // If for some reason we navigate here before game starts,
          // or the server restarts the game, keep local game in sync.
          if (msg.game) {
            setGame(msg.game);
            setScores(msg.game.scores || {});
            setCurrentQuestionIndex(0);
          }
          break;
        }

        case "NEXT_QUESTION": {
          // Advance the question index for *all* clients in this game
          setCurrentQuestionIndex((prev) => prev + 1);
          break;
        }

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [game?.pin]);

  const handleSendMessage = (messageText) => {
    if (!game) return;
    sendChat(game.pin, messageText, username);
  };

  const handleExitGame = async () => {
    try {
      if (game) {
        await exitGame(game.pin, username);
      }
    } catch (err) {
      console.error("Failed to exit game:", err);
    }
    navigate("/");
  };

  const handleNextQuestion = async () => {
    if (!game) return;
    try {
      // Host asks the server to advance questions for this game
      await nextQuestion(game.pin);
      // Don't manually bump currentQuestionIndex here;
      // all clients (including host) update when they receive NEXT_QUESTION via SSE.
    } catch (err) {
      console.error("Failed to go to next question:", err);
    }
  };

  return (
    <main className="active-game">
      {!isHost && (
        <Button buttonEvent={handleExitGame} buttonText="Exit" />
      )}

      <AllQuestions
        gameQuestions={game.questions || []}
        gamePin={game.pin}
        username={username}
        isHost={isHost}
        scores={scores}
        currentQuestionIndex={currentQuestionIndex}
        onNextQuestion={isHost ? handleNextQuestion : undefined}
      />

      <Chat
        messages={messages}
        user={username}
        onSendMessage={handleSendMessage}
      />
    </main>
  );
};