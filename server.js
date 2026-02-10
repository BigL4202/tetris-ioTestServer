// --- IMPORTS & SETUP ---
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    const pub = path.join(__dirname, 'public', 'index.html');
    const root = path.join(__dirname, 'index.html');
    if (fs.existsSync(pub)) res.sendFile(pub);
    else res.sendFile(root);
});

// --- DATA STORAGE ---
const DATA_FILE = path.join(__dirname, 'accounts.json');
let accounts = {}; 
function loadAccounts() { try { if (fs.existsSync(DATA_FILE)) accounts = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) { accounts = {}; } }
function saveAccounts() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2)); } catch(e) {} }
loadAccounts();

// --- FFA STATE ---
let ffaLobby = { players: [], state: 'waiting', seed: 12345, matchStats: [], startTime: 0, timer: null };

// --- DUEL STATE ---
let onlinePlayers = {};
let challenges = {};
let duels = {};

function broadcastPlayerList() {
    const list = Object.values(onlinePlayers).map(p => ({ id: p.id, username: p.username, status: p.status }));
    io.emit('player_list_update', list);
}

function findDuelByPlayer(sid) {
    for (const d of Object.values(duels)) { if (d.active && (d.p1Id === sid || d.p2Id === sid)) return d; }
    return null;
}

function leaveDuel(sid, reason) {
    const duel = findDuelByPlayer(sid);
    if (!duel || !duel.active) return;
    duel.active = false;
    const winnerId = duel.p1Id === sid ? duel.p2Id : duel.p1Id;
    const winnerName = duel.p1Id === winnerId ? duel.p1Name : duel.p2Name;
    const loserName = duel.p1Id === sid ? duel.p1Name : duel.p2Name;
    const s1 = duel.scores[duel.p1Id] || 0, s2 = duel.scores[duel.p2Id] || 0;
    if (accounts[winnerName]) { accounts[winnerName].wins = (accounts[winnerName].wins||0)+1; if(!accounts[winnerName].history) accounts[winnerName].history=[]; accounts[winnerName].history.push({date:new Date().toISOString(),type:'duel',place:1,vs:loserName,score:`${s1}-${s2}`}); }
    if (accounts[loserName]) { if(!accounts[loserName].history) accounts[loserName].history=[]; accounts[loserName].history.push({date:new Date().toISOString(),type:'duel',place:2,vs:winnerName,score:`${s1}-${s2}`}); }
    saveAccounts();
    io.to(duel.id).emit('duel_end', { winnerName, loserName, finalScores: duel.scores, p1Id: duel.p1Id, p2Id: duel.p2Id, p1Name: duel.p1Name, p2Name: duel.p2Name, reason: reason || 'Forfeit' });
    io.emit('leaderboard_update', getLeaderboards());
    [duel.p1Id, duel.p2Id].forEach(pid => { const s = io.sockets.sockets.get(pid); if(s) s.leave(duel.id); if(onlinePlayers[pid]) onlinePlayers[pid].status='idle'; });
    broadcastPlayerList();
    delete duels[duel.id];
}

// --- WATCHDOG ---
setInterval(() => {
    const now = Date.now();
    if (ffaLobby.state === 'playing') {
        ffaLobby.players.filter(p => p.alive && (now - p.lastActivity > 15000)).forEach(p => {
            io.to(p.id).emit('force_disconnect', 'Kicked for inactivity.');
            handlePlayerDeath(p.id, { apm: 0, sent: 0 }, "AFK Timer");
            removePlayerFromLobby(p.id);
        });
    }
    if (ffaLobby.state !== 'waiting' && ffaLobby.players.length === 0) forceLobbyReset();
    if (ffaLobby.state === 'playing' && ffaLobby.players.length === 1) checkWinCondition();
}, 1000);

// --- SOCKET ---
io.on('connection', (socket) => {

    socket.on('login_attempt', (data) => {
        const user = data.username.trim().substring(0, 12);
        const pass = data.password.trim();
        if (!user || !pass) return socket.emit('login_response', { success: false, msg: "Enter user & pass." });
        if (!accounts[user]) { accounts[user] = { password: pass, wins: 0, bestAPM: 0, bestCombo: 0, history: [] }; saveAccounts(); }
        else if (accounts[user].password !== pass) return socket.emit('login_response', { success: false, msg: "Incorrect Password!" });
        socket.username = user;
        onlinePlayers[socket.id] = { id: socket.id, username: user, status: 'idle' };
        broadcastPlayerList();
        socket.emit('login_response', { success: true, username: user, wins: accounts[user].wins, bestAPM: accounts[user].bestAPM || 0 });
        io.emit('leaderboard_update', getLeaderboards());
    });

    socket.on('set_status', (status) => { if (onlinePlayers[socket.id]) { onlinePlayers[socket.id].status = status; broadcastPlayerList(); } });

    // --- DUEL ---
    socket.on('duel_challenge', (targetId) => {
        if (!socket.username) return;
        if (challenges[socket.id]) return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'You already have a pending challenge.' });
        const target = onlinePlayers[targetId];
        if (!target) return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'Player not found.' });
        if (target.status === 'duel') return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'Player is in a duel.' });
        challenges[socket.id] = {
            targetId, targetName: target.username, senderName: socket.username, timestamp: Date.now(),
            timer: setTimeout(() => { socket.emit('receive_chat', { user: '[SYSTEM]', text: 'Challenge expired.' }); const ts = io.sockets.sockets.get(targetId); if(ts) ts.emit('challenge_cancelled', { fromId: socket.id }); delete challenges[socket.id]; }, 60000)
        };
        socket.emit('receive_chat', { user: '[SYSTEM]', text: `Challenge sent to ${target.username}. Waiting...` });
        io.to(targetId).emit('receive_challenge', { fromId: socket.id, fromName: socket.username });
    });

    socket.on('duel_cancel', () => { const ch = challenges[socket.id]; if(ch){ clearTimeout(ch.timer); io.to(ch.targetId).emit('challenge_cancelled',{fromId:socket.id}); delete challenges[socket.id]; } });

    socket.on('duel_accept', (challengerId) => {
        const ch = challenges[challengerId];
        if (!ch || ch.targetId !== socket.id) return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'Challenge expired.' });
        clearTimeout(ch.timer); delete challenges[challengerId];
        const p1Sock = io.sockets.sockets.get(challengerId);
        if (!p1Sock) return socket.emit('receive_chat', { user: '[SYSTEM]', text: 'Challenger disconnected.' });

        // Force-switch from FFA
        [challengerId, socket.id].forEach(pid => {
            const idx = ffaLobby.players.findIndex(p => p.id === pid);
            if (idx !== -1) {
                const p = ffaLobby.players[idx];
                if (ffaLobby.state === 'playing' && p.alive) { io.to('lobby_ffa').emit('elimination', { username: p.username, killer: 'Disconnect (Duel)' }); p.alive = false; checkWinCondition(); }
                ffaLobby.players.splice(idx, 1);
                const s = io.sockets.sockets.get(pid); if(s) s.leave('lobby_ffa');
                io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length });
            }
        });

        const duelId = 'duel_' + Date.now();
        const seed = Math.floor(Math.random() * 1000000);
        duels[duelId] = { id: duelId, p1Id: challengerId, p2Id: socket.id, p1Name: ch.senderName, p2Name: socket.username, scores: { [challengerId]: 0, [socket.id]: 0 }, round: 1, seed, active: true };
        p1Sock.join(duelId); socket.join(duelId);
        if (onlinePlayers[challengerId]) onlinePlayers[challengerId].status = 'duel';
        if (onlinePlayers[socket.id]) onlinePlayers[socket.id].status = 'duel';
        broadcastPlayerList();

        const startData = (oppId, oppName) => ({ mode: 'duel', duelId, seed, opponent: { id: oppId, username: oppName }, p1Id: challengerId, p2Id: socket.id, p1Name: ch.senderName, p2Name: socket.username });
        p1Sock.emit('duel_start', startData(socket.id, socket.username));
        socket.emit('duel_start', startData(challengerId, ch.senderName));
    });

    socket.on('duel_decline', (challengerId) => {
        const ch = challenges[challengerId];
        if (ch && ch.targetId === socket.id) { clearTimeout(ch.timer); const cs = io.sockets.sockets.get(challengerId); if(cs) cs.emit('receive_chat', { user: '[SYSTEM]', text: socket.username+' declined.' }); delete challenges[challengerId]; }
    });

    socket.on('duel_report_loss', (stats) => {
        const duel = findDuelByPlayer(socket.id);
        if (!duel || !duel.active) return;
        const winnerId = duel.p1Id === socket.id ? duel.p2Id : duel.p1Id;
        duel.scores[winnerId] = (duel.scores[winnerId]||0) + 1;
        const wS = duel.scores[winnerId], lS = duel.scores[socket.id]||0;
        const wName = duel.p1Id === winnerId ? duel.p1Name : duel.p2Name;
        const lName = duel.p1Id === socket.id ? duel.p1Name : duel.p2Name;

        if (wS >= 6 && (wS - lS) >= 2) {
            duel.active = false;
            if (accounts[wName]) { accounts[wName].wins=(accounts[wName].wins||0)+1; if(!accounts[wName].history) accounts[wName].history=[]; accounts[wName].history.push({date:new Date().toISOString(),type:'duel',place:1,vs:lName,score:`${duel.scores[duel.p1Id]}-${duel.scores[duel.p2Id]}`}); }
            if (accounts[lName]) { if(!accounts[lName].history) accounts[lName].history=[]; accounts[lName].history.push({date:new Date().toISOString(),type:'duel',place:2,vs:wName,score:`${duel.scores[duel.p1Id]}-${duel.scores[duel.p2Id]}`}); }
            saveAccounts();
            io.to(duel.id).emit('duel_end', { winnerName:wName, loserName:lName, finalScores:duel.scores, p1Id:duel.p1Id, p2Id:duel.p2Id, p1Name:duel.p1Name, p2Name:duel.p2Name, reason:null });
            io.emit('leaderboard_update', getLeaderboards());
            [duel.p1Id,duel.p2Id].forEach(pid=>{ const s=io.sockets.sockets.get(pid); if(s) s.leave(duel.id); if(onlinePlayers[pid]) onlinePlayers[pid].status='idle'; });
            broadcastPlayerList(); delete duels[duel.id];
        } else {
            duel.round++; const newSeed = Math.floor(Math.random()*1000000); duel.seed = newSeed;
            io.to(duel.id).emit('duel_round_result', { roundWinnerName:wName, roundLoserName:lName, scores:duel.scores, round:duel.round, newSeed, p1Id:duel.p1Id, p2Id:duel.p2Id, p1Name:duel.p1Name, p2Name:duel.p2Name });
        }
    });

    // --- FFA ---
    socket.on('join_ffa', async () => {
        if (!socket.username) return;
        removePlayerFromLobby(socket.id);
        await socket.join('lobby_ffa');
        if (onlinePlayers[socket.id]) { onlinePlayers[socket.id].status = 'ffa'; broadcastPlayerList(); }
        const pData = { id: socket.id, username: socket.username, alive: true, damageLog: [], lastActivity: Date.now() };
        if (ffaLobby.state === 'finished') ffaLobby.state = 'waiting';
        ffaLobby.players.push(pData);
        if (ffaLobby.state === 'waiting') { io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length }); if (ffaLobby.players.length >= 2) tryStartGame(); }
        else { pData.alive = false; socket.emit('ffa_spectate', { seed: ffaLobby.seed, players: ffaLobby.players.filter(p=>p.alive).map(p=>({id:p.id,username:p.username})) }); }
    });

    socket.on('leave_lobby', () => { removePlayerFromLobby(socket.id); });

    socket.on('disconnect', () => {
        leaveDuel(socket.id, 'Opponent Disconnected');
        if (challenges[socket.id]) { clearTimeout(challenges[socket.id].timer); io.to(challenges[socket.id].targetId).emit('challenge_cancelled',{fromId:socket.id}); delete challenges[socket.id]; }
        for (const [cid, ch] of Object.entries(challenges)) { if(ch.targetId===socket.id){ clearTimeout(ch.timer); const cs=io.sockets.sockets.get(cid); if(cs) cs.emit('receive_chat',{user:'[SYSTEM]',text:'Target disconnected.'}); delete challenges[cid]; } }
        removePlayerFromLobby(socket.id);
        delete onlinePlayers[socket.id];
        broadcastPlayerList();
    });

    socket.on('update_board', (grid) => {
        const p = ffaLobby.players.find(x => x.id === socket.id);
        if (p) { p.lastActivity = Date.now(); socket.to('lobby_ffa').emit('enemy_board_update', { id: socket.id, grid }); }
        const duel = findDuelByPlayer(socket.id);
        if (duel) { const opId = duel.p1Id === socket.id ? duel.p2Id : duel.p1Id; io.to(opId).emit('enemy_board_update', { id: socket.id, grid }); }
    });

    socket.on('send_garbage', (data) => {
        if (data.mode === 'duel') { const duel = findDuelByPlayer(socket.id); if(duel&&duel.active){ const opId=duel.p1Id===socket.id?duel.p2Id:duel.p1Id; io.to(opId).emit('receive_garbage',data.amount); } return; }
        if (ffaLobby.state === 'playing') {
            const sender = ffaLobby.players.find(p => p.id === socket.id);
            if (!sender || !sender.alive) return;
            sender.lastActivity = Date.now();
            const targets = ffaLobby.players.filter(p => p.alive && p.id !== socket.id);
            if (targets.length > 0) { let split = Math.floor(data.amount / targets.length); if (data.amount >= 4 && split === 0) split = 1; if (split > 0) targets.forEach(t => { t.damageLog.push({ attacker: sender.username, amount: split, time: Date.now() }); io.to(t.id).emit('receive_garbage', split); }); }
        }
    });

    socket.on('player_died', (stats) => { handlePlayerDeath(socket.id, stats, "Gravity"); });
    socket.on('match_won', (stats) => { if (ffaLobby.state === 'playing') { recordMatchStat(socket.username, stats, true, Date.now() - ffaLobby.startTime); finishGame(socket.username); } });
    socket.on('send_chat', (msg) => { io.emit('receive_chat', { user: socket.username || "Anon", text: msg.replace(/</g, "&lt;").substring(0, 50) }); });
    socket.on('request_all_stats', () => { socket.emit('receive_all_stats', accounts); });
});

// --- CORE LOGIC ---
function removePlayerFromLobby(socketId) {
    const idx = ffaLobby.players.findIndex(p => p.id === socketId);
    if (idx !== -1) {
        const p = ffaLobby.players[idx]; ffaLobby.players.splice(idx, 1);
        const s = io.sockets.sockets.get(socketId); if(s) s.leave('lobby_ffa');
        io.to('lobby_ffa').emit('lobby_update', { count: ffaLobby.players.length });
        if (ffaLobby.state === 'playing' && p.alive) { io.to('lobby_ffa').emit('elimination', { username: p.username, killer: "Disconnect" }); checkWinCondition(); }
        if (ffaLobby.players.length < 2) { if (ffaLobby.state === 'countdown') { clearTimeout(ffaLobby.timer); forceLobbyReset(); } else if (ffaLobby.state === 'playing' && ffaLobby.players.length === 0) forceLobbyReset(); }
    }
    if (onlinePlayers[socketId] && onlinePlayers[socketId].status === 'ffa') { onlinePlayers[socketId].status = 'idle'; broadcastPlayerList(); }
}

function forceLobbyReset() { ffaLobby.state = 'waiting'; ffaLobby.matchStats = []; clearTimeout(ffaLobby.timer); io.to('lobby_ffa').emit('lobby_reset'); if (ffaLobby.players.length >= 2) tryStartGame(); }

function handlePlayerDeath(socketId, stats, defaultKiller) {
    const p = ffaLobby.players.find(x => x.id === socketId);
    if (p && ffaLobby.state === 'playing' && p.alive) {
        p.alive = false; let killer = defaultKiller;
        const recent = p.damageLog.filter(l => Date.now() - l.time < 15000);
        if (recent.length > 0) { const map = {}; recent.forEach(l => map[l.attacker] = (map[l.attacker]||0) + l.amount); killer = Object.keys(map).reduce((a, b) => map[a] > map[b] ? a : b); }
        recordMatchStat(p.username, stats, false, Date.now() - ffaLobby.startTime);
        io.to('lobby_ffa').emit('elimination', { username: p.username, killer }); checkWinCondition();
    }
}

function tryStartGame() {
    if (ffaLobby.state === 'waiting' && ffaLobby.players.length >= 2) {
        ffaLobby.state = 'countdown'; ffaLobby.seed = Math.floor(Math.random() * 1000000); ffaLobby.matchStats = [];
        ffaLobby.players.forEach(p => { p.alive = true; p.damageLog = []; p.lastActivity = Date.now(); });
        io.to('lobby_ffa').emit('start_countdown', { targetTime: Date.now() + 3000 });
        ffaLobby.timer = setTimeout(() => { ffaLobby.state = 'playing'; ffaLobby.startTime = Date.now(); io.to('lobby_ffa').emit('match_start', { mode: 'ffa', seed: ffaLobby.seed, players: ffaLobby.players.map(p => ({ id: p.id, username: p.username })) }); }, 3000);
    }
}

function checkWinCondition() { const s = ffaLobby.players.filter(p => p.alive); if (s.length <= 1) { if (s.length === 1) io.to(s[0].id).emit('request_win_stats'); else finishGame(null); } }

function recordMatchStat(username, stats, isWinner, sTime) { if (ffaLobby.matchStats.find(s => s.username === username)) return; ffaLobby.matchStats.push({ username, isWinner, ...stats, survivalTime: sTime }); }

function finishGame(winnerName) {
    if (ffaLobby.state === 'finished') return;
    setTimeout(() => {
        ffaLobby.state = 'finished';
        const winnerObj = ffaLobby.matchStats.find(s => s.isWinner);
        const losers = ffaLobby.matchStats.filter(s => !s.isWinner).sort((a, b) => b.survivalTime - a.survivalTime);
        const results = []; const fmt = (ms) => `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
        if (winnerObj) results.push({ ...winnerObj, place: 1, durationStr: fmt(winnerObj.survivalTime) });
        losers.forEach((l, i) => results.push({ ...l, place: (winnerObj ? 2 : 1) + i, durationStr: fmt(l.survivalTime) }));
        results.forEach(res => {
            if (accounts[res.username]) {
                if (res.place === 1) accounts[res.username].wins++;
                if ((res.maxCombo||0) > (accounts[res.username].bestCombo||0)) accounts[res.username].bestCombo = res.maxCombo;
                if ((res.apm||0) > (accounts[res.username].bestAPM||0)) accounts[res.username].bestAPM = res.apm;
                if (!accounts[res.username].history) accounts[res.username].history = [];
                accounts[res.username].history.push({ date: new Date().toISOString(), ...res });
            }
        });
        saveAccounts();
        if (winnerName && accounts[winnerName]) { const sock = ffaLobby.players.find(p => p.username === winnerName); if (sock && io.sockets.sockets.get(sock.id)) io.to(sock.id).emit('update_my_wins', accounts[winnerName].wins); }
        io.emit('leaderboard_update', getLeaderboards());
        io.to('lobby_ffa').emit('match_summary', results);
        setTimeout(() => { forceLobbyReset(); }, 5000);
    }, 500);
}

function getLeaderboards() {
    const all = Object.entries(accounts);
    return {
        wins: all.map(([n, d]) => ({ name: n, val: d.wins })).sort((a, b) => b.val - a.val).slice(0, 5),
        combos: all.map(([n, d]) => ({ name: n, val: d.bestCombo || 0 })).filter(u => u.val > 0).sort((a, b) => b.val - a.val).slice(0, 5)
    };
}

http.listen(PORT, () => console.log('SERVER RUNNING ON PORT ' + PORT));
