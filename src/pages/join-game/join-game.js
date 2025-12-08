import './join-game.scss';
import { Button } from '../../components/Button/Button';
import { InputField } from '../../components/InputField/InputField';
import { GameList } from '../../components/GameList/GameList';
import { useEffect, useState } from 'react';
import { listGames, joinGame } from '../../api/clientApi';
import { useNavigate } from 'react-router-dom';

export const JoinGame = () => {
  const [availableGames, setAvailableGames] = useState([]);
  const [gamePin, setGamePin] = useState('');
  const navigate = useNavigate();

  const username = localStorage.getItem('username') || 'Unknown';

  useEffect(() => {
    listGames()
      .then((data) => {
        if (data.success) setAvailableGames(data.games || []);
      })
      .catch((err) => console.error('Error fetching games:', err));
  }, []);

  const handleJoinByPin = async () => {
    const pin = gamePin.trim();
    if (!pin) return;

    try {
      const res = await joinGame(pin); // { ok:true, game }
      const game = res.game;
      navigate('/open-game', { state: { game, username } });
    } catch (err) {
      console.error('Error joining game by pin:', err);
      alert(err.message);
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
          <GameList openGames={availableGames} username={username} />
        ) : (
          <p className='no-games-message'>No active games available. Try hosting one!</p>
        )}
      </div>
    </main>
  );
};