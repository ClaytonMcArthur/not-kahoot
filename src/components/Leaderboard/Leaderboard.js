import './Leaderboard.scss';

/**
 * Component that displays who is on the podium at the end of the game.
 * @component
 * @param {Array} props.topFive - array containing information on the current top 5 players
 * @returns {JSX.Element}
 */
export const Leaderboard = (props) => {
    const podium = props.topFive.slice(0, 3);
    const others = props.topFive.slice(3, 5);

    return (
        <div className='leaderboard'>
            <h1 className='winner-title'>Winners!</h1>
            <div className='podium'>
                {podium.length >= 2 && <div className='second place'>
                    <div className='rank-circle'>2</div>
                    <span className='username'>{podium[1].username}</span>
                    <span className='score'>{podium[1].score}</span>
                    <span className='placeholder'>.</span>
                </div>}
                <div className='first place'>
                    <div className='rank-circle'>1</div>
                    <span className='username'>{podium[0].username}</span>
                    <span className='score'>{podium[0].score}</span>
                    <span className='placeholder'>.</span>
                </div>
                {podium.length >= 3 && <div className='third place'>
                    <div className='rank-circle'>3</div>
                    <span className='username'>{podium[2].username}</span>
                    <span className='score'>{podium[2].score}</span>
                    <span className='placeholder'>.</span>
                </div>}
            </div>
            {others.length >= 2 && <div>
                <h2 className='other-scorers-title'>Other Top Scorers</h2>
                <div className='others-list'>
                    <div className='fourth'>
                        <span className='rank'>4</span>
                        <span className='username'>{others[0].username}</span>
                        <span className='score'>{others[0].score}</span>
                    </div>
                    <div className='fifth'>
                        <span className='rank'>5</span>
                        <span className='username'>{others[1].username}</span>
                        <span className='score'>{others[1].score}</span>
                    </div>
                </div>
            </div>}
        </div>
    );
};