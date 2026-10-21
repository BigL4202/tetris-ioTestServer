// ============================================================================
// PROJECT A^2 STANDALONE AI BOT ENGINE (PATH-VERIFIED 1-10 DIFFICULTY)
// ============================================================================

class StackerAI {
  constructor(difficulty = 5) {
    this.setDifficulty(difficulty);
    this.engine = null;
    this.moveTimer = 0;
    this.actionQueue = []; // Verified sequence of actions: ['CW', 'L', 'L', 'HD']
  }

  setDifficulty(level) {
    this.difficulty = Math.max(1, Math.min(10, Number(level) || 5));

    // Action interval (ms per step) & suboptimal choice probability
    // Level 1: Slow & occasional mistakes | Level 10: Blistering fast & 0 mistakes
    const speedTable = [380, 300, 235, 185, 145, 112, 85, 64, 48, 34];
    const errorTable = [0.28, 0.20, 0.14, 0.09, 0.05, 0.025, 0.01, 0.0, 0.0, 0.0];

    this.stepIntervalMs = speedTable[this.difficulty - 1];
    this.mistakeRate = errorTable[this.difficulty - 1];
  }

  bindEngine(engineInstance) {
    this.engine = engineInstance;
    this.moveTimer = 0;
    this.actionQueue = [];
  }

  reset(seed, cols = 4) {
    if (!this.engine) return;
    this.engine.reset(seed, cols);
    this.moveTimer = 0;
    this.actionQueue = [];
  }

  update(dtMs) {
    if (!this.engine || this.engine.gameOver || !this.engine.activePiece) return;

    this.engine.update(dtMs);
    this.moveTimer += dtMs;

    while (this.moveTimer >= this.stepIntervalMs) {
      this.moveTimer -= this.stepIntervalMs;
      if (this.engine.gameOver || !this.engine.activePiece) break;

      if (this.actionQueue.length === 0) {
        this.actionQueue = this.planBestActionSequence();
      }

      const nextAct = this.actionQueue.shift();
      this.executeAction(nextAct);
    }
  }

  executeAction(act) {
    if (!this.engine || this.engine.gameOver || !this.engine.activePiece) return;
    switch (act) {
      case 'L':
        this.engine.moveHorizontal(-1);
        break;
      case 'R':
        this.engine.moveHorizontal(1);
        break;
      case 'CW':
        this.engine.rotate(1);
        break;
      case 'CCW':
        this.engine.rotate(3);
        break;
      case '180':
        this.engine.rotate(2);
        break;
      case 'SD':
        this.engine.softDrop(true);
        break;
      case 'HD':
      default:
        this.actionQueue = [];
        this.engine.hardDrop();
        break;
    }
  }

  // Simulates SRS rotation with kicks on a virtual piece state
  simulateRotation(type, x, y, oldRot, dir, grid, cols, rows) {
    const newRot = (oldRot + dir) % 4;
    const newMat = window.TETROMINO_MATRICES[type][newRot];
    const kickKey = `${oldRot}>${newRot}`;
    const kickTable = (type === 'I')
      ? {
          '0>1': [[0,0], [-2,0], [ 1,0], [-2, 1], [ 1,-2], [-1,0], [0,-1]],
          '0>3': [[0,0], [-1,0], [ 2,0], [-1,-2], [ 2, 1], [ 1,0], [0, 1]],
          '0>2': [[0,0], [0,-1], [-1,0], [ 1,0]]
        }
      : {
          '0>1': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
          '0>3': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
          '0>2': [[0,0], [0,-1], [1,-1], [-1,-1], [1,0], [-1,0]]
        };

    const kicks = kickTable[kickKey] || [[0, 0]];
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      if (this.isValidSimPos(x + dx, y + dy, newMat, grid, cols, rows)) {
        return { ok: true, x: x + dx, y: y + dy, rot: newRot, mat: newMat };
      }
    }
    return { ok: false };
  }

  isValidSimPos(nx, ny, mat, grid, cols, rows) {
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (!mat[r][c]) continue;
        const gx = nx + c;
        const gy = ny + r;
        if (gx < 0 || gx >= cols || gy >= rows) return false;
        if (gy >= 0 && grid[gy][gx] !== null) return false;
      }
    }
    return true;
  }

  planBestActionSequence() {
    const p = this.engine.activePiece;
    if (!p) return ['HD'];

    const cols = this.engine.cols;
    const rows = this.engine.rows;
    const grid = this.engine.grid;

    let candidates = this.findReachablePlacementsForPiece(p.type, p.x, p.y, grid, cols, rows, false);

    // If hold is available, also check if holding gives a significantly better placement
    if (this.engine.canHold && this.difficulty >= 4) {
      const holdType = this.engine.holdPiece || this.engine.nextQueue[0];
      if (holdType && holdType !== p.type) {
        const hMat = window.TETROMINO_MATRICES[holdType][0];
        const hSpawnX = Math.max(0, Math.floor((cols - hMat[0].length) / 2));
        const holdCandidates = this.findReachablePlacementsForPiece(holdType, hSpawnX, 4, grid, cols, rows, true);
        candidates = candidates.concat(holdCandidates);
      }
    }

    if (candidates.length === 0) {
      return ['HD'];
    }

    candidates.sort((a, b) => b.score - a.score);

    // Lower difficulties occasionally pick a slightly suboptimal placement
    if (candidates.length > 1 && Math.random() < this.mistakeRate) {
      const idx = Math.min(candidates.length - 1, 1 + Math.floor(Math.random() * 2));
      return candidates[idx].actions;
    }

    return candidates[0].actions;
  }

  findReachablePlacementsForPiece(type, startX, startY, grid, cols, rows, useHoldPrefix) {
    const results = [];
    const rotOptions = [
      { dir: 0, act: null },
      { dir: 1, act: 'CW' },
      { dir: 3, act: 'CCW' },
      { dir: 2, act: '180' }
    ];

    for (const rOpt of rotOptions) {
      let curX = startX;
      let curY = startY;
      let curMat = window.TETROMINO_MATRICES[type][0];
      const baseActions = useHoldPrefix ? ['HOLD'] : [];

      if (rOpt.dir !== 0) {
        const simRot = this.simulateRotation(type, curX, curY, 0, rOpt.dir, grid, cols, rows);
        if (!simRot.ok) continue;
        curX = simRot.x;
        curY = simRot.y;
        curMat = simRot.mat;
        baseActions.push(rOpt.act);
      } else {
        if (!this.isValidSimPos(curX, curY, curMat, grid, cols, rows)) continue;
      }

      // 1. Test dropping at current X (0 horizontal shifts)
      this.recordLandingCandidate(type, curX, curY, curMat, [...baseActions], grid, cols, rows, results);

      // 2. Walk Left step-by-step (verifies piece never clips through a wall or high stack)
      let lx = curX;
      const leftActions = [...baseActions];
      while (this.isValidSimPos(lx - 1, curY, curMat, grid, cols, rows)) {
        lx -= 1;
        leftActions.push('L');
        this.recordLandingCandidate(type, lx, curY, curMat, [...leftActions], grid, cols, rows, results);
      }

      // 3. Walk Right step-by-step
      let rx = curX;
      const rightActions = [...baseActions];
      while (this.isValidSimPos(rx + 1, curY, curMat, grid, cols, rows)) {
        rx += 1;
        rightActions.push('R');
        this.recordLandingCandidate(type, rx, curY, curMat, [...rightActions], grid, cols, rows, results);
      }
    }

    return results;
  }

  recordLandingCandidate(type, x, startY, mat, moveActions, grid, cols, rows, results) {
    let landY = startY;
    while (this.isValidSimPos(x, landY + 1, mat, grid, cols, rows)) {
      landY += 1;
    }

    const score = this.evaluateBoardAfterLock(x, landY, mat, type, grid, cols, rows);
    results.push({
      score,
      actions: [...moveActions, 'HD']
    });
  }

  evaluateBoardAfterLock(px, py, mat, type, grid, cols, rows) {
    const simGrid = grid.map(r => [...r]);
    let lockedAboveCeiling = true;

    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (!mat[r][c]) continue;
        const gx = px + c;
        const gy = py + r;
        if (gy >= 0 && gy < rows && gx >= 0 && gx < cols) {
          simGrid[gy][gx] = type;
          if (gy >= this.engine.bufferRows) {
            lockedAboveCeiling = false;
          }
        }
      }
    }

    // Never choose a move that immediately tops out in the buffer zone!
    if (lockedAboveCeiling) {
      return -999999;
    }

    // Clear completed rows
    let linesCleared = 0;
    for (let r = rows - 1; r >= 0; r--) {
      if (simGrid[r].every(cell => cell !== null)) {
        linesCleared += 1;
        simGrid.splice(r, 1);
        simGrid.unshift(Array(cols).fill(null));
        r++;
      }
    }

    // Calculate column heights, buried holes, and blocks covering holes
    const colHeights = Array(cols).fill(0);
    let holes = 0;
    let coveredBlocks = 0;

    for (let c = 0; c < cols; c++) {
      let topFound = false;
      let blocksAboveInCol = 0;
      for (let r = 0; r < rows; r++) {
        if (simGrid[r][c] !== null) {
          if (!topFound) {
            colHeights[c] = rows - r;
            topFound = true;
          }
          blocksAboveInCol += 1;
        } else if (topFound) {
          holes += 1;
          coveredBlocks += Math.min(4, blocksAboveInCol);
        }
      }
    }

    const aggregateHeight = colHeights.reduce((a, b) => a + b, 0);
    const maxHeight = Math.max(...colHeights);

    let bumpiness = 0;
    let maxPillarDiff = 0;
    for (let c = 0; c < cols - 1; c++) {
      const diff = Math.abs(colHeights[c] - colHeights[c + 1]);
      bumpiness += diff;
      if (diff > maxPillarDiff) maxPillarDiff = diff;
    }

    // Heuristic Weights tuned specifically for 4x26 & 10x26 survival + downstacking
    let score = 0;
    score += linesCleared * 42.0;
    if (linesCleared >= 2) score += linesCleared * 28.0;
    if (linesCleared >= 4) score += 90.0;

    score -= holes * 55.0;          // Heavily avoid creating buried holes
    score -= coveredBlocks * 14.0;  // Penalize stacking over existing holes
    score -= aggregateHeight * 1.4; // Keep stack low
    score -= maxHeight * 2.8;       // Prevent single-column towers
    score -= bumpiness * 3.2;       // Keep surface flat so O, S, Z, T pieces fit cleanly

    if (maxPillarDiff >= 3) {
      score -= (maxPillarDiff - 2) * 18.0; // Avoid deep narrow wells unless clearing them
    }

    // Extra urgency to clear lines when stack is high
    if (maxHeight >= 14) {
      score += linesCleared * 50.0;
      score -= maxHeight * 6.0;
    }

    return score;
  }
}

window.StackerAI = StackerAI;
