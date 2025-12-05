import './login.scss';
import { useState } from "react";
import { connect } from "../../api/clientApi";
import { InputField } from '../../components/InputField/InputField';
import { Button } from "../../components/Button/Button";
import { useNavigate } from 'react-router-dom';

export const Login = () => {
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [createAccountUsername, setCreateAccountUsername] = useState('');
    const [createAccountPassword, setCreateAccountPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = async () => {
        // Needs to additionally verify username in the database and that password is correct
        if (!createAccountUsername.trim() || !createAccountPassword.trim()) {
            alert('Username and password cannot be empty.');
            return;
        }

        try {
            await connect(createAccountUsername.trim(), createAccountPassword.trim());
            navigate('/home');
        } catch (err) {
            alert(`Login failed: ${err.message}`);
        }
    };

    const handleCreateAccount = async () => {
        // Needs to additionalyl verify username is NOT in the database
        if (!createAccountUsername.trim() || !createAccountPassword.trim()) {
            alert('Username and password cannot be empty.');
            return;
        }

        try {
            // Add new account to database as well
            await connect(createAccountUsername.trim(), createAccountPassword.trim());
            navigate('/home');
        } catch (err) {
            alert(`Account creation failed: ${err.message}`);
        }
    };

    return (
        <main className='login'>
            <div className='login-panel'>
                <h1 className='account-question'>Need to create an account?</h1>
                <div className='account-sections'>
                    <div className='creat-account-section'>
                        <h2 className='create-account-header'>True</h2>
                        <InputField
                            value={createAccountUsername}
                            onChange={(val) => setCreateAccountUsername(val)}
                            default='Username'
                        />
                        <InputField
                            value={createAccountPassword}
                            onChange={(val) => setCreateAccountPassword(val)}
                            default='Password'
                            type='password'
                        />
                        <div className='create-account-buttons'>
                            <Button
                                buttonEvent={handleCreateAccount}
                                buttonText='Create account'
                            />
                        </div>
                    </div>
                    <div className='login-section'>
                        <h2 className='login-header'>False</h2>
                        <InputField
                            value={loginUsername}
                            onChange={(val) => setLoginUsername(val)}
                            default='Username'
                        />
                        <InputField
                            value={loginPassword}
                            onChange={(val) => setLoginPassword(val)}
                            default='Password'
                            type='password'
                        />
                        <div className='login-buttons'>
                            <Button
                                buttonEvent={handleLogin}
                                buttonText='Login'
                            />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
};