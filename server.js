const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- PERSISTENCE (data.json) ---
const DATA_FILE = 'data.json';
let users = {}; 

// Load stats on startup
if (fs.existsSync(DATA_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (e) {
        console.log("Error loading stats:", e);
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// --- GLOBAL STATE ---
let players = {}; // { socketId: { username, room, state } }
let duels = {};   // { duelId: { p1, p2, scores: {id:0}, round: 1, active: true } }
let challenges = {}; // { challengerId: { targetId, timestamp } }

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);
    
    // Default Init
    players[socket.id] = { 
        id: socket.id, 
        username: `Guest${socket.id.substr(0,4)}`, 
        room: 'lobby', 
        state: 'idle' 
    };
    socket.join('lobby');

    // --- LOGIN / REGISTER ---
    socket.on('login_attempt', (data) => {
        const { username, password } = data;
        
        if (!users[username]) {
            // New Registration with ALL stats tracked
            users[username] = { 
                password, 
                wins: 0, 
                gamesPlayed: 0,
                bestAPM: 0, 
                totalAPM: 0,   // Used for Avg APM
                maxCombo: 0, 
                totalSent: 0,
                totalRecv: 0,
                duelHistory: [] 
            };
            saveData();
        } else if (users[username].password !== password) {
            return socket.emit('login_response', { success: false, msg: 'Invalid Password' });
        }
        
        // Data Migration (Backfill old accounts)
        const u = users[username];
        if(u.gamesPlayed === undefined) u.gamesPlayed = 0;
        if(u.totalAPM === undefined) u.totalAPM = 0;
        if(u.totalSent === undefined) u.totalSent = 0;
        if(u.totalRecv === undefined) u.totalRecv = 0;
        if(u.maxCombo === undefined) u.maxCombo = 0;

        players[socket.id].username = username;
        
        // Calculate Avg APM for immediate UI update
        const avgAPM = u.gamesPlayed > 0 ? Math.floor(u.totalAPM / u.gamesPlayed) : 0;

        socket.emit('login_response', { 
            success: true, 
            username, 
            wins: u.wins, 
            bestAPM: u.bestAPM,
            avgAPM: avgAPM
        });
        
        io.emit('player_list_update', getPublicList());
        broadcastLeaderboards();
    });

    // --- STANDARD MODES ---
    socket.on('join_ffa', () => {
        const p = players[socket.id];
        p.room = 'ffa';
        p.state = 'playing';
        socket.leave('lobby');
        socket.join('ffa');
        
        // Broadcast join to others in FFA
        socket.to('ffa').emit('receive_chat', { user: '[SYSTEM]', text: `${p.username} joined.` });
        
        // Start match immediately
        socket.emit('match_start', { 
            mode: 'ffa', 
            seed: Math.random() * 10000, 
            players: getRoomPlayers('ffa') 
        });
        
        io.emit('player_list_update', getPublicList());
    });

    socket.on('leave_lobby', () => {
        const p = players[socket.id];
        if(!p) return;

        if (p.room.startsWith('duel_')) {
            handleDuelDisconnect(socket.id);
        } else {
            socket.leave(p.room);
            p.room = 'lobby';
            p.state = 'idle';
            socket.join('lobby');
        }
        io.emit('player_list_update', getPublicList());
    });

    // --- DUEL SYSTEM (UPDATED) ---

    // 1. Challenge Request
    socket.on('duel_challenge', (targetId) => {
        // Limit: 1 active challenge at a time
        if (challenges[socket.id]) {
            return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'You already have a pending challenge.' });
        }

        const sender = players[socket.id];
        const target = players[targetId];
        
        if (target && target.id !== socket.id) {
            // Register challenge
            challenges[socket.id] = { targetId: targetId, timestamp: Date.now() };
            
            // Auto-expire after 60 seconds
            setTimeout(() => {
                if (challenges[socket.id]) {
                    delete challenges[socket.id];
                    socket.emit('receive_chat', { user: '[SYSTEM]', text: `Challenge to ${target.username} expired.` });
                }
            }, 60000);

            // Send invite to target
            io.to(targetId).emit('receive_challenge', { 
                fromId: socket.id, 
                fromName: sender.username 
            });
            socket.emit('receive_chat', { user: '[SYSTEM]', text: `Challenge sent to ${target.username}.` });
        }
    });

    // 2. Accept Challenge
    socket.on('duel_accept', (challengerId) => {
        const p1 = players[challengerId]; // Challenger
        const p2 = players[socket.id];    // Acceptor

        if (!p1 || !challenges[challengerId] || challenges[challengerId].targetId !== socket.id) {
            return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'Challenge expired or invalid.' });
        }
        
        // Clear request
        delete challenges[challengerId];

        // LOGIC: If players are in FFA, announce disconnect
        [p1, p2].forEach(p => {
            if (p.room === 'ffa') {
                socket.to('ffa').emit('elimination', { username: p.username, killer: "DISCONNECT" });
            }
        });

        // Create Duel Room
        const duelId = `duel_${Date.now()}`;
        duels[duelId] = {
            id: duelId,
            p1: p1.id,
            p2: p2.id,
            scores: { [p1.id]: 0, [p2.id]: 0 },
            round: 1,
            active: true
        };

        // Move players (Force Switch)
        [p1, p2].forEach(p => {
            const s = io.sockets.sockets.get(p.id);
            if(s) {
                s.leave(p.room);
                s.join(duelId);
                p.room = duelId;
                p.state = 'dueling';
            }
        });

        io.emit('player_list_update', getPublicList());
        io.to(duelId).emit('receive_chat', { user: '[SYSTEM]', text: `⚔️ DUEL STARTED` });
        
        startDuelRound(duelId);
    });

    function startDuelRound(duelId) {
        const duel = duels[duelId];
        if (!duel || !duel.active) return;

        const p1Name = players[duel.p1].username;
        const p2Name = players[duel.p2].username;

        // Update Scoreboard UI
        io.to(duelId).emit('duel_round_init', {
            s1: duel.scores[duel.p1],
            s2: duel.scores[duel.p2],
            n1: p1Name,
            n2: p2Name
        });

        // Start Game Engine
        io.to(duelId).emit('match_start', {
            mode: 'duel',
            seed: Math.random() * 10000,
            players: [{id: duel.p1, username: p1Name}, {id: duel.p2, username: p2Name}]
        });
    }

    // 3. Report Loss (Round Over)
    socket.on('duel_report_loss', (stats) => {
        const p = players[socket.id];
        if (!p || !p.room.startsWith('duel_')) return;

        // Update user stats (Loss)
        updateUserStats(p.username, stats, false);

        const duel = duels[p.room];
        if (!duel || !duel.active) return;

        // Winner is the other person
        const winnerId = (duel.p1 === socket.id) ? duel.p2 : duel.p1;
        
        // Increment Score
        duel.scores[winnerId]++;
        duel.round++;

        const sWin = duel.scores[winnerId];
        const sLose = duel.scores[socket.id];
        const winnerName = players[winnerId].username;

        io.to(duel.id).emit('receive_chat', { user: '[DUEL]', text: `${p.username} topped out.` });

        // CHECK WIN: First to 6, Win by 2
        if (sWin >= 6 && (sWin - sLose) >= 2) {
            io.to(duel.id).emit('receive_chat', { user: '[DUEL]', text: `🏆 ${winnerName} WINS THE SET!` });
            
            // Record History
            recordDuelHistory(duel.p1, duel.p2, duel.scores[duel.p1], duel.scores[duel.p2], (winnerId === duel.p1));
            
            io.to(duel.id).emit('duel_set_over', { 
                winner: winnerName, 
                score: `${duel.scores[duel.p1]} - ${duel.scores[duel.p2]}` 
            });
            
            endDuel(duel.id);
        } else {
            // Next round
            setTimeout(() => startDuelRound(duel.id), 3000);
        }
    });

    // Manual APM submit (for APM Test mode)
    socket.on('submit_stats_manual', (stats) => {
        if(players[socket.id]) {
            updateUserStats(players[socket.id].username, stats, false); // Won doesn't matter for pure stats
        }
    });

    // FFA Death
    socket.on('player_died', (stats) => {
        if(players[socket.id]) {
            updateUserStats(players[socket.id].username, stats, false);
            socket.to(players[socket.id].room).emit('elimination', { username: players[socket.id].username, killer: "GRAVITY" });
        }
    });

    function updateUserStats(username, stats, won) {
        if(users[username] && stats) {
            const u = users[username];
            u.gamesPlayed++;
            
            if(stats.sent) u.totalSent += stats.sent;
            if(stats.recv) u.totalRecv += stats.recv;
            if(stats.apm) u.totalAPM += stats.apm;
            
            if(stats.apm > u.bestAPM) u.bestAPM = stats.apm;
            if(stats.maxCombo > u.maxCombo) u.maxCombo = stats.maxCombo;
            
            saveData();
            broadcastLeaderboards();
        }
    }

    function recordDuelHistory(id1, id2, s1, s2, p1Won) {
        const u1 = users[players[id1].username];
        const u2 = users[players[id2].username];
        const date = new Date().toISOString();

        if(u1) {
            u1.duelHistory.push({ result: p1Won?'WIN':'LOSS', opponent: players[id2].username, score: `${s1}-${s2}`, date });
            if(p1Won) u1.wins++;
        }
        if(u2) {
            u2.duelHistory.push({ result: p1Won?'LOSS':'WIN', opponent: players[id1].username, score: `${s2}-${s1}`, date });
            if(!p1Won) u2.wins++;
        }
        saveData();
        broadcastLeaderboards();
    }

    function endDuel(duelId) {
        const duel = duels[duelId];
        if(!duel) return;
        duel.active = false;
        
        [duel.p1, duel.p2].forEach(pid => {
            const s = io.sockets.sockets.get(pid);
            if(s) {
                s.leave(duelId);
                s.join('lobby');
                players[pid].room = 'lobby';
                players[pid].state = 'idle';
            }
        });
        delete duels[duelId];
        io.emit('player_list_update', getPublicList());
    }

    function handleDuelDisconnect(socketId) {
        const p = players[socketId];
        if (!p || !p.room.startsWith('duel_')) return;
        const duel = duels[p.room];
        
        if (duel && duel.active) {
            const winnerId = (duel.p1 === socketId) ? duel.p2 : duel.p1;
            io.to(winnerId).emit('receive_chat', { user: '[SYSTEM]', text: "Opponent disconnected. You win!" });
            io.to(winnerId).emit('duel_set_over', { winner: players[winnerId].username, score: "FF" });
            
            recordDuelHistory(duel.p1, duel.p2, "FF", "FF", (winnerId === duel.p1));
            endDuel(duel.id);
        }
    }

    function broadcastLeaderboards() {
        const allUsers = Object.entries(users).map(([name, data]) => ({ name, ...data }));
        
        // Sort by Wins
        const byWins = [...allUsers].sort((a,b) => b.wins - a.wins).slice(0, 10);
        
        // Sort by Max Combo
        const byCombo = [...allUsers].sort((a,b) => b.maxCombo - a.maxCombo).slice(0, 10);
        
        io.emit('leaderboard_update', { wins: byWins, combo: byCombo });
    }

    // --- RELAYS ---
    socket.on('update_board', (grid) => {
        if(players[socket.id]) {
            socket.to(players[socket.id].room).emit('enemy_board_update', { id: socket.id, grid });
        }
    });
    
    socket.on('send_garbage', (data) => {
        if(players[socket.id]) {
            socket.to(players[socket.id].room).emit('receive_garbage', data.amount);
        }
    });

    socket.on('send_chat', (msg) => {
        io.emit('receive_chat', { user: players[socket.id].username, text: msg });
    });

    socket.on('request_all_stats', () => {
        socket.emit('receive_all_stats', users);
    });

    socket.on('disconnect', () => {
        handleDuelDisconnect(socket.id);
        delete players[socket.id];
        if(challenges[socket.id]) delete challenges[socket.id]; // Remove pending
        io.emit('player_list_update', getPublicList());
        console.log('Disconnected:', socket.id);
    });

    function getPublicList() {
        return Object.values(players).map(p => ({ id: p.id, name: p.username, state: p.state }));
    }
    function getRoomPlayers(room) {
        return Object.values(players).filter(p => p.room === room).map(p => ({ id: p.id, username: p.username }));
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on ${PORT}`));
