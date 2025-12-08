import { Leaderboard } from '../Leaderboard/Leaderboard';
import './Ranking.scss';

/**
 * Component that displays who is currently in the top five during the game,
 * and displays the Leaderboard at the end.
 * @component
 * @param {Object} props
 * @param {Array<{username: string, score: number}>} props.topFive
 * @param {boolean} props.gameEnd
 * @returns {JSX.Element}
 */
export const Ranking = (props) => {
  const topFive = Array.isArray(props.topFive) ? props.topFive : [];

  return (
    <div>
      {props.gameEnd ? (
        <Leaderboard topFive={topFive} />
      ) : (
        <div className='ranking'>
          <h2 className='rank-title'>Top Five</h2>

          <div className='header-row'>
            <span className='rank-column'>Rank</span>
            <span className='username-column'>Name</span>
            <span className='score-column'>Score</span>
          </div>

          {topFive.length === 0 ? (
            <div className='top-player-row'>
              <span className='rank-column'>—</span>
              <span className='username-column'>No scores yet</span>
              <span className='score-column'>—</span>
            </div>
          ) : (
            topFive.map((top, idx) => (
              <div className='top-player-row' key={top.username}>
                <span className='rank-column'>{idx + 1}</span>
                <span className='username-column'>{top.username}</span>
                <span className='score-column'>{top.score}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};