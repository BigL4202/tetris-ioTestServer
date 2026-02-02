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
let currentMatchStats = []; // Stores stats for the active game

// --- DATA STORAGE ---
const DATA_FILE = path.join(__dirname, 'accounts.json');
let accounts = {}; 

// Accounts Structure: 
// { 
//   "username": { 
//     password: "...", 
//     wins: 0, 
//     bestAPM: 0,
//     history: [ { date, rank, apm, pps, sent, received }, ... ] 
//   } 
// }

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

        if (!accounts[user]) {
            // New Account
            accounts[user] = { password: pass, wins: 0, bestAPM: 0, history: [] };
            saveAccounts();
        } else if (accounts[user].password !== pass) {
            return socket.emit('login_response', { success: false, msg: "Incorrect Password!" });
        }

        socket.username = user;
        socket.emit('login_response', { 
            success: true, 
            username: user, 
            wins: accounts[user].wins, 
            bestAPM: accounts[user].bestAPM || 0 
        });
        socket.emit('leaderboard_update', getLeaderboards());
    });

    // --- STATS PAGE REQUEST ---
    socket.on('request_all_stats', () => {
        // Send a sanitized version of accounts (no passwords)
        const safeData = {};
        for (const [key, val] of Object.entries(accounts)) {
            safeData[key] = { 
                wins: val.wins, 
                bestAPM: val.bestAPM, 
                history: val.history || [] 
            };
        }
        socket.emit('receive_all_stats', safeData);
    });

    // --- APM TEST SUBMISSION ---
    socket.on('submit_apm', (val) => {
        if (!socket.username) return;
        const score = parseInt(val) || 0;
        if (accounts[socket.username]) {
            if (score > (accounts[socket.username].bestAPM || 0)) {
                accounts[socket.username].bestAPM = score;
                saveAccounts();
                socket.emit('update_my_apm', score);
                io.emit('leaderboard_update', getLeaderboards());
            }
        }
    });

    // --- FFA SYSTEM ---
    socket.on('join_ffa', () => {
        if (!socket.username) return;
        socket.join('ffa_room');
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

    socket.on('leave_lobby', () => { removePlayer(socket); });
    socket.on('disconnect', () => { removePlayer(socket); });

    // --- GAMEPLAY ---
    socket.on('send_garbage', (data) => {
        if (ffaState === 'playing') {
            const sender = ffaPlayers.find(p => p.id === socket.id);
            if (!sender || !sender.alive) return;

            const targets = ffaPlayers.filter(p => p.alive && p.id !== socket.id);
            if (targets.length > 0) {
                let split = Math.floor(data.amount / targets.length);
                if (data.amount >= 4 && split === 0) split = 1; 
                if (split > 0) targets.forEach(t => io.to(t.id).emit('receive_garbage', split));
            }
        }
    });

    socket.on('update_board', (grid) => {
        socket.to('ffa_room').emit('enemy_board_update', { id: socket.id, grid: grid });
    });

    // --- MATCH CONCLUSION LOGIC ---
    socket.on('player_died', (stats) => {
        const p = ffaPlayers.find(x => x.id === socket.id);
        if (p && ffaState === 'playing' && p.alive) {
            p.alive = false;
            
            // Record Stats (Rank will be assigned later)
            recordMatchStat(p.username, stats, false);

            io.to('ffa_room').emit('elimination', { id: p.id, username: p.username });
            checkFFAWin();
        }
    });

    socket.on('match_won', (stats) => {
        // Winner sends this explicitly to ensure final stats are captured
        if (ffaState === 'playing' || ffaState === 'finished') {
            recordMatchStat(socket.username, stats, true);
            processMatchResults(socket.username);
        }
    });
});

function recordMatchStat(username, stats, isWinner) {
    // Check if already recorded for this match (prevent duplicates)
    const existing = currentMatchStats.find(s => s.username === username);
    if (existing) return;

    currentMatchStats.push({
        username: username,
        isWinner: isWinner,
        apm: stats.apm || 0,
        pps: stats.pps || 0,
        sent: stats.sent || 0,
        recv: stats.recv || 0,
        timestamp: Date.now()
    });
}

function removePlayer(socket) {
    const pIndex = ffaPlayers.findIndex(x => x.id === socket.id);
    if (pIndex !== -1) {
        const p = ffaPlayers[pIndex];
        ffaPlayers.splice(pIndex, 1);
        
        if (ffaState === 'playing' && p.alive) {
            io.to('ffa_room').emit('elimination', { id: p.id, username: p.username });
            checkFFAWin();
        }
        io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
    }
}

function getLeaderboards() {
    const allUsers = Object.entries(accounts);
    const wins = allUsers.map(([n, d]) => ({ name: n, val: d.wins })).sort((a, b) => b.val - a.val).slice(0, 5);
    const apm = allUsers.map(([n, d]) => ({ name: n, score: d.bestAPM || 0 })).filter(u => u.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    return { wins, apm };
}

function checkFFAStart() {
    if (ffaState === 'waiting' && ffaPlayers.length >= 2) {
        startFFARound();
    }
}

function startFFARound() {
    ffaState = 'countdown';
    ffaSeed = Math.floor(Math.random() * 1000000);
    currentMatchStats = []; // Reset stats for new game
    
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
        
        if (survivors.length === 1) {
            // Tell the winner to send their final stats
            // We wait for the 'match_won' event to process results
            io.to(survivors[0].id).emit('request_win_stats');
        } else {
            // Everyone died (draw or disconnects), process what we have
            processMatchResults(null);
        }
    }
}

function processMatchResults(winnerName) {
    // 1. Determine Ranks
    // Sort logic: Winner is #1. Everyone else sorted by elimination timestamp (last to die = higher rank)
    
    // Separate winner from losers
    const winnerObj = currentMatchStats.find(s => s.isWinner);
    const losers = currentMatchStats.filter(s => !s.isWinner).sort((a, b) => b.timestamp - a.timestamp);
    
    const finalResults = [];
    if (winnerObj) finalResults.push({ ...winnerObj, place: 1 });
    
    losers.forEach((l, index) => {
        finalResults.push({ ...l, place: (winnerObj ? 2 : 1) + index });
    });

    // 2. Save History to Accounts
    finalResults.forEach(res => {
        if (accounts[res.username]) {
            if (res.place === 1) accounts[res.username].wins++;
            
            // Push to history
            if (!accounts[res.username].history) accounts[res.username].history = [];
            accounts[res.username].history.push({
                date: new Date().toISOString(),
                place: res.place,
                apm: res.apm,
                pps: res.pps,
                sent: res.sent,
                received: res.recv
            });
        }
    });
    
    saveAccounts();

    // 3. Broadcast
    if (winnerName && accounts[winnerName]) {
        // Find winner socket to update their specific win count UI
        const winnerSocket = ffaPlayers.find(p => p.username === winnerName);
        if (winnerSocket) io.to(winnerSocket.id).emit('update_my_wins', accounts[winnerName].wins);
    }

    io.emit('leaderboard_update', getLeaderboards());
    io.to('ffa_room').emit('match_summary', finalResults);

    // 4. Reset Lobby after 15 seconds
    setTimeout(() => {
        if (ffaPlayers.length >= 2) {
            startFFARound();
        } else {
            ffaState = 'waiting';
            io.to('ffa_room').emit('lobby_reset');
        }
    }, 15000);
}

http.listen(3000, () => { console.log('Server on 3000'); });
}
