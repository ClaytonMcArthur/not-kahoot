# <img width="50" height="50" alt="notKahootLogo" src="https://github.com/user-attachments/assets/ae873fbd-543d-42d8-b516-eaaee18cc8f4" /> Welcome to Not Kahoot!
[Play Not Kahoot Here!](https://not-kahoot.onrender.com)
## Overview
Not Kahoot is a multiplayer quiz game inspired by the classic Kahoot experience. It includes a custom game server built using TCP sockets, a Node bridge that exposes a simple API, and a React client that allows users to create and join games.
## Features
* Create new quiz games with custom themes
* Join active games using a game pin
* Real time communication with the game server through the Node bridge
* Display of open games with player counts
* Smooth navigation through the React client
## Project Structure
* server: The TCP game server that manages game state, player lists, and transitions
* node client: A Node based client that maintains a persistent socket connection with the game server
* client api: A Node Express bridge that forwards HTTP requests from the React frontend to the game server
* frontend: A React application that provides the user interface for creating and joining games
