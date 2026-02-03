const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

// Serve the separate files
app.use(express.static(path.join(__dirname, 'public')));

// --- DATA ---
const DATA_FILE = path.join(__dirname, 'accounts.json');
let accounts = {}; 
function loadAccounts() { try { if (fs.existsSync(DATA_FILE)) accounts = JSON.parse(fs.readFileSync(DATA_FILE)); } catch (err) {} }
function saveAccounts() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2)); } catch (err) {} }
loadAccounts();

// --- LOBBY STATE ---
let ffaLobby = {
    players: [],
    state: 'waiting', 
    seed: 12345,
    matchStats: [],
    startTime: 0,
    timer: null
};

io.on('connection', (socket) => {
    // CHAT
    socket.on('send_chat', (msg) => {
        const name = socket.username || "Anon";
        const clean = msg.replace(/</g, "&lt;").substring(0, 50);
        if (socket.rooms.has('lobby_ffa')) io.to('lobby_ffa').emit('receive_chat', { user: name, text: clean });
        else io.emit('receive_chat', { user: name, text: clean });
    });

    // LOGIN
    socket.on('login_attempt', (d) => {
        if(!d.username || !d.password) return;
        if(!accounts[d.username]) { accounts[d.username] = { password: d.password, wins: 0, bestAPM: 0, history: [] }; saveAccounts(); }
        else if(accounts[d.username].password !== d.password) return socket.emit('login_response', {success:false, msg:"Wrong pass"});
        
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

    // LOBBY LOGIC (Async Join Fix)
    async function leaveFFA() {
        const idx = ffaLobby.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
            const p = ffaLobby.players[idx];
            ffaLobby.players.splice(idx, 1);
            await socket.leave('lobby_ffa');
            
            io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length });
            
            if (ffaLobby.state === 'playing' && p.alive) {
                io.to('lobby_ffa').emit('elimination', { username: p.username, killer: "Disconnect" });
                checkWin();
            }
            if (ffaLobby.players.length < 2 && ffaLobby.state === 'countdown') {
                ffaLobby.state = 'waiting'; clearTimeout(ffaLobby.timer);
                io.to('lobby_ffa').emit('lobby_reset');
            }
        }
    }

    socket.on('leave_lobby', leaveFFA);
    socket.on('disconnect', leaveFFA);

    socket.on('join_ffa', async () => {
        if (!socket.username) return;
        await leaveFFA();
        await socket.join('lobby_ffa');
        const pData = { id: socket.id, username: socket.username, alive: true, damageLog: [] };
        ffaLobby.players.push(pData);

        if (ffaLobby.state === 'waiting' || ffaLobby.state === 'finished') {
            io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length });
            tryStartGame();
        } else {
            pData.alive = false;
            const living = ffaLobby.players.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: ffaLobby.seed, players: living });
        }
    });

    // GAMEPLAY
    socket.on('update_board', (g) => { socket.to('lobby_ffa').emit('enemy_board_update', {id:socket.id, grid:g}); });
    
    socket.on('send_garbage', (d) => {
        if(ffaLobby.state === 'playing') {
            const targets = ffaLobby.players.filter(p => p.alive && p.id !== socket.id);
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
        }
    });

    socket.on('player_died', (stats) => {
        const p = ffaLobby.players.find(x => x.id === socket.id);
        if(p && ffaLobby.state === 'playing' && p.alive) {
            p.alive = false;
            let killer = "Gravity";
            const recent = p.damageLog.filter(l => Date.now() - l.time < 15000);
            if(recent.length) {
                const map = {}; recent.forEach(l => map[l.attacker] = (map[l.attacker]||0)+l.amount);
                killer = Object.keys(map).reduce((a,b)=>map[a]>map[b]?a:b);
            }
            recordStats(p.username, stats, false);
            io.to('lobby_ffa').emit('elimination', { username: p.username, killer });
            checkWin();
        }
    });

    socket.on('match_won', (stats) => {
        if(ffaLobby.state === 'playing' || ffaLobby.state === 'finished') {
            recordStats(socket.username, stats, true);
            finishGame(socket.username);
        }
    });
});

function tryStartGame() {
    if (ffaLobby.state === 'waiting' && ffaLobby.players.length >= 2) {
        ffaLobby.state = 'countdown';
        ffaLobby.seed = Math.floor(Math.random() * 1000000);
        ffaLobby.matchStats = [];
        ffaLobby.players.forEach(p => { p.alive = true; p.damageLog = []; });
        io.to('lobby_ffa').emit('start_countdown', { duration: 3 });
        ffaLobby.timer = setTimeout(() => {
            ffaLobby.state = 'playing';
            ffaLobby.startTime = Date.now();
            io.to('lobby_ffa').emit('match_start', { mode: 'ffa', seed: ffaLobby.seed, players: ffaLobby.players.map(p => ({ id: p.id, username: p.username })) });
        }, 3000);
    }
}

function checkWin() {
    const alive = ffaLobby.players.filter(p => p.alive);
    if (alive.length <= 1) {
        ffaLobby.state = 'finished';
        if (alive.length === 1) io.to(alive[0].id).emit('request_win_stats');
        else finishGame(null);
    }
}

function recordStats(user, stats, won) {
    if(ffaLobby.matchStats.find(s=>s.username===user)) return;
    ffaLobby.matchStats.push({ username:user, isWinner:won, ...stats, survivalTime: Date.now() - ffaLobby.startTime });
}

function finishGame(winner) {
    const results = ffaLobby.matchStats.sort((a,b) => b.survivalTime - a.survivalTime);
    const wObj = results.find(r => r.isWinner);
    if(wObj) { results.splice(results.indexOf(wObj), 1); results.unshift(wObj); }
    
    const final = results.map((r, i) => ({ ...r, place: i+1 }));
    io.to('lobby_ffa').emit('match_summary', final);

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
        ffaLobby.state = 'waiting';
        io.to('lobby_ffa').emit('lobby_reset');
        if(ffaLobby.players.length >= 2) tryStartGame();
        else io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length });
    }, 5000);
}

function getLeaderboards() {
    const all = Object.entries(accounts);
    return {
        wins: all.map(([n,d])=>({name:n, val:d.wins})).sort((a,b)=>b.val-a.val).slice(0,5),
        combos: all.map(([n,d])=>({name:n, val:d.bestCombo||0})).sort((a,b)=>b.val-a.val).slice(0,5)
    };
}

http.listen(3000, () => { console.log('SERVER RUNNING ON 3000'); });
