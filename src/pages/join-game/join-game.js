import './join-game.scss';
import { Button } from '../../components/Button/Button';
import { InputField } from '../../components/InputField/InputField';
import { GameList } from '../../components/GameList/GameList';
import { useEffect, useState } from 'react';
import { listGames, joinGame } from '../../api/clientApi';
import { useNavigate, useLocation } from 'react-router-dom';

export const JoinGame = () => {
    const [availableGames, setAvailableGames] = useState([]);
    const [gamePin, setGamePin] = useState('');
    const navigate = useNavigate();
    const location = useLocation();
    const { username } = location.state || {};

    // Fetch available games from server on component mount
    useEffect(() => {
        listGames().then(data => {
            if (data.success) {
                setAvailableGames(data.games);
            }
        }).catch(err => {
            console.error('Error fetching games:', err);
        });
    }, []);

    // Handle joining a game via pin entry
    const handleJoinByPin = async () => {
        const pin = gamePin.trim();
        if (!pin) return;
        try {
            await joinGame(gamePin);
            // Navigate to active game screen after joining
            navigate('/open-game', { state: { game: { pin, host: null, players: [] }, username } });
        }
        catch (err) {
            console.error('Error joining game by pin:', err);
        }
    };

    return (
        <main className='join-game'>
            <div className='enter-game-pin'>
                <InputField
                    default='Game pin'
                    value={gamePin}
                    onChange={(value) => setGamePin(value)}
                />
                <Button
                    buttonText='Enter'
                    buttonEvent={handleJoinByPin}
                    disabled={!gamePin.trim()}
                />
            </div>
            <div className='active-game-list'>
                {availableGames.length > 0 ? (
                    <GameList
                        openGames={availableGames}
                        username={username}
                    />
                ) : (
                    <p className='no-games-message'>No active games available. Try hosting one!</p>
                )}
            </div>
        </main>
    );
};