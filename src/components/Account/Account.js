import './Account.scss';
import { useState } from "react";
import { connect } from "../../api/clientApi";
import { InputField } from '../InputField/InputField';
import { Button } from "../Button/Button";

/**
 * Account component for user registration and account management.
 * @component
 * @param {Boolean} props.isOpen - Determines if the account panel is open
 * @param {Function} props.onClose - Function to close the account panel
 * @param {Function} props.onLogin - Function to handle user login
 * @returns {JSX.Element}
 */
export const Account = (props) => {
    const [username, setUsername] = useState('');
    if (!props.isOpen) return null;

    const handleSubmit = async () => {
        // 🔹 Use typed username or fall back to a Guest name
        const raw = (username || "").trim();
        const finalUsername = raw || `Guest-${Math.floor(Math.random() * 1000000)}`;

        try {
            await connect(finalUsername);
            localStorage.setItem('username', finalUsername);
            props.onLogin(finalUsername);
            props.onClose();
        } catch (err) {
            alert(`Login failed: ${err.message}`);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('username');
        props.onLogin(null);
        props.onClose();
    };

    return (
        <div className='account-overlay'>
            <div className='account-panel'>
                <h2>Account</h2>
                <label>Choose a username:</label>
                <InputField
                    value={username}
                    onChange={(val) => setUsername(val)}
                    placeholder='Enter username'
                />
                <div className='account-buttons'>
                    <Button
                        buttonEvent={handleSubmit}
                        buttonText='Register / Login'
                    />
                    <Button
                        buttonEvent={handleLogout}
                        buttonText='Unregister / Logout'
                    />
                    <Button
                        buttonEvent={props.onClose}
                        buttonText='Close'
                    />
                </div>
            </div>
        </div>
    );
};
