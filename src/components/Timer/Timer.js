// src/components/Timer/Timer.js
import './Timer.scss';
import { useEffect, useRef, useState } from 'react';

/**
 * Component that tracks and displays the timer for every game question.
 *
 * @param {Object} props
 * @param {number|string} props.countdown - countdown duration (seconds)
 * @param {Function} props.onTimeUp - called once when time reaches 0
 * @returns {JSX.Element}
 */
export const Timer = (props) => {
  const initial = Math.max(0, Number(props.countdown) || 0);

  const [seconds, setSeconds] = useState(initial);
  const firedRef = useRef(false);

  // Reset timer when countdown changes (new question)
  useEffect(() => {
    firedRef.current = false;
    setSeconds(initial);
  }, [initial]);

  useEffect(() => {
    if (seconds <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        props.onTimeUp?.();
      }
      return;
    }

    const id = setInterval(() => {
      setSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(id);
  }, [seconds, props.onTimeUp]);

  return (
    <div className='timer-section'>
      <span className='current-time'>{seconds}</span>
    </div>
  );
};