import { useEffect } from 'react';
import useSound from 'use-sound';
import NotKahootLoop from '../../assets/not_kahoot_loop.mp3';

/**
 * Component that manages the background music during games
 * @returns {JSX Element}
 */
export const BackgroundMusic = () => {
    const [play, { stop }] = useSound(NotKahootLoop, {
        loop: true, // Loop the music
        volume: 0.5, // Adjust volume as needed
    });

    useEffect(() => {
        play(); // Start playing when the component mounts

        return () => {
            stop(); // Stop playing when the component unmounts
        };
    }, [play, stop]); // Depend on play and stop to avoid re-creating the effect unnecessarily

    return null; // This component doesn't render any visible UI
};

export default BackgroundMusic;