const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// --- GLOBAL STATE ---
let ffaPlayers = []; // { id, username, alive, socket }
let ffaState = 'waiting'; // 'waiting', 'countdown', 'playing', 'finished'
let ffaSeed = 12345;

io.on('connection', (socket) => {
    
    // --- CHAT SYSTEM ---
    socket.on('send_chat', (msg) => {
        // Broadcast to everyone in FFA room (Spectators + Players)
        // Sanitize input slightly
        const cleanMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 50);
        const name = socket.username || "Anon";
        io.to('ffa_room').emit('receive_chat', { user: name, text: cleanMsg });
    });

    // --- FFA SYSTEM ---
    socket.on('join_ffa', (username) => {
        socket.username = (username || "Player").substring(0,12);
        socket.join('ffa_room');
        
        // Determine state
        if (ffaState === 'waiting' || ffaState === 'finished') {
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: true, socket: socket });
            io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
            checkFFAStart();
        } else {
            // Join as spectator
            const livingPlayers = ffaPlayers.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: ffaSeed, players: livingPlayers });
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: false, socket: socket });
        }
    });

    // --- GAMEPLAY LOGIC ---
    socket.on('send_garbage', (data) => {
        // FFA Split Logic
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
        let winner = survivors.length === 1 ? survivors[0].username : "No One";
        
        io.to('ffa_room').emit('round_over', { winner: winner });
        
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
