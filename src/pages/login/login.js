import './login.scss';
import { useState } from "react";
import { connect } from "../../api/clientApi";
import { InputField } from '../../components/InputField/InputField';
import { Button } from "../../components/Button/Button";

export const Login = () => {
    return (
        <main className='login'>
            <div className='login-panel'>
                <h1 className='account-question'>Already have an account?</h1>
                <div className='account-sections'>
                    <div className='creat-account-section'>
                        <h2 className='create-account-header'>True</h2>
                        <InputField
                            value={''}
                            onChange={() => { }}
                            default='Username'
                        />
                        <InputField
                            value={''}
                            onChange={() => { }}
                            default='Password'
                        />
                        <div className='create-account-buttons'>
                            <Button
                                buttonEvent={() => { }}
                                buttonText='Create account'
                            />
                        </div>
                    </div>
                    <div className='login-section'>
                        <h2 className='login-header'>False</h2>
                        <InputField
                            value={''}
                            onChange={() => { }}
                            default='Username'
                        />
                        <InputField
                            value={''}
                            onChange={() => { }}
                            default='Password'
                        />
                        <div className='login-buttons'>
                            <Button
                                buttonEvent={() => { }}
                                buttonText='Login'
                            />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
};