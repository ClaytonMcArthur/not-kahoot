import { Leaderboard } from '../Leaderboard/Leaderboard';
import './Ranking.scss';

/**
 * Component that displays who is currently in the top five during the game, displaying leaderboard at the end.
 * @component
 * @param {Array} props.topFive - array containing information on the current top 5 players
 * @param {Boolean} props.gameEnd - indicates whether the game is over or not
 * @returns {JSX.Element}
 */
export const Ranking = (props) => {
    let rank = 1;
    return (
        <div>
            {props.gameEnd ? (
                <Leaderboard topFive={props.topFive} />
            ) : (
                <div className='ranking'>
                    <h2 className='rank-title'>Top Five</h2>
                    <div className='header-row'>
                        <span className='rank-column'>Rank</span>
                        <span className='username-column'>Name</span>
                        <span className='score-column'>Score</span>
                    </div>
                    {props.topFive.map(top => (
                        <div className='top-player-row' key={top.username}>
                            <span className='rank-column'>{rank++}</span>
                            <span className='username-column'>{top.username}</span>
                            <span className='score-column'>{top.score}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};