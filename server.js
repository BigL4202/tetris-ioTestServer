const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// --- GLOBAL STATE ---
let ffaPlayers = []; 
let ffaState = 'waiting'; 
let ffaSeed = 12345;

// --- ACCOUNT SYSTEM ---
// Structure: { "username": { password: "...", wins: 0 } }
const accounts = {}; 

io.on('connection', (socket) => {
    
    // --- CHAT SYSTEM ---
    socket.on('send_chat', (msg) => {
        const cleanMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 50);
        const name = socket.username || "Anon";
        io.to('ffa_room').emit('receive_chat', { user: name, text: cleanMsg });
    });

    // --- LOGIN / REGISTER ---
    socket.on('login_attempt', (data) => {
        const user = data.username.trim().substring(0, 12);
        const pass = data.password.trim();

        if (!user || !pass) {
            socket.emit('login_response', { success: false, msg: "Enter user & pass." });
            return;
        }

        if (accounts[user]) {
            // Existing Account
            if (accounts[user].password === pass) {
                socket.username = user;
                // Send Success + Current Wins
                socket.emit('login_response', { success: true, username: user, wins: accounts[user].wins });
                // Send Leaderboard
                socket.emit('leaderboard_update', getLeaderboard());
            } else {
                socket.emit('login_response', { success: false, msg: "Incorrect Password!" });
            }
        } else {
            // New Account
            accounts[user] = { password: pass, wins: 0 };
            socket.username = user;
            socket.emit('login_response', { success: true, username: user, wins: 0 });
            // Broadcast new leaderboard (if a new user somehow has wins, or just to sync)
            io.emit('leaderboard_update', getLeaderboard());
        }
    });

    // --- FFA SYSTEM ---
    socket.on('join_ffa', () => {
        if (!socket.username) return; // Must be logged in

        socket.join('ffa_room');
        
        const existing = ffaPlayers.find(p => p.id === socket.id);
        if (existing) return;

        if (ffaState === 'waiting' || ffaState === 'finished') {
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: true, socket: socket });
            io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
            checkFFAStart();
        } else {
            // Spectate
            const livingPlayers = ffaPlayers.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: ffaSeed, players: livingPlayers });
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: false, socket: socket });
        }
    });

    socket.on('send_garbage', (data) => {
        if (ffaState === 'playing') {
            const targets = ffaPlayers.filter(p => p.alive && p.id !== socket.id);
            if (targets.length > 0) {
                let split = Math.floor(data.amount / targets.length);
                if (data.amount >= 4 && split === 0) split = 1; 
                if (split > 0) {
                    targets.forEach(t => io.to(t.id).emit('receive_garbage', split));
                }
            }
        }
    });

    socket.on('update_board', (grid) => {
        socket.to('ffa_room').emit('enemy_board_update', { id: socket.id, grid: grid });
    });

    socket.on('player_died', () => {
        const p = ffaPlayers.find(x => x.id === socket.id);
        if (p && ffaState === 'playing' && p.alive) {
            p.alive = false;
            io.to('ffa_room').emit('elimination', { username: p.username });
            checkFFAWin();
        }
    });

    socket.on('disconnect', () => {
        const pIndex = ffaPlayers.findIndex(x => x.id === socket.id);
        if (pIndex !== -1) {
            const p = ffaPlayers[pIndex];
            ffaPlayers.splice(pIndex, 1);
            if (ffaState === 'playing' && p.alive) {
                io.to('ffa_room').emit('elimination', { username: p.username });
                checkFFAWin();
            }
            io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
        }
    });
});

// --- HELPERS ---
function getLeaderboard() {
    // Sort accounts by wins (descending) and take top 10
    return Object.entries(accounts)
        .map(([name, data]) => ({ name: name, wins: data.wins }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 10);
}

function checkFFAStart() {
    if (ffaState === 'waiting' && ffaPlayers.length >= 2) {
        startFFARound();
    }
}

function startFFARound() {
    ffaState = 'countdown';
    ffaSeed = Math.floor(Math.random() * 1000000);
    ffaPlayers.forEach(p => p.alive = true);
    
    io.to('ffa_room').emit('start_countdown', { duration: 3 });
    
    setTimeout(() => {
        ffaState = 'playing';
        io.to('ffa_room').emit('match_start', { 
            mode: 'ffa',
            seed: ffaSeed, 
            players: ffaPlayers.map(p => ({ id: p.id, username: p.username })) 
        });
    }, 3000);
}

function checkFFAWin() {
    const survivors = ffaPlayers.filter(p => p.alive);
    if (survivors.length <= 1) {
        ffaState = 'finished';
        let winnerName = "No One";
        
        if (survivors.length === 1) {
            winnerName = survivors[0].username;
            // UPDATE WINS
            if (accounts[winnerName]) {
                accounts[winnerName].wins++;
                
                // Update the specific winner's client
                const winnerSocket = survivors[0].socket;
                if(winnerSocket) {
                    winnerSocket.emit('update_my_wins', accounts[winnerName].wins);
                }
            }
            // Broadcast new leaderboard
            io.emit('leaderboard_update', getLeaderboard());
        }
        
        io.to('ffa_room').emit('round_over', { winner: winnerName });
        
        setTimeout(() => {
            if (ffaPlayers.length >= 2) {
                startFFARound();
            } else {
                ffaState = 'waiting';
                io.to('ffa_room').emit('lobby_reset');
            }
        }, 3000);
    }
}

http.listen(3000, () => { console.log('Server on 3000'); });
