import './AddQuestionModal.scss';
import { useState } from 'react';
import { connect } from '../../api/clientApi';
import { InputField } from '../InputField/InputField';
import { Button } from '../Button/Button';

/**
 * Account component for user registration and account management.
 * @component
 * @param {Boolean} props.isOpen - Determines if the account panel is open
 * @param {Function} props.onClose - Function to close the account panel
 * @param {Function} props.onSubmitQuestion - Function to handle user submitting their question
 * @returns {JSX.Element}
 */
export const AddQuestionModal = (props) => {
    const [question, setQuestion] = useState('');
    // Handle question answer
    const [isTrueAnswer, setIsTrueAnswer] = useState(true);
    if (!props.isOpen) return null;

    // Control whether the game is public or private
    const setTrueAnswer = () => {
        setIsTrueAnswer(true);
    };
    const setFalseAnswer = () => {
        setIsTrueAnswer(false);
    };

    return (
        <div className='question-modal-overlay'>
            <div className='question-panel'>
                <h2>Submit a Game Question</h2>
                <InputField
                    value={question}
                    onChange={(val) => setQuestion(val)}
                    default='Enter question'
                />
                <label>Is the answer True or False?</label>
                <div className='question-buttons'>
                    <div className='true-false-buttons'>
                        <Button
                            buttonText='True'
                            buttonEvent={setTrueAnswer}
                            selected={isTrueAnswer}
                        />
                        <Button
                            buttonText='False'
                            buttonEvent={setFalseAnswer}
                            selected={!isTrueAnswer}
                        />
                    </div>
                    <Button
                        buttonText='Submit Question'
                        buttonEvent={() => {
                            if (!question.trim()) return; // avoid empty questions
                            props.onSubmitQuestion({
                                question: question.trim(),
                                answer: isTrueAnswer
                            });
                            // Reset modal state
                            setQuestion('');
                            setIsTrueAnswer(true);
                        }}
                    />
                </div>
            </div>
        </div>
    );
};