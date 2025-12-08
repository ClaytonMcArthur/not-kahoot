import './AllQuestions.scss';
import { useEffect, useMemo, useState } from 'react';
import { Question } from '../Question/Question';
import { Ranking } from '../Ranking/Ranking';
import { Button } from '../Button/Button';
import { Timer } from '../Timer/Timer';
import { sendAnswer, nextQuestion, endGame } from '../../api/clientApi';

/**
 * Server-driven question display.
 * - Uses props.currentQuestionIndex as the source of truth
 * - Resets local UI when host advances (advanceTick) or index changes
 */
export const AllQuestions = (props) => {
  const questions = props.gameQuestions || [];
  const total = questions.length;

  const idx = Math.max(0, Math.min(props.currentQuestionIndex ?? 0, Math.max(total - 1, 0)));
  const currentQuestion = questions[idx];
  const isLastQuestion = total > 0 && idx === total - 1;

  const [isAnswered, setIsAnswered] = useState(false);
  const [isQuestionActive, setIsQuestionActive] = useState(true);

  // Ranking from scores prop
  const ranking = useMemo(() => {
    const entries = Object.entries(props.scores || {});
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return entries.map(([username, score]) => ({ username, score }));
  }, [props.scores]);

  // Reset local UI when the server index changes / host advances
  useEffect(() => {
    setIsAnswered(false);
    setIsQuestionActive(true);
  }, [props.advanceTick, props.currentQuestionIndex]);

  if (!questions || questions.length === 0) {
    return <div className='all-questions-section'>Waiting for questions...</div>;
  }

  const questionAnswered = (isCorrect) => {
    if (!isQuestionActive || isAnswered) return;

    setIsAnswered(true);

    // isCorrect is already boolean (Question compares user choice vs answerTrue)
    sendAnswer(props.gamePin, idx, !!isCorrect).catch((e) =>
      console.error('sendAnswer failed:', e)
    );
  };

  const handleTimeUp = () => {
    // If they never answered, submit false once
    if (!isAnswered) {
      setIsAnswered(true);
      sendAnswer(props.gamePin, idx, false).catch((e) =>
        console.error('sendAnswer (timeup) failed:', e)
      );
    }
    setIsQuestionActive(false);
  };

  const handleNextClick = async () => {
    if (!props.isHost) return;
    try {
      await nextQuestion(props.gamePin);
    } catch (e) {
      console.error('nextQuestion failed:', e);
      alert(e.message);
    }
  };

  const handleEndGame = async () => {
    if (!props.isHost) return;
    try {
      await endGame(props.gamePin);
    } catch (e) {
      console.error('endGame failed:', e);
      alert(e.message);
    }
  };

  const myRank = ranking.findIndex((r) => r.username === props.username);
  const myScore = (props.scores || {})[props.username] || 0;

  return (
    <div className='all-questions-section'>
      {isQuestionActive && (
        <Timer
          key={`t:${props.gamePin}:${idx}:${props.advanceTick}`}
          countdown={15}
          onTimeUp={handleTimeUp}
        />
      )}

      {isQuestionActive ? (
        isAnswered ? (
          <h2 className='waiting-screen'>Waiting for the timer…</h2>
        ) : (
          <Question
            question={currentQuestion.question}
            answerTrue={currentQuestion.answerTrue}
            questionAnswered={questionAnswered}
          />
        )
      ) : (
        <div className='current-ranking'>
          <Ranking topFive={ranking.slice(0, 5)} gameEnd={isLastQuestion} />

          <div className='user-score'>
            <h3>Your Current Standing</h3>
            <p className='rank'>Rank: {myRank >= 0 ? myRank + 1 : 'unranked'}</p>
            <p className='score'>Score: {myScore}</p>
            <p style={{ opacity: 0.75 }}>
              Question {idx + 1} / {total}
            </p>
          </div>

          {props.isHost ? (
            isLastQuestion ? (
              <Button buttonText='End game' buttonEvent={handleEndGame} />
            ) : (
              <Button buttonText='Next question' buttonEvent={handleNextClick} />
            )
          ) : (
            <h3 style={{ marginTop: 16 }}>Waiting for host to continue…</h3>
          )}
        </div>
      )}
    </div>
  );
};