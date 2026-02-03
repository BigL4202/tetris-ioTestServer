// --- IMPORTS & SETUP ---
// Express is a web framework to serve the HTML file.
const express = require('express');
const app = express();

// Create a standard HTTP server using the Express app.
const http = require('http').createServer(app);

// Socket.io enables real-time, bidirectional communication between the browser and server.
const io = require('socket.io')(http);

// Path and FS (File System) are standard Node.js modules for file paths and reading/writing files.
const path = require('path');
const fs = require('fs');

// Serve static files (like your index.html) from the 'public' directory.
app.use(express.static(path.join(__dirname, 'public')));

// --- GLOBAL STATE ---
// Stores the list of players currently in the "Free For All" (FFA) lobby/game.
let ffaPlayers = []; 

// Tracks the current phase of the game: 'waiting' (lobby), 'countdown', 'playing', or 'finished'.
let ffaState = 'waiting'; 

// A shared random seed ensures all players get the exact same sequence of pieces.
let ffaSeed = 12345;

// Temporary storage for the results of the current match (who died, who won, their stats).
let currentMatchStats = []; 

// --- DATA STORAGE ---
// The file path where user accounts (wins, history, passwords) are saved.
const DATA_FILE = path.join(__dirname, 'accounts.json');

// In-memory object to hold all user data.
let accounts = {}; 

// Reads 'accounts.json' on startup so we don't lose data when the server restarts.
function loadAccounts() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            accounts = JSON.parse(fs.readFileSync(DATA_FILE));
            console.log("Loaded account data.");
        }
    } catch (err) { accounts = {}; } // If file doesn't exist or is corrupt, start fresh.
}

// Writes the 'accounts' object back to the hard drive. Called whenever stats change.
function saveAccounts() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2)); } catch (err) {}
}
// Load data immediately when the server starts.
loadAccounts();

// --- SOCKET CONNECTION LOOP ---
// This runs every time a new player connects to the site.
io.on('connection', (socket) => {
    
    // --- CHAT SYSTEM ---
    // Listens for chat messages, cleans them to prevent hacking (XSS), and sends them to everyone.
    socket.on('send_chat', (msg) => {
        // .replace(/</g, "&lt;") turns HTML tags into text so code doesn't run.
        const cleanMsg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 50);
        const name = socket.username || "Anon";
        io.emit('receive_chat', { user: name, text: cleanMsg });
    });

    // --- AUTHENTICATION (LOGIN/REGISTER) ---
    socket.on('login_attempt', (data) => {
        const user = data.username.trim().substring(0, 12); // Limit username length
        const pass = data.password.trim();
        
        // Validation: Ensure fields aren't empty.
        if (!user || !pass) return socket.emit('login_response', { success: false, msg: "Enter user & pass." });

        if (!accounts[user]) {
            // REGISTER: If user doesn't exist, create a new entry.
            accounts[user] = { password: pass, wins: 0, bestAPM: 0, bestCombo: 0, history: [] };
            saveAccounts();
        } else if (accounts[user].password !== pass) {
            // LOGIN FAIL: Password doesn't match.
            return socket.emit('login_response', { success: false, msg: "Incorrect Password!" });
        }

        // LOGIN SUCCESS: Attach username to the socket connection for future reference.
        socket.username = user;
        
        // Send success message and current stats back to the user.
        socket.emit('login_response', { 
            success: true, 
            username: user, 
            wins: accounts[user].wins, 
            bestAPM: accounts[user].bestAPM || 0 
        });
        
        // Update everyone's leaderboards since a new player logged in (or stats might have changed).
        socket.emit('leaderboard_update', getLeaderboards());
    });

    // --- STATS PAGE REQUEST ---
    // User asked for the full list of player stats (for the "Stats/History" screen).
    socket.on('request_all_stats', () => {
        const safeData = {};
        // Loop through all accounts and copy data, EXCLUDING passwords for security.
        for (const [key, val] of Object.entries(accounts)) {
            safeData[key] = { 
                wins: val.wins, 
                bestAPM: val.bestAPM,
                bestCombo: val.bestCombo || 0,
                history: val.history || [] 
            };
        }
        socket.emit('receive_all_stats', safeData);
    });

    // --- APM TEST SUBMISSION ---
    // Called when a user finishes the 60-second "APM Test" mode.
    socket.on('submit_apm', (val) => {
        if (!socket.username) return;
        const score = parseInt(val) || 0;
        
        // If this score is higher than their personal best, save it.
        if (accounts[socket.username]) {
            if (score > (accounts[socket.username].bestAPM || 0)) {
                accounts[socket.username].bestAPM = score;
                saveAccounts();
                socket.emit('update_my_apm', score);
                // Note: Leaderboard update isn't needed here because APM leaderboard is now on the Stats page.
            }
        }
    });

    // --- FFA (FREE FOR ALL) LOBBY SYSTEM ---
    socket.on('join_ffa', () => {
        if (!socket.username) return; // Guests cannot play online.
        socket.join('ffa_room'); // Subscribe this socket to the 'ffa_room' channel.

        // Prevent adding the same player twice.
        if (ffaPlayers.find(p => p.id === socket.id)) return;

        // JOINING: If game is waiting or just finished, add them as a player.
        if (ffaState === 'waiting' || ffaState === 'finished') {
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: true, socket: socket });
            // Tell everyone in the room how many people are waiting.
            io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
            checkFFAStart(); // Check if we have enough players (2+) to start.
        } else {
            // SPECTATING: If a game is already in progress, add them as a spectator (alive: false).
            // Send them the current game seed so their client can replicate the game state.
            const livingPlayers = ffaPlayers.filter(p => p.alive).map(p => ({ id: p.id, username: p.username }));
            socket.emit('ffa_spectate', { seed: ffaSeed, players: livingPlayers });
            ffaPlayers.push({ id: socket.id, username: socket.username, alive: false, socket: socket });
        }
    });

    // CLEANUP: If player closes tab or clicks "Cancel", remove them.
    socket.on('leave_lobby', () => { removePlayer(socket); });
    socket.on('disconnect', () => { removePlayer(socket); });

    // --- GAMEPLAY EVENTS ---
    
    // ATTACK LOGIC: Player cleared lines and is sending garbage.
    socket.on('send_garbage', (data) => {
        if (ffaState === 'playing') {
            const sender = ffaPlayers.find(p => p.id === socket.id);
            if (!sender || !sender.alive) return; // Dead players can't attack.

            // Find all other living players.
            const targets = ffaPlayers.filter(p => p.alive && p.id !== socket.id);
            
            if (targets.length > 0) {
                // Split garbage evenly among targets.
                let split = Math.floor(data.amount / targets.length);
                // If 4 lines (Quad) sent to many people, ensure at least 1 line is sent if split becomes 0.
                if (data.amount >= 4 && split === 0) split = 1; 
                
                if (split > 0) targets.forEach(t => io.to(t.id).emit('receive_garbage', split));
            }
        }
    });

    // VISUALS: Player moved a piece, send their board grid to spectators/opponents.
    socket.on('update_board', (grid) => {
        socket.to('ffa_room').emit('enemy_board_update', { id: socket.id, grid: grid });
    });

    // --- MATCH CONCLUSION ---
    
    // Player topped out (died).
    socket.on('player_died', (stats) => {
        const p = ffaPlayers.find(x => x.id === socket.id);
        if (p && ffaState === 'playing' && p.alive) {
            p.alive = false; // Mark as dead.
            recordMatchStat(p.username, stats, false); // Save their stats (place will be calculated later).
            
            // Tell everyone this player died (shows in kill feed).
            io.to('ffa_room').emit('elimination', { id: p.id, username: p.username });
            checkFFAWin(); // Check if only 1 player is left.
        }
    });

    // Winner logic: The last survivor sends this event.
    socket.on('match_won', (stats) => {
        if (ffaState === 'playing' || ffaState === 'finished') {
            recordMatchStat(socket.username, stats, true); // Save stats, mark as winner.
            processMatchResults(socket.username); // End the game and show results.
        }
    });
});

// --- HELPER FUNCTIONS ---

// Helper to push stats into the temporary match array.
function recordMatchStat(username, stats, isWinner) {
    const existing = currentMatchStats.find(s => s.username === username);
    if (existing) return; // Prevent duplicate stats.

    currentMatchStats.push({
        username: username,
        isWinner: isWinner,
        apm: stats.apm || 0,
        pps: stats.pps || 0,
        sent: stats.sent || 0,
        recv: stats.recv || 0,
        maxCombo: stats.maxCombo || 0, // IMPORTANT: Save the max combo achieved.
        timestamp: Date.now()
    });
}

// Handles removing a player from the lobby array.
function removePlayer(socket) {
    const pIndex = ffaPlayers.findIndex(x => x.id === socket.id);
    if (pIndex !== -1) {
        const p = ffaPlayers[pIndex];
        ffaPlayers.splice(pIndex, 1);
        
        // If the player left mid-game, treat it as an elimination.
        if (ffaState === 'playing' && p.alive) {
            io.to('ffa_room').emit('elimination', { id: p.id, username: p.username });
            checkFFAWin();
        }
        io.to('ffa_room').emit('lobby_update', { count: ffaPlayers.length });
    }
}

// Generates data for the sidebars (Top Wins, Top Combos).
function getLeaderboards() {
    const allUsers = Object.entries(accounts);
    
    // Sort by Wins (Descending)
    const wins = allUsers.map(([n, d]) => ({ name: n, val: d.wins })).sort((a, b) => b.val - a.val).slice(0, 5);
    
    // Sort by Best Combo (Descending)
    const combos = allUsers.map(([n, d]) => ({ name: n, val: d.bestCombo || 0 })).filter(u => u.val > 0).sort((a, b) => b.val - a.val).slice(0, 5);
    
    return { wins, combos };
}

// If 2+ players are waiting, start the countdown.
function checkFFAStart() {
    if (ffaState === 'waiting' && ffaPlayers.length >= 2) {
        startFFARound();
    }
}

// Begins the game sequence.
function startFFARound() {
    ffaState = 'countdown';
    ffaSeed = Math.floor(Math.random() * 1000000); // Generate seed so everyone gets same pieces.
    currentMatchStats = []; // Clear old results.
    
    ffaPlayers.forEach(p => p.alive = true); // Revive everyone.
    
    io.to('ffa_room').emit('start_countdown', { duration: 3 });
    
    // Wait 3 seconds, then start.
    setTimeout(() => {
        ffaState = 'playing';
        io.to('ffa_room').emit('match_start', { 
            mode: 'ffa',
            seed: ffaSeed, 
            players: ffaPlayers.map(p => ({ id: p.id, username: p.username })) 
        });
    }, 3000);
}

// Checks if the game should end (1 or 0 players left).
function checkFFAWin() {
    const survivors = ffaPlayers.filter(p => p.alive);
    if (survivors.length <= 1) {
        ffaState = 'finished';
        
        if (survivors.length === 1) {
            // Ask the winner to send their final stats.
            io.to(survivors[0].id).emit('request_win_stats');
        } else {
            // Everyone died (draw/disconnect), process results immediately.
            processMatchResults(null);
        }
    }
}

// Finalizes the game, saves history, updates leaderboards.
function processMatchResults(winnerName) {
    const winnerObj = currentMatchStats.find(s => s.isWinner);
    // Sort losers by who died last (timestamp).
    const losers = currentMatchStats.filter(s => !s.isWinner).sort((a, b) => b.timestamp - a.timestamp);
    
    const finalResults = [];
    if (winnerObj) finalResults.push({ ...winnerObj, place: 1 });
    
    // Assign places (2nd, 3rd, etc.)
    losers.forEach((l, index) => {
        finalResults.push({ ...l, place: (winnerObj ? 2 : 1) + index });
    });

    // Save to permanent account history.
    finalResults.forEach(res => {
        if (accounts[res.username]) {
            if (res.place === 1) accounts[res.username].wins++;
            
            // Update Best Combo if this match set a new record.
            if ((res.maxCombo || 0) > (accounts[res.username].bestCombo || 0)) {
                accounts[res.username].bestCombo = res.maxCombo;
            }

            if (!accounts[res.username].history) accounts[res.username].history = [];
            accounts[res.username].history.push({
                date: new Date().toISOString(),
                place: res.place,
                apm: res.apm,
                pps: res.pps,
                sent: res.sent,
                received: res.recv,
                maxCombo: res.maxCombo
            });
        }
    });
    
    saveAccounts();

    // Notify the winner client (to update their local UI).
    if (winnerName && accounts[winnerName]) {
        const winnerSocket = ffaPlayers.find(p => p.username === winnerName);
        if (winnerSocket) io.to(winnerSocket.id).emit('update_my_wins', accounts[winnerName].wins);
    }

    // Update clients with new data.
    io.emit('leaderboard_update', getLeaderboards());
    io.to('ffa_room').emit('match_summary', finalResults);

    // Wait 10 seconds before starting the next round.
    setTimeout(() => {
        if (ffaPlayers.length >= 2) {
            startFFARound();
        } else {
            ffaState = 'waiting';
            io.to('ffa_room').emit('lobby_reset');
        }
    }, 10000); 
}

http.listen(3000, () => { console.log('Server on 3000'); });
