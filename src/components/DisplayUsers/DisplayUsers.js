import './DisplayUsers.scss';

/**
 * Grid copmonent that displays all the current users
 * @component
 * @param {Array} props.users - Array of all the current users who have joined the open game
 * @returns {JSX.Element}
 */
export const DisplayUsers = (props) => {
    return (
        <div className='display-users'>
            {props.users.map(user => (
                <div className='individual-user' key={user.username}>
                    <span className='username'>{user.username}</span>
                    {user.submitted && <span className='checkmark'>✅</span>}
                </div>
            ))}
        </div>
    );
};