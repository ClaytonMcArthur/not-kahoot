import './AllQuestions.scss';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Question } from '../Question/Question';
import { Ranking } from '../Ranking/Ranking';
import { Button } from '../Button/Button';
import { Timer } from '../Timer/Timer';
import {
  sendAnswer,
  nextQuestion,
  subscribeToGameEvents,
  awardWinner,
  endGame
} from '../../api/clientApi';
import { useNavigate } from 'react-router-dom';

/**
 * Component that maintains game state and renders all of the questions, answers, and rankings in the game.
 */
export const AllQuestions = (props) => {
  const navigate = useNavigate();

  const [isAnswered, setIsAnswered] = useState(false);
  const [isQuestionActive, setIsQuestionActive] = useState(true);
  const [gameEnd, setGameEnd] = useState(false);

  // We keep a local index as a fallback, but prefer server index if provided.
  const [localQuestionIndex, setLocalQuestionIndex] = useState(0);

  const [scores, setScores] = useState({});
  const awardedRef = useRef(false);

  const questions = props.gameQuestions || [];
  const serverIndex =
    typeof props.currentQuestionIndex === 'number' ? props.currentQuestionIndex : null;

  const effectiveIndex = useMemo(() => {
    const idx = serverIndex !== null ? serverIndex : localQuestionIndex;
    if (!questions.length) return 0;
    return Math.min(Math.max(idx, 0), questions.length - 1);
  }, [serverIndex, localQuestionIndex, questions.length]);

  const currentQuestion = questions[effectiveIndex];
  const isLastQuestion = questions.length > 0 && effectiveIndex === questions.length - 1;

  const ranking = useMemo(() => {
    return Object.entries(scores || {})
      .map(([username, score]) => ({ username, score }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [scores]);

  // Subscribe to live game events
  useEffect(() => {
    const unsubscribe = subscribeToGameEvents((msg) => {
      if (!msg.pin || msg.pin !== props.gamePin) return;

      switch (msg.type) {
        case 'SCORE_UPDATE': {
          if (msg.game?.scores) setScores(msg.game.scores);
          break;
        }

        case 'NEXT_QUESTION': {
          // Everyone resets state and advances.
          setIsQuestionActive(true);
          setIsAnswered(false);
          setGameEnd(false);

          // If serverIndex isn't passed down, at least keep local in sync.
          setLocalQuestionIndex((prev) => prev + 1);
          break;
        }

        case 'GAME_ENDED': {
          if (msg.game?.scores) setScores(msg.game.scores);
          setGameEnd(true);
          setIsQuestionActive(false);
          break;
        }

        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [props.gamePin]);

  // If parent passes in currentQuestionIndex and it changes, reset per-question UI state.
  useEffect(() => {
    if (serverIndex === null) return;
    setIsQuestionActive(true);
    setIsAnswered(false);
    setGameEnd(false);
  }, [serverIndex]);

  // Also allow parent to "tick" advances even if msg.game isn't passed
  useEffect(() => {
    if (props.advanceTick == null) return;
    // When advanceTick changes, treat it like a new question
    setIsQuestionActive(true);
    setIsAnswered(false);
    setGameEnd(false);
  }, [props.advanceTick]);

  // Early guard after hooks
  if (!questions.length) {
    return <div className='all-questions-section'>Loading questions...</div>;
  }

  const handleNextClick = async () => {
    if (!props.isHost) return;
    try {
      await nextQuestion(props.gamePin);
    } catch (error) {
      console.error('Error advancing to next question:', error);
    }
  };

  const questionAnswered = (isCorrect) => {
    if (!isQuestionActive || isAnswered) return;

    setIsAnswered(true);

    // Send to backend; boolean or string will be handled server-side
    sendAnswer(props.gamePin, effectiveIndex, isCorrect).catch((e) =>
      console.error('sendAnswer failed:', e)
    );
  };

  const handleTimeUp = () => {
    setIsQuestionActive(false);

    // If player never clicked anything, count as incorrect
    if (!isAnswered) {
      questionAnswered(false);
    }
  };

  const handleEndGame = async () => {
    try {
      // End game on TCP server (broadcasts GAME_ENDED)
      await endGame(props.gamePin);

      // Award winner once (host-only)
      if (props.isHost && !awardedRef.current) {
        awardedRef.current = true;

        const winner = ranking[0]?.username;
        if (winner) {
          await awardWinner(winner, props.gamePin);
        }
      }
    } catch (err) {
      console.error('Failed to end game:', err);
    }

    navigate('/home');
  };

  return (
    <div className='all-questions-section'>
      {isQuestionActive && <Timer countdown='15' onTimeUp={handleTimeUp} />}

      {isQuestionActive ? (
        isAnswered ? (
          <h2 className='waiting-screen'>Waiting for others...</h2>
        ) : (
          <Question
            question={currentQuestion.question}
            answerTrue={currentQuestion.answerTrue}
            questionAnswered={questionAnswered}
          />
        )
      ) : (
        <div className='current-ranking'>
          <Ranking topFive={ranking.slice(0, 5)} gameEnd={gameEnd || isLastQuestion} />

          <div className='user-score'>
            <h3>Your Current Standing</h3>
            <p className='rank'>
              Rank:{' '}
              {ranking.findIndex((r) => r.username === props.username) >= 0
                ? ranking.findIndex((r) => r.username === props.username) + 1
                : 'unranked'}
            </p>
            <p className='score'>Score: {scores[props.username] || 0}</p>
          </div>

          {props.isHost && (gameEnd || isLastQuestion) ? (
            <Button buttonText='End game' buttonEvent={handleEndGame} />
          ) : (
            <Button buttonText='Next question' buttonEvent={handleNextClick} />
          )}
        </div>
      )}
    </div>
  );
};