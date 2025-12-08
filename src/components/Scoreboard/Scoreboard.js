import './Scoreboard.scss';

/**
 * Component that tracks a constant scoreboard across all Not Kahoot games.
 *
 * @param {Object} props
 * @param {Array<{rank: number, name: string, score: number}>} props.players
 * @param {string} props.title
 * @param {string} props.scoreTitle
 * @returns {JSX.Element}
 */
export const Scoreboard = (props) => {
  const players = Array.isArray(props.players) ? props.players : [];

  return (
    <div className='scoreboard'>
      <h2 className='board-title'>{props.title}</h2>

      <div className='header-row'>
        <span className='rank-column'>Rank</span>
        <span className='player-column'>Player</span>
        <span className='score-column'>{props.scoreTitle}</span>
      </div>

      {players.length === 0 ? (
        <div className='player-row'>
          <span className='rank-column'>—</span>
          <span className='player-column'>No results</span>
          <span className='score-column'>—</span>
        </div>
      ) : (
        players.map((player) => (
          <div className='player-row' key={player.rank}>
            <span className='rank-column'>{player.rank}</span>
            <span className='player-column'>{player.name}</span>
            <span className='score-column'>{player.score}</span>
          </div>
        ))
      )}
    </div>
  );
};