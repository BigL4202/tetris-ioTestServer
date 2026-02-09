const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- PERSISTENCE (data.json) ---
const DATA_FILE = 'data.json';
let users = {}; 
// Structure: { username: { password, wins, bestAPM, duelHistory: [] } }

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

// --- ACTIVE STATE ---
let players = {}; // { socketId: { username, room, state } }
let duels = {};   // { duelId: { p1, p2, scores: {id:0}, round: 1, active: true } }

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

    // --- AUTHENTICATION ---
    socket.on('login_attempt', (data) => {
        const { username, password } = data;
        
        if (!users[username]) {
            // New Registration
            users[username] = { password, wins: 0, bestAPM: 0, duelHistory: [] };
            saveData();
        } else if (users[username].password !== password) {
            return socket.emit('login_response', { success: false, msg: 'Invalid Password' });
        }
        
        players[socket.id].username = username;
        
        socket.emit('login_response', { 
            success: true, 
            username, 
            wins: users[username].wins, 
            bestAPM: users[username].bestAPM 
        });
        
        io.emit('player_list_update', getPublicList());
    });

    // --- STANDARD MODES ---
    socket.on('join_ffa', () => {
        const p = players[socket.id];
        p.room = 'ffa';
        p.state = 'playing';
        socket.leave('lobby');
        socket.join('ffa');
        
        io.to('ffa').emit('chat_system', `${p.username} joined the FFA Arena.`);
        
        // Send start signal immediately
        socket.emit('match_start', { 
            mode: 'ffa', 
            seed: Math.random() * 10000, 
            players: getRoomPlayers('ffa') 
        });
        
        io.emit('player_list_update', getPublicList());
    });

    socket.on('leave_lobby', () => {
        const p = players[socket.id];
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

    // --- DUEL SYSTEM (1v1) ---

    // 1. Challenge Request
    socket.on('duel_challenge', (targetId) => {
        const sender = players[socket.id];
        const target = players[targetId];
        
        if (target && target.id !== socket.id) {
            // Send PRIVATE Invite
            io.to(targetId).emit('receive_challenge', { 
                fromId: socket.id, 
                fromName: sender.username 
            });
            socket.emit('chat_system', `Duel request sent to ${target.username}.`);
        }
    });

    // 2. Challenge Accepted
    socket.on('duel_accept', (challengerId) => {
        const p1 = players[challengerId]; // Challenger
        const p2 = players[socket.id];    // Acceptor

        if (!p1 || p1.room !== 'lobby') {
            return socket.emit('chat_system', 'Challenge expired or player busy.');
        }

        // Create Duel Session
        const duelId = `duel_${Date.now()}`;
        duels[duelId] = {
            id: duelId,
            p1: p1.id,
            p2: p2.id,
            scores: { [p1.id]: 0, [p2.id]: 0 },
            round: 1,
            active: true
        };

        // Move Players to Private Room
        [p1, p2].forEach(p => {
            const s = io.sockets.sockets.get(p.id);
            if (s) {
                s.leave('lobby');
                s.join(duelId);
                p.room = duelId;
                p.state = 'dueling';
            }
        });

        // Broadcast to Global Chat
        io.emit('chat_system', `⚔️ DUEL STARTED: ${p1.username} vs ${p2.username}`);
        io.emit('player_list_update', getPublicList());

        // Start Round 1
        startDuelRound(duelId);
    });

    function startDuelRound(duelId) {
        const duel = duels[duelId];
        if (!duel || !duel.active) return;

        const p1Name = players[duel.p1].username;
        const p2Name = players[duel.p2].username;

        // Send Ready Signal
        io.to(duelId).emit('duel_round_init', {
            s1: duel.scores[duel.p1],
            s2: duel.scores[duel.p2],
            n1: p1Name,
            n2: p2Name,
            round: duel.round
        });

        // Start Game
        io.to(duelId).emit('match_start', {
            mode: 'duel',
            seed: Math.random() * 10000,
            players: [{id: duel.p1, username: p1Name}, {id: duel.p2, username: p2Name}]
        });
    }

    // 3. Loss Reported (Round Over)
    socket.on('duel_report_loss', () => {
        const loserId = socket.id;
        const p = players[loserId];
        if (!p.room.startsWith('duel_')) return;

        const duel = duels[p.room];
        if (!duel || !duel.active) return;

        // Determine Winner
        const winnerId = (duel.p1 === loserId) ? duel.p2 : duel.p1;
        
        // Update Stats
        duel.scores[winnerId]++;
        duel.round++;

        const sWin = duel.scores[winnerId];
        const sLose = duel.scores[loserId];
        const winnerName = players[winnerId].username;

        // Broadcast Round Result
        io.emit('chat_system', `[DUEL] ${players[duel.p1].username} (${duel.scores[duel.p1]}) - (${duel.scores[duel.p2]}) ${players[duel.p2].username}`);

        // CHECK WIN CONDITION: First to 6, Win by 2
        if (sWin >= 6 && (sWin - sLose) >= 2) {
            // SET OVER
            io.emit('chat_system', `🏆 ${winnerName} WINS THE DUEL SET!`);
            
            // Record History
            recordDuelHistory(duel.p1, duel.p2, duel.scores[duel.p1], duel.scores[duel.p2], (winnerId === duel.p1));
            
            // End Match
            io.to(duel.id).emit('duel_set_over', { 
                winner: winnerName, 
                score: `${duel.scores[duel.p1]} - ${duel.scores[duel.p2]}` 
            });
            
            endDuel(duel.id);
        } else {
            // Next Round
            io.to(duel.id).emit('chat_system', `Round to ${winnerName}. Next round starting...`);
            setTimeout(() => startDuelRound(duel.id), 3000);
        }
    });

    function recordDuelHistory(id1, id2, s1, s2, p1Won) {
        const u1Name = players[id1].username;
        const u2Name = players[id2].username;
        const date = new Date().toISOString();

        if (users[u1Name]) {
            users[u1Name].duelHistory.push({ 
                result: p1Won ? 'WIN' : 'LOSS', 
                opponent: u2Name, 
                score: `${s1}-${s2}`, 
                date 
            });
            if (p1Won) users[u1Name].wins++;
        }
        if (users[u2Name]) {
            users[u2Name].duelHistory.push({ 
                result: p1Won ? 'LOSS' : 'WIN', 
                opponent: u1Name, 
                score: `${s2}-${s1}`, 
                date 
            });
            if (!p1Won) users[u2Name].wins++;
        }
        saveData();
    }

    function endDuel(duelId) {
        const duel = duels[duelId];
        if (!duel) return;
        duel.active = false;
        
        [duel.p1, duel.p2].forEach(pid => {
            const s = io.sockets.sockets.get(pid);
            if (s) {
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
            
            io.to(winnerId).emit('chat_system', "Opponent Disconnected. You win by default!");
            io.to(winnerId).emit('duel_set_over', { winner: players[winnerId].username, score: "FF" });

            // Record FF
            recordDuelHistory(duel.p1, duel.p2, "FF", "FF", (winnerId === duel.p1));
            endDuel(duel.id);
        }
    }


    // --- GAMEPLAY RELAY ---
    socket.on('update_board', (grid) => {
        socket.to(players[socket.id].room).emit('enemy_board_update', { id: socket.id, grid });
    });
    
    socket.on('send_garbage', (data) => {
        socket.to(players[socket.id].room).emit('receive_garbage', data.amount);
    });

    socket.on('send_chat', (msg) => {
        io.emit('receive_chat', { user: players[socket.id].username, text: msg });
    });

    socket.on('submit_apm', (apm) => {
        const p = players[socket.id];
        if (users[p.username]) {
            if (parseInt(apm) > users[p.username].bestAPM) {
                users[p.username].bestAPM = parseInt(apm);
                saveData();
                socket.emit('update_my_apm', users[p.username].bestAPM);
            }
        }
    });

    socket.on('request_all_stats', () => {
        socket.emit('receive_all_stats', users);
    });

    socket.on('disconnect', () => {
        handleDuelDisconnect(socket.id);
        delete players[socket.id];
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
