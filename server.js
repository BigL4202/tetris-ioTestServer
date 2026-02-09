const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- DATA PERSISTENCE ---
const DATA_FILE = 'data.json';
let users = {}; // { username: { password, wins, bestAPM, history: [] } }

if (fs.existsSync(DATA_FILE)) {
    try { users = JSON.parse(fs.readFileSync(DATA_FILE)); } catch (e) { console.log("Error loading stats", e); }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// --- ACTIVE STATE ---
let players = {}; // { socketId: { username, room, state, ... } }
let duels = {};   // { duelId: { p1, p2, scores: {}, round: 1 } }
let ffaLobby = []; 

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);
    
    // Default State
    players[socket.id] = { id: socket.id, username: `Guest${socket.id.substr(0,4)}`, room: 'menu', state: 'idle' };

    // --- AUTHENTICATION ---
    socket.on('login_attempt', (data) => {
        const { username, password } = data;
        if (!users[username]) {
            // Register
            users[username] = { password, wins: 0, bestAPM: 0, history: [] };
            saveData();
        } else if (users[username].password !== password) {
            return socket.emit('login_response', { success: false, msg: 'Invalid Password' });
        }
        
        players[socket.id].username = username;
        players[socket.id].authenticated = true;
        
        socket.emit('login_response', { 
            success: true, 
            username, 
            wins: users[username].wins, 
            bestAPM: users[username].bestAPM 
        });
        
        io.emit('player_list_update', Object.values(players).map(p => ({
            id: p.id, name: p.username, state: p.state
        })));
    });

    // --- MATCHMAKING & MODES ---
    socket.on('join_ffa', () => {
        const p = players[socket.id];
        p.room = 'ffa';
        p.state = 'playing';
        socket.join('ffa_room');
        
        // Notify existing players
        io.to('ffa_room').emit('chat_system', `${p.username} joined the FFA.`);
        
        // Start match immediately for now (or wait for timer)
        socket.emit('match_start', { 
            mode: 'ffa', 
            seed: Math.random() * 10000, 
            players: getRoomPlayers('ffa_room') 
        });
        
        io.emit('player_list_update', getPublicList());
    });

    socket.on('leave_lobby', () => {
        const p = players[socket.id];
        if (p.room.startsWith('duel_')) {
            // Handle Duel Surrender logic handled in disconnect/report
            handleDuelDisconnect(socket.id);
        }
        socket.leave(p.room);
        p.room = 'menu';
        p.state = 'idle';
        io.emit('player_list_update', getPublicList());
    });

    // --- DUEL SYSTEM (1v1) ---
    
    // 1. Send Challenge
    socket.on('duel_challenge', (targetId) => {
        const sender = players[socket.id];
        const target = players[targetId];
        
        if (target && target.state === 'idle') {
            io.to(targetId).emit('receive_challenge', { fromId: socket.id, fromName: sender.username });
            socket.emit('chat_system', `Challenge sent to ${target.username}.`);
        } else {
            socket.emit('chat_system', `Cannot challenge ${target ? target.username : 'player'}. They might be busy.`);
        }
    });

    // 2. Accept Challenge
    socket.on('duel_accept', (challengerId) => {
        const p1 = players[challengerId]; // Challenger
        const p2 = players[socket.id];    // Accepter (Me)

        if (!p1 || p1.room !== 'menu') {
            return socket.emit('chat_system', 'Challenge expired.');
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
            const sock = io.sockets.sockets.get(p.id);
            if(sock) {
                sock.join(duelId);
                p.room = duelId;
                p.state = 'dueling';
            }
        });

        io.emit('player_list_update', getPublicList());
        
        // Start First Round
        startDuelRound(duelId);
    });

    function startDuelRound(duelId) {
        const duel = duels[duelId];
        if (!duel || !duel.active) return;

        const p1Name = players[duel.p1].username;
        const p2Name = players[duel.p2].username;

        io.to(duelId).emit('duel_update_score', { 
            s1: duel.scores[duel.p1], 
            s2: duel.scores[duel.p2], 
            n1: p1Name, 
            n2: p2Name 
        });

        io.to(duelId).emit('match_start', {
            mode: 'duel',
            seed: Math.random() * 10000,
            players: [{id: duel.p1, username: p1Name}, {id: duel.p2, username: p2Name}]
        });
        
        io.to(duelId).emit('chat_system', `--- ROUND ${duel.round} START ---`);
    }

    // 3. Report Loss (Client Trust)
    socket.on('duel_report_loss', () => {
        const p = players[socket.id];
        if (!p.room.startsWith('duel_')) return;
        
        const duel = duels[p.room];
        if (!duel || !duel.active) return;

        const winnerId = (duel.p1 === socket.id) ? duel.p2 : duel.p1;
        
        // Update Score
        duel.scores[winnerId]++;
        duel.round++;

        const s1 = duel.scores[duel.p1];
        const s2 = duel.scores[duel.p2];
        const p1Name = players[duel.p1].username;
        const p2Name = players[duel.p2].username;

        // Check Win Condition: First to 6 AND Win by 2
        // Map scores to "Winner" and "Loser" for check
        const wScore = duel.scores[winnerId];
        const lScore = duel.scores[socket.id]; // Loser's score

        if (wScore >= 6 && (wScore - lScore) >= 2) {
            // SET OVER
            io.to(duel.id).emit('chat_system', `🏆 ${players[winnerId].username} WINS THE SET!`);
            
            // Record Stats
            recordDuelStat(duel.p1, duel.p2, s1, s2, (duel.p1 === winnerId));
            
            io.to(duel.id).emit('duel_set_over', { 
                winner: players[winnerId].username,
                score: `${s1}-${s2}`
            });

            closeDuel(duel.id);
        } else {
            // Next Round
            io.to(duel.id).emit('chat_system', `${players[socket.id].username} topped out. Point to ${players[winnerId].username}.`);
            setTimeout(() => startDuelRound(duel.id), 3000);
        }
    });

    function recordDuelStat(id1, id2, s1, s2, p1Won) {
        const u1 = users[players[id1].username];
        const u2 = users[players[id2].username];
        const date = new Date().toISOString();
        
        if (u1) {
            u1.history.push({ result: p1Won ? 'WIN' : 'LOSS', opponent: players[id2].username, score: `${s1}-${s2}`, date, mode: '1v1' });
            if(p1Won) u1.wins++;
        }
        if (u2) {
            u2.history.push({ result: p1Won ? 'LOSS' : 'WIN', opponent: players[id1].username, score: `${s2}-${s1}`, date, mode: '1v1' });
            if(!p1Won) u2.wins++;
        }
        saveData();
    }

    function closeDuel(duelId) {
        const duel = duels[duelId];
        if(!duel) return;
        duel.active = false;
        
        [duel.p1, duel.p2].forEach(pid => {
            const sock = io.sockets.sockets.get(pid);
            if(sock) {
                sock.leave(duelId);
                players[pid].room = 'menu';
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
            io.to(winnerId).emit('chat_system', "Opponent disconnected! You win by forfeit.");
            io.to(winnerId).emit('duel_set_over', { winner: players[winnerId].username, score: "FF" });
            
            // Record FF win
            const wName = players[winnerId].username;
            if (users[wName]) {
                users[wName].wins++;
                users[wName].history.push({ result: 'WIN (FF)', opponent: p.username, score: 'FF', date: new Date().toISOString() });
                saveData();
            }
            closeDuel(duel.id);
        }
    }


    // --- GAMEPLAY RELAY (Client Auth) ---
    socket.on('update_board', (grid) => {
        socket.to(players[socket.id].room).emit('enemy_board_update', { id: socket.id, grid });
    });

    socket.on('send_garbage', (data) => {
        // Relay garbage to opponent(s)
        socket.to(players[socket.id].room).emit('receive_garbage', data.amount);
    });

    socket.on('send_chat', (msg) => {
        const room = players[socket.id].room === 'menu' ? 'lobby' : players[socket.id].room; // Simplified chat rooms
        io.emit('receive_chat', { user: players[socket.id].username, text: msg }); // Global chat for now
    });

    // --- UTILS ---
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
        return Object.values(players).filter(p => p.room === room).map(p => ({id: p.id, username: p.username}));
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on ${PORT}`));
