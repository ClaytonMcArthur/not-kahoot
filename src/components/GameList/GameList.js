import './GameList.scss';
import { Button } from '../Button/Button';
import { useNavigate } from 'react-router-dom';
import { joinGame } from '../../api/clientApi';

export const GameList = (props) => {
  const navigate = useNavigate();

  const handleJoinGame = async (game) => {
    try {
      const res = await joinGame(game.pin); // { ok:true, game }
      navigate('/open-game', { state: { game: res.game, username: props.username } });
    } catch (err) {
      console.error('Error joining game:', err);
      alert(err.message);
    }
  };

  return (
    <div className='game-list'>
      <h2 className='active-game-list-title'>Open Games</h2>

      <div className='header-row'>
        <span className='theme-column'>Theme</span>
        <span className='pin-column'>Game Pin</span>
        <span className='players-column'>Current Players</span>
        <span className='join-column'>Join Game</span>
      </div>

      {[...(props.openGames || [])]
        .sort((a, b) => (b.players?.length || 0) - (a.players?.length || 0))
        .map((game) => (
          <div className='game-row' key={game.pin}>
            <span className='theme-column'>{game.theme || '—'}</span>
            <span className='pin-column'>{game.pin}</span>
            <span className='players-column'>
              {(game.players?.length || 0)}/{game.maxPlayers ?? '—'}
            </span>
            <span className='join-column'>
              <Button buttonText='Join' buttonEvent={() => handleJoinGame(game)} />
            </span>
          </div>
        ))}
    </div>
  );
};