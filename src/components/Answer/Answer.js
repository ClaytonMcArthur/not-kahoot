import './Answer.scss';

/**
 * Answer component that renders an individual answer to the screen and tracks whether it is the correct answer or not.
 * @component
 * @param {String} props.type - Whether the answer is a true or false type
 * @param {Boolean} props.actualAnswer - Boolean value representing whether this answer is the correct answer for the question
 * @param {function} props.onClick - Function to be called when the answer is clicked
 * @returns {JSX.Element}
 */
export const Answer = (props) => {
    const HandleClick = () => {
        props.onClick(props.type, props.actualAnswer);
    };

    return (
        <button className={props.type} id='answer-button' onClick={HandleClick}>
            {props.type}
        </button>
    );
};