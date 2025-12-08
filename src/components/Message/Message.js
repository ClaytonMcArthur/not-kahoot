import './Message.scss';

/**
 * Message component that displays a single message to the screen.
 * @component
 * @param {String} props.player - the player who typed and sent out the message
 * @param {String} props.text - the message to be displayed on screen
 * @returns {JSX.Element}
 */
export const Message = (props) => {
    return (
        <div className='message'>
            <h4 className='name'>{props.player}</h4>
            <p className='text'>{props.text}</p>
        </div>
    );
};