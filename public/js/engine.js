// ============================================================================
// TETR.IO 4x26 & 10x26 CORE STACKER ENGINE (SRS, 7-BAG, GARBAGE, T-SPIN)
// ============================================================================

const PIECE_COLORS = {
  I: '#00e5ff',
  O: '#ffea00',
  T: '#d500f9',
  S: '#00e676',
  Z: '#ff1744',
  J: '#2979ff',
  L: '#ff9100',
  G: '#78909c' // Garbage block color
};

// 4 rotation states (0: North, 1: East, 2: South, 3: West) for all 7 Tetrominoes
const TETROMINO_MATRICES = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
  ],
  O: [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]]
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]]
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]]
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]]
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]]
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]]
  ]
};

// Standard SRS Kick Table for J, L, S, T, Z (Note: +y is downward on screen)
const SRS_JLSTZ_KICKS = {
  '0>1': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
  '1>0': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
  '1>2': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
  '2>1': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
  '2>3': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
  '3>2': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
  '3>0': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
  '0>3': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
  // 180-degree rotation kicks
  '0>2': [[0,0], [0,-1], [1,-1], [-1,-1], [1,0], [-1,0]],
  '2>0': [[0,0], [0, 1], [-1,1], [ 1, 1], [-1,0], [1,0]],
  '1>3': [[0,0], [1, 0], [1,-1], [ 1, 1], [0,-1], [0,1]],
  '3>1': [[0,0], [-1,0], [-1,-1],[-1, 1], [0,-1], [0,1]]
};

// Standard SRS Kick Table for I Piece (+ extended 4-wide wall recovery offsets)
const SRS_I_KICKS = {
  '0>1': [[0,0], [-2,0], [ 1,0], [-2, 1], [ 1,-2], [-1,0], [0,-1]],
  '1>0': [[0,0], [ 2,0], [-1,0], [ 2,-1], [-1, 2], [ 1,0], [0, 1]],
  '1>2': [[0,0], [-1,0], [ 2,0], [-1,-2], [ 2, 1], [ 1,0], [0,-1]],
  '2>1': [[0,0], [ 1,0], [-2,0], [ 1, 2], [-2,-1], [-1,0], [0, 1]],
  '2>3': [[0,0], [ 2,0], [-1,0], [ 2,-1], [-1, 2], [ 1,0], [0,-1]],
  '3>2': [[0,0], [-2,0], [ 1,0], [-2, 1], [ 1,-2], [-1,0], [0, 1]],
  '3>0': [[0,0], [ 1,0], [-2,0], [ 1, 2], [-2,-1], [-1,0], [0,-1]],
  '0>3': [[0,0], [-1,0], [ 2,0], [-1,-2], [ 2, 1], [ 1,0], [0, 1]],
  '0>2': [[0,0], [0,-1], [-1,0], [ 1,0]],
  '2>0': [[0,0], [0, 1], [-1,0], [ 1,0]],
  '1>3': [[0,0], [1, 0], [-1,0], [0,-1]],
  '3>1': [[0,0], [-1,0], [ 1,0], [0,-1]]
};

// TETR.IO Combo Garbage Bonus Table
const COMBO_GARBAGE_TABLE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7];

class StackerEngine {
  constructor(cols = 4, rows = 26, visibleRows = 20, callbacks = {}) {
    this.cols = cols; // 4 for 4x26 mode, 10 for 10x26 mode
    this.rows = rows; // 26 total rows (6 buffer + 20 visible)
    this.visibleRows = visibleRows;
    this.bufferRows = rows - visibleRows; // 6 hidden buffer rows (y = 0..5)
    this.callbacks = callbacks;
    this.reset(Math.floor(Math.random() * 2147483647), cols);
  }

  // Deterministic Mulberry32 PRNG for synchronized 1v1 7-Bag generation
  createPRNG(seed) {
    let a = seed >>> 0;
    return function() {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  reset(seed = Date.now(), cols = this.cols) {
    this.cols = cols;
    this.rng = this.createPRNG(seed);
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));

    this.bag = [];
    this.nextQueue = [];
    this.holdPiece = null;
    this.canHold = true;

    this.activePiece = null;
    this.gameOver = false;

    // Timing & Lock Delay
    this.gravityInterval = 850; // ms per row drop
    this.gravityTimer = 0;
    this.lockDelayMax = 500;
    this.lockTimer = 0;
    this.lockMoveResets = 0;
    this.maxLockMoveResets = 15;
    this.lowestYReached = 0;

    // Combat & Telemetry Metrics
    this.startTime = performance.now();
    this.piecesPlaced = 0;
    this.linesCleared = 0;
    this.attackSent = 0;
    this.garbageReceivedTotal = 0;
    this.combo = -1;
    this.maxCombo = 0;
    this.b2b = -1;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = 0;

    // Incoming Garbage Queue: [{ lines, holeCol }]
    this.garbageQueue = [];
    this.currentGarbageHole = Math.floor(this.rng() * this.cols);

    this.refillQueue();
    this.spawnNextPiece();
  }

  refillQueue() {
    while (this.nextQueue.length < 7) {
      if (this.bag.length === 0) {
        this.bag = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.nextQueue.push(this.bag.pop());
    }
  }

  spawnNextPiece() {
    this.refillQueue();
    const type = this.nextQueue.shift();
    this.refillQueue();
    this.spawnPieceOfType(type);
    this.canHold = true;
  }

  spawnPieceOfType(type) {
    const matrix = TETROMINO_MATRICES[type][0];
    const pWidth = matrix[0].length;
    // Center horizontally inside 4-wide or 10-wide playfield
    const spawnX = Math.max(0, Math.floor((this.cols - pWidth) / 2));
    // Spawn in buffer zone right above visible ceiling (y = 4)
    const spawnY = 4;

    this.activePiece = {
      type,
      rot: 0,
      x: spawnX,
      y: spawnY,
      matrix
    };

    this.lockTimer = 0;
    this.lockMoveResets = 0;
    this.lowestYReached = spawnY;
    this.lastMoveWasRotation = false;

    // Check immediate block-out collision in spawn zone
    if (!this.isValidPosition(this.activePiece.x, this.activePiece.y, this.activePiece.matrix)) {
      // Try spawning 1 or 2 rows higher in the buffer zone before declaring Top-Out
      if (this.isValidPosition(this.activePiece.x, this.activePiece.y - 1, this.activePiece.matrix)) {
        this.activePiece.y -= 1;
      } else if (this.isValidPosition(this.activePiece.x, this.activePiece.y - 2, this.activePiece.matrix)) {
        this.activePiece.y -= 2;
      } else {
        this.triggerTopOut();
      }
    }
  }

  isValidPosition(nx, ny, matrix) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const gx = nx + c;
        const gy = ny + r;
        if (gx < 0 || gx >= this.cols || gy >= this.rows) return false;
        if (gy >= 0 && this.grid[gy][gx] !== null) return false;
      }
    }
    return true;
  }

  moveHorizontal(dir) {
    if (this.gameOver || !this.activePiece) return false;
    const nx = this.activePiece.x + dir;
    if (this.isValidPosition(nx, this.activePiece.y, this.activePiece.matrix)) {
      this.activePiece.x = nx;
      this.lastMoveWasRotation = false;
      this.registerLockReset();
      if (this.callbacks.onSfx) this.callbacks.onSfx('move');
      return true;
    }
    return false;
  }

  rotate(dir) {
    // dir: 1 = CW, 3 = CCW, 2 = 180
    if (this.gameOver || !this.activePiece) return false;
    const p = this.activePiece;
    const oldRot = p.rot;
    const newRot = (oldRot + dir) % 4;
    const newMatrix = TETROMINO_MATRICES[p.type][newRot];

    const kickKey = `${oldRot}>${newRot}`;
    const kickTable = (p.type === 'I') ? SRS_I_KICKS : SRS_JLSTZ_KICKS;
    const kicks = kickTable[kickKey] || [[0, 0]];

    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      if (this.isValidPosition(p.x + dx, p.y + dy, newMatrix)) {
        p.x += dx;
        p.y += dy;
        p.rot = newRot;
        p.matrix = newMatrix;
        this.lastMoveWasRotation = true;
        this.lastKickIndex = i;
        this.registerLockReset();
        if (this.callbacks.onSfx) this.callbacks.onSfx('rotate');
        return true;
      }
    }
    return false;
  }

  softDrop(instant = false) {
    if (this.gameOver || !this.activePiece) return false;
    let moved = false;
    if (instant) {
      while (this.isValidPosition(this.activePiece.x, this.activePiece.y + 1, this.activePiece.matrix)) {
        this.activePiece.y += 1;
        moved = true;
      }
    } else {
      if (this.isValidPosition(this.activePiece.x, this.activePiece.y + 1, this.activePiece.matrix)) {
        this.activePiece.y += 1;
        moved = true;
      }
    }

    if (moved) {
      this.lastMoveWasRotation = false;
      if (this.activePiece.y > this.lowestYReached) {
        this.lowestYReached = this.activePiece.y;
        this.lockMoveResets = 0;
        this.lockTimer = 0;
      }
      if (this.callbacks.onSfx) this.callbacks.onSfx('softdrop');
    }
    return moved;
  }

  hardDrop() {
    if (this.gameOver || !this.activePiece) return;
    let droppedRows = 0;
    while (this.isValidPosition(this.activePiece.x, this.activePiece.y + 1, this.activePiece.matrix)) {
      this.activePiece.y += 1;
      droppedRows += 1;
    }
    if (droppedRows > 0) this.lastMoveWasRotation = false;
    if (this.callbacks.onSfx) this.callbacks.onSfx('harddrop');
    this.lockPiece();
  }

  hold() {
    if (this.gameOver || !this.activePiece || !this.canHold) return;
    const currentType = this.activePiece.type;
    if (this.holdPiece === null) {
      this.holdPiece = currentType;
      this.spawnNextPiece();
    } else {
      const swapType = this.holdPiece;
      this.holdPiece = currentType;
      this.spawnPieceOfType(swapType);
    }
    this.canHold = false;
    if (this.callbacks.onSfx) this.callbacks.onSfx('hold');
  }

  getGhostY() {
    if (!this.activePiece) return 0;
    let gy = this.activePiece.y;
    while (this.isValidPosition(this.activePiece.x, gy + 1, this.activePiece.matrix)) {
      gy += 1;
    }
    return gy;
  }

  isGrounded() {
    if (!this.activePiece) return false;
    return !this.isValidPosition(this.activePiece.x, this.activePiece.y + 1, this.activePiece.matrix);
  }

  registerLockReset() {
    if (this.isGrounded() && this.lockMoveResets < this.maxLockMoveResets) {
      this.lockTimer = 0;
      this.lockMoveResets += 1;
    }
  }

  // 3-Corner T-Spin Detection
  detectTSpin() {
    const p = this.activePiece;
    if (!p || p.type !== 'T' || !this.lastMoveWasRotation) {
      return { isTSpin: false, isMini: false };
    }

    const cx = p.x + 1;
    const cy = p.y + 1;
    const corners = [
      [cx - 1, cy - 1], // Top-Left
      [cx + 1, cy - 1], // Top-Right
      [cx + 1, cy + 1], // Bottom-Right
      [cx - 1, cy + 1]  // Bottom-Left
    ];

    let occupiedCount = 0;
    const occupiedFlags = corners.map(([x, y]) => {
      if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
        occupiedCount += 1;
        return true;
      }
      if (this.grid[y][x] !== null) {
        occupiedCount += 1;
        return true;
      }
      return false;
    });

    if (occupiedCount < 3) return { isTSpin: false, isMini: false };

    // Front corners based on T orientation (0: N, 1: E, 2: S, 3: W)
    const frontIndices = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0]
    ][p.rot];

    const frontFilled = occupiedFlags[frontIndices[0]] && occupiedFlags[frontIndices[1]];
    const isMini = !frontFilled && this.lastKickIndex < 4;
    return { isTSpin: true, isMini };
  }

  lockPiece() {
    if (!this.activePiece || this.gameOver) return;
    const p = this.activePiece;
    const tSpinCheck = this.detectTSpin();

    let lockedEntirelyAboveVisible = true;
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (!p.matrix[r][c]) continue;
        const gx = p.x + c;
        const gy = p.y + r;
        if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
          this.grid[gy][gx] = p.type;
          if (gy >= this.bufferRows) {
            lockedEntirelyAboveVisible = false;
          }
        }
      }
    }

    this.piecesPlaced += 1;

    // Lock-out condition: piece locked completely inside the 6 buffer rows
    if (lockedEntirelyAboveVisible) {
      this.triggerTopOut();
      return;
    }

    // Evaluate completed lines across all 26 rows
    const clearedRowIndices = [];
    for (let r = 0; r < this.rows; r++) {
      if (this.grid[r].every(cell => cell !== null)) {
        clearedRowIndices.push(r);
      }
    }

    const clearedCount = clearedRowIndices.length;
    if (clearedCount > 0) {
      // Remove completed rows and unshift empty buffer rows at top
      for (let i = clearedRowIndices.length - 1; i >= 0; i--) {
        this.grid.splice(clearedRowIndices[i], 1);
      }
      while (this.grid.length < this.rows) {
        this.grid.unshift(Array(this.cols).fill(null));
      }
    }

    // Check Perfect Clear (All Clear)
    const isPerfectClear = this.grid.every(row => row.every(cell => cell === null));

    // Calculate Attack & Garbage Cancellation
    this.processLineClearAttack(clearedCount, tSpinCheck, isPerfectClear);

    // Spawn next piece
    this.spawnNextPiece();

    if (this.callbacks.onSync) {
      this.callbacks.onSync();
    }
  }

  processLineClearAttack(cleared, tSpin, isPC) {
    let baseAttack = 0;
    let difficultClear = false;
    let calloutText = '';

    if (cleared > 0) {
      this.combo += 1;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.linesCleared += cleared;

      if (tSpin.isTSpin) {
        difficultClear = true;
        if (tSpin.isMini) {
          baseAttack = cleared === 1 ? 1 : 2;
          calloutText = `T-SPIN MINI ${cleared === 1 ? 'SINGLE' : 'DOUBLE'}`;
        } else {
          baseAttack = cleared * 2; // Single: 2, Double: 4, Triple: 6
          calloutText = `T-SPIN ${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][cleared] || 'QUAD'}`;
        }
      } else {
        if (cleared === 1) {
          baseAttack = 0;
          // In 4x26 mode, clearing a 4-wide quad is a single row clear, so we reward combos and 4-row quads
        } else if (cleared === 2) {
          baseAttack = 1;
          calloutText = 'DOUBLE';
        } else if (cleared === 3) {
          baseAttack = 2;
          calloutText = 'TRIPLE';
        } else if (cleared >= 4) {
          baseAttack = 4;
          difficultClear = true;
          calloutText = 'QUAD / TETRIS!';
        }
      }

      if (difficultClear) {
        this.b2b += 1;
        if (this.b2b > 0) {
          baseAttack += 1; // B2B bonus (+1 line, +2 at higher chains)
          if (this.b2b >= 3) baseAttack += 1;
          calloutText = `B2B x${this.b2b} ${calloutText}`;
        }
      } else {
        this.b2b = -1;
      }

      // Add Combo Bonus
      const comboBonus = COMBO_GARBAGE_TABLE[Math.min(this.combo, COMBO_GARBAGE_TABLE.length - 1)];
      let totalAttack = baseAttack + comboBonus;

      if (isPC) {
        totalAttack += 10;
        calloutText = 'ALL CLEAR (+10)';
      } else if (this.combo >= 2 && !calloutText) {
        calloutText = `${this.combo} COMBO`;
      } else if (this.combo >= 2) {
        calloutText += ` (${this.combo}x COMBO)`;
      }

      if (tSpin.isTSpin) {
        if (this.callbacks.onSfx) this.callbacks.onSfx('tspin');
      } else {
        if (this.callbacks.onSfx) this.callbacks.onSfx('combo', this.combo + 1);
      }

      if (calloutText && this.callbacks.onCallout) {
        this.callbacks.onCallout(calloutText);
      }

      // First cancel incoming garbage in queue before dispatching outgoing garbage
      if (totalAttack > 0) {
        const netOutgoing = this.cancelIncomingGarbage(totalAttack);
        if (netOutgoing > 0) {
          this.attackSent += netOutgoing;
          if (this.callbacks.onSendGarbage) {
            this.callbacks.onSendGarbage(netOutgoing);
          }
        }
      }
    } else {
      // Piece locked with 0 lines cleared -> combo resets & queued garbage rises onto board
      this.combo = -1;
      if (tSpin.isTSpin && this.callbacks.onCallout) {
        this.callbacks.onCallout('T-SPIN');
        if (this.callbacks.onSfx) this.callbacks.onSfx('tspin');
      } else {
        if (this.callbacks.onSfx) this.callbacks.onSfx('lock');
      }
      this.tankQueuedGarbage();
    }
  }

  queueIncomingGarbage(lines) {
    if (lines <= 0 || this.gameOver) return;
    this.garbageQueue.push({ lines });
    if (this.callbacks.onSfx) this.callbacks.onSfx('garbage_in');
  }

  getPendingGarbageCount() {
    return this.garbageQueue.reduce((sum, item) => sum + item.lines, 0);
  }

  cancelIncomingGarbage(attackAmount) {
    let remaining = attackAmount;
    while (remaining > 0 && this.garbageQueue.length > 0) {
      const front = this.garbageQueue[0];
      if (front.lines <= remaining) {
        remaining -= front.lines;
        this.garbageQueue.shift();
      } else {
        front.lines -= remaining;
        remaining = 0;
      }
    }
    return remaining;
  }

  tankQueuedGarbage() {
    if (this.garbageQueue.length === 0) return;

    // Cap garbage insertion per piece lock at 8 lines (TETR.IO style passthrough cap)
    let toInsert = 0;
    const maxPerLock = 8;

    while (this.garbageQueue.length > 0 && toInsert < maxPerLock) {
      const front = this.garbageQueue[0];
      const take = Math.min(front.lines, maxPerLock - toInsert);
      toInsert += take;
      front.lines -= take;
      if (front.lines <= 0) this.garbageQueue.shift();
    }

    if (toInsert <= 0) return;
    this.garbageReceivedTotal += toInsert;

    for (let i = 0; i < toInsert; i++) {
      // 75% chance to keep garbage hole in the same column for clean downstacking
      if (this.rng() > 0.75 || this.currentGarbageHole >= this.cols) {
        this.currentGarbageHole = Math.floor(this.rng() * this.cols);
      }
      const gRow = Array(this.cols).fill('G');
      gRow[this.currentGarbageHole] = null;

      this.grid.shift();
      this.grid.push(gRow);
    }
  }

  triggerTopOut() {
    if (this.gameOver) return;
    this.gameOver = true;
    if (this.callbacks.onSfx) this.callbacks.onSfx('lose');
    if (this.callbacks.onTopOut) {
      this.callbacks.onTopOut(this.getLiveMetrics());
    }
  }

  getLiveMetrics() {
    const elapsedSec = Math.max(0.5, (performance.now() - this.startTime) / 1000);
    const elapsedMin = elapsedSec / 60;
    const apm = Number((this.attackSent / elapsedMin).toFixed(1));
    const pps = Number((this.piecesPlaced / elapsedSec).toFixed(2));
    const vsScore = Number((((this.attackSent + this.garbageReceivedTotal) / elapsedSec) * 100).toFixed(1));

    return {
      apm,
      pps,
      vsScore,
      linesCleared: this.linesCleared,
      attackSent: this.attackSent,
      garbageReceived: this.garbageReceivedTotal,
      combo: Math.max(0, this.combo),
      maxCombo: this.maxCombo,
      b2b: Math.max(0, this.b2b),
      pendingGarbage: this.getPendingGarbageCount()
    };
  }

  update(dtMs) {
    if (this.gameOver || !this.activePiece) return;

    if (this.isGrounded()) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= this.lockDelayMax) {
        this.lockPiece();
      }
    } else {
      this.gravityTimer += dtMs;
      if (this.gravityTimer >= this.gravityInterval) {
        this.gravityTimer %= this.gravityInterval;
        this.activePiece.y += 1;
        if (this.activePiece.y > this.lowestYReached) {
          this.lowestYReached = this.activePiece.y;
          this.lockMoveResets = 0;
          this.lockTimer = 0;
        }
      }
    }
  }
}

window.StackerEngine = StackerEngine;
window.PIECE_COLORS = PIECE_COLORS;
window.TETROMINO_MATRICES = TETROMINO_MATRICES;
