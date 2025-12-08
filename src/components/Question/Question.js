import './Question.scss';
import { Answer } from '../Answer/Answer';
import { useState } from 'react';

/**
 * Question component that renders each question to the middle of the active game screen.
 * @component
 * @param {String} props.question - The question that is displayed and must be answered as true or false
 * @param {Boolean} props.answerTrue - Boolean value representing whether the answer is true (if true) or false (if false)
 * @param {Function} props.questionAnswered - function from parent to receive when answer is clicked
 * @returns {JSX.Element}
 */
export const Question = (props) => {
    const [selected, setSelected] = useState(null);
    const [isCorrect, setIsCorrect] = useState(null);

const handleAnswerClick = (answerType, actualAnswer) => {
    setSelected(answerType);
    setIsCorrect(actualAnswer);
    // actualAnswer is a boolean: true if this click is correct
    props.questionAnswered(actualAnswer);
};

    return (
        <div className='question-and-answer'>
            <h2 className='question'>{props.question}</h2>
            <div className='answers'>
                <Answer
                    type='true'
                    actualAnswer={props.answerTrue}
                    onClick={handleAnswerClick}
                />
                <Answer
                    type='false'
                    actualAnswer={!props.answerTrue}
                    onClick={handleAnswerClick}
                />
            </div>

            {/* Saved for testing purposes only
            <div className='result'>
                {selected !== null && (
                    <p className='selection'>You selected {selected}</p>
                )}
                {isCorrect !== null && (
                    <p className='correctness'>You were {isCorrect ? 'correct' : 'wrong'}</p>
                )}
            </div> */}
        </div>
    );
};