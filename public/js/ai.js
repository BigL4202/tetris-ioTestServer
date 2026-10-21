// ============================================================================
// PROJECT A^2 STANDALONE AI BOT ENGINE (10 DIFFICULTY LEVELS)
// ============================================================================

class StackerAI {
  constructor(difficulty = 5) {
    this.setDifficulty(difficulty);
    this.engine = null;
    this.moveTimer = 0;
    this.currentPlan = null; // { targetRot, targetX }
  }

  setDifficulty(level) {
    this.difficulty = Math.max(1, Math.min(10, Number(level) || 5));

    // Action interval (ms between bot keystrokes) & mistake probability
    // Level 1: ~420ms per step, 35% suboptimal move chance
    // Level 10: ~42ms per step (~3.8 PPS), 0% mistake chance
    const speedTable = [420, 330, 260, 200, 155, 120, 92, 70, 54, 42];
    const errorTable = [0.35, 0.26, 0.18, 0.12, 0.08, 0.05, 0.03, 0.015, 0.005, 0.0];

    this.stepIntervalMs = speedTable[this.difficulty - 1];
    this.mistakeRate = errorTable[this.difficulty - 1];
  }

  bindEngine(engineInstance) {
    this.engine = engineInstance;
    this.moveTimer = 0;
    this.currentPlan = null;
  }

  reset(seed, cols = 4) {
    if (!this.engine) return;
    this.engine.reset(seed, cols);
    this.moveTimer = 0;
    this.currentPlan = null;
  }

  update(dtMs) {
    if (!this.engine || this.engine.gameOver || !this.engine.activePiece) return;

    this.engine.update(dtMs);
    this.moveTimer += dtMs;

    while (this.moveTimer >= this.stepIntervalMs) {
      this.moveTimer -= this.stepIntervalMs;
      if (this.engine.gameOver || !this.engine.activePiece) break;

      if (!this.currentPlan) {
        this.currentPlan = this.computeBestMove();
      }

      this.executeNextStep();
    }
  }

  executeNextStep() {
    const p = this.engine.activePiece;
    if (!p || !this.currentPlan) return;

    // 1. Rotate toward target orientation first
    if (p.rot !== this.currentPlan.targetRot) {
      const diff = (this.currentPlan.targetRot - p.rot + 4) % 4;
      if (diff === 2) this.engine.rotate(2);
      else if (diff === 3) this.engine.rotate(3);
      else this.engine.rotate(1);
      return;
    }

    // 2. Shift horizontally toward target X column
    if (p.x < this.currentPlan.targetX) {
      if (!this.engine.moveHorizontal(1)) {
        // Blocked by stack wall; lock plan and drop
        this.currentPlan.targetX = p.x;
      }
      return;
    } else if (p.x > this.currentPlan.targetX) {
      if (!this.engine.moveHorizontal(-1)) {
        this.currentPlan.targetX = p.x;
      }
      return;
    }

    // 3. Aligned with target column & rotation -> Hard Drop!
    this.currentPlan = null;
    this.engine.hardDrop();
  }

  computeBestMove() {
    const p = this.engine.activePiece;
    if (!p) return { targetRot: 0, targetX: 0 };

    const cols = this.engine.cols;
    const rows = this.engine.rows;
    const candidates = [];

    for (let rot = 0; rot < 4; rot++) {
      const mat = window.TETROMINO_MATRICES[p.type][rot];
      for (let x = -2; x < cols + 2; x++) {
        if (!this.engine.isValidPosition(x, p.y, mat)) continue;

        // Drop piece straight down to find landing Y
        let landY = p.y;
        while (this.engine.isValidPosition(x, landY + 1, mat)) {
          landY += 1;
        }

        const score = this.evaluatePlacement(x, landY, mat, p.type, cols, rows);
        candidates.push({ targetRot: rot, targetX: x, score });
      }
    }

    if (candidates.length === 0) {
      return { targetRot: 0, targetX: p.x };
    }

    candidates.sort((a, b) => b.score - a.score);

    // Lower difficulties occasionally pick 2nd or 3rd best move
    if (candidates.length > 1 && Math.random() < this.mistakeRate) {
      const pickIdx = Math.min(candidates.length - 1, 1 + Math.floor(Math.random() * 2));
      return candidates[pickIdx];
    }

    return candidates[0];
  }

  evaluatePlacement(px, py, mat, type, cols, rows) {
    // Clone grid & place piece
    const simGrid = this.engine.grid.map(r => [...r]);
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (!mat[r][c]) continue;
        const gx = px + c;
        const gy = py + r;
        if (gy >= 0 && gy < rows && gx >= 0 && gx < cols) {
          simGrid[gy][gx] = type;
        }
      }
    }

    // Count & remove completed lines
    let linesCleared = 0;
    for (let r = rows - 1; r >= 0; r--) {
      if (simGrid[r].every(cell => cell !== null)) {
        linesCleared += 1;
        simGrid.splice(r, 1);
        simGrid.unshift(Array(cols).fill(null));
        r++;
      }
    }

    // Compute heuristics: column heights, holes, and bumpiness
    const colHeights = Array(cols).fill(0);
    let holes = 0;

    for (let c = 0; c < cols; c++) {
      let foundTop = false;
      for (let r = 0; r < rows; r++) {
        if (simGrid[r][c] !== null) {
          if (!foundTop) {
            colHeights[c] = rows - r;
            foundTop = true;
          }
        } else if (foundTop) {
          holes += 1;
        }
      }
    }

    const aggregateHeight = colHeights.reduce((a, b) => a + b, 0);
    const maxHeight = Math.max(...colHeights);
    let bumpiness = 0;
    for (let c = 0; c < cols - 1; c++) {
      bumpiness += Math.abs(colHeights[c] - colHeights[c + 1]);
    }

    // Reward line clears and combos, penalize holes, height, and jagged stacks
    let score = 0;
    score += linesCleared * 18.5;
    if (linesCleared >= 2) score += linesCleared * 12.0;
    score -= aggregateHeight * 0.62;
    score -= maxHeight * 1.15;
    score -= holes * 16.5;
    score -= bumpiness * 0.48;

    // Danger zone penalty if piece locks inside buffer rows
    if (py < this.engine.bufferRows) {
      score -= 500;
    }

    return score;
  }
}

window.StackerAI = StackerAI;
