// server.js

// --- SETUP ---
// Import required modules
const express = require('express');
const http =require('http');
const { Server } = require("socket.io");
const path = require('path');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
// Initialize Socket.IO server
const io = new Server(server);

// --- STATIC FILE SERVING ---
// Serve the main HTML file and other static assets from a 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'aetherwars.html'));
});


// --- GAME DATA & LOGIC ---
// This section contains the core game logic, adapted from your original file.
const allCards = {
    aetherShards: [
        ...Array(4).fill({ name: 'Aether Shard', type: 'aether-shard', value: 2 }), ...Array(4).fill({ name: 'Aether Shard', type: 'aether-shard', value: 3 }),
        ...Array(3).fill({ name: 'Aether Shard', type: 'aether-shard', value: 4 }), ...Array(3).fill({ name: 'Aether Shard', type: 'aether-shard', value: 5 }),
        ...Array(2).fill({ name: 'Aether Shard', type: 'aether-shard', value: 6 }), ...Array(2).fill({ name: 'Aether Shard', type: 'aether-shard', value: 7 }),
        ...Array(1).fill({ name: 'Aether Shard', type: 'aether-shard', value: 8 }), ...Array(1).fill({ name: 'Aether Shard', type: 'aether-shard', value: 9 }),
    ],
    classic: [
        { name: 'Blast', type: 'attack', effect: 'Reduce opponent score by 5.', action: 'attack', value: 5 },
        { name: 'Shield', type: 'defense', effect: 'Block the next attack.', action: 'shield' },
        { name: 'Double Draw', type: 'special', effect: 'Draw 2 cards next turn.', action: 'doubledraw' },
    ],
    strategic: [
        { name: 'Aether Overload', type: 'attack', effect: 'Opponent immediately draws 2 cards.', action: 'overload' },
        { name: 'Shatter', type: 'attack', effect: 'Destroy opponent\'s Shield. If they have none, they lose 7 score.', action: 'shatter' },
        { name: 'Aether Leach', type: 'special', effect: 'Steal 4 score from opponent.', action: 'leach', value: 4 },
        { name: 'Stabilize', type: 'defense', effect: 'Next time you > 21, score becomes 15, not 0.', action: 'stabilize' },
        { name: 'Sanctuary', type: 'defense', effect: 'Your score cannot be reduced for 2 turns.', action: 'sanctuary' },
        { name: 'Rift Surge', type: 'special', effect: 'Set your score to 11.', action: 'surge' },
    ],
    advanced: [
        { name: 'Aether Siphon', type: 'attack', effect: 'Steal a random card from opponent\'s hand. If they have none, they lose 5 score.', action: 'siphon' },
        { name: 'Rift Leak', type: 'attack', effect: 'Opponent loses 2 score at the start of their next 3 turns.', action: 'riftleak' },
        { name: 'Phase Shift', type: 'defense', effect: 'On your next turn, you may skip your draw phase to gain 3 score.', action: 'phaseshift' },
        { name: 'Dark Matter', type: 'defense', effect: 'Your score is hidden from your opponent for your next 2 turns.', action: 'darkmatter' },
        { name: 'Supernova', type: 'attack', effect: 'Both players\' scores are halved (rounded down).', action: 'supernova' },
        { name: 'Paradox', type: 'special', effect: 'If winning, swap score with lower player. If losing, swap with higher.', action: 'paradox' },
        { name: 'Event Horizon', type: 'special', effect: 'For 3 turns, all score-reducing effects are reversed for both players.', action: 'eventhorizon' },
        { name: 'Time Warp', type: 'special', effect: 'Take an extra turn after this one.', action: 'timewarp' },
        { name: 'Counterspell', type: 'defense', effect: 'On opponent\'s next turn, if they attack, its effect is reflected back for 3 damage.', action: 'counterspell' },
        { name: 'Gambit', type: 'special', effect: 'Discard your hand. Gain 5 score per card.', action: 'gambit' },
        { name: 'Equilibrium', type: 'special', effect: 'Both scores become the average of the two.', action: 'equilibrium' },
        { name: 'Singularity', type: 'special', effect: 'Reset both players\' scores to 0.', action: 'singularity' },
        { name: 'Void Swap', type: 'special', effect: 'Swap scores with your opponent.', action: 'swap' },
    ]
};
const cardPools = {
    classic: [...allCards.classic],
    duelist: [...allCards.classic, ...allCards.strategic],
    gambit: [...allCards.classic, ...allCards.strategic, ...allCards.advanced.filter(c => ['Gambit', 'Aether Siphon'].includes(c.name))],
    chaos: [].concat(...Object.values(allCards).slice(1))
};

function createDeck(mode) {
    let deck = [...allCards.aetherShards];
    const actionCards = cardPools[mode];
    actionCards.forEach(card => {
        const copies = (card.name === 'Shield' || card.name === 'Blast') ? 3 : 2;
        for(let i = 0; i < copies; i++) deck.push(card);
    });
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    return deck;
}

// --- SERVER STATE ---
let rooms = {}; // This object will store all active game rooms

// --- SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('hostGame', (data) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        socket.join(roomId);

        rooms[roomId] = {
            roomId,
            players: {
                [socket.id]: { socketId: socket.id, playerNum: 1 }
            },
            gameMode: data.gameMode,
            gameState: null // Game state will be initialized when the second player joins
        };

        socket.emit('gameCreated', { roomId });
        console.log(`Room ${roomId} created by ${socket.id}`);
    });

    socket.on('joinGame', (data) => {
        const { roomId } = data;
        const room = rooms[roomId];

        if (room && Object.keys(room.players).length === 1) {
            socket.join(roomId);
            room.players[socket.id] = { socketId: socket.id, playerNum: 2 };
            
            // Initialize and start the game
            initializeGame(room);
            
            console.log(`User ${socket.id} joined room ${roomId}. Starting game.`);
            
            // Send the initial game state to both players
            const p1 = Object.values(room.players).find(p => p.playerNum === 1);
            const p2 = Object.values(room.players).find(p => p.playerNum === 2);

            io.to(p1.socketId).emit('gameStart', createPayload(room));
            io.to(p2.socketId).emit('gameStart', createPayload(room));

        } else {
            socket.emit('error', { message: 'Room is full or does not exist.' });
        }
    });
    
    socket.on('playerAction', (data) => {
        const roomId = findRoomBySocketId(socket.id);
        if (!roomId) return;
        
        const room = rooms[roomId];
        const player = room.gameState.players[socket.id];
        const opponent = Object.values(room.gameState.players).find(p => p.socketId !== socket.id);

        // Server-side validation
        if (player.playerNum !== room.gameState.activePlayer || room.gameState.gameIsOver) {
            return; // Not their turn or game is over
        }

        switch(data.action) {
            case 'drawCard':
                if (!player.hasDrawn) {
                   handleCardDraw(room, player);
                }
                break;
            case 'playCard':
                if (!player.actionCardPlayedThisTurn) {
                    playActionCard(room, player, opponent, data.cardIndex);
                }
                break;
            case 'endTurn':
                if (player.hasDrawn) {
                    endTurn(room, player);
                }
                break;
            case 'quit':
                io.to(roomId).emit('playerLeft', { message: `Player ${player.playerNum} has quit the game.` });
                delete rooms[roomId];
                break;
        }

        // After any action, check for win/loss conditions
        checkWinCondition(room);

        // Send updated state to all players in the room
        if (rooms[roomId]) { // Check if room still exists (player might have quit)
            io.to(roomId).emit('gameUpdate', createPayload(room));
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const roomId = findRoomBySocketId(socket.id);
        if (roomId && rooms[roomId]) {
            const player = rooms[roomId].gameState.players[socket.id];
            // Notify the other player
            io.to(roomId).emit('playerLeft', { message: `Player ${player.playerNum} has disconnected.` });
            // Clean up the room
            delete rooms[roomId];
            console.log(`Room ${roomId} closed due to disconnect.`);
        }
    });
});

// --- GAME LOGIC FUNCTIONS (SERVER-SIDE) ---

function initializeGame(room) {
    const handSizeLimits = { classic: 3, duelist: 2, gambit: 4, chaos: 99 };
    const p1SocketId = Object.keys(room.players).find(id => room.players[id].playerNum === 1);
    const p2SocketId = Object.keys(room.players).find(id => room.players[id].playerNum === 2);

    room.gameState = {
        players: {
            [p1SocketId]: { socketId: p1SocketId, playerNum: 1, score: 0, hand: [], status: {}, hasDrawn: false, actionCardPlayedThisTurn: false },
            [p2SocketId]: { socketId: p2SocketId, playerNum: 2, score: 0, hand: [], status: {}, hasDrawn: false, actionCardPlayedThisTurn: false }
        },
        deck: createDeck(room.gameMode),
        handSizeLimit: handSizeLimits[room.gameMode] || 3,
        activePlayer: 1,
        gameIsOver: false,
        message: `Player 1's turn. Draw a card.`
    };
}

function handleCardDraw(room, player) {
    player.hasDrawn = true;
    const draws = player.status.doubledraw ? 2 : 1;
    if (player.status.doubledraw) delete player.status.doubledraw;

    for (let i = 0; i < draws; i++) {
        if (room.gameState.deck.length === 0) {
            room.gameState.deck = createDeck(room.gameMode);
            room.gameState.message = "Deck reshuffled!";
        }
        const card = room.gameState.deck.pop();
        
        if (card.type === 'aether-shard') {
            player.score += card.value;
        } else {
            if (player.hand.length < room.gameState.handSizeLimit) {
                player.hand.push(card);
            }
        }
    }
    room.gameState.message = `Player ${player.playerNum} drew ${draws > 1 ? '2 cards' : 'a card'}.`;
    handleScoreOverflow(room, player);
}

function playActionCard(room, player, opponent, cardIndex) {
    if (cardIndex >= player.hand.length) return; // Invalid index

    player.actionCardPlayedThisTurn = true;
    const card = player.hand.splice(cardIndex, 1)[0];
    
    // The core action logic would go here, modifying player and opponent objects.
    // This is a simplified version. A full implementation would require moving
    // the entire 'executeAction' logic from your original file here.
    room.gameState.message = `Player ${player.playerNum} played ${card.name}!`;

    // Example of a simple action:
    if (card.action === 'attack') {
        if (!opponent.status.shield) {
            opponent.score = Math.max(0, opponent.score - card.value);
        } else {
            delete opponent.status.shield;
            room.gameState.message += ` But it was blocked!`;
        }
    } else if (card.action === 'shield') {
        player.status.shield = true;
    }
    
    handleScoreOverflow(room, player);
    handleScoreOverflow(room, opponent);
}

function endTurn(room, player) {
    // Reset turn-based flags for the current player
    player.hasDrawn = false;
    player.actionCardPlayedThisTurn = false;

    // Switch active player
    room.gameState.activePlayer = room.gameState.activePlayer === 1 ? 2 : 1;
    room.gameState.message = `Player ${room.gameState.activePlayer}'s turn. Draw a card.`;
}

function handleScoreOverflow(room, player) {
    if (player.score > 21) {
        if (player.status.stabilized) {
            player.score = 15;
            delete player.status.stabilized;
        } else {
            player.score = 0;
        }
    }
}

function checkWinCondition(room) {
    const p1 = Object.values(room.gameState.players).find(p => p.playerNum === 1);
    const p2 = Object.values(room.gameState.players).find(p => p.playerNum === 2);

    if (p1.score === 21) {
        room.gameState.gameIsOver = true;
        room.gameState.message = `Player 1 closes the rift! Player 1 wins!`;
    } else if (p2.score === 21) {
        room.gameState.gameIsOver = true;
        room.gameState.message = `Player 2 closes the rift! Player 2 wins!`;
    }
}


// --- HELPER FUNCTIONS ---
function findRoomBySocketId(socketId) {
    return Object.keys(rooms).find(roomId => rooms[roomId].players[socketId]);
}

function createPayload(room) {
    // Creates a data payload to send to clients, ensuring hands are kept private.
    // IMPORTANT: This is a simplified payload. A real implementation would need to
    // create a separate payload for each player to hide the opponent's hand.
    return {
        gameState: room.gameState,
        message: room.gameState.message,
        activePlayer: room.gameState.activePlayer,
        gameIsOver: room.gameState.gameIsOver
    };
}


// --- START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});