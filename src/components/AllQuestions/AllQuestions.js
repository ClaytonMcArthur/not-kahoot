import './AllQuestions.scss';
import { useState, useEffect } from 'react';
import { Question } from '../Question/Question';
import { Ranking } from '../Ranking/Ranking';
import { Button } from '../Button/Button';
import { Timer } from '../Timer/Timer';
import { sendAnswer, nextQuestion, subscribeToGameEvents } from '../../api/clientApi';

export const AllQuestions = (props) => {
  const [isAnswered, setIsAnswered] = useState(false);
  const [isQuestionActive, setIsQuestionActive] = useState(true);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [gameEnd, setGameEnd] = useState(false);
  const [playerAnswers, setPlayerAnswers] = useState({});
  const [scores, setScores] = useState({});

  useEffect(() => {
    const unsubscribe = subscribeToGameEvents((msg) => {
      if (msg.pin !== props.gamePin) return;

      if (msg.type === 'SCORE_UPDATE' && msg.game && msg.game.scores) {
        setScores(msg.game.scores);
      }

      if (msg.type === 'NEXT_QUESTION') {
        setIsAnswered(false);
        setIsQuestionActive(true);
        setQuestionIndex((prev) =>
          prev + 1 < props.gameQuestions.length ? prev + 1 : prev
        );
      }

      if (msg.type === 'GAME_ENDED') {
        setGameEnd(true);
        setIsQuestionActive(false);
      }
    });

    return () => unsubscribe();
  }, [props.gamePin, props.gameQuestions.length]);

  const currentQuestion = props.gameQuestions[questionIndex];
  const isLastQuestion = questionIndex === props.gameQuestions.length - 1;

  if (!props.gameQuestions || props.gameQuestions.length === 0) {
    return <div className="all-questions-section">Loading questions...</div>;
  }

  const handleNextClick = async () => {
    if (props.isHost) {
      try {
        await nextQuestion(props.gamePin);
      } catch (error) {
        console.error("Error advancing to next question:", error);
      }
    }
  };

  const questionAnswered = (answer) => {
    if (!isQuestionActive || isAnswered) return;

    setIsAnswered(true);
    setPlayerAnswers((prev) => ({
      ...prev,
      [props.username]: { questionIndex, answer },
    }));

    // IMPORTANT: send username
    sendAnswer(props.gamePin, questionIndex, answer, props.username);
  };

  const handleTimeUp = () => {
    setIsQuestionActive(false);
    if (!isAnswered) {
      questionAnswered(null);
      setIsAnswered(true);
    }
  };

  return (
    <div className="all-questions-section">
      {isQuestionActive && (
        <Timer countdown="15" onTimeUp={handleTimeUp} />
      )}

      {isQuestionActive ? (
        isAnswered ? (
          <h2 className="waiting-screen">Waiting for others...</h2>
        ) : (
          <Question
            question={currentQuestion.question}
            answerTrue={currentQuestion.answerTrue}
            questionAnswered={questionAnswered}
          />
        )
      ) : (
        <div className="current-ranking">
          <Ranking
            topFive={Object.entries(scores || {})
              .map(([username, score]) => ({ username, score }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)}
            gameEnd={isLastQuestion || gameEnd}
          />
          {props.isHost && (gameEnd || isLastQuestion) ? (
            <Button buttonText="End game" buttonLink="/" />
          ) : (
            <Button buttonText="Next question" buttonEvent={handleNextClick} />
          )}
        </div>
      )}
    </div>
  );
};