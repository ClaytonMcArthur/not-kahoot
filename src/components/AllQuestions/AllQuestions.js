import "./AllQuestions.scss";
import { useState, useEffect } from "react";
import { Question } from "../Question/Question";
import { Ranking } from "../Ranking/Ranking";
import { Button } from "../Button/Button";
import { Timer } from "../Timer/Timer";
import {
  sendAnswer,
  nextQuestion,
  subscribeToGameEvents,
} from "../../api/clientApi";

/**
 * Component that maintains game state and renders all of the questions, answers, and rankings in the game.
 * @component
 * @param {Array} props.gameQuestions - Array containing all of the questions in this game.
 * @param {String} props.gamePin - The pin of the current game
 * @param {String} props.username - The username of the current player
 * @param {Boolean} props.isHost - Whether the current player is the host of the game
 * @returns {JSX.Element}
 */
export const AllQuestions = (props) => {
  const [isAnswered, setIsAnswered] = useState(false);
  const [isQuestionActive, setIsQuestionActive] = useState(true);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [gameEnd, setGameEnd] = useState(false);
  const [playerAnswers, setPlayerAnswers] = useState({});
  const [scores, setScores] = useState({});

  // Subscribe to live game events for scores or host actions
  useEffect(() => {
    const unsubscribe = subscribeToGameEvents((msg) => {
      if (!msg.pin || msg.pin !== props.gamePin) return;

      switch (msg.type) {
        case "SCORE_UPDATE": {
          // Server sends { type: 'SCORE_UPDATE', game: { scores: {...} }, ... }
          if (msg.game && msg.game.scores) {
            setScores(msg.game.scores);
          }
          break;
        }

        case "NEXT_QUESTION": {
          // Advance to the next question for EVERYONE in this game
          setIsQuestionActive(true);
          setIsAnswered(false);
          setGameEnd(false);

          setQuestionIndex((prevIndex) => {
            const nextIndex = prevIndex + 1;
            // If we run out of questions, mark game end and don't go out of bounds
            if (
              !props.gameQuestions ||
              props.gameQuestions.length === 0 ||
              nextIndex >= props.gameQuestions.length
            ) {
              setGameEnd(true);
              setIsQuestionActive(false);
              return prevIndex; // stay on last valid question
            }
            return nextIndex;
          });
          break;
        }

        case "GAME_ENDED": {
          // In case you ever add this event type on the server
          setGameEnd(true);
          setIsQuestionActive(false);
          break;
        }

        default:
          break;
      }
    });

    return () => unsubscribe();
    // include gameQuestions.length so boundary logic stays correct if questions change
  }, [props.gamePin, props.gameQuestions?.length]);

  // ---- Early guard AFTER hooks (to satisfy React hook rules) ----
  if (!props.gameQuestions || props.gameQuestions.length === 0) {
    return (
      <div className="all-questions-section">Loading questions...</div>
    );
  }

  // Clamp index to valid range just in case
  const safeIndex = Math.min(
    questionIndex,
    Math.max(props.gameQuestions.length - 1, 0)
  );
  const currentQuestion = props.gameQuestions[safeIndex];
  const isLastQuestion = safeIndex === props.gameQuestions.length - 1;

  const handleNextClick = async () => {
    // Only the host should actually call the backend.
    if (props.isHost) {
      try {
        await nextQuestion(props.gamePin);
      } catch (error) {
        console.error("Error advancing to next question:", error);
      }
    }
    // Everyone (host + players) moves when the SSE { type: 'NEXT_QUESTION' } arrives.
  };

  const questionAnswered = (answer) => {
    if (!isQuestionActive || isAnswered) return;

    setIsAnswered(true);
    setPlayerAnswers((prev) => ({
      ...prev,
      [props.username]: { questionIndex: safeIndex, answer },
    }));
    // Notify the server of the player's answer
    sendAnswer(props.gamePin, safeIndex, answer);
  };

  // Handle timer running out
  const handleTimeUp = () => {
    setIsQuestionActive(false);
    if (!isAnswered) {
      // Record no answer if time runs out
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
              .map(([username, score]) => ({ username, score })) // map to objects
              .sort((a, b) => b.score - a.score) // sort descending
              .slice(0, 5)} // take top 5
            gameEnd={isLastQuestion || gameEnd}
          />
          {props.isHost && (gameEnd || isLastQuestion) ? (
            <Button buttonText="End game" buttonLink="/" />
          ) : (
            <Button
              buttonText="Next question"
              buttonEvent={handleNextClick}
            />
          )}
        </div>
      )}
    </div>
  );
};