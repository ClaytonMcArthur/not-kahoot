import './Scoreboard.scss';

/**
 * Component that tracks a constant scoreboard accross all Not Kahoot games.
 * @component
 * @param {Array} props.players - an array of all the top ranked players to be displayed on the scoreboard
 * @param {String} props.title - the title to be displayed at the top of the scoreboard
 * @param {String} props.scoreTtile - the title to be displayed in the final score column
 * @returns {JSX.Element}
 */
export const Scoreboard = (props) => {
    return (
        <div className='scoreboard'>
            <h2 className='board-title'>{props.title}</h2>

            <div className='header-row'>
                <span className='rank-column'>Rank</span>
                <span className='player-column'>Player</span>
                <span className='score-column'>{props.scoreTitle}</span>
            </div>
            {props.players.map(player => (
                <div className='player-row' key={player.rank}>
                    <span className='rank-column'>{player.rank}</span>
                    <span className='player-column'>{player.name}</span>
                    <span className='score-column'>{player.score}</span>
                </div>
            ))}
        </div>
    );
};