// src/components/AddQuestionModal/AddQuestionModal.js
import './AddQuestionModal.scss';
import { useState } from 'react';
import { InputField } from '../InputField/InputField';
import { Button } from '../Button/Button';

/**
 * Modal for submitting a True/False question.
 * @component
 * @param {Boolean} props.isOpen - Determines if the account panel is open
 * @param {Function} props.onClose - Function to close the account panel
 * @param {Function} props.onSubmitQuestion - Function to handle user submitting their question
 * @returns {JSX.Element}
 */
export const AddQuestionModal = (props) => {
  const [question, setQuestion] = useState('');
  const [isTrueAnswer, setIsTrueAnswer] = useState(true);

  if (!props.isOpen) return null;

  const submit = () => {
    const q = question.trim();
    if (!q) return;

    props.onSubmitQuestion?.({
      question: q,
      answerTrue: isTrueAnswer,
    });

    // Reset modal state
    setQuestion('');
    setIsTrueAnswer(true);
  };

  return (
    <div
      className='question-modal-overlay'
      onClick={() => props.onClose?.()}
      role='button'
      tabIndex={-1}
    >
      <div className='question-panel' onClick={(e) => e.stopPropagation()}>
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
              buttonEvent={() => setIsTrueAnswer(true)}
              selected={isTrueAnswer}
            />
            <Button
              buttonText='False'
              buttonEvent={() => setIsTrueAnswer(false)}
              selected={!isTrueAnswer}
            />
          </div>

          <Button buttonText='Submit Question' buttonEvent={submit} />
        </div>
      </div>
    </div>
  );
};