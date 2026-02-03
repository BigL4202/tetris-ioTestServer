// --- IMPORTS & SETUP ---
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

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

// --- GAME STATE ---
function createLobby() {
    return { players: [], state: 'waiting', seed: 12345, matchStats: [], startTime: 0, timer: null };
}

let lobbies = {
    'ffa': createLobby(),
    'madness': createLobby()
};

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    
    socket.on('send_chat', (msg) => {
        const cleanMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 50);
        const name = socket.username || "Anon";
        if (socket.rooms.has('lobby_ffa')) io.to('lobby_ffa').emit('receive_chat', { user: name, text: cleanMsg });
        else if (socket.rooms.has('lobby_madness')) io.to('lobby_madness').emit('receive_chat', { user: name, text: cleanMsg });
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
            safeData[key] = { wins: val.wins, bestAPM: val.bestAPM, bestCombo: val.bestCombo || 0, history: val.history || [] };
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

    // --- LOBBY MANAGEMENT ---
    function removeFromLobby(type) {
        const lobby = lobbies[type];
        const roomName = 'lobby_' + type;
        const idx = lobby.players.findIndex(p => p.id === socket.id);
        
        if (idx !== -1) {
            const p = lobby.players[idx];
            lobby.players.splice(idx, 1);
            socket.leave(roomName);
            io.to(roomName).emit('lobby_update', { count: lobby.players.length });
            
            if (lobby.state === 'playing' && p.alive) {
                io.to(roomName).emit('elimination', { username: p.username, killer: "Disconnect" });
                checkWinCondition(type);
            }
            
            if (lobby.players.length < 2 && lobby.state === 'countdown') {
                lobby.state = 'waiting';
                clearTimeout(lobby.timer);
                io.to(roomName).emit('lobby_reset');
            }
        }
    }

    function leaveAll() {
        removeFromLobby('ffa');
        removeFromLobby('madness');
    }

    socket.on('leave_lobby', () => { leaveAll(); });
    socket.on('disconnect', () => { leaveAll(); });

    socket.on('join_ffa', () => {
        if (!socket.username) return;
        leaveAll();
        socket.join('lobby_ffa');
        const lobby = lobbies['ffa'];
        const pData = { id: socket.id, username: socket.username, alive: true, damageLog: [] };
        
        if (lobby.state === 'waiting' || lobby.state === 'finished') {
            lobby.players.push(pData);
            io.to('lobby_ffa').emit('lobby_update', { count: lobby.players.length });
            tryStartGame('ffa');
        } else {
            pData.alive = false;
            lobby.players.push(pData);
            const living = lobby.players.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: lobby.seed, players: living });
        }
    });

    socket.on('join_madness', (passiveChoice) => {
        if (!socket.username) return;
        leaveAll();
        socket.join('lobby_madness');
        const lobby = lobbies['madness'];
        const pData = { 
            id: socket.id, 
            username: socket.username, 
            alive: true, 
            damageLog: [],
            passive: passiveChoice || 'double_hold'
        };

        if (lobby.state === 'waiting' || lobby.state === 'finished') {
            lobby.players.push(pData);
            io.to('lobby_madness').emit('lobby_update', { count: lobby.players.length });
            tryStartGame('madness');
        } else {
            pData.alive = false;
            lobby.players.push(pData);
            const living = lobby.players.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: lobby.seed, players: living });
        }
    });

    // --- GAMEPLAY ---
    socket.on('update_board', (grid) => {
        if (socket.rooms.has('lobby_ffa')) socket.to('lobby_ffa').emit('enemy_board_update', { id: socket.id, grid: grid });
        if (socket.rooms.has('lobby_madness')) socket.to('lobby_madness').emit('enemy_board_update', { id: socket.id, grid: grid });
    });

    socket.on('send_garbage', (data) => {
        let type = null;
        if (socket.rooms.has('lobby_ffa')) type = 'ffa';
        else if (socket.rooms.has('lobby_madness')) type = 'madness';

        if (type) {
            const lobby = lobbies[type];
            if (lobby.state === 'playing') {
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
        }
    });

    socket.on('player_died', (stats) => {
        let type = null;
        if (socket.rooms.has('lobby_ffa')) type = 'ffa';
        else if (socket.rooms.has('lobby_madness')) type = 'madness';

        if (type) {
            const lobby = lobbies[type];
            const p = lobby.players.find(x => x.id === socket.id);
            if (p && lobby.state === 'playing' && p.alive) {
                p.alive = false;
                
                let killer = "Gravity";
                const recent = p.damageLog.filter(l => Date.now() - l.time < 15000);
                if (recent.length > 0) {
                    const map = {};
                    recent.forEach(l => map[l.attacker] = (map[l.attacker] || 0) + l.amount);
                    killer = Object.keys(map).reduce((a, b) => map[a] > map[b] ? a : b);
                }

                const sTime = Date.now() - lobby.startTime;
                recordMatchStat(lobby, p.username, stats, false, sTime);
                
                io.to('lobby_'+type).emit('elimination', { username: p.username, killer: killer });
                checkWinCondition(type);
            }
        }
    });

    socket.on('match_won', (stats) => {
        let type = null;
        if (socket.rooms.has('lobby_ffa')) type = 'ffa';
        else if (socket.rooms.has('lobby_madness')) type = 'madness';

        if (type) {
            const lobby = lobbies[type];
            const sTime = Date.now() - lobby.startTime;
            recordMatchStat(lobby, socket.username, stats, true, sTime);
            finishGame(type, socket.username);
        }
    });
});

function tryStartGame(type) {
    const lobby = lobbies[type];
    const room = 'lobby_' + type;

    if (lobby.state === 'waiting' && lobby.players.length >= 2) {
        lobby.state = 'countdown';
        lobby.seed = Math.floor(Math.random() * 1000000);
        lobby.matchStats = [];
        lobby.players.forEach(p => { p.alive = true; p.damageLog = []; });

        io.to(room).emit('start_countdown', { duration: 3 });

        lobby.timer = setTimeout(() => {
            lobby.state = 'playing';
            lobby.startTime = Date.now();
            io.to(room).emit('match_start', {
                mode: type,
                seed: lobby.seed,
                players: lobby.players.map(p => ({ id: p.id, username: p.username, passive: p.passive }))
            });
        }, 3000);
    }
}

function checkWinCondition(type) {
    const lobby = lobbies[type];
    const survivors = lobby.players.filter(p => p.alive);
    if (survivors.length <= 1) {
        lobby.state = 'finished';
        if (survivors.length === 1) {
            io.to(survivors[0].id).emit('request_win_stats');
        } else {
            finishGame(type, null);
        }
    }
}

function recordMatchStat(lobby, username, stats, isWinner, sTime) {
    if (lobby.matchStats.find(s => s.username === username)) return;
    lobby.matchStats.push({
        username, isWinner,
        apm: stats.apm||0, pps: stats.pps||0, sent: stats.sent||0, recv: stats.recv||0,
        maxCombo: stats.maxCombo||0, survivalTime: sTime||0,
        timestamp: Date.now()
    });
}

function finishGame(type, winnerName) {
    const lobby = lobbies[type];
    const room = 'lobby_' + type;
    
    const winnerObj = lobby.matchStats.find(s => s.isWinner);
    const losers = lobby.matchStats.filter(s => !s.isWinner).sort((a, b) => b.timestamp - a.timestamp);
    const results = [];
    const fmt = (ms) => `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;

    if (winnerObj) results.push({ ...winnerObj, place: 1, durationStr: fmt(winnerObj.survivalTime) });
    losers.forEach((l, index) => { results.push({ ...l, place: (winnerObj ? 2 : 1) + index, durationStr: fmt(l.survivalTime) }); });

    results.forEach(res => {
        if (accounts[res.username]) {
            if (res.place === 1) accounts[res.username].wins++;
            if ((res.maxCombo||0) > (accounts[res.username].bestCombo||0)) accounts[res.username].bestCombo = res.maxCombo;
            if (!accounts[res.username].history) accounts[res.username].history = [];
            accounts[res.username].history.push({ date: new Date().toISOString(), place: res.place, apm: res.apm, pps: res.pps, sent: res.sent, received: res.recv, maxCombo: res.maxCombo });
        }
    });
    saveAccounts();

    if (winnerName && accounts[winnerName]) {
        const sock = lobby.players.find(p => p.username === winnerName);
        if (sock) io.to(sock.id).emit('update_my_wins', accounts[winnerName].wins);
    }

    io.emit('leaderboard_update', getLeaderboards());
    io.to(room).emit('match_summary', results);

    setTimeout(() => {
        lobby.state = 'waiting';
        io.to(room).emit('lobby_reset');
        if (lobby.players.length >= 2) tryStartGame(type);
        else io.to(room).emit('lobby_update', { count: lobby.players.length });
    }, 10000);
}

function getLeaderboards() {
    const all = Object.entries(accounts);
    const wins = all.map(([n, d]) => ({ name: n, val: d.wins })).sort((a, b) => b.val - a.val).slice(0, 5);
    const combos = all.map(([n, d]) => ({ name: n, val: d.bestCombo || 0 })).filter(u => u.val > 0).sort((a, b) => b.val - a.val).slice(0, 5);
    return { wins, combos };
}

http.listen(3000, () => { console.log('SERVER RUNNING ON PORT 3000'); });
