import './InputField.scss';
import { useState } from 'react';

/**
 * Component that renders an input field.
 * @component
 * @param {String} props.default - the default value displayed initially in the input field.
 * @param {Function} props.onChange - function to handle input value changes
 * @param {String} props.value - current value of the input field
 * @param {String} props.type - type of the input field (indicating if password where necessary)
 * @returns {JSX.Element}
 */
export const InputField = (props) => {
    return (
        <div className='input-section'>
            <input
                type={props.type === 'password' ? 'password' : 'text'}
                id='input'
                placeholder={props.default}
                value={props.value}
                onChange={(e) => props.onChange(e.target.value)}
            />
        </div>
    );
};