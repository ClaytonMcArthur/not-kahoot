import './active-game.scss';
import { AllQuestions } from '../../components/AllQuestions/AllQuestions';
import { Button } from '../../components/Button/Button';
import { Chat } from '../../components/Chat/Chat';
import { sendChat, subscribeToGameEvents, exitGame } from "../../api/clientApi";
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

export const ActiveGame = () => {
    const location = useLocation();
    const { game, username } = location.state || {};

    const [messages, setMessages] = useState([]);
    const [scores, setScores] = useState({});
    const navigate = useNavigate();

    // Subscribe to SSE events for chat and scores
    useEffect(() => {
        const unsubscribe = subscribeToGameEvents((msg) => {
            if (msg.pin !== game.pin) return; // Important: filter by game

            if (msg.type === "chat") {
                setMessages(prev => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        player: msg.username,
                        text: msg.message
                    }
                ]);
            }
            if (msg.type === "scoreUpdate") {
                setScores(msg.scores);
            }
        });

        return () => unsubscribe();
    }, [game.pin, username]);


    const handleSendMessage = (messageText) => {
        sendChat(game.pin, messageText, username);
    };

    if (!game) {
        return <div>Please join a game first.</div>;
    }
    if (!username) {
        return <div>Username not found. Please re-join the game.</div>;
    }

    const isHost = username === game.host;

    const handleExitGame = async () => {
        try {
            await exitGame(game.pin, username);
        } catch (err) {
            console.error("Failed to exit game:", err);
        }
        navigate('/');
    };

    return (
        <main className='active-game'>
            {!isHost && <Button
                buttonEvent={handleExitGame}
                buttonText='Exit'
            />}
            <AllQuestions
                gameQuestions={game.questions}
                gamePin={game.pin}
                username={username}
                isHost={isHost}
            />
            <Chat
                messages={messages}
                user={username}
                onSendMessage={handleSendMessage}
            />
        </main>
    );
};