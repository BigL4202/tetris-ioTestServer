// ============================================================================
// PROJECT A^2 CORE STACKER ENGINE (SRS, 7-BAG, TRAILS & PARTICLE SHATTER)
// ============================================================================

const PIECE_COLORS = {
  I: '#00e5ff',
  O: '#ffea00',
  T: '#d500f9',
  S: '#00e676',
  Z: '#ff1744',
  J: '#2979ff',
  L: '#ff9100',
  G: '#78909c'
};

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

const SRS_JLSTZ_KICKS = {
  '0>1': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
  '1>0': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
  '1>2': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
  '2>1': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
  '2>3': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
  '3>2': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
  '3>0': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
  '0>3': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
  '0>2': [[0,0], [0,-1], [1,-1], [-1,-1], [1,0], [-1,0]],
  '2>0': [[0,0], [0, 1], [-1,1], [ 1, 1], [-1,0], [1,0]],
  '1>3': [[0,0], [1, 0], [1,-1], [ 1, 1], [0,-1], [0,1]],
  '3>1': [[0,0], [-1,0], [-1,-1],[-1, 1], [0,-1], [0,1]]
};

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

const COMBO_GARBAGE_TABLE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7];

class StackerEngine {
  constructor(cols = 4, rows = 26, visibleRows = 20, callbacks = {}) {
    this.cols = cols;
    this.rows = rows;
    this.visibleRows = visibleRows;
    this.bufferRows = rows - visibleRows;
    this.callbacks = callbacks;
    this.lockFlashCells = [];
    this.hardDropTrails = []; // [{ x, startY, endY, color, createdAt, expiresAt }]
    this.clearParticles = []; // [{ x, y, vx, vy, size, color, alpha }]
    this.reset(Math.floor(Math.random() * 2147483647), cols);
  }

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
    this.lockFlashCells = [];
    this.hardDropTrails = [];
    this.clearParticles = [];

    this.gravityInterval = 850;
    this.gravityTimer = 0;
    this.lockDelayMax = 500;
    this.lockTimer = 0;
    this.lockMoveResets = 0;
    this.maxLockMoveResets = 15;
    this.lowestYReached = 0;

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
    const spawnX = Math.max(0, Math.floor((this.cols - pWidth) / 2));
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

    if (!this.isValidPosition(this.activePiece.x, this.activePiece.y, this.activePiece.matrix)) {
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
    const p = this.activePiece;
    const startY = p.y;
    let droppedRows = 0;
    while (this.isValidPosition(p.x, p.y + 1, p.matrix)) {
      p.y += 1;
      droppedRows += 1;
    }

    // Record Hard-Drop Motion Trail for each column of the piece
    if (droppedRows > 1) {
      const now = performance.now();
      const color = PIECE_COLORS[p.type] || '#00e5ff';
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (p.matrix[r][c]) {
            this.hardDropTrails.push({
              x: p.x + c,
              startY: startY + r,
              endY: p.y + r,
              color,
              createdAt: now,
              expiresAt: now + 180
            });
          }
        }
      }
      this.lastMoveWasRotation = false;
    }

    if (this.callbacks.onSfx) this.callbacks.onSfx('harddrop');
    if (this.callbacks.onBoardImpulse) {
      this.callbacks.onBoardImpulse(0, Math.min(7, 2.5 + droppedRows * 0.2), false);
    }
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

  detectTSpin() {
    const p = this.activePiece;
    if (!p || p.type !== 'T' || !this.lastMoveWasRotation) {
      return { isTSpin: false, isMini: false };
    }

    const cx = p.x + 1;
    const cy = p.y + 1;
    const corners = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx + 1, cy + 1],
      [cx - 1, cy + 1]
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

  spawnLineClearParticles(rowIndex, rowCells) {
    const cellSize = 32;
    for (let c = 0; c < this.cols; c++) {
      const cellType = rowCells[c];
      const color = PIECE_COLORS[cellType] || '#00e5ff';
      const baseX = (c + 0.5) * cellSize;
      const baseY = (rowIndex + 0.5) * cellSize;

      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 190;
        this.clearParticles.push({
          x: baseX + (Math.random() - 0.5) * 14,
          y: baseY + (Math.random() - 0.5) * 14,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          size: 4 + Math.random() * 5,
          color,
          alpha: 1.0
        });
      }
    }
  }

  lockPiece() {
    if (!this.activePiece || this.gameOver) return;
    const p = this.activePiece;
    const tSpinCheck = this.detectTSpin();
    const flashExpire = performance.now() + 115;

    let lockedEntirelyAboveVisible = true;
    for (let r = 0; r < p.matrix.length; r++) {
      for (let c = 0; c < p.matrix[r].length; c++) {
        if (!p.matrix[r][c]) continue;
        const gx = p.x + c;
        const gy = p.y + r;
        if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
          this.grid[gy][gx] = p.type;
          this.lockFlashCells.push({ x: gx, y: gy, expiresAt: flashExpire });
          if (gy >= this.bufferRows) {
            lockedEntirelyAboveVisible = false;
          }
        }
      }
    }

    this.piecesPlaced += 1;

    if (lockedEntirelyAboveVisible) {
      this.triggerTopOut();
      return;
    }

    const clearedRowIndices = [];
    for (let r = 0; r < this.rows; r++) {
      if (this.grid[r].every(cell => cell !== null)) {
        clearedRowIndices.push(r);
        // Trigger Line-Clear Particle Shatter for this row!
        this.spawnLineClearParticles(r, this.grid[r]);
      }
    }

    const clearedCount = clearedRowIndices.length;
    if (clearedCount > 0) {
      for (let i = clearedRowIndices.length - 1; i >= 0; i--) {
        this.grid.splice(clearedRowIndices[i], 1);
      }
      while (this.grid.length < this.rows) {
        this.grid.unshift(Array(this.cols).fill(null));
      }
    }

    const isPerfectClear = this.grid.every(row => row.every(cell => cell === null));
    this.processLineClearAttack(clearedCount, tSpinCheck, isPerfectClear);
    this.spawnNextPiece();

    if (this.callbacks.onSync) {
      this.callbacks.onSync();
    }
  }

  processLineClearAttack(cleared, tSpin, isPC) {
    let baseAttack = 0;
    let difficultClear = false;
    const parts = [];

    if (cleared > 0) {
      this.combo += 1;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.linesCleared += cleared;

      if (tSpin.isTSpin) {
        difficultClear = true;
        if (tSpin.isMini) {
          baseAttack = cleared === 1 ? 1 : 2;
          parts.push(`T-SPIN MINI ${cleared === 1 ? 'SINGLE' : 'DOUBLE'}`);
        } else {
          baseAttack = cleared * 2;
          parts.push(`T-SPIN ${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][cleared] || 'QUAD'}`);
        }
      } else {
        if (cleared === 1) {
          baseAttack = 0;
          parts.push('SINGLE');
        } else if (cleared === 2) {
          baseAttack = 1;
          parts.push('DOUBLE');
        } else if (cleared === 3) {
          baseAttack = 2;
          parts.push('TRIPLE');
        } else if (cleared >= 4) {
          baseAttack = 4;
          difficultClear = true;
          parts.push('QUAD');
        }
      }

      if (difficultClear) {
        this.b2b += 1;
        if (this.b2b > 0) {
          baseAttack += 1;
          if (this.b2b >= 3) baseAttack += 1;
          parts.unshift(`B2B x${this.b2b}`);
        }
      } else {
        this.b2b = -1;
      }

      const comboBonus = COMBO_GARBAGE_TABLE[Math.min(this.combo, COMBO_GARBAGE_TABLE.length - 1)];
      let totalAttack = baseAttack + comboBonus;

      if (this.combo >= 1) {
        parts.push(`${this.combo}x COMBO`);
      }

      if (isPC) {
        totalAttack += 10;
        parts.push('ALL CLEAR');
      }

      if (totalAttack > 0) {
        parts.push(`+${totalAttack} LINES`);
      }

      if (tSpin.isTSpin) {
        if (this.callbacks.onSfx) this.callbacks.onSfx('tspin');
      } else {
        if (this.callbacks.onSfx) this.callbacks.onSfx('combo', this.combo + 1);
      }

      if (parts.length > 0 && this.callbacks.onCallout) {
        this.callbacks.onCallout(parts.join(' • '));
      }

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
    if (this.callbacks.onBoardImpulse) {
      this.callbacks.onBoardImpulse((Math.random() > 0.5 ? 1 : -1) * Math.min(8, lines * 1.4), 3, true);
    }
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

  updateParticles(dtMs) {
    if (this.clearParticles.length === 0) return;
    const dt = dtMs / 1000;
    for (let i = this.clearParticles.length - 1; i >= 0; i--) {
      const pt = this.clearParticles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 380 * dt; // Gravity
      pt.alpha -= dt * 1.9;
      if (pt.alpha <= 0) {
        this.clearParticles.splice(i, 1);
      }
    }
  }

  update(dtMs) {
    this.updateParticles(dtMs);
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
