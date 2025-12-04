import './home.scss';
import { Button } from '../../components/Button/Button';
import { Scoreboard } from '../../components/Scoreboard/Scoreboard';
import notKahootLogo from '../../assets/notKahoot.png'
import { Account } from '../../components/Account/Account';
import { useEffect, useState } from 'react';

export const Home = () => {
    const [username, setUsername] = useState(null);
    const [isAccountOpen, setIsAccountOpen] = useState(false);

    useEffect(() => {
        const savedUsername = localStorage.getItem('username');
        if (savedUsername) {
            setUsername(savedUsername);
        }
    }, []);

    return (
        <main className='home'>
            <Account
                isOpen={isAccountOpen}
                onClose={() => setIsAccountOpen(false)}
                onLogin={(name) => setUsername(name)}
            />
            <div className='title-section'>
                <img src={notKahootLogo} alt='Not Kahoot Logo' className='logo' />
                <h1 className='title'>Welcome to... <span className='make-purple'>Not Kahoot!</span></h1>
            </div>
            <div className='registration'>
                <Button
                    buttonText={username ? `Account: ${username}` : 'Account'}
                    buttonEvent={() => setIsAccountOpen(true)}
                />
            </div>
            <div className='home-buttons'>
                <Button
                    buttonLink='/join-game'
                    buttonText='Join a game'
                />
                <Button
                    buttonLink='/host-game'
                    buttonText='Host a game'
                />
            </div>
            {/* This is passed static values for testing purposes */}
            <h1 className='scoreboards-title'>Top Scorers</h1>
            <div className='scoreboards'>
                <Scoreboard
                    players={[
                        { rank: 1, name: 'PlayerOne', score: 100 },
                        { rank: 2, name: 'PlayerTwo', score: 18 },
                        { rank: 3, name: 'PlayerThree', score: 12 },
                        { rank: 4, name: 'PlayerFour', score: 10 },
                        { rank: 5, name: 'PlayerFive', score: 8 }
                    ]}
                    title='Top Players'
                    scoreTitle='Wins'
                />
                <Scoreboard
                    players={[
                        { rank: 1, name: 'THEhost', score: 68 },
                        { rank: 2, name: 'PlayerFive', score: 21 },
                        { rank: 3, name: 'PlayerThree', score: 17 },
                        { rank: 4, name: 'PlayerSix', score: 16 },
                        { rank: 5, name: 'PlayerTen', score: 11 }
                    ]}
                    title='Great Hosts'
                    scoreTitle='Hosted'
                />
            </div>
        </main>
    );
};