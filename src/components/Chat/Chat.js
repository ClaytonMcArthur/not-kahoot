import './Chat.scss';
import { useState, useEffect, useRef } from 'react';
import { Message } from '../Message/Message';
import { InputField } from '../InputField/InputField';
import { Button } from '../Button/Button';

/**
 * Chat component that displays all the current chat messages to a chat popup.
 * @component 
 * @param {Array} props.messages - array of all the messages to be displayed in the chat
 * @param {Function} props.onSendMessage - function to handle sending a new message
 * @param {String} props.user - username of the current user that is used to track which messages are theirs
 * @returns {JSX.Element}
 */
export const Chat = (props) => {
    const [input, setInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    // Track the lates/newest message
    const messagesEndRef = useRef(null);
    // Scrolling logic for the chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollTo({
            top: messagesEndRef.current.scrollHeight,
            behavior: 'smooth'
        });
    };

    useEffect(() => {
        if (isChatOpen) {
            scrollToBottom();
        }
    }, [isChatOpen, props.messages]); // Scrolls to the bottom when chat opens or new messages are added

    const sendMessage = () => {
        if (!input.trim()) return; // Prevent sending empty messages
        props.onSendMessage(input);
        setInput(''); // Clear input field after sending
    }

    // Toggles the chat open & closed
    const openChat = () => {
        setIsChatOpen(!isChatOpen);
    }

    return (
        <div className='chat-section'>
            <Button
                buttonText={isChatOpen ? 'Close chat' : 'Open chat'}
                buttonEvent={openChat}
            />
            {/* Render the chat box only if the chat should be open */}
            {isChatOpen && (
                <div className='chat'>
                    <h3 className='chat-title'>Chat</h3>
                    <div className='line'></div>
                    <div className='all-messages' ref={messagesEndRef}>
                        {props.messages.map(message => (
                            <div className={`individual-message ${message.player === props.user ? 'user' : ''}`} key={message.id}>
                                <Message
                                    player={message.player}
                                    text={message.text}
                                />
                            </div>
                        ))}
                    </div>
                    <div className='bottom'>
                        <div className='line'></div>
                        <div className='new-message'>
                            <InputField
                                default='Type here to chat'
                                value={input} // pass Chat state
                                onChange={(val) => setInput(val)}
                            />
                            <Button
                                buttonText='Send'
                                buttonEvent={sendMessage}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};