// --- IMPORTS & SETUP ---
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

// --- GLOBAL SETTINGS ---
const MUTATORS = ['double_hold'];
let currentMutator = 'double_hold'; 

setInterval(() => {
    const r = Math.floor(Math.random() * MUTATORS.length);
    currentMutator = MUTATORS[r];
    io.to('lobby_mixtape').emit('mixtape_update', { mutator: currentMutator });
}, 30 * 60 * 1000);

// --- DATA STORAGE ---
const DATA_FILE = path.join(__dirname, 'accounts.json');
let accounts = {}; 

function loadAccounts() {
    try {
        if (fs.existsSync(DATA_FILE)) accounts = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (err) { accounts = {}; }
}
function saveAccounts() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2)); } catch (err) {}
}
loadAccounts();

// --- GAME STATE MANAGEMENT ---
let ffa = { players: [], state: 'waiting', seed: 12345, matchStats: [], startTime: 0 };
let mixtape = { players: [], state: 'waiting', seed: 67890, matchStats: [], startTime: 0 };

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    socket.on('send_chat', (msg) => {
        const cleanMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 50);
        const name = socket.username || "Anon";
        const rooms = Array.from(socket.rooms);
        if (rooms.includes('lobby_ffa')) io.to('lobby_ffa').emit('receive_chat', { user: name, text: cleanMsg });
        else if (rooms.includes('lobby_mixtape')) io.to('lobby_mixtape').emit('receive_chat', { user: name, text: cleanMsg });
        else io.emit('receive_chat', { user: name, text: cleanMsg });
    });

    socket.on('login_attempt', (data) => {
        const user = data.username.trim().substring(0, 12);
        const pass = data.password.trim();
        if (!user || !pass) return socket.emit('login_response', { success: false, msg: "Enter user & pass." });

        if (!accounts[user]) {
            accounts[user] = { password: pass, wins: 0, bestAPM: 0, bestCombo: 0, history: [] };
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
        io.emit('leaderboard_update', getLeaderboards());
    });

    socket.on('request_all_stats', () => {
        const safeData = {};
        for (const [key, val] of Object.entries(accounts)) {
            safeData[key] = { 
                wins: val.wins, 
                bestAPM: val.bestAPM,
                bestCombo: val.bestCombo || 0,
                history: val.history || [] 
            };
        }
        socket.emit('receive_all_stats', safeData);
    });

    socket.on('submit_apm', (val) => {
        if (!socket.username) return;
        const score = parseInt(val) || 0;
        if (accounts[socket.username] && score > (accounts[socket.username].bestAPM || 0)) {
            accounts[socket.username].bestAPM = score;
            saveAccounts();
            socket.emit('update_my_apm', score);
        }
    });

    // --- LOBBY LOGIC ---
    function leaveAllLobbies() {
        let fIndex = ffa.players.findIndex(p => p.id === socket.id);
        if (fIndex !== -1) {
            let p = ffa.players[fIndex];
            ffa.players.splice(fIndex, 1);
            socket.leave('lobby_ffa');
            io.to('lobby_ffa').emit('lobby_update', { count: ffa.players.length });
            if (ffa.state === 'playing' && p.alive) {
                io.to('lobby_ffa').emit('elimination', { username: p.username, killer: "Disconnect" });
                checkWinCondition(ffa, 'lobby_ffa');
            }
        }

        let mIndex = mixtape.players.findIndex(p => p.id === socket.id);
        if (mIndex !== -1) {
            let p = mixtape.players[mIndex];
            mixtape.players.splice(mIndex, 1);
            socket.leave('lobby_mixtape');
            io.to('lobby_mixtape').emit('lobby_update', { count: mixtape.players.length });
            if (mixtape.state === 'playing' && p.alive) {
                io.to('lobby_mixtape').emit('elimination', { username: p.username, killer: "Disconnect" });
                checkWinCondition(mixtape, 'lobby_mixtape');
            }
        }
    }

    socket.on('leave_lobby', () => { leaveAllLobbies(); });
    socket.on('disconnect', () => { leaveAllLobbies(); });

    socket.on('join_ffa', () => {
        if (!socket.username) return;
        leaveAllLobbies();
        socket.join('lobby_ffa');
        const playerData = { id: socket.id, username: socket.username, alive: true, damageLog: [] };
        if (ffa.state === 'waiting' || ffa.state === 'finished') {
            ffa.players.push(playerData);
            io.to('lobby_ffa').emit('lobby_update', { count: ffa.players.length });
            checkStart(ffa, 'lobby_ffa');
        } else {
            const living = ffa.players.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: ffa.seed, players: living });
            playerData.alive = false;
            ffa.players.push(playerData);
        }
    });

    socket.on('join_mixtape', () => {
        if (!socket.username) return;
        leaveAllLobbies();
        socket.join('lobby_mixtape');
        const playerData = { id: socket.id, username: socket.username, alive: true, damageLog: [] };
        if (mixtape.state === 'waiting' || mixtape.state === 'finished') {
            mixtape.players.push(playerData);
            io.to('lobby_mixtape').emit('lobby_update', { count: mixtape.players.length });
            checkStart(mixtape, 'lobby_mixtape');
        } else {
            const living = mixtape.players.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: mixtape.seed, players: living });
            playerData.alive = false;
            mixtape.players.push(playerData);
        }
    });

    // --- GAMEPLAY ---
    socket.on('update_board', (grid) => {
        if (socket.rooms.has('lobby_ffa')) socket.to('lobby_ffa').emit('enemy_board_update', { id: socket.id, grid: grid });
        if (socket.rooms.has('lobby_mixtape')) socket.to('lobby_mixtape').emit('enemy_board_update', { id: socket.id, grid: grid });
    });

    socket.on('send_garbage', (data) => {
        let lobby = null;
        if (socket.rooms.has('lobby_ffa')) lobby = ffa;
        else if (socket.rooms.has('lobby_mixtape')) lobby = mixtape;

        if (lobby && lobby.state === 'playing') {
            const sender = lobby.players.find(p => p.id === socket.id);
            if (!sender || !sender.alive) return;
            const targets = lobby.players.filter(p => p.alive && p.id !== socket.id);
            if (targets.length > 0) {
                let split = Math.floor(data.amount / targets.length);
                if (data.amount >= 4 && split === 0) split = 1;
                if (split > 0) {
                    targets.forEach(t => {
                        t.damageLog.push({ attacker: sender.username, amount: split, time: Date.now() });
                        io.to(t.id).emit('receive_garbage', split);
                    });
                }
            }
        }
    });

    socket.on('player_died', (stats) => {
        let lobby = null;
        let roomName = '';
        if (socket.rooms.has('lobby_ffa')) { lobby = ffa; roomName = 'lobby_ffa'; }
        else if (socket.rooms.has('lobby_mixtape')) { lobby = mixtape; roomName = 'lobby_mixtape'; }

        if (lobby) {
            const p = lobby.players.find(x => x.id === socket.id);
            if (p && lobby.state === 'playing' && p.alive) {
                p.alive = false;
                let killerName = "Gravity";
                const recentLogs = p.damageLog.filter(l => Date.now() - l.time < 15000);
                if (recentLogs.length > 0) {
                    const dmgMap = {};
                    recentLogs.forEach(l => dmgMap[l.attacker] = (dmgMap[l.attacker] || 0) + l.amount);
                    killerName = Object.keys(dmgMap).reduce((a, b) => dmgMap[a] > dmgMap[b] ? a : b);
                }
                
                // Record Stats WITH Duration
                const survivalTime = Date.now() - lobby.startTime;
                recordMatchStat(lobby, p.username, stats, false, survivalTime);
                
                io.to(roomName).emit('elimination', { username: p.username, killer: killerName });
                checkWinCondition(lobby, roomName);
            }
        }
    });

    socket.on('match_won', (stats) => {
        let lobby = null;
        let roomName = '';
        if (socket.rooms.has('lobby_ffa')) { lobby = ffa; roomName = 'lobby_ffa'; }
        else if (socket.rooms.has('lobby_mixtape')) { lobby = mixtape; roomName = 'lobby_mixtape'; }

        if (lobby && (lobby.state === 'playing' || lobby.state === 'finished')) {
            const survivalTime = Date.now() - lobby.startTime;
            recordMatchStat(lobby, socket.username, stats, true, survivalTime);
            processResults(lobby, roomName, socket.username);
        }
    });
});

function checkStart(lobby, roomName) {
    if (lobby.state === 'waiting' && lobby.players.length >= 2) {
        lobby.state = 'countdown';
        lobby.seed = Math.floor(Math.random() * 1000000);
        lobby.matchStats = [];
        lobby.players.forEach(p => { p.alive = true; p.damageLog = []; });
        io.to(roomName).emit('start_countdown', { duration: 3 });
        setTimeout(() => {
            lobby.state = 'playing';
            lobby.startTime = Date.now();
            io.to(roomName).emit('match_start', {
                mode: (roomName === 'lobby_mixtape' ? 'mixtape' : 'ffa'),
                mutator: (roomName === 'lobby_mixtape' ? currentMutator : null),
                seed: lobby.seed,
                players: lobby.players.map(p => ({ id: p.id, username: p.username }))
            });
        }, 3000);
    }
}

function checkWinCondition(lobby, roomName) {
    const survivors = lobby.players.filter(p => p.alive);
    if (survivors.length <= 1) {
        lobby.state = 'finished';
        if (survivors.length === 1) {
            io.to(survivors[0].id).emit('request_win_stats');
        } else {
            processResults(lobby, roomName, null);
        }
    }
}

// CHANGED: Added 'survivalTime' parameter
function recordMatchStat(lobby, username, stats, isWinner, survivalTime) {
    if (lobby.matchStats.find(s => s.username === username)) return;
    lobby.matchStats.push({ 
        username: username, 
        isWinner: isWinner, 
        apm: stats.apm || 0, 
        pps: stats.pps || 0, 
        sent: stats.sent || 0, 
        recv: stats.recv || 0, 
        maxCombo: stats.maxCombo || 0, 
        survivalTime: survivalTime || 0, // NEW
        timestamp: Date.now() 
    });
}

function processResults(lobby, roomName, winnerName) {
    const winnerObj = lobby.matchStats.find(s => s.isWinner);
    const losers = lobby.matchStats.filter(s => !s.isWinner).sort((a, b) => b.timestamp - a.timestamp);
    const finalResults = [];
    
    // Format duration helper
    const fmt = (ms) => {
        const m = Math.floor(ms/60000);
        const s = Math.floor((ms%60000)/1000);
        return `${m}m ${s}s`;
    };

    if (winnerObj) finalResults.push({ ...winnerObj, place: 1, durationStr: fmt(winnerObj.survivalTime) });
    losers.forEach((l, index) => { 
        finalResults.push({ ...l, place: (winnerObj ? 2 : 1) + index, durationStr: fmt(l.survivalTime) }); 
    });

    finalResults.forEach(res => {
        if (accounts[res.username]) {
            if (res.place === 1) accounts[res.username].wins++;
            if ((res.maxCombo || 0) > (accounts[res.username].bestCombo || 0)) accounts[res.username].bestCombo = res.maxCombo;
            if (!accounts[res.username].history) accounts[res.username].history = [];
            accounts[res.username].history.push({ 
                date: new Date().toISOString(), 
                place: res.place, 
                apm: res.apm, 
                pps: res.pps, 
                sent: res.sent, 
                received: res.recv, 
                maxCombo: res.maxCombo 
            });
        }
    });
    saveAccounts();

    if (winnerName && accounts[winnerName]) {
        const winnerSocket = lobby.players.find(p => p.username === winnerName);
        if (winnerSocket) io.to(winnerSocket.id).emit('update_my_wins', accounts[winnerName].wins);
    }

    io.emit('leaderboard_update', getLeaderboards());
    io.to(roomName).emit('match_summary', finalResults);

    setTimeout(() => {
        if (lobby.players.length >= 2) checkStart(lobby, roomName);
        else { lobby.state = 'waiting'; io.to(roomName).emit('lobby_reset'); }
    }, 10000);
}

function getLeaderboards() {
    const allUsers = Object.entries(accounts);
    const wins = allUsers.map(([n, d]) => ({ name: n, val: d.wins })).sort((a, b) => b.val - a.val).slice(0, 5);
    const combos = allUsers.map(([n, d]) => ({ name: n, val: d.bestCombo || 0 })).filter(u => u.val > 0).sort((a, b) => b.val - a.val).slice(0, 5);
    return { wins, combos };
}

http.listen(3000, () => { console.log('SERVER RUNNING ON PORT 3000'); });
