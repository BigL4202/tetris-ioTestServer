const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- PERSISTENCE (data.json) ---
// Saves accounts, wins, APM, and Duel History
const DATA_FILE = 'data.json';
let users = {}; 

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
        
        // Broadcast join to others in FFA
        socket.to('ffa').emit('receive_chat', { user: '[SYSTEM]', text: `${p.username} joined the FFA.` });
        
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

    // --- DUEL SYSTEM (1v1) ---

    // 1. Challenge
    socket.on('duel_challenge', (targetId) => {
        const sender = players[socket.id];
        const target = players[targetId];
        
        if (target && target.id !== socket.id) {
            io.to(targetId).emit('receive_challenge', { 
                fromId: socket.id, 
                fromName: sender.username 
            });
            socket.emit('receive_chat', { user: '[SYSTEM]', text: `Challenge sent to ${target.username}.` });
        }
    });

    // 2. Accept
    socket.on('duel_accept', (challengerId) => {
        const p1 = players[challengerId]; // Challenger
        const p2 = players[socket.id];    // Acceptor

        if (!p1 || p1.room !== 'lobby') {
            return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'Challenge expired or player busy.' });
        }

        const duelId = `duel_${Date.now()}`;
        duels[duelId] = {
            id: duelId,
            p1: p1.id,
            p2: p2.id,
            scores: { [p1.id]: 0, [p2.id]: 0 },
            round: 1,
            active: true
        };

        // Move players
        [p1, p2].forEach(p => {
            const s = io.sockets.sockets.get(p.id);
            if(s) {
                s.leave('lobby');
                s.join(duelId);
                p.room = duelId;
                p.state = 'dueling';
            }
        });

        io.emit('player_list_update', getPublicList());
        io.to(duelId).emit('receive_chat', { user: '[SYSTEM]', text: `⚔️ DUEL STARTED: ${p1.username} vs ${p2.username}` });
        
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

    // 3. Report Loss (Client Trust)
    socket.on('duel_report_loss', () => {
        const p = players[socket.id];
        if (!p || !p.room.startsWith('duel_')) return;

        const duel = duels[p.room];
        if (!duel || !duel.active) return;

        // Winner is the other person
        const winnerId = (duel.p1 === socket.id) ? duel.p2 : duel.p1;
        
        duel.scores[winnerId]++;
        duel.round++;

        const sWin = duel.scores[winnerId];
        const sLose = duel.scores[socket.id];
        const winnerName = players[winnerId].username;

        io.to(duel.id).emit('receive_chat', { user: '[DUEL]', text: `${players[socket.id].username} topped out.` });

        // CHECK WIN: First to 6, Win by 2
        if (sWin >= 6 && (sWin - sLose) >= 2) {
            io.to(duel.id).emit('receive_chat', { user: '[DUEL]', text: `🏆 ${winnerName} WINS THE SET!` });
            
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

    // --- GAMEPLAY RELAY ---
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

    socket.on('submit_apm', (apm) => {
        const p = players[socket.id];
        if(p && users[p.username]) {
            if(parseInt(apm) > users[p.username].bestAPM) {
                users[p.username].bestAPM = parseInt(apm);
                saveData();
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
