import "./active-game.scss";
import { AllQuestions } from "../../components/AllQuestions/AllQuestions";
import { Button } from "../../components/Button/Button";
import { Chat } from "../../components/Chat/Chat";
import {
  sendChat,
  subscribeToGameEvents,
  exitGame,
} from "../../api/clientApi";
import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const ActiveGame = () => {
  const location = useLocation();
  const { game, username: navUsername } = location.state || {};

  const [messages, setMessages] = useState([]);
  const [scores, setScores] = useState({});
  const navigate = useNavigate();

  // 🔹 Compute a safe username:
  // 1) from navigation, 2) from localStorage, 3) random guest
  const username = useMemo(() => {
    const fromNav = (navUsername || "").trim();
    if (fromNav) return fromNav;

    const stored = (localStorage.getItem("username") || "").trim();
    if (stored) return stored;

    return `Guest-${Math.floor(Math.random() * 1000000)}`;
  }, [navUsername]);

  // Subscribe to SSE events for chat and scores
  useEffect(() => {
    if (!game) return;

    const unsubscribe = subscribeToGameEvents((msg) => {
      if (!msg.pin || msg.pin !== game.pin) return; // filter by game

      switch (msg.type) {
        case "CHAT":
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              player: msg.from,
              text: msg.message,
            },
          ]);
          break;

        case "SCORE_UPDATE":
          if (msg.game && msg.game.scores) {
            setScores(msg.game.scores);
          }
          break;

        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [game?.pin, username]);

  const handleSendMessage = (messageText) => {
    if (!game || !username) return;
    sendChat(game.pin, messageText, username);
  };

  if (!game) {
    return <div>Please join a game first.</div>;
  }

  // 🔹 We no longer early-return on missing username; we always have a fallback

  const isHost = username === game.host;

  const handleExitGame = async () => {
    try {
      await exitGame(game.pin, username);
    } catch (err) {
      console.error("Failed to exit game:", err);
    }
    navigate("/");
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
      />
      <Chat
        messages={messages}
        user={username}
        onSendMessage={handleSendMessage}
      />
    </main>
  );
};
