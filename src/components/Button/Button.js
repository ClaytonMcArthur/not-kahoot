import './Button.scss';
import { Link } from 'react-router-dom';

/**
 * Button component that directs users to other pages/resources.
 * @component
 * @param {String} props.buttonText - The text to be displayed on the button
 * @param {String} props.buttonLink - The link this button directs users to
 * @param {Object} props.buttonState - State object to be passed to the link destination (optional)
 * @param {Function} props.buttonEvent - Event handler function that determines what happens when the button is clicked
 * @param {Boolean} props.selected - tracks if the button is selected
 * @param {Boolean} props.disabled - tracks if the button is disabled
 * @returns {JSX.Element}
 */
export const Button = (props) => {
    if (props.buttonLink) {
        return (
            <Link to={props.buttonLink}
                state={props.buttonState}
                className={`button ${props.selected ? 'selected' : ''}`}
            >
                {props.buttonText}
            </Link>
        );
    } else if (props.buttonEvent) {
        return (
            <button onClick={props.buttonEvent} className={`button ${props.selected ? 'selected' : ''}`} disabled={props.disabled}>
                {props.buttonText}
            </button>
        );
    } else {
        return (
            <button className={`button ${props.selected ? 'selected' : ''}`} disabled={props.disabled}>{props.buttonText}</button>
        )
    }
};