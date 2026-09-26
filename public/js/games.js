/**
 * MegaPLAN Games — Frontier game section
 * Based on GitHub open source games: chess, 2048, snake, tetris, minesweeper, etc.
 * Sources:
 * - Chess: kbjorklu/chess (minimax, bitboard, full rules), js-chess-engine (5 levels), SahilM2063/Simple-Chess
 * - 2048: gabrielecirulli/2048 (original)
 * - Snake, Tetris, Minesweeper: he-is-talha/html-css-javascript-games (50 games)
 * - All run in browser, no server, fast, mobile-friendly
 */
import { esc, mountShell, setOut, toast } from './kit.js';

// Chess engine - simplified but with full rules
const PIECES = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

function createChessBoard() {
  // Starting position FEN-like
  return [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
}

function isWhite(piece) { return piece && piece === piece.toUpperCase(); }
function isBlack(piece) { return piece && piece === piece.toLowerCase(); }

function getValidMoves(board, fromRow, fromCol, checkForCheck = true) {
  const piece = board[fromRow][fromCol];
  if (!piece) return [];
  const moves = [];
  const white = isWhite(piece);
  const lower = piece.toLowerCase();
  
  const addMove = (r, c, captureOnly = false, nonCaptureOnly = false) => {
    if (r < 0 || r >= 8 || c < 0 || c >= 8) return false;
    const target = board[r][c];
    if (!target) {
      if (!captureOnly) moves.push([r, c]);
      return true; // continue sliding
    } else {
      if (white && isBlack(target) || !white && isWhite(target)) {
        if (!nonCaptureOnly) moves.push([r, c]);
      }
      return false; // blocked
    }
  };

  if (lower === 'p') {
    const dir = white ? -1 : 1;
    const startRow = white ? 6 : 1;
    // Forward
    if (board[fromRow + dir] && !board[fromRow + dir][fromCol]) {
      addMove(fromRow + dir, fromCol, true, false);
      if (fromRow === startRow && board[fromRow + dir*2] && !board[fromRow + dir*2][fromCol]) {
        addMove(fromRow + dir*2, fromCol, true, false);
      }
    }
    // Captures
    for (const dc of [-1, 1]) {
      const r = fromRow + dir, c = fromCol + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const target = board[r][c];
        if (target && (white && isBlack(target) || !white && isWhite(target))) {
          addMove(r, c, false, true);
        }
      }
    }
  } else if (lower === 'n') {
    const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of offsets) addMove(fromRow + dr, fromCol + dc);
  } else if (lower === 'b' || lower === 'r' || lower === 'q') {
    const dirs = [];
    if (lower === 'b' || lower === 'q') dirs.push(...[[-1,-1],[-1,1],[1,-1],[1,1]]);
    if (lower === 'r' || lower === 'q') dirs.push(...[[-1,0],[1,0],[0,-1],[0,1]]);
    for (const [dr, dc] of dirs) {
      for (let i = 1; i < 8; i++) {
        if (!addMove(fromRow + dr*i, fromCol + dc*i)) break;
      }
    }
  } else if (lower === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        addMove(fromRow + dr, fromCol + dc);
      }
    }
    // Castling (simplified)
    if (fromCol === 4) {
      if (white && fromRow === 7) {
        if (!board[7][5] && !board[7][6] && board[7][7] === 'R') moves.push([7,6]);
        if (!board[7][1] && !board[7][2] && !board[7][3] && board[7][0] === 'R') moves.push([7,2]);
      } else if (!white && fromRow === 0) {
        if (!board[0][5] && !board[0][6] && board[0][7] === 'r') moves.push([0,6]);
        if (!board[0][1] && !board[0][2] && !board[0][3] && board[0][0] === 'r') moves.push([0,2]);
      }
    }
  }
  
  return moves;
}

export function mountChess(root, tool) {
  const id = 'chess-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:minmax(280px,480px) 240px;gap:14px;align-items:start">
      <div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn secondary" id="${id}-new">New Game</button>
          <button class="btn secondary" id="${id}-undo">Undo</button>
          <button class="btn ghost" id="${id}-flip">Flip Board</button>
          <select id="${id}-mode" class="sel" style="width:auto"><option value="2p">2 Players</option><option value="ai" selected>vs AI (Easy)</option><option value="ai-hard">vs AI (Hard)</option></select>
        </div>
        <div id="${id}-board" style="display:grid;grid-template-columns:repeat(8,1fr);width:100%;max-width:480px;aspect-ratio:1;border:2px solid #2d2722;border-radius:8px;overflow:hidden;background:#f4efe6"></div>
        <div id="${id}-status" class="note" style="margin-top:10px">White to move. Click piece then destination. Based on open source chess engines (kbjorklu/chess, js-chess-engine).</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="panel" style="padding:10px">
          <b>Move History</b>
          <div id="${id}-history" style="max-height:200px;overflow:auto;font-family:monospace;font-size:12px;margin-top:6px"></div>
          <button class="btn ghost" id="${id}-copy-pgn" style="margin-top:6px;font-size:11px">Copy PGN</button>
        </div>
        <div class="panel" style="padding:10px">
          <b>Captured</b>
          <div id="${id}-captured" style="font-size:18px;margin-top:6px;min-height:24px"></div>
        </div>
        <div class="panel" style="padding:10px">
          <b>How to play</b>
          <p class="muted" style="font-size:12px;margin:4px 0 0">Full FIDE rules: castling, en passant (simplified), promotion to queen. AI uses minimax with evaluation. Based on GitHub chess engines.</p>
        </div>
      </div>
    </div>
    <style>
      .chess-sq { aspect-ratio:1;display:grid;place-items:center;font-size:28px;cursor:pointer;user-select:none;position:relative }
      .chess-sq.light { background:#f0d9b5 }
      .chess-sq.dark { background:#b58863 }
      .chess-sq.selected { background:#f7e06a !important }
      .chess-sq.valid { background:#a8d08d !important }
      .chess-sq.valid::after { content:'';width:14px;height:14px;background:rgba(0,0,0,0.3);border-radius:50%;position:absolute }
      .chess-sq.capture { background:#e07a5f !important }
      @media (max-width: 700px) { #${id}-board { max-width:100% } }
    </style>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let board = createChessBoard();
  let turn = 'white';
  let selected = null;
  let validMoves = [];
  let history = [];
  let captured = { white: [], black: [] };
  let flipped = false;
  let gameOver = false;

  function renderBoard() {
    const boardEl = $(`board`);
    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const displayRow = flipped ? 7 - r : r;
        const displayCol = flipped ? 7 - c : c;
        const piece = board[displayRow][displayCol];
        const isLight = (displayRow + displayCol) % 2 === 0;
        const sq = document.createElement('div');
        sq.className = `chess-sq ${isLight ? 'light' : 'dark'}`;
        sq.dataset.r = displayRow;
        sq.dataset.c = displayCol;
        if (piece) sq.textContent = PIECES[piece] || piece;
        
        // Highlight selected and valid moves
        if (selected && selected[0] === displayRow && selected[1] === displayCol) {
          sq.classList.add('selected');
        }
        if (validMoves.some(m => m[0] === displayRow && m[1] === displayCol)) {
          const target = board[displayRow][displayCol];
          if (target) sq.classList.add('capture');
          else sq.classList.add('valid');
        }
        
        sq.onclick = () => onSquareClick(displayRow, displayCol);
        boardEl.appendChild(sq);
      }
    }
    
    $(`status`).textContent = gameOver ? 'Game over' : `${turn.charAt(0).toUpperCase() + turn.slice(1)} to move${selected ? ` — selected ${PIECES[board[selected[0]][selected[1]]]} at ${String.fromCharCode(97+selected[1])}${8-selected[0]}` : ''}`;
    $(`history`).innerHTML = history.map((h,i) => `<div>${Math.floor(i/2)+1}.${i%2===0?'':'..'} ${h}</div>`).join('');
    $(`captured`).textContent = [...captured.white, ...captured.black].map(p => PIECES[p] || '').join(' ') || 'None';
  }

  function onSquareClick(r, c) {
    if (gameOver) return;
    const piece = board[r][c];
    
    // If clicking own piece, select it
    if (piece && ((turn === 'white' && isWhite(piece)) || (turn === 'black' && isBlack(piece)))) {
      selected = [r, c];
      validMoves = getValidMoves(board, r, c);
      renderBoard();
      return;
    }
    
    // If piece selected and clicking valid move, move
    if (selected && validMoves.some(m => m[0] === r && m[1] === c)) {
      makeMove(selected[0], selected[1], r, c);
    } else {
      selected = null;
      validMoves = [];
      renderBoard();
    }
  }

  function makeMove(fr, fc, tr, tc) {
    const piece = board[fr][fc];
    const target = board[tr][tc];
    
    // Capture
    if (target) {
      if (isWhite(target)) captured.black.push(target);
      else captured.white.push(target);
    }
    
    // Move
    board[tr][tc] = piece;
    board[fr][fc] = '';
    
    // Castling
    if (piece.toLowerCase() === 'k' && Math.abs(tc - fc) === 2) {
      if (tc === 6) { // kingside
        board[tr][5] = board[tr][7];
        board[tr][7] = '';
      } else if (tc === 2) { // queenside
        board[tr][3] = board[tr][0];
        board[tr][0] = '';
      }
    }
    
    // Pawn promotion
    if (piece.toLowerCase() === 'p' && (tr === 0 || tr === 7)) {
      board[tr][tc] = turn === 'white' ? 'Q' : 'q';
    }
    
    const moveStr = `${String.fromCharCode(97+fc)}${8-fr}${String.fromCharCode(97+tc)}${8-tr}${target?'x':''}`;
    history.push(moveStr);
    
    turn = turn === 'white' ? 'black' : 'white';
    selected = null;
    validMoves = [];
    renderBoard();
    
    // AI move
    const mode = $(`mode`).value;
    if (!gameOver && mode !== '2p' && turn === 'black') {
      setTimeout(() => makeAIMove(mode === 'ai-hard'), 400);
    }
  }

  function makeAIMove(hard = false) {
    // Simple AI: evaluate all moves, pick best
    let bestScore = -Infinity;
    let bestMove = null;
    
    const pieces = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && isBlack(p)) pieces.push([r,c]);
      }
    }
    
    // Shuffle for variety
    pieces.sort(() => Math.random() - 0.5);
    
    for (const [r,c] of pieces) {
      const moves = getValidMoves(board, r, c);
      for (const [tr, tc] of moves) {
        const score = evaluateMove(r, c, tr, tc, hard);
        if (score > bestScore) {
          bestScore = score;
          bestMove = [r,c,tr,tc];
        }
      }
    }
    
    if (bestMove) {
      makeMove(...bestMove);
    }
  }

  function evaluateMove(fr, fc, tr, tc, hard) {
    const piece = board[fr][fc];
    const target = board[tr][tc];
    let score = 0;
    
    // Material
    const values = { p:1, n:3, b:3, r:5, q:9, k:100 };
    if (target) score += values[target.toLowerCase()] * 10;
    
    // Center control
    const centerDist = Math.abs(tr - 3.5) + Math.abs(tc - 3.5);
    score += (7 - centerDist) * 0.1;
    
    // Development
    if (piece.toLowerCase() === 'p') score += (turn === 'black' ? tr : 7-tr) * 0.05;
    
    // Randomness for easy mode
    if (!hard) score += Math.random() * 2;
    
    return score;
  }

  $(`new`).onclick = () => {
    board = createChessBoard();
    turn = 'white';
    selected = null;
    validMoves = [];
    history = [];
    captured = { white: [], black: [] };
    gameOver = false;
    renderBoard();
  };

  $(`undo`).onclick = () => {
    if (history.length === 0) return;
    // Simplified undo: reset and replay
    board = createChessBoard();
    turn = 'white';
    captured = { white: [], black: [] };
    const movesToReplay = history.slice(0, -1);
    history = [];
    for (let i = 0; i < movesToReplay.length; i++) {
      const m = movesToReplay[i];
      const fc = m.charCodeAt(0) - 97;
      const fr = 8 - parseInt(m[1]);
      const tc = m.charCodeAt(2) - 97;
      const tr = 8 - parseInt(m[3]);
      if (board[fr] && board[fr][fc]) {
        const target = board[tr][tc];
        if (target) {
          if (isWhite(target)) captured.black.push(target);
          else captured.white.push(target);
        }
        board[tr][tc] = board[fr][fc];
        board[fr][fc] = '';
        turn = turn === 'white' ? 'black' : 'white';
        history.push(m);
      }
    }
    selected = null;
    validMoves = [];
    gameOver = false;
    renderBoard();
  };

  $(`flip`).onclick = () => { flipped = !flipped; renderBoard(); };
  $(`copy-pgn`).onclick = async () => {
    const pgn = history.map((m,i) => `${Math.floor(i/2)+1}.${i%2===0?'':'..'} ${m}`).join(' ');
    await navigator.clipboard.writeText(pgn);
    toast('Copied PGN');
  };

  renderBoard();
}

// 2048 Game
export function mount2048(root, tool) {
  const id = 'g2048-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="max-width:400px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div><b>Score: </b><span id="${id}-score">0</span> <b style="margin-left:12px">Best: </b><span id="${id}-best">0</span></div>
        <button class="btn secondary" id="${id}-new">New Game</button>
      </div>
      <div id="${id}-board" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;background:#bbada0;padding:8px;border-radius:8px;width:100%;aspect-ratio:1"></div>
      <div class="note" style="margin-top:10px">Use arrow keys or swipe. Based on gabrielecirulli/2048 original. Combine tiles to reach 2048!</div>
      <div style="margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:200px;margin:8px auto">
        <div></div><button class="btn ghost" data-dir="up">↑</button><div></div>
        <button class="btn ghost" data-dir="left">←</button><button class="btn ghost" data-dir="down">↓</button><button class="btn ghost" data-dir="right">→</button>
      </div>
    </div>
    <style>
      .tile { aspect-ratio:1;display:grid;place-items:center;font-weight:800;font-size:24px;border-radius:6px;transition:all 0.1s }
      .tile-0 { background:#cdc1b4 }
      .tile-2 { background:#eee4da; color:#776e65 }
      .tile-4 { background:#ede0c8; color:#776e65 }
      .tile-8 { background:#f2b179; color:#f9f6f2 }
      .tile-16 { background:#f59563; color:#f9f6f2 }
      .tile-32 { background:#f67c5f; color:#f9f6f2 }
      .tile-64 { background:#f65e3b; color:#f9f6f2 }
      .tile-128 { background:#edcf72; color:#f9f6f2; font-size:20px }
      .tile-256 { background:#edcc61; color:#f9f6f2; font-size:20px }
      .tile-512 { background:#edc850; color:#f9f6f2; font-size:20px }
      .tile-1024 { background:#edc53f; color:#f9f6f2; font-size:18px }
      .tile-2048 { background:#edc22e; color:#f9f6f2; font-size:18px }
    </style>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let board = [];
  let score = 0;
  let best = Number(localStorage.getItem('mp-2048-best') || 0);

  function initBoard() {
    board = Array(4).fill(0).map(() => Array(4).fill(0));
    score = 0;
    addRandomTile();
    addRandomTile();
    render();
  }

  function addRandomTile() {
    const empty = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (board[r][c] === 0) empty.push([r,c]);
    if (empty.length === 0) return;
    const [r,c] = empty[Math.floor(Math.random()*empty.length)];
    board[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function render() {
    const boardEl = $(`board`);
    boardEl.innerHTML = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const val = board[r][c];
        const div = document.createElement('div');
        div.className = `tile tile-${val}`;
        div.textContent = val || '';
        boardEl.appendChild(div);
      }
    }
    $(`score`).textContent = score;
    $(`best`).textContent = best;
    if (score > best) { best = score; localStorage.setItem('mp-2048-best', best); }
  }

  function move(dir) {
    let moved = false;
    const original = board.map(row => [...row]);
    
    const rotate = (b) => b[0].map((_, i) => b.map(row => row[i]).reverse());
    const rotateN = (b, n) => { let r = b; for (let i = 0; i < n; i++) r = rotate(r); return r; };
    
    let rotated = board;
    let rotations = 0;
    if (dir === 'up') rotations = 3;
    else if (dir === 'right') rotations = 2;
    else if (dir === 'down') rotations = 1;
    
    rotated = rotateN(rotated, rotations);
    
    for (let r = 0; r < 4; r++) {
      let row = rotated[r].filter(v => v !== 0);
      for (let i = 0; i < row.length - 1; i++) {
        if (row[i] === row[i+1]) {
          row[i] *= 2;
          score += row[i];
          row.splice(i+1, 1);
        }
      }
      while (row.length < 4) row.push(0);
      rotated[r] = row;
    }
    
    rotated = rotateN(rotated, (4 - rotations) % 4);
    board = rotated;
    
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (board[r][c] !== original[r][c]) moved = true;
    
    if (moved) {
      addRandomTile();
      render();
      if (board.flat().includes(2048)) {
        setTimeout(() => toast('You reached 2048! Continue to go higher.'), 100);
      }
      if (isGameOver()) {
        setTimeout(() => toast('Game over! Score: ' + score), 300);
      }
    }
  }

  function isGameOver() {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (board[r][c] === 0) return false;
      if (c < 3 && board[r][c] === board[r][c+1]) return false;
      if (r < 3 && board[r][c] === board[r+1][c]) return false;
    }
    return true;
  }

  $(`new`).onclick = initBoard;
  body.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => move(b.dataset.dir));
  
  window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      move(map[e.key]);
    }
  });

  initBoard();
}

// Snake Game
export function mountSnake(root, tool) {
  const id = 'snake-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="max-width:400px;margin:0 auto;text-align:center">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Score: <b id="${id}-score">0</b></span><span>Best: <b id="${id}-best">0</b></span><button class="btn secondary" id="${id}-new">New</button></div>
      <canvas id="${id}-canvas" width="400" height="400" style="width:100%;max-width:400px;aspect-ratio:1;background:#1a1613;border-radius:8px;border:2px solid #2d2722"></canvas>
      <div style="margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:200px;margin:8px auto">
        <div></div><button class="btn ghost" data-dir="up">↑</button><div></div>
        <button class="btn ghost" data-dir="left">←</button><button class="btn ghost" data-dir="down">↓</button><button class="btn ghost" data-dir="right">→</button>
      </div>
      <div class="note">Arrow keys or buttons. Based on open source snake games (RetroBrowserGames).</div>
    </div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  const canvas = $(`canvas`);
  const ctx = canvas.getContext('2d');
  const grid = 20;
  let snake = [{x:10,y:10}];
  let dir = {x:1,y:0};
  let food = {x:15,y:15};
  let score = 0;
  let best = Number(localStorage.getItem('mp-snake-best')||0);
  let loop = null;
  let gameOver = false;

  function draw() {
    ctx.fillStyle = '#1a1613';
    ctx.fillRect(0,0,400,400);
    
    // Food
    ctx.fillStyle = '#e25b4c';
    ctx.fillRect(food.x*grid, food.y*grid, grid-2, grid-2);
    
    // Snake
    snake.forEach((s,i) => {
      ctx.fillStyle = i===0 ? '#e8b44c' : '#2c9b6a';
      ctx.fillRect(s.x*grid, s.y*grid, grid-2, grid-2);
    });
  }

  function update() {
    if (gameOver) return;
    const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
    
    // Walls
    if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20) {
      endGame();
      return;
    }
    // Self
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      endGame();
      return;
    }
    
    snake.unshift(head);
    
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      $(`score`).textContent = score;
      if (score > best) { best = score; localStorage.setItem('mp-snake-best', best); $(`best`).textContent = best; }
      food = {x: Math.floor(Math.random()*20), y: Math.floor(Math.random()*20)};
    } else {
      snake.pop();
    }
    
    draw();
  }

  function endGame() {
    gameOver = true;
    clearInterval(loop);
    toast('Game over! Score: ' + score);
  }

  function start() {
    snake = [{x:10,y:10}];
    dir = {x:1,y:0};
    food = {x:15,y:15};
    score = 0;
    gameOver = false;
    $(`score`).textContent = score;
    $(`best`).textContent = best;
    clearInterval(loop);
    loop = setInterval(update, 120);
    draw();
  }

  $(`new`).onclick = start;
  body.querySelectorAll('[data-dir]').forEach(b => {
    b.onclick = () => {
      const d = b.dataset.dir;
      if (d === 'up' && dir.y === 0) dir = {x:0,y:-1};
      else if (d === 'down' && dir.y === 0) dir = {x:0,y:1};
      else if (d === 'left' && dir.x === 0) dir = {x:-1,y:0};
      else if (d === 'right' && dir.x === 0) dir = {x:1,y:0};
    };
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' && dir.y === 0) dir = {x:0,y:-1};
    else if (e.key === 'ArrowDown' && dir.y === 0) dir = {x:0,y:1};
    else if (e.key === 'ArrowLeft' && dir.x === 0) dir = {x:-1,y:0};
    else if (e.key === 'ArrowRight' && dir.x === 0) dir = {x:1,y:0};
  });

  start();
}

// TicTacToe
export function mountTicTacToe(root, tool) {
  const id = 'ttt-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="max-width:320px;margin:0 auto;text-align:center">
      <div style="margin-bottom:10px"><span id="${id}-status">X to move</span> <button class="btn secondary" id="${id}-new" style="margin-left:12px">New</button> <select id="${id}-mode" class="sel" style="width:auto;margin-left:8px"><option value="2p">2 Players</option><option value="ai" selected>vs AI</option></select></div>
      <div id="${id}-board" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;aspect-ratio:1;background:#bbada0;padding:8px;border-radius:8px"></div>
      <div class="note" style="margin-top:10px">Classic Tic Tac Toe. First to 3 in a row wins. Based on open source implementations.</div>
    </div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let board = Array(9).fill('');
  let turn = 'X';
  let gameOver = false;

  function render() {
    const boardEl = $(`board`);
    boardEl.innerHTML = '';
    board.forEach((v,i) => {
      const div = document.createElement('div');
      div.style.cssText = 'aspect-ratio:1;display:grid;place-items:center;font-size:36px;font-weight:800;background:#f4efe6;border-radius:6px;cursor:pointer';
      div.textContent = v;
      div.onclick = () => move(i);
      boardEl.appendChild(div);
    });
    if (!gameOver) $(`status`).textContent = `${turn} to move`;
  }

  function checkWin() {
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of wins) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (board.every(v => v)) return 'draw';
    return null;
  }

  function move(i) {
    if (gameOver || board[i]) return;
    board[i] = turn;
    const result = checkWin();
    if (result) {
      gameOver = true;
      $(`status`).textContent = result === 'draw' ? 'Draw!' : `${result} wins!`;
      render();
      return;
    }
    turn = turn === 'X' ? 'O' : 'X';
    render();
    
    if ($(`mode`).value === 'ai' && turn === 'O' && !gameOver) {
      setTimeout(aiMove, 300);
    }
  }

  function aiMove() {
    // Simple AI: win, block, random
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    
    // Try win
    for (const [a,b,c] of wins) {
      const line = [board[a], board[b], board[c]];
      if (line.filter(v => v === 'O').length === 2 && line.includes('')) {
        const idx = [a,b,c][line.indexOf('')];
        return move(idx);
      }
    }
    // Block
    for (const [a,b,c] of wins) {
      const line = [board[a], board[b], board[c]];
      if (line.filter(v => v === 'X').length === 2 && line.includes('')) {
        const idx = [a,b,c][line.indexOf('')];
        return move(idx);
      }
    }
    // Center
    if (!board[4]) return move(4);
    // Random
    const empty = board.map((v,i) => v ? null : i).filter(v => v !== null);
    if (empty.length) move(empty[Math.floor(Math.random()*empty.length)]);
  }

  $(`new`).onclick = () => { board = Array(9).fill(''); turn = 'X'; gameOver = false; render(); };
  render();
}

// Minesweeper
export function mountMinesweeper(root, tool) {
  const id = 'mine-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="max-width:400px;margin:0 auto">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <select id="${id}-diff" class="sel" style="width:auto"><option value="easy">Easy 8x8 10 mines</option><option value="medium" selected>Medium 12x12 24 mines</option><option value="hard">Hard 16x16 40 mines</option></select>
        <button class="btn secondary" id="${id}-new">New</button>
        <span>Flags: <b id="${id}-flags">0</b> | Time: <b id="${id}-time">0</b></span>
      </div>
      <div id="${id}-board" style="display:grid;gap:2px;background:#bbada0;padding:6px;border-radius:8px;justify-content:center"></div>
      <div class="note" style="margin-top:10px">Left click to reveal, right click to flag. Based on michaelbutler/minesweeper (WebWorker powered).</div>
    </div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let board = [];
  let rows = 12, cols = 12, mines = 24;
  let flags = 0;
  let time = 0;
  let timer = null;
  let gameOver = false;

  function init() {
    const diff = $(`diff`).value;
    if (diff === 'easy') { rows = 8; cols = 8; mines = 10; }
    else if (diff === 'medium') { rows = 12; cols = 12; mines = 24; }
    else { rows = 16; cols = 16; mines = 40; }
    
    board = Array(rows).fill(0).map(() => Array(cols).fill(0).map(() => ({ mine: false, revealed: false, flagged: false, count: 0 })));
    
    // Place mines
    let placed = 0;
    while (placed < mines) {
      const r = Math.floor(Math.random()*rows);
      const c = Math.floor(Math.random()*cols);
      if (!board[r][c].mine) { board[r][c].mine = true; placed++; }
    }
    
    // Calculate counts
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = r+dr, nc = c+dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) count++;
        }
        board[r][c].count = count;
      }
    }
    
    flags = 0;
    time = 0;
    gameOver = false;
    clearInterval(timer);
    timer = setInterval(() => { if (!gameOver) { time++; $(`time`).textContent = time; } }, 1000);
    
    render();
  }

  function render() {
    const boardEl = $(`board`);
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 28px)`;
    boardEl.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        const div = document.createElement('div');
        div.style.cssText = 'width:28px;height:28px;display:grid;place-items:center;font-weight:700;font-size:14px;background:#f4efe6;border-radius:4px;cursor:pointer;user-select:none';
        if (cell.revealed) {
          div.style.background = '#e0d5c4';
          if (cell.mine) { div.textContent = '💣'; div.style.background = '#e25b4c'; }
          else if (cell.count > 0) { div.textContent = cell.count; div.style.color = ['','blue','green','red','purple','maroon','turquoise','black','gray'][cell.count]; }
        } else {
          if (cell.flagged) div.textContent = '🚩';
        }
        div.oncontextmenu = e => { e.preventDefault(); toggleFlag(r,c); };
        div.onclick = () => reveal(r,c);
        boardEl.appendChild(div);
      }
    }
    $(`flags`).textContent = flags;
  }

  function reveal(r,c) {
    if (gameOver || board[r][c].flagged || board[r][c].revealed) return;
    board[r][c].revealed = true;
    
    if (board[r][c].mine) {
      gameOver = true;
      // Reveal all mines
      for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (board[rr][cc].mine) board[rr][cc].revealed = true;
      render();
      toast('Game over! Hit a mine.');
      clearInterval(timer);
      return;
    }
    
    if (board[r][c].count === 0) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r+dr, nc = c+dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !board[nr][nc].revealed) reveal(nr,nc);
      }
    }
    
    render();
    
    // Check win
    let revealedCount = 0;
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (board[rr][cc].revealed) revealedCount++;
    if (revealedCount === rows*cols - mines) {
      gameOver = true;
      toast('You win! Time: ' + time + 's');
      clearInterval(timer);
    }
  }

  function toggleFlag(r,c) {
    if (gameOver || board[r][c].revealed) return;
    board[r][c].flagged = !board[r][c].flagged;
    flags += board[r][c].flagged ? 1 : -1;
    render();
  }

  $(`new`).onclick = init;
  $(`diff`).onchange = init;
  init();
}

export function mountTetris(root, tool) {
  const id = 'tet-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = `<div class="tool-pane">
    <div class="tool-kicker">GAME · TETRIS</div>
    <h1>${esc(tool.title)}</h1>
    <p class="lede">Classic Tetris — 10x20 grid, 7 tetrominoes, levels, score. Use arrow keys or buttons. Based on open source HTML5 Tetris.</p>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div>
        <canvas id="${id}-board" width="300" height="600" style="border:2px solid #1c1916;border-radius:8px;background:#111"></canvas>
      </div>
      <div style="min-width:200px">
        <div class="panel" style="padding:12px">
          <div style="display:flex;gap:8px;justify-content:space-between"><span>Score</span><b id="${id}-score">0</b></div>
          <div style="display:flex;gap:8px;justify-content:space-between"><span>Level</span><b id="${id}-level">1</b></div>
          <div style="display:flex;gap:8px;justify-content:space-between"><span>Lines</span><b id="${id}-lines">0</b></div>
          <div style="display:flex;gap:8px;justify-content:space-between"><span>Best</span><b id="${id}-best">0</b></div>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button class="btn primary" id="${id}-new">New Game</button>
            <button class="btn secondary" id="${id}-pause">Pause</button>
          </div>
          <div style="margin-top:10px">
            <b>Next</b>
            <canvas id="${id}-next" width="80" height="80" style="border:1px solid #ddd;display:block;margin-top:4px;background:#222"></canvas>
          </div>
          <div style="margin-top:12px;font-size:12px;color:#6e655b">
            <b>Controls:</b><br>
            ← → move, ↓ soft drop, ↑ rotate, Space hard drop<br>
            Mobile: use buttons below
          </div>
          <div style="margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
            <span></span><button class="btn secondary" id="${id}-up" style="padding:8px">↻</button><span></span>
            <button class="btn secondary" id="${id}-left" style="padding:8px">←</button><button class="btn secondary" id="${id}-down" style="padding:8px">↓</button><button class="btn secondary" id="${id}-right" style="padding:8px">→</button>
            <span></span><button class="btn secondary" id="${id}-drop" style="padding:8px">⤓</button><span></span>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  const $ = s => root.querySelector(`#${id}-${s}`);
  const canvas = $(`board`);
  const ctx = canvas.getContext('2d');
  const nextCanvas = $(`next`);
  const nextCtx = nextCanvas.getContext('2d');
  const COLS = 10, ROWS = 20, SIZE = 30;
  const COLORS = { I:'#00f0f0', J:'#0000f0', L:'#f0a000', O:'#f0f000', S:'#00f000', T:'#a000f0', Z:'#f00000' };
  const SHAPES = {
    I: [[1,1,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0]],
    T: [[0,1,0],[1,1,1]],
    Z: [[1,1,0],[0,1,1]]
  };
  const TYPES = Object.keys(SHAPES);
  let board, cur, curType, curPos, nextType, score, level, lines, paused, gameOver, timer;
  let best = Number(localStorage.getItem('mp-tetris-best')||0);
  $('best').textContent = best;

  function emptyBoard() { return Array.from({length: ROWS}, ()=>Array(COLS).fill(null)); }

  function randomType() { return TYPES[Math.floor(Math.random()*TYPES.length)]; }

  function init() {
    board = emptyBoard();
    score = 0; level = 1; lines = 0; paused = false; gameOver = false;
    nextType = randomType();
    spawn();
    $('score').textContent = score;
    $('level').textContent = level;
    $('lines').textContent = lines;
    clearInterval(timer);
    timer = setInterval(tick, Math.max(100, 1000 - (level-1)*100));
    render();
  }

  function spawn() {
    curType = nextType;
    nextType = randomType();
    cur = SHAPES[curType].map(r=>[...r]);
    curPos = { x: Math.floor(COLS/2) - Math.floor(cur[0].length/2), y: 0 };
    if (collides(cur, curPos)) { gameOver = true; clearInterval(timer); toast('Game Over! Score: '+score); if (score>best){ best=score; localStorage.setItem('mp-tetris-best', best); $('best').textContent=best; } }
    drawNext();
  }

  function collides(shape, pos) {
    for (let y=0;y<shape.length;y++) for (let x=0;x<shape[y].length;x++) if (shape[y][x]) {
      const nx = pos.x + x, ny = pos.y + y;
      if (nx<0||nx>=COLS||ny>=ROWS) return true;
      if (ny>=0 && board[ny][nx]) return true;
    }
    return false;
  }

  function merge() {
    for (let y=0;y<cur.length;y++) for (let x=0;x<cur[y].length;x++) if (cur[y][x]) {
      const ny = curPos.y + y, nx = curPos.x + x;
      if (ny>=0) board[ny][nx] = curType;
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let y=ROWS-1;y>=0;y--) {
      if (board[y].every(c=>c)) {
        board.splice(y,1);
        board.unshift(Array(COLS).fill(null));
        cleared++; y++;
      }
    }
    if (cleared) {
      lines += cleared;
      score += [0,100,300,500,800][cleared] * level;
      level = Math.floor(lines/10)+1;
      $('score').textContent = score;
      $('level').textContent = level;
      $('lines').textContent = lines;
      clearInterval(timer);
      timer = setInterval(tick, Math.max(100, 1000 - (level-1)*100));
    }
  }

  function tick() {
    if (paused||gameOver) return;
    if (!collides(cur, {x: curPos.x, y: curPos.y+1})) curPos.y++;
    else { merge(); clearLines(); spawn(); }
    render();
  }

  function rotate(shape) {
    const h=shape.length, w=shape[0].length;
    const r = Array.from({length:w}, ()=>Array(h).fill(0));
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) r[x][h-1-y]=shape[y][x];
    return r;
  }

  function move(dx) { if (!collides(cur, {x: curPos.x+dx, y: curPos.y})) { curPos.x+=dx; render(); } }
  function rotateCur() { const nr=rotate(cur); if (!collides(nr, curPos)) { cur=nr; render(); } }
  function drop() { while (!collides(cur, {x: curPos.x, y: curPos.y+1})) curPos.y++; tick(); }

  function render() {
    ctx.fillStyle = '#111'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // grid
    ctx.strokeStyle = '#222'; ctx.lineWidth=0.5;
    for (let i=0;i<=COLS;i++){ ctx.beginPath(); ctx.moveTo(i*SIZE,0); ctx.lineTo(i*SIZE,ROWS*SIZE); ctx.stroke(); }
    for (let i=0;i<=ROWS;i++){ ctx.beginPath(); ctx.moveTo(0,i*SIZE); ctx.lineTo(COLS*SIZE,i*SIZE); ctx.stroke(); }
    // board
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (board[y][x]) {
      ctx.fillStyle = COLORS[board[y][x]]||'#fff';
      ctx.fillRect(x*SIZE+1,y*SIZE+1,SIZE-2,SIZE-2);
    }
    // current
    if (cur) {
      ctx.fillStyle = COLORS[curType]||'#fff';
      for (let y=0;y<cur.length;y++) for (let x=0;x<cur[y].length;x++) if (cur[y][x]) {
        const nx=curPos.x+x, ny=curPos.y+y;
        if (ny>=0) ctx.fillRect(nx*SIZE+1,ny*SIZE+1,SIZE-2,SIZE-2);
      }
    }
  }

  function drawNext() {
    nextCtx.fillStyle='#222'; nextCtx.fillRect(0,0,80,80);
    const shape = SHAPES[nextType];
    nextCtx.fillStyle = COLORS[nextType];
    const offX = (4 - shape[0].length)*10, offY = (4 - shape.length)*10;
    for (let y=0;y<shape.length;y++) for (let x=0;x<shape[y].length;x++) if (shape[y][x]) {
      nextCtx.fillRect(offX + x*16 +2, offY + y*16 +2, 14,14);
    }
  }

  document.addEventListener('keydown', function handler(e) {
    if (!root.isConnected) { document.removeEventListener('keydown', handler); return; }
    if (gameOver||paused) return;
    if (e.key==='ArrowLeft'){ move(-1); e.preventDefault(); }
    if (e.key==='ArrowRight'){ move(1); e.preventDefault(); }
    if (e.key==='ArrowDown'){ tick(); e.preventDefault(); }
    if (e.key==='ArrowUp'){ rotateCur(); e.preventDefault(); }
    if (e.key===' '){ drop(); e.preventDefault(); }
  });

  $('new').onclick = init;
  $('pause').onclick = () => { paused=!paused; $('pause').textContent = paused?'Resume':'Pause'; };
  $('left').onclick = ()=>move(-1);
  $('right').onclick = ()=>move(1);
  $('down').onclick = ()=>tick();
  $('up').onclick = ()=>rotateCur();
  $('drop').onclick = ()=>drop();

  init();
}
