const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- GAME CONSTANTS ---
const COLS = 10;
const ROWS = 40; // 20 visible + 20 buffer
const PIECES = [ [[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]], [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]] ];
// SRS Kicks (Simplified for server performance)
const KICKS = {
    '01': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '10': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '12': [[0,0],[1,0],[1,-1],[0,2],[1,2]], '21': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '23': [[0,0],[1,0],[1,1],[0,-2],[1,-2]], '32': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '30': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], '03': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};
const I_KICKS = {
    '01': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], '10': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '12': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], '21': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '23': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], '32': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '30': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]], '03': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};

// --- DATA PERSISTENCE ---
const DATA_FILE = path.join(__dirname, 'accounts.json');
let accounts = {};
try { if (fs.existsSync(DATA_FILE)) accounts = JSON.parse(fs.readFileSync(DATA_FILE)); } catch (e) {}
function saveAccounts() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(accounts)); } catch (e) {} }

// --- GAME ENGINE ---
class GameSession {
    constructor(id, username) {
        this.id = id;
        this.username = username;
        this.grid = Array.from({length: ROWS}, () => Array(COLS).fill(0));
        this.bag = [];
        this.queue = [];
        this.holdId = null;
        this.canHold = true;
        this.active = null; // { matrix, pos, id, rotation }
        this.alive = true;
        
        // Stats
        this.linesSent = 0;
        this.linesRecv = 0;
        this.piecesPlaced = 0;
        this.combo = -1;
        this.b2b = 0;
        this.startTime = Date.now();
        this.garbageQueue = 0;
        
        this.refillBag();
        for(let i=0; i<5; i++) this.queue.push(this.bag.pop());
        this.spawn();
    }

    refillBag() {
        this.bag = [0,1,2,3,4,5,6];
        for (let i = 6; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
    }

    spawn() {
        if (!this.alive) return;
        const id = this.queue.shift();
        if (this.queue.length < 5) { this.refillBag(); this.queue.push(this.bag.pop()); }
        
        this.active = { id: id, matrix: PIECES[id], pos: {x: 3, y: 18}, rotation: 0 }; // Spawn at row 18 (visible buffer)
        this.canHold = true;

        if (this.collide()) {
            this.alive = false;
            io.to('lobby_ffa').emit('elimination', { username: this.username, killer: "Top Out" });
        }
    }

    collide(pos = this.active.pos, matrix = this.active.matrix) {
        for(let y=0; y<matrix.length; y++) {
            for(let x=0; x<matrix[y].length; x++) {
                if(matrix[y][x]) {
                    const gx = x + pos.x;
                    const gy = y + pos.y;
                    if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
                    if (this.grid[gy][gx] !== 0) return true;
                }
            }
        }
        return false;
    }

    rotate(dir) {
        if (!this.active) return;
        const oldRot = this.active.rotation;
        const newRot = (oldRot + dir + 4) % 4;
        const newMatrix = this.active.matrix[0].map((_, i) => this.active.matrix.map(row => row[i]).reverse());
        
        const kicks = (this.active.id === 0 ? I_KICKS : KICKS)[`${oldRot}${newRot}`] || [[0,0]];
        const basePos = this.active.pos;

        for (let k of kicks) {
            const testPos = { x: basePos.x + k[0], y: basePos.y - k[1] }; // Y is inverted in standard kick tables
            if (!this.collide(testPos, newMatrix)) {
                this.active.pos = testPos;
                this.active.matrix = newMatrix;
                this.active.rotation = newRot;
                return;
            }
        }
    }

    move(dx) {
        if (!this.active) return;
        this.active.pos.x += dx;
        if (this.collide()) this.active.pos.x -= dx;
    }

    softDrop() {
        if (!this.active) return false;
        this.active.pos.y++;
        if (this.collide()) {
            this.active.pos.y--;
            this.lock();
            return true;
        }
        return false;
    }

    hardDrop() {
        if (!this.active) return;
        while(!this.collide()) this.active.pos.y++;
        this.active.pos.y--;
        this.lock();
    }

    hold() {
        if (!this.canHold || !this.alive) return;
        const curr = this.active.id;
        if (this.holdId === null) {
            this.holdId = curr;
            this.spawn();
        } else {
            const temp = this.holdId;
            this.holdId = curr;
            this.active = { id: temp, matrix: PIECES[temp], pos: {x: 3, y: 18}, rotation: 0 };
        }
        this.canHold = false;
    }

    lock() {
        if (!this.active) return;
        // Place blocks
        this.active.matrix.forEach((row, y) => {
            row.forEach((val, x) => {
                if (val) {
                    const gy = y + this.active.pos.y;
                    if (gy >= 0 && gy < ROWS) this.grid[gy][x + this.active.pos.x] = this.active.id + 1;
                }
            });
        });
        
        this.piecesPlaced++;
        
        // Clear lines
        let cleared = 0;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (this.grid[y].every(c => c !== 0)) {
                this.grid.splice(y, 1);
                this.grid.unshift(Array(COLS).fill(0));
                cleared++;
                y++;
            }
        }

        if (cleared > 0) {
            this.combo++;
            let atk = (cleared === 4) ? 4 : (cleared - 1);
            if (this.combo > 0) atk += Math.floor(this.combo / 2);
            if (atk > 0) sendGarbage(this.id, atk);
            this.linesSent += atk;
        } else {
            this.combo = -1;
            // Receive Garbage
            if (this.garbageQueue > 0) {
                const amt = Math.min(this.garbageQueue, 8);
                this.garbageQueue -= amt;
                this.linesRecv += amt;
                for(let i=0; i<amt; i++) {
                    const row = Array(COLS).fill(8);
                    row[Math.floor(Math.random()*COLS)] = 0;
                    this.grid.shift();
                    this.grid.push(row);
                }
            }
        }
        this.spawn();
    }

    getState() {
        // Only send visible grid (last 20 rows approx, mapped to client size)
        // We send full grid for simplicity, client clips it
        return {
            id: this.id,
            username: this.username,
            grid: this.grid,
            active: this.active,
            hold: this.holdId,
            next: this.queue.slice(0, 5),
            alive: this.alive,
            stats: {
                sent: this.linesSent,
                recv: this.linesRecv,
                pps: (this.piecesPlaced / ((Date.now() - this.startTime)/1000)).toFixed(2),
                apm: Math.floor((this.linesSent / ((Date.now() - this.startTime)/1000)) * 60)
            }
        };
    }
}

// --- GLOBAL LOBBY STATE ---
let lobby = {
    players: {}, // socket.id -> GameSession
    state: 'waiting', // waiting, countdown, playing
    timer: null
};

// --- GAME LOOP (20 TPS) ---
setInterval(() => {
    if (lobby.state === 'playing') {
        let activeCount = 0;
        const now = Date.now();
        
        Object.values(lobby.players).forEach(p => {
            if (p.alive) {
                activeCount++;
                // Gravity (0.5s drop)
                if (now % 500 < 50) p.softDrop(); 
            }
        });

        // Broadcast State
        const state = Object.values(lobby.players).map(p => p.getState());
        io.to('lobby_ffa').emit('gamestate', state);

        // Win Condition
        if (Object.keys(lobby.players).length > 1 && activeCount <= 1) {
            endGame();
        }
    }
}, 50);

// --- LOGIC HELPERS ---
function sendGarbage(senderId, amount) {
    const targets = Object.values(lobby.players).filter(p => p.id !== senderId && p.alive);
    if (targets.length === 0) return;
    const split = Math.ceil(amount / targets.length); // Send full amount split
    targets.forEach(t => t.garbageQueue += split);
}

function startGame() {
    lobby.state = 'playing';
    Object.values(lobby.players).forEach(p => {
        // Reset player state but keep ID/Name
        const name = p.username;
        const id = p.id;
        lobby.players[id] = new GameSession(id, name);
    });
}

function endGame() {
    lobby.state = 'finished';
    const winner = Object.values(lobby.players).find(p => p.alive);
    io.to('lobby_ffa').emit('match_summary', winner ? winner.username : "Draw");
    setTimeout(() => {
        lobby.state = 'waiting';
        io.to('lobby_ffa').emit('lobby_reset');
    }, 5000);
}

// --- SOCKETS ---
io.on('connection', (socket) => {
    socket.on('login_attempt', (data) => {
        const {username, password} = data;
        if (!accounts[username]) { accounts[username] = {password, wins:0}; saveAccounts(); }
        else if (accounts[username].password !== password) return socket.emit('login_response', {success:false, msg:'Bad Pass'});
        
        socket.username = username;
        socket.emit('login_response', {success:true, username, wins: accounts[username].wins});
    });

    socket.on('join_ffa', () => {
        if (!socket.username) return;
        socket.join('lobby_ffa');
        
        // Add to lobby
        lobby.players[socket.id] = new GameSession(socket.id, socket.username);
        lobby.players[socket.id].alive = (lobby.state === 'waiting'); // Spectator if mid-game

        // Check start
        if (lobby.state === 'waiting' && Object.keys(lobby.players).length >= 2) {
            lobby.state = 'countdown';
            io.to('lobby_ffa').emit('start_countdown', 3);
            setTimeout(startGame, 3000);
        }
    });

    socket.on('input', (cmd) => {
        const p = lobby.players[socket.id];
        if (p && p.alive && lobby.state === 'playing') {
            if (cmd === 'left') p.move(-1);
            if (cmd === 'right') p.move(1);
            if (cmd === 'rotate') p.rotate(1);
            if (cmd === 'soft') p.softDrop();
            if (cmd === 'hard') p.hardDrop();
            if (cmd === 'hold') p.hold();
        }
    });

    socket.on('disconnect', () => {
        delete lobby.players[socket.id];
        if (Object.keys(lobby.players).length < 2 && lobby.state !== 'waiting') {
            lobby.state = 'waiting'; // Force reset if empty
            io.to('lobby_ffa').emit('lobby_reset');
        }
    });
    
    // Chat
    socket.on('send_chat', (msg) => io.emit('receive_chat', {user: socket.username, text: msg}));
});

http.listen(3000, () => console.log('SERVER READY'));
