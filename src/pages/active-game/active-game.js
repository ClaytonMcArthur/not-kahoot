// src/pages/active-game.js
import './active-game.scss';
import { AllQuestions } from '../../components/AllQuestions/AllQuestions';
import { Button } from '../../components/Button/Button';
import { Chat } from '../../components/Chat/Chat';
import { sendChat, subscribeToGameEvents, exitGame } from "../../api/clientApi";
import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BackgroundMusic } from '../../components/BackgroundMusic/BackgroundMusic';

export const ActiveGame = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const { game: navGame, username: navUsername } = location.state || {};

    const [game] = useState(navGame || null);
    const [messages, setMessages] = useState([]);
    const [scores, setScores] = useState({});

    // 🔹 Compute a safe username:
    // 1) from navigation, 2) from localStorage, 3) random guest
    const username = useMemo(() => {
        const fromNav = (navUsername || "").trim();
        if (fromNav) return fromNav;

        const stored = (localStorage.getItem('username') || "").trim();
        if (stored) return stored;

        return `Guest-${Math.floor(Math.random() * 1000000)}`;
    }, [navUsername]);

    // Subscribe to game events (scores, chat, etc.)
    useEffect(() => {
        if (!game) return;

        const unsubscribe = subscribeToGameEvents((event) => {
            if (event.type === "chat") {
                setMessages(prev => [...prev, {
                    username: event.username,
                    message: event.message
                }]);
            } else if (event.type === "scoreUpdate") {
                setScores(event.scores || {});
            } else if (event.type === "gameOver") {
                setScores(event.scores || {});
                // You can navigate to a summary screen here if you want
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [game]);

    if (!game) {
        return <div>Please join a game first.</div>;
    }

    const isHost = username === game.host;

    const handleSendMessage = async (text) => {
        try {
            await sendChat(game.pin, username, text);
        } catch (err) {
            console.error("Failed to send chat:", err);
        }
    };

    const handleExitGame = async () => {
        try {
            await exitGame(game.pin, username);
        } catch (err) {
            console.error("Failed to exit game:", err);
        } finally {
            navigate('/');
        }
    };

    return (
        <main className='active-game'>
            <header className='active-header'>
                <h1>Game PIN: {game.pin}</h1>
                <span className='active-username'>Player: {username}</span>
                <Button
                    buttonEvent={handleExitGame}
                    buttonText='Leave Game'
                />
            </header>

            <AllQuestions
                gameQuestions={game.questions}
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

            <BackgroundMusic />
        </main>
    );
};
