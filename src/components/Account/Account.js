// src/components/Account/Account.js
import './Account.scss';
import { useState } from "react";
import { connect } from "../../api/clientApi";
import { InputField } from '../InputField/InputField';
import { Button } from "../Button/Button";

export const Account = (props) => {
    const [username, setUsername] = useState('');

    if (!props.isOpen) return null;

    const handleSubmit = async () => {
        const raw = username.trim() || `Guest-${Math.floor(Math.random() * 100000)}`;

        try {
            await connect(raw);
            localStorage.setItem('username', raw);
            props.onLogin(raw);
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
