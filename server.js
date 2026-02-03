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

// --- LOBBIES ---
function createLobby() {
    return { players: [], state: 'waiting', seed: 12345, matchStats: [], startTime: 0, timer: null };
}

let lobbies = {
    'ffa': createLobby(),
    'madness': createLobby()
};

io.on('connection', (socket) => {
    
    // CHAT
    socket.on('send_chat', (msg) => {
        const name = socket.username || "Anon";
        const clean = msg.replace(/</g, "&lt;").substring(0, 50);
        if (socket.rooms.has('lobby_ffa')) io.to('lobby_ffa').emit('receive_chat', { user: name, text: clean });
        else if (socket.rooms.has('lobby_madness')) io.to('lobby_madness').emit('receive_chat', { user: name, text: clean });
        else io.emit('receive_chat', { user: name, text: clean });
    });

    // LOGIN
    socket.on('login_attempt', (d) => {
        if(!d.username || !d.password) return;
        if(!accounts[d.username]) { accounts[d.username] = { password: d.password, wins: 0, bestAPM: 0, history: [] }; saveAccounts(); }
        else if(accounts[d.username].password !== d.password) return socket.emit('login_response', {success:false, msg:"Incorrect Password"});
        
        socket.username = d.username;
        socket.emit('login_response', { success:true, username:d.username, wins:accounts[d.username].wins, bestAPM:accounts[d.username].bestAPM });
        io.emit('leaderboard_update', getLeaderboards());
    });

    // STATS
    socket.on('request_all_stats', () => { socket.emit('receive_all_stats', accounts); });
    socket.on('submit_apm', (val) => {
        if(!socket.username) return;
        if(parseInt(val) > (accounts[socket.username].bestAPM||0)) { accounts[socket.username].bestAPM = parseInt(val); saveAccounts(); }
    });

    // LOBBY MANAGEMENT
    function leaveAll() {
        ['ffa', 'madness'].forEach(type => {
            const lobby = lobbies[type];
            const idx = lobby.players.findIndex(p => p.id === socket.id);
            if(idx !== -1) {
                const p = lobby.players[idx];
                lobby.players.splice(idx, 1);
                socket.leave('lobby_'+type);
                
                io.to('lobby_'+type).emit('lobby_update', { count: lobby.players.length });
                
                if(lobby.state === 'playing' && p.alive) {
                    io.to('lobby_'+type).emit('elimination', { username: p.username, killer: "Disconnect" });
                    checkWin(type);
                }
                if(lobby.players.length < 2 && lobby.state === 'countdown') {
                    lobby.state = 'waiting'; clearTimeout(lobby.timer);
                    io.to('lobby_'+type).emit('lobby_reset');
                }
            }
        });
    }

    socket.on('leave_lobby', leaveAll);
    socket.on('disconnect', leaveAll);

    // JOIN HANDLER
    socket.on('join_ffa', () => handleJoin('ffa', null));
    socket.on('join_madness', (passive) => handleJoin('madness', passive));

    function handleJoin(type, passive) {
        if(!socket.username) return;
        leaveAll();
        socket.join('lobby_'+type);
        
        const lobby = lobbies[type];
        const pData = { id: socket.id, username: socket.username, alive: true, damageLog: [], passive: passive || 'double_hold' };
        lobby.players.push(pData);

        if(lobby.state === 'waiting' || lobby.state === 'finished') {
            io.to('lobby_'+type).emit('lobby_update', { count: lobby.players.length });
            if(lobby.players.length >= 2) startCountdown(type);
        } else {
            pData.alive = false;
            const living = lobby.players.filter(p=>p.alive).map(p=>({id:p.id, username:p.username}));
            socket.emit('ffa_spectate', { seed: lobby.seed, players: living });
        }
    }

    // GAMEPLAY
    socket.on('update_board', (g) => {
        if(socket.rooms.has('lobby_ffa')) socket.to('lobby_ffa').emit('enemy_board_update', {id:socket.id, grid:g});
        if(socket.rooms.has('lobby_madness')) socket.to('lobby_madness').emit('enemy_board_update', {id:socket.id, grid:g});
    });

    socket.on('send_garbage', (d) => {
        const type = socket.rooms.has('lobby_ffa') ? 'ffa' : (socket.rooms.has('lobby_madness') ? 'madness' : null);
        if(!type) return;
        const lobby = lobbies[type];
        if(lobby.state !== 'playing') return;
        
        const targets = lobby.players.filter(p => p.alive && p.id !== socket.id);
        if(targets.length > 0) {
            let split = Math.floor(d.amount / targets.length);
            if(d.amount >= 4 && split === 0) split = 1;
            if(split > 0) {
                targets.forEach(t => {
                    t.damageLog.push({ attacker: socket.username, amount: split, time: Date.now() });
                    io.to(t.id).emit('receive_garbage', split);
                });
            }
        }
    });

    socket.on('player_died', (stats) => {
        const type = socket.rooms.has('lobby_ffa') ? 'ffa' : (socket.rooms.has('lobby_madness') ? 'madness' : null);
        if(!type) return;
        const lobby = lobbies[type];
        const p = lobby.players.find(x => x.id === socket.id);
        if(p && p.alive) {
            p.alive = false;
            recordStats(lobby, p.username, stats, false);
            
            let killer = "Gravity";
            const recent = p.damageLog.filter(l => Date.now() - l.time < 15000);
            if(recent.length) {
                const map = {}; recent.forEach(l => map[l.attacker] = (map[l.attacker]||0)+l.amount);
                killer = Object.keys(map).reduce((a,b)=>map[a]>map[b]?a:b);
            }
            io.to('lobby_'+type).emit('elimination', { username: p.username, killer });
            checkWin(type);
        }
    });

    socket.on('match_won', (stats) => {
        const type = socket.rooms.has('lobby_ffa') ? 'ffa' : (socket.rooms.has('lobby_madness') ? 'madness' : null);
        if(type) {
            recordStats(lobbies[type], socket.username, stats, true);
            endGame(type);
        }
    });
});

function startCountdown(type) {
    const lobby = lobbies[type];
    lobby.state = 'countdown';
    lobby.seed = Math.floor(Math.random()*1000000);
    lobby.matchStats = [];
    lobby.players.forEach(p => { p.alive = true; p.damageLog = []; });
    lobby.startTime = Date.now() + 3000;

    io.to('lobby_'+type).emit('start_countdown', { duration: 3 });
    lobby.timer = setTimeout(() => {
        lobby.state = 'playing';
        io.to('lobby_'+type).emit('match_start', { 
            mode: type, seed: lobby.seed, 
            players: lobby.players.map(p=>({id:p.id, username:p.username, passive:p.passive})) 
        });
    }, 3000);
}

function checkWin(type) {
    const lobby = lobbies[type];
    const alive = lobby.players.filter(p => p.alive);
    if(alive.length <= 1) {
        lobby.state = 'finished';
        if(alive.length === 1) io.to(alive[0].id).emit('request_win_stats');
        else endGame(type);
    }
}

function recordStats(lobby, user, stats, won) {
    if(lobby.matchStats.find(s=>s.username===user)) return;
    lobby.matchStats.push({ username:user, isWinner:won, ...stats, survivalTime: Date.now() - lobby.startTime });
}

function endGame(type) {
    const lobby = lobbies[type];
    const results = lobby.matchStats.sort((a,b) => b.survivalTime - a.survivalTime);
    const winner = results.find(r => r.isWinner);
    if(winner) {
        results.splice(results.indexOf(winner), 1);
        results.unshift(winner);
    }
    
    const final = results.map((r, i) => ({ ...r, place: i+1 }));
    io.to('lobby_'+type).emit('match_summary', final);

    final.forEach(r => {
        if(accounts[r.username]) {
            if(r.place===1) accounts[r.username].wins++;
            if(r.maxCombo > (accounts[r.username].bestCombo||0)) accounts[r.username].bestCombo = r.maxCombo;
            if(r.apm > (accounts[r.username].bestAPM||0)) accounts[r.username].bestAPM = r.apm;
        }
    });
    saveAccounts();
    io.emit('leaderboard_update', getLeaderboards());

    setTimeout(() => {
        lobby.state = 'waiting';
        io.to('lobby_'+type).emit('lobby_reset');
        if(lobby.players.length >= 2) startCountdown(type);
        else io.to('lobby_'+type).emit('lobby_update', { count: lobby.players.length });
    }, 5000);
}

function getLeaderboards() {
    const all = Object.entries(accounts);
    return {
        wins: all.map(([n,d])=>({name:n, val:d.wins})).sort((a,b)=>b.val-a.val).slice(0,5),
        combos: all.map(([n,d])=>({name:n, val:d.bestCombo||0})).sort((a,b)=>b.val-a.val).slice(0,5)
    };
}

http.listen(3000, () => { console.log('SERVER RUNNING PORT 3000'); });
