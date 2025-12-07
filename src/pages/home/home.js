import './home.scss';
import { Button } from '../../components/Button/Button';
import { Scoreboard } from '../../components/Scoreboard/Scoreboard';
import notKahootLogo from '../../assets/notKahoot.png';
import { useNavigate } from 'react-router-dom';
import { scoreboard } from '../../api/clientApi';
import { useEffect, useState } from 'react';

export const Home = () => {
    const navigate = useNavigate();
    const [leaders, setLeaders] = useState([]);

    useEffect(() => {
        scoreboard().then(res => {
            setLeaders(res.leaders || []);
        }).catch(err => {
            console.error('falied to load scoreboard', err);
        });
    });

    const handleLogout = () => {
        // Add logic to handle log out
        navigate('/');
    };

    return (
        <main className='home'>
            <div className='title-section'>
                <img src={notKahootLogo} alt='Not Kahoot Logo' className='logo' />
                <h1 className='title'>Welcome to... <span className='make-purple'>Not Kahoot!</span></h1>
            </div>
            <div className='registration'>
                <Button
                    buttonText='Logout'
                    buttonEvent={() => handleLogout()}
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
            <div className='scoreboards'>
                <Scoreboard
                    players={leaders.map((u, index) => ({
                        rank: index + 1,
                        name: u.username,
                        score: u.wins
                    }))}
                    title='Top Players'
                    scoreTitle='Wins'
                />
            </div>
        </main>
    );
};