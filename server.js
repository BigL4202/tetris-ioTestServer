// --- IMPORTS & SETUP ---
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- DATABASE CONFIGURATION (MongoDB + Local Fallback) ---
const accountSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: String,
    wins: { type: Number, default: 0 },
    bestAPM: { type: Number, default: 0 },
    bestCombo: { type: Number, default: 0 },
    history: { type: Array, default: [] }
});

const Account = mongoose.model('Account', accountSchema);
let useMongoDB = false;
let localAccounts = {};

// 1. Try connecting to MongoDB (for Render)
const MONGO_URI = process.env.MONGO_URI; 
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => { console.log("CONNECTED TO MONGODB"); useMongoDB = true; })
        .catch(err => console.error("MongoDB Error:", err));
} else {
    // 2. Fallback to Local File (for your PC)
    console.log("USING LOCAL STORAGE (accounts.json)");
    loadLocalAccounts();
}

const DATA_FILE = path.join(__dirname, 'accounts.json');
function loadLocalAccounts() {
    try { if (fs.existsSync(DATA_FILE)) localAccounts = JSON.parse(fs.readFileSync(DATA_FILE)); } catch (err) { localAccounts = {}; }
}
function saveLocalAccounts() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(localAccounts, null, 2)); } catch (err) {}
}

// --- DATA HELPERS ---
async function getAccount(username) {
    if (useMongoDB) return await Account.findOne({ username });
    return localAccounts[username];
}

async function createAccount(data) {
    if (useMongoDB) {
        const newAcc = new Account(data);
        await newAcc.save();
        return newAcc;
    }
    localAccounts[data.username] = data;
    saveLocalAccounts();
    return data;
}

async function updateAccount(username, updates) {
    if (useMongoDB) {
        await Account.updateOne({ username }, updates);
    } else {
        const acc = localAccounts[username];
        if (!acc) return;
        // Simple manual implementation of MongoDB update operators
        if (updates.$inc) { if (updates.$inc.wins) acc.wins = (acc.wins || 0) + 1; }
        if (updates.$max) {
            if (updates.$max.bestCombo) acc.bestCombo = Math.max(acc.bestCombo || 0, updates.$max.bestCombo);
            if (updates.$max.bestAPM) acc.bestAPM = Math.max(acc.bestAPM || 0, updates.$max.bestAPM);
        }
        if (updates.$push) {
            if (!acc.history) acc.history = [];
            acc.history.push(updates.$push.history);
        }
        saveLocalAccounts();
    }
}

async function getLeaderboards() {
    let all = useMongoDB ? await Account.find({}) : Object.values(localAccounts);
    return {
        wins: all.map(d => ({ name: d.username, val: d.wins })).sort((a, b) => b.val - a.val).slice(0, 5),
        combos: all.map(d => ({ name: d.username, val: d.bestCombo || 0 })).filter(u => u.val > 0).sort((a, b) => b.val - a.val).slice(0, 5)
    };
}

// --- GAME LOGIC ---
let ffaLobby = {
    players: [],      
    state: 'waiting', 
    seed: 12345,
    matchStats: [],
    startTime: 0,
    timer: null
};

// --- WATCHDOG (Fixes Stuck Lobbies) ---
setInterval(() => {
    const now = Date.now();
    
    // 1. Kick inactive players
    if (ffaLobby.state === 'playing') {
        const afk = ffaLobby.players.filter(p => p.alive && (now - p.lastActivity > 15000));
        afk.forEach(p => {
            io.to(p.id).emit('force_disconnect', 'Kicked for inactivity.');
            handleDeath(p.id, { apm: 0 }, "AFK");
            removePlayer(p.id);
        });
    }

    // 2. Reset empty active lobbies
    if (ffaLobby.state !== 'waiting' && ffaLobby.players.length === 0) {
        forceReset();
    }
    
    // 3. Force end if 1 player left in playing state
    if (ffaLobby.state === 'playing' && ffaLobby.players.filter(p => p.alive).length <= 1) {
        checkWin();
    }
}, 1000);

// --- SOCKETS ---
io.on('connection', (socket) => {
    
    // LOGIN
    socket.on('login_attempt', async (data) => {
        const user = data.username.trim().substring(0, 12);
        if (!user) return;
        
        let acc = await getAccount(user);
        if (!acc) acc = await createAccount({ username: user, password: data.password, wins: 0 });
        else if (acc.password !== data.password) return socket.emit('login_response', { success: false, msg: "Wrong Password" });

        socket.username = user;
        socket.emit('login_response', { success: true, username: user, wins: acc.wins, bestAPM: acc.bestAPM || 0 });
        io.emit('leaderboard_update', await getLeaderboards());
    });

    // LOBBY JOIN
    socket.on('join_ffa', () => {
        if (!socket.username) return;
        removePlayer(socket.id);
        socket.join('lobby_ffa');

        const pData = { 
            id: socket.id, 
            username: socket.username, 
            alive: true, 
            damageLog: [], 
            lastActivity: Date.now() 
        };

        // If game is finished, treat as waiting so new players can join next round
        if (ffaLobby.state === 'finished') ffaLobby.state = 'waiting';

        ffaLobby.players.push(pData);

        if (ffaLobby.state === 'waiting') {
            io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length });
            if (ffaLobby.players.length >= 2) tryStart();
        } else {
            pData.alive = false; // Late joiner = Spectator
            const survivors = ffaLobby.players.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: ffaLobby.seed, players: survivors });
        }
    });

    // GAMEPLAY
    socket.on('update_board', (grid) => {
        const p = ffaLobby.players.find(x => x.id === socket.id);
        if (p) {
            p.lastActivity = Date.now();
            socket.to('lobby_ffa').emit('enemy_board_update', { id: socket.id, grid: grid });
        }
    });

    socket.on('send_garbage', (data) => {
        if (ffaLobby.state !== 'playing') return;
        const sender = ffaLobby.players.find(p => p.id === socket.id);
        if (!sender || !sender.alive) return;
        
        sender.lastActivity = Date.now();
        const targets = ffaLobby.players.filter(p => p.alive && p.id !== socket.id);
        
        if (targets.length > 0) {
            let amount = Math.floor(data.amount / targets.length);
            if (data.amount >= 4 && amount === 0) amount = 1; // Pity garbage
            
            if (amount > 0) {
                targets.forEach(t => {
                    t.damageLog.push({ attacker: sender.username, amount: amount, time: Date.now() });
                    io.to(t.id).emit('receive_garbage', amount);
                });
            }
        }
    });

    socket.on('player_died', (stats) => handleDeath(socket.id, stats, "Gravity"));
    
    socket.on('match_won', (stats) => {
        if (ffaLobby.state === 'playing') finishGame(socket.username, stats);
    });

    socket.on('submit_apm', async (val) => {
        if (socket.username) {
            await updateAccount(socket.username, { $max: { bestAPM: parseInt(val)||0 } });
        }
    });

    socket.on('send_chat', (msg) => {
        const clean = msg.replace(/</g, "&lt;").substring(0, 50);
        io.emit('receive_chat', { user: socket.username || "Anon", text: clean });
    });

    socket.on('disconnect', () => removePlayer(socket.id));
    socket.on('leave_lobby', () => removePlayer(socket.id));
    socket.on('request_all_stats', async () => socket.emit('receive_all_stats', useMongoDB ? await getAllStatsFromDB() : localAccounts));
});

// --- HELPER LOGIC ---

async function getAllStatsFromDB() {
    const all = await Account.find({});
    const out = {};
    all.forEach(a => out[a.username] = a);
    return out;
}

function removePlayer(id) {
    const idx = ffaLobby.players.findIndex(p => p.id === id);
    if (idx !== -1) {
        const p = ffaLobby.players[idx];
        ffaLobby.players.splice(idx, 1);
        
        if (ffaLobby.state === 'playing' && p.alive) {
            io.to('lobby_ffa').emit('elimination', { username: p.username, killer: "Disconnect" });
            checkWin();
        }
        
        if (ffaLobby.players.length < 2 && ffaLobby.state !== 'finished') {
            forceReset();
        } else {
            io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length });
        }
    }
}

function tryStart() {
    if (ffaLobby.state === 'waiting' && ffaLobby.players.length >= 2) {
        ffaLobby.state = 'countdown';
        ffaLobby.seed = Math.floor(Math.random() * 1000000);
        ffaLobby.matchStats = [];
        
        ffaLobby.players.forEach(p => { p.alive = true; p.damageLog = []; p.lastActivity = Date.now(); });
        
        // SYNC FIX: Send Target Timestamp (Current + 3000ms)
        io.to('lobby_ffa').emit('start_countdown', { targetTime: Date.now() + 3000 });
        
        ffaLobby.timer = setTimeout(() => {
            ffaLobby.state = 'playing';
            ffaLobby.startTime = Date.now();
            io.to('lobby_ffa').emit('match_start', { 
                mode: 'ffa', 
                seed: ffaLobby.seed, 
                players: ffaLobby.players.map(p => ({ id: p.id, username: p.username })) 
            });
        }, 3000);
    }
}

function handleDeath(id, stats, defaultKiller) {
    const p = ffaLobby.players.find(x => x.id === id);
    if (p && ffaLobby.state === 'playing' && p.alive) {
        p.alive = false;
        
        // Calculate Killer
        let killer = defaultKiller;
        const recent = p.damageLog.filter(l => Date.now() - l.time < 15000);
        if (recent.length > 0) {
            const tally = {};
            recent.forEach(r => tally[r.attacker] = (tally[r.attacker] || 0) + r.amount);
            killer = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);
        }

        recordStat(p.username, stats, false);
        io.to('lobby_ffa').emit('elimination', { username: p.username, killer: killer });
        checkWin();
    }
}

function checkWin() {
    const alive = ffaLobby.players.filter(p => p.alive);
    if (alive.length === 1) {
        io.to(alive[0].id).emit('request_win_stats'); // Ask winner for their final stats
    } else if (alive.length === 0) {
        finishGame(null, {}); // Draw
    }
}

function recordStat(user, stats, winner) {
    if (ffaLobby.matchStats.find(s => s.username === user)) return;
    ffaLobby.matchStats.push({ 
        username: user, 
        isWinner: winner, 
        ...stats, 
        survivalTime: Date.now() - ffaLobby.startTime 
    });
}

async function finishGame(winnerName, winnerStats) {
    if (ffaLobby.state === 'finished') return;
    ffaLobby.state = 'finished';

    if (winnerName) recordStat(winnerName, winnerStats, true);

    // Sort Results
    const results = ffaLobby.matchStats.sort((a, b) => {
        if (a.isWinner) return -1;
        if (b.isWinner) return 1;
        return b.survivalTime - a.survivalTime;
    }).map((r, i) => ({
        ...r,
        place: i + 1,
        durationStr: `${Math.floor(r.survivalTime/60000)}m ${Math.floor((r.survivalTime%60000)/1000)}s`
    }));

    // Update DB
    for (const res of results) {
        const update = {
            $max: { bestCombo: res.maxCombo || 0, bestAPM: res.apm || 0 },
            $push: { history: { date: new Date().toISOString(), ...res } }
        };
        if (res.place === 1) update.$inc = { wins: 1 };
        await updateAccount(res.username, update);
    }

    // Notify Clients
    if (winnerName) {
        const acc = await getAccount(winnerName);
        const sock = ffaLobby.players.find(p => p.username === winnerName);
        if (sock) io.to(sock.id).emit('update_my_wins', acc.wins);
    }

    io.emit('leaderboard_update', await getLeaderboards());
    io.to('lobby_ffa').emit('match_summary', results);

    // Reset
    setTimeout(forceReset, 5000);
}

function forceReset() {
    ffaLobby.state = 'waiting';
    ffaLobby.matchStats = [];
    clearTimeout(ffaLobby.timer);
    io.to('lobby_ffa').emit('lobby_reset');
    if (ffaLobby.players.length >= 2) tryStart();
}

http.listen(3000, () => console.log('SERVER RUNNING PORT 3000'));
