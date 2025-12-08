import './Leaderboard.scss';

/**
 * Component that displays who is on the podium at the end of the game.
 * @component
 * @param {Object} props
 * @param {Array<{username: string, score: number}>} props.topFive
 * @returns {JSX.Element}
 */
export const Leaderboard = (props) => {
  const topFive = Array.isArray(props.topFive) ? props.topFive : [];

  const podium = topFive.slice(0, 3);
  const others = topFive.slice(3, 5);

  if (topFive.length === 0) {
    return (
      <div className='leaderboard'>
        <h1 className='winner-title'>Winners!</h1>
        <p className='other-scorers-title'>No scores to show yet.</p>
      </div>
    );
  }

  const first = podium[0] || null;
  const second = podium[1] || null;
  const third = podium[2] || null;

  return (
    <div className='leaderboard'>
      <h1 className='winner-title'>Winners!</h1>

      <div className='podium'>
        {second && (
          <div className='second place'>
            <div className='rank-circle'>2</div>
            <span className='username'>{second.username}</span>
            <span className='score'>{second.score}</span>
            <span className='placeholder'>.</span>
          </div>
        )}

        {first && (
          <div className='first place'>
            <div className='rank-circle'>1</div>
            <span className='username'>{first.username}</span>
            <span className='score'>{first.score}</span>
            <span className='placeholder'>.</span>
          </div>
        )}

        {third && (
          <div className='third place'>
            <div className='rank-circle'>3</div>
            <span className='username'>{third.username}</span>
            <span className='score'>{third.score}</span>
            <span className='placeholder'>.</span>
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div>
          <h2 className='other-scorers-title'>Other Top Scorers</h2>
          <div className='others-list'>
            {others[0] && (
              <div className='fourth'>
                <span className='rank'>4</span>
                <span className='username'>{others[0].username}</span>
                <span className='score'>{others[0].score}</span>
              </div>
            )}
            {others[1] && (
              <div className='fifth'>
                <span className='rank'>5</span>
                <span className='username'>{others[1].username}</span>
                <span className='score'>{others[1].score}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};