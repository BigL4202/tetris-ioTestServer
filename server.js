const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

// --- GLOBAL STATE ---
let ffaPlayers = []; 
let ffaState = 'waiting'; 
let ffaSeed = 12345;

// --- DATA STORAGE ---
const DATA_FILE = path.join(__dirname, 'accounts.json');
let accounts = {}; 

function loadAccounts() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            accounts = JSON.parse(fs.readFileSync(DATA_FILE));
            console.log("Loaded account data.");
        }
    } catch (err) { accounts = {}; }
}
function saveAccounts() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2)); } catch (err) {}
}
loadAccounts();

io.on('connection', (socket) => {
    
    // --- CHAT ---
    socket.on('send_chat', (msg) => {
        const cleanMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 50);
        const name = socket.username || "Anon";
        io.emit('receive_chat', { user: name, text: cleanMsg });
    });

    // --- AUTH ---
    socket.on('login_attempt', (data) => {
        const user = data.username.trim().substring(0, 12);
        const pass = data.password.trim();
        if (!user || !pass) return socket.emit('login_response', { success: false, msg: "Enter user & pass." });

        if (accounts[user]) {
            if (accounts[user].password === pass) {
                socket.username = user;
                socket.emit('login_response', { success: true, username: user, wins: accounts[user].wins, bestAPM: accounts[user].bestAPM || 0 });
                socket.emit('leaderboard_update', getLeaderboards());
            } else {
                socket.emit('login_response', { success: false, msg: "Incorrect Password!" });
            }
        } else {
            accounts[user] = { password: pass, wins: 0, bestAPM: 0 };
            saveAccounts();
            socket.username = user;
            socket.emit('login_response', { success: true, username: user, wins: 0, bestAPM: 0 });
            io.emit('leaderboard_update', getLeaderboards());
        }
    });

    socket.on('submit_apm', (val) => {
        if (!socket.username) return;
        const score = parseInt(val) || 0;
        if (accounts[socket.username]) {
            const currentBest = accounts[socket.username].bestAPM || 0;
            if (score > currentBest) {
                accounts[socket.username].bestAPM = score;
                saveAccounts();
                socket.emit('update_my_apm', score);
                io.emit('leaderboard_update', getLeaderboards());
            }
        }
    });

    // --- FFA JOIN/LEAVE ---
    socket.on('join_ffa', () => {
        if (!socket.username) return;
        socket.join('ffa_room');
        
        // Prevent double join
        if (ffaPlayers.find(p => p.id === socket.id)) return;

        if (ffaState === 'waiting' || ffaState === 'finished') {
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: true, socket: socket });
            io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
            checkFFAStart();
        } else {
            const livingPlayers = ffaPlayers.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: ffaSeed, players: livingPlayers });
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: false, socket: socket });
        }
    });

    // NEW: Explicitly remove player from FFA list if they go to menu/singleplayer
    socket.on('leave_lobby', () => {
        removePlayer(socket);
    });

    // --- GAMEPLAY ---
    socket.on('send_garbage', (data) => {
        if (ffaState === 'playing') {
            // Ensure sender is actually ALIVE in the current game
            const sender = ffaPlayers.find(p => p.id === socket.id);
            if (!sender || !sender.alive) return;

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
        removePlayer(socket);
    });
});

function removePlayer(socket) {
    const pIndex = ffaPlayers.findIndex(x => x.id === socket.id);
    if (pIndex !== -1) {
        const p = ffaPlayers[pIndex];
        ffaPlayers.splice(pIndex, 1);
        
        // If they died/left mid-game
        if (ffaState === 'playing' && p.alive) {
            io.to('ffa_room').emit('elimination', { username: p.username });
            checkFFAWin();
        }
        io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
    }
}

function getLeaderboards() {
    const allUsers = Object.entries(accounts);
    
    // Top 5 Wins
    const wins = allUsers
        .map(([name, data]) => ({ name: name, val: data.wins }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 5);

    // Top 5 APM (Unique users)
    const apm = allUsers
        .map(([name, data]) => ({ name: name, score: data.bestAPM || 0 }))
        .filter(u => u.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
        
    return { wins: wins, apm: apm };
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
            if (accounts[winnerName]) {
                accounts[winnerName].wins++;
                saveAccounts();
                const winnerSocket = survivors[0].socket;
                if(winnerSocket) winnerSocket.emit('update_my_wins', accounts[winnerName].wins);
            }
            io.emit('leaderboard_update', getLeaderboards());
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
