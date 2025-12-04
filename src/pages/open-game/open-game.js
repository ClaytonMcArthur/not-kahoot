import "./open-game.scss";
import { DisplayUsers } from "../../components/DisplayUsers/DisplayUsers";
import { Button } from "../../components/Button/Button";
import { Chat } from "../../components/Chat/Chat";
import { AddQuestionModal } from "../../components/AddQuestionModal/AddQuestionModal";
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  sendChat,
  startGame,
  subscribeToGameEvents,
  removeGame,
  exitGame,
} from "../../api/clientApi";
import { useNavigate } from "react-router-dom";

export const OpenGame = () => {
  const [questionsByPlayer, setQuestionsByPlayer] = useState({});
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const location = useLocation();
  const { game, username } = location.state || {};
  const [messages, setMessages] = useState([]);
  const navigate = useNavigate();
  const [players, setPlayers] = useState(
    (game?.players || []).map((p) =>
      typeof p === "string" ? { username: p } : p
    )
  );

  // Prepare collected questions for starting the game based on player submissions
  const collectedQuestions = Object.entries(questionsByPlayer).map(
    ([user, q]) => ({
      username: user,
      question: q.question,
      answerTrue: q.answerTrue,
    })
  );

  useEffect(() => {
    if (!game) return;

    const unsubscribe = subscribeToGameEvents((msg) => {
      // Ignore events for other games
      if (!msg.pin || msg.pin !== game.pin) return;

      switch (msg.type) {
        case "PLAYER_JOINED":
        case "PLAYER_LEFT":
        case "SCORE_UPDATE": {
          // Update players from the latest game state
          const playersFromGame = (msg.game?.players || []).map((p) =>
            typeof p === "string" ? { username: p } : p
          );
          setPlayers(playersFromGame);
          break;
        }

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

        case "GAME_STARTED": {
          // Navigate all players to active game
          navigate("/active-game", { state: { game: msg.game, username } });
          break;
        }

        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [game?.pin, username, navigate]);

  const handleSendMessage = (messageText) => {
    sendChat(game.pin, messageText, username);
  };

  const handleEndGame = async () => {
    try {
      await removeGame({ gameId: game.id, pin: game.pin });
    } catch (err) {
      console.error("Failed to remove game:", err);
    }
    navigate("/");
  };

  const handleExitGame = async () => {
    try {
      await exitGame(game.pin, username);
    } catch (err) {
      console.error("Failed to exit game:", err);
    }
    navigate("/");
  };

  if (!game) {
    return <main className="open-game">No game data found.</main>;
  }

  return (
    <main className="open-game">
      <AddQuestionModal
        isOpen={isQuestionModalOpen}
        onClose={() => setIsQuestionModalOpen(false)}
        onSubmitQuestion={(q) => {
          setQuestionsByPlayer((prev) => ({
            ...prev,
            [username]: {
              question: q.question,
              answerTrue: q.answerTrue,
            },
          }));
          setIsQuestionModalOpen(false);
        }}
      />
      <h3 className="number-players">
        Players: {players.length}/{game.maxPlayers}
      </h3>
      <h1>Waiting for players...</h1>
      <h2 className="game-theme">Theme: {game.theme}</h2>
      <h2 className="game-pin">Game PIN: {game.pin}</h2>
      <div className="question-submission">
        <Button
          buttonText="Add Question"
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
      <Chat
        messages={messages}
        user={username}
        onSendMessage={handleSendMessage}
      />
      {username === game.host ? (
        <div className="host-controls">
          <div className="start-game">
            <Button
              buttonText="Start game"
              buttonEvent={async () => {
                try {
                  await startGame(game.pin, collectedQuestions);
                } catch (err) {
                  console.error("Failed to start game:", err);
                }
              }}
            />
          </div>
          <div className="end-game">
            <Button buttonText="End game" buttonEvent={handleEndGame} />
          </div>
        </div>
      ) : (
        <Button buttonText="Exit" buttonEvent={handleExitGame} />
      )}
    </main>
  );
};