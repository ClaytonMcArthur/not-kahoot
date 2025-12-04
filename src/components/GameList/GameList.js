import './GameList.scss';
import { Button } from '../Button/Button';
import { useNavigate } from 'react-router-dom';
import { joinGame } from '../../api/clientApi';

/**
 * Component that lists out all joinable games on the join screen.
 * @component
 * @param {Array} props.openGames - array listing all the active games that are open to new people joining
 * @param {String} props.username - the username of the player joining a game
 * @returns {JSX.Element}
 */
export const GameList = (props) => {
    const navigate = useNavigate();

    const handlJoinGame = async (game) => {
        try {
            await joinGame(game.pin);
            // Navigate to active game screen after joining
            navigate('/open-game', { state: { game, username: props.username } });
        } catch (err) {
            console.error('Error joining game:', err);
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
            {[...props.openGames]                 // copy so we don’t mutate props
                .sort((a, b) => b.players.length - a.players.length)
                .map(game => (
                    <div className='game-row' key={game.pin}>
                        <span className='theme-column'>{game.theme}</span>
                        <span className='pin-column'>{game.pin}</span>
                        <span className='players-column'>
                            {game.players.length}/{game.maxPlayers}
                        </span>
                        <span className='join-column'>
                            <Button
                                buttonText='Join'
                                buttonEvent={() => handlJoinGame(game)}
                            />
                        </span>
                    </div>
                ))}
        </div>
    );
};