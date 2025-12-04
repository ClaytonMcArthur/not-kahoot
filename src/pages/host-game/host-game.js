import "./host-game.scss";
import { Button } from "../../components/Button/Button";
import { InputField } from "../../components/InputField/InputField";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGame } from "../../api/clientApi"; // <-- use your API helper

export const HostGame = () => {
    const [isPublicGame, setIsPublicGame] = useState(true);
    // Control whether the game is public or private
    const setPublic = () => {
        setIsPublicGame(true);
    };
    const setPrivate = () => {
        setIsPublicGame(false);
    };
    // Handle maximum players
    const [maxPlayers, setMaxPlayers] = useState(20);
    const selectMaxPlayers = (num) => {
        setMaxPlayers(num);
    };

    // Handle game information and navigation
    const navigate = useNavigate();
    const [gameTheme, setGameTheme] = useState("");
    const [gamePin, setGamePin] = useState("");

    const startGame = async () => {
        try {
            const username = localStorage.getItem("username") || "Host";

            // Call our clientApi createGame helper, which hits /api/createGame
            const data = await createGame({
                username,
                theme: gameTheme,
                isPublic: isPublicGame,
                maxPlayers
            });

            console.log("createGame response:", data);

            if (data && data.success && data.game) {
                const newGamePin = data.game.pin;
                setGamePin(newGamePin);

                // Navigate to the open game page with the new game PIN and game object
                navigate("/open-game", { state: { game: data.game, username } });
            } else {
                console.error("createGame returned unexpected data:", data);
            }
        } catch (err) {
            console.error("Error creating game:", err);
        }
    };

    return (
        <main className="host-game">
            <div className="game-inputs">
                <InputField
                    default="Set a theme"
                    onChange={(value) => setGameTheme(value)}
                    value={gameTheme}
                />
                <div className="set-game-visibility">
                    <Button
                        buttonText="Pubilc"
                        buttonEvent={setPublic}
                        selected={isPublicGame === true}
                    />
                    <Button
                        buttonText="Private"
                        buttonEvent={setPrivate}
                        selected={isPublicGame === false}
                    />
                </div>
                <h2>Select Maximum Players</h2>
                <div className="set-player-max">
                    <Button
                        buttonText="10"
                        buttonEvent={() => selectMaxPlayers(10)}
                        selected={maxPlayers === 10}
                    />
                    <Button
                        buttonText="20"
                        buttonEvent={() => selectMaxPlayers(20)}
                        selected={maxPlayers === 20}
                    />
                    <Button
                        buttonText="30"
                        buttonEvent={() => selectMaxPlayers(30)}
                        selected={maxPlayers === 30}
                    />
                    <Button
                        buttonText="40"
                        buttonEvent={() => selectMaxPlayers(40)}
                        selected={maxPlayers === 40}
                    />
                    <Button
                        buttonText="50"
                        buttonEvent={() => selectMaxPlayers(50)}
                        selected={maxPlayers === 50}
                    />
                </div>
                <Button buttonEvent={startGame} buttonText="Start game" />
            </div>
        </main>
    );
};