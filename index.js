const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { generateId, LOG_LOBBIES_INFO, restartGame, gameInfo, randomTurn, createChamber, getRandomIndex, getRandomElement, generatePerks, getPlayers } = require('./utils');
const { GAME_INFO, PERKS } = require('./constants');
const GAME = require('./game')

const app = express();
app.use(cors())

const server = http.createServer(app);
const io = new Server(server, {
    path: '/api-roulette/socket.io/',
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    rememberUpgrade: true,
});

app.get('/test', (req, res) => {
    res.send('THIS IS A TEST')
});

app.get('/api-roulette/', (req, res) => {
    res.sendFile(__dirname + '/static/index.html');
});

app.get('/api-roulette/lobby', (req, res) => {
    res.sendFile(__dirname + '/static/lobby.html');
});

const lobbies = {};

io.use((socket, next) => {
    // const username = socket.handshake.auth.username;

    // if (!username) {
    //     return next(new Error('Invalid username'));
    // }

    socket.userId = generateId();
    // socket.username = username;

    next();
});

io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle game logic here
    socket.on('joinLobby', (data) => {
        const requestedLobbyId = data.lobbyId;
        // const username = socket.username
        const playerId = socket.userId

        let lobby = lobbies[requestedLobbyId]

        if (!lobby) {
            lobby = {
                id: generateId(),
                round: GAME_INFO.STARTING_ROUND,
                isStarted: false,
                players: [
                    {
                        id: playerId,
                        socket,
                        life: GAME_INFO.LIFE[1],
                        perks: [],
                        activePerks: [],
                        isAdmin: true,
                        score: 0,
                    },
                ]
            }
            lobbies[lobby.id] = lobby
        } else {
            if (lobby.players.length >= 2) {
                socket.emit('lobbyFull');
                return;
            }
            lobby.players.push({
                id: playerId,
                socket,
                life: GAME_INFO.LIFE[1],
                perks: [],
                activePerks: [],
                isAdmin: false,
                score: 0,
            })
        }

        // Notify the client about successful lobby join
        socket.emit('lobbyJoined', gameInfo(lobby, playerId));
        LOG_LOBBIES_INFO(lobbies)

        // Notify other players in the lobby about the new player
        lobby.players.forEach((player) => {
            if (player.socket !== socket) {
                player.socket.emit('opponentJoined', gameInfo(lobby, player.id));
            }
        });

        socket.on('sendLobbyInfo', () => {
            console.log(gameInfo(lobby, playerId))
            socket.emit('lobbyInfo', gameInfo(lobby, playerId))
        })

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('A user disconnected');
            console.log(lobby)

            const updatedPlayers = lobby.players.filter((p) => {
                return p.socket !== socket
            })

            lobby.players = updatedPlayers

            const opponent = updatedPlayers[0]
            if (opponent) {
                opponent.isAdmin = true
                restartGame(lobby)
                opponent.socket.emit('opponentLeft', gameInfo(lobby, opponent.id));
            }

            if (lobby.players.length <= 0) {
                console.log('deleted lobby: ', lobby.id)
                delete lobbies[lobby.id]
                LOG_LOBBIES_INFO(lobbies)
            }
        });

        // Handle game events
        GAME(socket, lobby)
    });
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});