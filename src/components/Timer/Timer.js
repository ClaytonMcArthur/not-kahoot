import './Timer.scss';
import { useState, useEffect } from 'react';

/**
 * Component that tracks and displays the timer for every game question.
 * @component
 * @param {Integer} props.countdown - the countdown duration
 * @param {Function} props.onTimeUp - allows parent component to act once time is up
 * @returns {JSX.Element}
 */
export const Timer = (props) => {
    const [seconds, setSeconds] = useState(props.countdown);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setSeconds(prevseconds => {
                if (prevseconds === 1) {
                    clearInterval(intervalId);
                    props.onTimeUp();     // notify parent
                }
                return prevseconds - 1;
            })
        }, 1000); // Update every second

        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className='timer-section'>
            <span className='current-time'>{seconds}</span>
        </div>
    );
};