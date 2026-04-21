// === 盤の種類 ===
const BOARDS = {
  segway:     { key: 'segway',     name: 'セグウェイ', alias: 'Scooter', rows: 8, cols: 7,  color: '#58a6ff' },
  skateboard: { key: 'skateboard', name: 'スケボー',   alias: 'Hover',   rows: 8, cols: 9,  color: '#a77bff' },
  horse:      { key: 'horse',      name: '馬',         alias: 'Doom',    rows: 8, cols: 12, color: '#ff6666' }
};
const BOARD_ORDER = ['segway', 'skateboard', 'horse'];

// === 品質 (grade) ===
// 紫 (excellent) は旧キラ紫の色を、金 (epic) は旧キラ橙の色を流用。
// 紫+1, 金+1 は同色にスパークル表現を重ねて上位種を表現。
const GRADES = [
  { key: 'good',          label: '緑 (good)',        hex: '#9fe870', priority: 1, sparkle: false },
  { key: 'better',        label: '青 (better)',      hex: '#58a6ff', priority: 2, sparkle: false },
  { key: 'excellent',     label: '紫 (excellent)',   hex: '#d39bff', priority: 3, sparkle: false },
  { key: 'excellentPlus', label: '紫+1 (excellent+1)', hex: '#d39bff', priority: 4, sparkle: true  },
  { key: 'epic',          label: '金 (epic)',        hex: '#ffd27a', priority: 5, sparkle: false },
  { key: 'epicPlus',      label: '金+1 (epic+1)',    hex: '#ffd27a', priority: 6, sparkle: true  },
  { key: 'legend',        label: '赤 (legend)',      hex: '#ff6666', priority: 7, sparkle: false }
];
const gradeMap = Object.fromEntries(GRADES.map(g => [g.key, g]));

// === 形状 ===
const SHAPES = ['O', 'I', 'T', 'L', 'J'];
const SHAPE_ORIENTATIONS = {
  O: [[[0,0],[0,1],[1,0],[1,1]]],
  I: [
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,0],[1,0],[2,0],[3,0]]
  ],
  T: [
    [[0,0],[0,1],[0,2],[1,1]],
    [[0,1],[1,0],[1,1],[2,1]],
    [[0,1],[1,0],[1,1],[1,2]],
    [[0,0],[1,0],[1,1],[2,0]]
  ],
  L: [
    [[0,0],[1,0],[2,0],[2,1]],
    [[0,0],[0,1],[0,2],[1,0]],
    [[0,0],[0,1],[1,1],[2,1]],
    [[0,2],[1,0],[1,1],[1,2]]
  ],
  J: [
    [[0,1],[1,1],[2,0],[2,1]],
    [[0,0],[1,0],[1,1],[1,2]],
    [[0,0],[0,1],[1,0],[2,0]],
    [[0,0],[0,1],[0,2],[1,2]]
  ]
};

// === 状態 ===
const state = {
  boardsUsed: { segway: true, skateboard: false, horse: false },
  mainBoard: 'segway',
  paintMode: 'paint',            // 'paint' | 'erase'
  manualPlacement: false,
  paintGrade: 'better',
  manualGrade: 'better',
  manualShape: 'T',
  boards: {},                    // boardKey -> { cells: [[grade|null]], locked: [[bool]] }
  inventory: {},                 // gradeKey -> shapeKey -> count
  solveResult: null              // { placements, unused }
};

function initState() {
  for (const key of BOARD_ORDER) {
    const { rows, cols } = BOARDS[key];
    state.boards[key] = {
      cells:    Array.from({ length: rows }, () => Array(cols).fill(null)),
      locked:   Array.from({ length: rows }, () => Array(cols).fill(false)),
      shapes:   Array.from({ length: rows }, () => Array(cols).fill(null)),
      pieceIds: Array.from({ length: rows }, () => Array(cols).fill(null))
    };
  }
  for (const g of GRADES) {
    state.inventory[g.key] = {};
    for (const s of SHAPES) state.inventory[g.key][s] = 0;
  }
}

// === 永続化 (localStorage) ===
const STORAGE_KEY = 'unit-optimizer:v1';

function saveState() {
  try {
    const snapshot = {
      boardsUsed: state.boardsUsed,
      mainBoard: state.mainBoard,
      paintGrade: state.paintGrade,
      manualGrade: state.manualGrade,
      manualShape: state.manualShape,
      boards: state.boards,
      inventory: state.inventory,
      solveResult: state.solveResult
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    // ストレージ不可 (プライベートモード等) はサイレントに無視
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const snap = JSON.parse(raw);
    if (!snap || typeof snap !== 'object') return;

    if (snap.boardsUsed && typeof snap.boardsUsed === 'object') {
      for (const k of BOARD_ORDER) {
        if (typeof snap.boardsUsed[k] === 'boolean') state.boardsUsed[k] = snap.boardsUsed[k];
      }
    }
    if (BOARD_ORDER.includes(snap.mainBoard)) state.mainBoard = snap.mainBoard;
    if (gradeMap[snap.paintGrade])  state.paintGrade  = snap.paintGrade;
    if (gradeMap[snap.manualGrade]) state.manualGrade = snap.manualGrade;
    if (SHAPES.includes(snap.manualShape)) state.manualShape = snap.manualShape;

    // 盤面: サイズが一致する時のみ採用 (仕様変更時の破損回避)
    if (snap.boards && typeof snap.boards === 'object') {
      for (const k of BOARD_ORDER) {
        const meta = BOARDS[k];
        const saved = snap.boards[k];
        if (!saved || !Array.isArray(saved.cells) || !Array.isArray(saved.locked)) continue;
        if (saved.cells.length !== meta.rows) continue;
        if (!saved.cells.every(row => Array.isArray(row) && row.length === meta.cols)) continue;
        state.boards[k].cells  = saved.cells.map(r => r.map(v => (gradeMap[v] ? v : null)));
        state.boards[k].locked = saved.locked.map(r => r.map(v => !!v));
        if (Array.isArray(saved.shapes) && saved.shapes.length === meta.rows &&
            saved.shapes.every(row => Array.isArray(row) && row.length === meta.cols)) {
          state.boards[k].shapes = saved.shapes.map(r => r.map(v => (SHAPES.includes(v) ? v : null)));
        }
        if (Array.isArray(saved.pieceIds) && saved.pieceIds.length === meta.rows &&
            saved.pieceIds.every(row => Array.isArray(row) && row.length === meta.cols)) {
          state.boards[k].pieceIds = saved.pieceIds.map(r => r.map(v => (typeof v === 'string' ? v : null)));
        }
      }
    }

    // 在庫
    if (snap.inventory && typeof snap.inventory === 'object') {
      for (const g of GRADES) {
        const row = snap.inventory[g.key];
        if (!row) continue;
        for (const s of SHAPES) {
          const n = Number(row[s]);
          if (Number.isFinite(n) && n >= 0) state.inventory[g.key][s] = Math.floor(n);
        }
      }
    }

    // 未使用表示の復元
    if (snap.solveResult && Array.isArray(snap.solveResult.unused)) {
      state.solveResult = {
        placements: Array.isArray(snap.solveResult.placements) ? snap.solveResult.placements : [],
        unused: snap.solveResult.unused.filter(u => u && gradeMap[u.grade] && SHAPES.includes(u.shape))
      };
    }
  } catch (e) {
    // パース失敗時はデフォルトのまま続行
  }
}

// === DOM参照 ===
const el = {};
function cacheEls() {
  el.boardSelect = document.getElementById('boardSelect');
  el.boards = document.getElementById('boards');
  el.paintGrade = document.getElementById('paintGrade');
  el.paintToggle = document.getElementById('paintToggle');
  el.eraseToggle = document.getElementById('eraseToggle');
  el.manualToggle = document.getElementById('manualToggle');
  el.resetBoard = document.getElementById('resetBoard');
  el.solveBtn = document.getElementById('solveBtn');
  el.status = document.getElementById('status');
  el.inventory = document.getElementById('inventory');
  el.unusedPanel = document.getElementById('unusedPanel');
  el.unusedList = document.getElementById('unusedList');
}

// === 初期化 ===
function init() {
  cacheEls();
  initState();
  loadState();

  // 塗る用品質セレクト
  for (const g of GRADES) {
    const opt = document.createElement('option');
    opt.value = g.key;
    opt.textContent = g.label;
    el.paintGrade.append(opt);
  }
  el.paintGrade.value = state.paintGrade;
  el.paintGrade.addEventListener('change', () => {
    state.paintGrade = el.paintGrade.value;
    saveState();
  });

  el.paintToggle.addEventListener('click', () => setPaintMode('paint'));
  el.eraseToggle.addEventListener('click', () => setPaintMode('erase'));
  el.manualToggle.addEventListener('click', () => toggleManual());
  el.resetBoard.addEventListener('click', resetBoards);
  el.solveBtn.addEventListener('click', runSolve);

  renderBoardSelect();
  renderBoards();
  renderInventory();
  renderUnused();
}

// === 盤選択 UI ===
function renderBoardSelect() {
  el.boardSelect.innerHTML = '';
  for (const key of BOARD_ORDER) {
    const b = BOARDS[key];
    const card = document.createElement('div');
    card.className = 'board-opt';
    card.style.setProperty('--board-color', b.color);
    card.dataset.board = key;
    if (state.boardsUsed[key]) card.classList.add('used');
    if (state.mainBoard === key) card.classList.add('main');

    const title = document.createElement('div');
    title.className = 'board-opt-title';
    title.textContent = `${b.name} (${b.alias})`;

    const useLabel = document.createElement('label');
    useLabel.className = 'chk';
    const useChk = document.createElement('input');
    useChk.type = 'checkbox';
    useChk.checked = state.boardsUsed[key];
    useChk.addEventListener('change', () => {
      state.boardsUsed[key] = useChk.checked;
      if (!useChk.checked && state.mainBoard === key) {
        state.mainBoard = BOARD_ORDER.find(k => state.boardsUsed[k]) || null;
      }
      if (useChk.checked && !state.mainBoard) state.mainBoard = key;
      saveState();
      renderBoardSelect();
      renderBoards();
    });
    useLabel.append(useChk, document.createTextNode(' 使用'));

    const mainLabel = document.createElement('label');
    mainLabel.className = 'chk';
    const mainRadio = document.createElement('input');
    mainRadio.type = 'radio';
    mainRadio.name = 'mainBoard';
    mainRadio.checked = state.mainBoard === key;
    mainRadio.disabled = !state.boardsUsed[key];
    mainRadio.addEventListener('change', () => {
      if (!state.boardsUsed[key]) return;
      state.mainBoard = key;
      saveState();
      renderBoardSelect();
      renderBoards();
    });
    mainLabel.append(mainRadio, document.createTextNode(' メイン'));

    card.append(title, useLabel, mainLabel);
    el.boardSelect.append(card);
  }
}

// === 盤のレンダリング ===
function renderBoards() {
  el.boards.innerHTML = '';
  const keys = selectedBoardKeys();
  if (keys.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint-text';
    empty.textContent = '使用する盤を選択してください。';
    el.boards.append(empty);
    return;
  }
  for (const key of keys) renderOneBoard(key);
}

function selectedBoardKeys() {
  const used = BOARD_ORDER.filter(k => state.boardsUsed[k]);
  if (!used.length) return [];
  used.sort((a, b) => {
    if (a === state.mainBoard) return -1;
    if (b === state.mainBoard) return 1;
    return 0;
  });
  return used;
}

function renderOneBoard(key) {
  const meta = BOARDS[key];
  const bs = state.boards[key];

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  wrap.style.setProperty('--board-color', meta.color);
  if (state.mainBoard === key) wrap.classList.add('main');

  const title = document.createElement('div');
  title.className = 'board-title';
  const badge = state.mainBoard === key ? ' ★メイン' : '';
  title.textContent = `${meta.name} (${meta.alias})${badge}`;
  wrap.append(title);

  const grid = document.createElement('div');
  grid.className = 'board';
  grid.style.gridTemplateColumns = `repeat(${meta.cols}, var(--cell))`;
  grid.style.gridTemplateRows = `repeat(${meta.rows}, var(--cell))`;

  const lines = fullLinesOf(bs.cells);
  const lineSet = new Set(lines);

  for (let r = 0; r < meta.rows; r++) {
    for (let c = 0; c < meta.cols; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      const grade  = bs.cells[r][c];
      const shape  = bs.shapes   ? bs.shapes[r][c]   : null;
      const pId    = bs.pieceIds ? bs.pieceIds[r][c] : null;
      if (grade) {
        const g = gradeMap[grade];
        div.style.background = g.hex;
        if (g.sparkle) div.classList.add('sparkle');
      }
      if (bs.locked[r][c]) div.classList.add('prefilled');

      // ピース輪郭インセットシャドウ + ライン完成シャドウを一括設定
      const shadows = [];
      if (lineSet.has(r)) shadows.push('inset 0 -3px 0 #ffffffaa');
      if (grade) {
        if (pId) {
          const adj = (nr, nc) =>
            (nr >= 0 && nr < meta.rows && nc >= 0 && nc < meta.cols && bs.pieceIds)
              ? (bs.pieceIds[nr][nc] ?? null) : null;
          if (adj(r-1, c) !== pId) shadows.push('inset 0  3px 0 rgba(255,255,255,0.9)');
          if (adj(r+1, c) !== pId) shadows.push('inset 0 -3px 0 rgba(255,255,255,0.9)');
          if (adj(r, c-1) !== pId) shadows.push('inset  3px 0 0 rgba(255,255,255,0.9)');
          if (adj(r, c+1) !== pId) shadows.push('inset -3px 0 0 rgba(255,255,255,0.9)');
        } else {
          // ペイント塗りセル（pieceId無し）は4辺すべてに輪郭
          shadows.push('inset 0  3px 0 rgba(255,255,255,0.9)');
          shadows.push('inset 0 -3px 0 rgba(255,255,255,0.9)');
          shadows.push('inset  3px 0 0 rgba(255,255,255,0.9)');
          shadows.push('inset -3px 0 0 rgba(255,255,255,0.9)');
        }
      }
      if (shadows.length) div.style.boxShadow = shadows.join(', ');
      else if (lineSet.has(r)) div.classList.add('line');

      div.addEventListener('click', () => onCellClick(key, r, c));
      grid.append(div);
    }
  }
  wrap.append(grid);

  const info = document.createElement('div');
  info.className = 'board-info';
  info.textContent = `揃ったライン: ${lines.length} / ${meta.rows}`;
  wrap.append(info);

  el.boards.append(wrap);
}

function fullLinesOf(cells) {
  const lines = [];
  for (let r = 0; r < cells.length; r++) {
    if (cells[r].every(Boolean)) lines.push(r);
  }
  return lines;
}

// === クリック ===
function onCellClick(boardKey, r, c) {
  if (state.manualPlacement) {
    tryManualPlace(boardKey, r, c);
    return;
  }
  const bs = state.boards[boardKey];
  if (state.paintMode === 'erase') {
    bs.cells[r][c] = null;
    bs.locked[r][c] = false;
    if (bs.shapes)   bs.shapes[r][c]   = null;
    if (bs.pieceIds) bs.pieceIds[r][c] = null;
  } else {
    bs.cells[r][c] = state.paintGrade;
    bs.locked[r][c] = true;
    if (bs.shapes)   bs.shapes[r][c]   = null;
    if (bs.pieceIds) bs.pieceIds[r][c] = null;
  }
  state.solveResult = null;
  saveState();
  renderBoards();
  renderUnused();
}

// === モード切り替え ===
function setPaintMode(mode) {
  state.paintMode = mode;
  el.paintToggle.classList.toggle('active', mode === 'paint');
  el.eraseToggle.classList.toggle('active', mode === 'erase');
  if (state.manualPlacement) toggleManual(); // 強制的にOFF
}

function toggleManual() {
  state.manualPlacement = !state.manualPlacement;
  el.manualToggle.classList.toggle('active', state.manualPlacement);
  if (state.manualPlacement) {
    showManualPicker();
    setStatus('手動配置モード: 形状と品質を選択してから盤面をクリック');
  } else {
    hideManualPicker();
    setStatus('手動配置モード OFF');
  }
}

// === 手動配置のピッカー (シンプルなポップオーバー) ===
let manualPicker = null;
function showManualPicker() {
  if (manualPicker) manualPicker.remove();
  manualPicker = document.createElement('div');
  manualPicker.className = 'manual-picker';

  const shapeLbl = document.createElement('label');
  shapeLbl.textContent = '形状 ';
  const shapeSel = document.createElement('select');
  for (const s of SHAPES) {
    const o = document.createElement('option');
    o.value = s; o.textContent = s; shapeSel.append(o);
  }
  shapeSel.value = state.manualShape;
  shapeSel.addEventListener('change', () => { state.manualShape = shapeSel.value; saveState(); });
  shapeLbl.append(shapeSel);

  const gradeLbl = document.createElement('label');
  gradeLbl.textContent = ' 品質 ';
  const gradeSel = document.createElement('select');
  for (const g of GRADES) {
    const o = document.createElement('option');
    o.value = g.key; o.textContent = g.label; gradeSel.append(o);
  }
  gradeSel.value = state.manualGrade;
  gradeSel.addEventListener('change', () => { state.manualGrade = gradeSel.value; saveState(); });
  gradeLbl.append(gradeSel);

  const note = document.createElement('span');
  note.className = 'hint-text';
  note.textContent = ' (回転はツールが自動で最適化時に考慮します)';

  manualPicker.append(shapeLbl, gradeLbl, note);
  el.manualToggle.after(manualPicker);
}
function hideManualPicker() {
  if (manualPicker) { manualPicker.remove(); manualPicker = null; }
}

function tryManualPlace(boardKey, r, c) {
  const bs = state.boards[boardKey];
  const meta = BOARDS[boardKey];
  const shape = state.manualShape;
  const grade = state.manualGrade;
  // 全向きを試し、最初にフィットするものを採用
  for (const orient of SHAPE_ORIENTATIONS[shape]) {
    if (fitsAt(bs.cells, orient, r, c, meta)) {
      const pieceId = `manual_${shape}_${Date.now()}`;
      for (const [dr, dc] of orient) {
        bs.cells[r + dr][c + dc] = grade;
        bs.locked[r + dr][c + dc] = true;
        if (bs.shapes)   bs.shapes[r + dr][c + dc]   = shape;
        if (bs.pieceIds) bs.pieceIds[r + dr][c + dc] = pieceId;
      }
      state.solveResult = null;
      saveState();
      renderBoards();
      renderUnused();
      setStatus(`手動配置: ${shape}(${gradeMap[grade].label}) @ (${r},${c})`);
      return;
    }
  }
  setStatus('配置できません / 重なる or はみ出す');
}

function fitsAt(cells, orient, r, c, meta) {
  for (const [dr, dc] of orient) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= meta.rows || cc < 0 || cc >= meta.cols) return false;
    if (cells[rr][cc] !== null) return false;
  }
  return true;
}

// === 盤面リセット ===
function resetBoards() {
  for (const key of BOARD_ORDER) {
    const { rows, cols } = BOARDS[key];
    state.boards[key] = {
      cells:    Array.from({ length: rows }, () => Array(cols).fill(null)),
      locked:   Array.from({ length: rows }, () => Array(cols).fill(false)),
      shapes:   Array.from({ length: rows }, () => Array(cols).fill(null)),
      pieceIds: Array.from({ length: rows }, () => Array(cols).fill(null))
    };
  }
  state.solveResult = null;
  saveState();
  renderBoards();
  renderUnused();
  setStatus('盤面リセット完了');
}

// === 所持ユニット UI (35 スロット) ===
function renderInventory() {
  el.inventory.innerHTML = '';

  const table = document.createElement('div');
  table.className = 'inv-grid';

  // ヘッダ行: 形状
  table.append(cornerCell(''));
  for (const s of SHAPES) {
    const h = document.createElement('div');
    h.className = 'inv-head';
    h.textContent = s;
    table.append(h);
  }

  // 各品質 × 各形状
  for (const g of GRADES) {
    const rowHead = document.createElement('div');
    rowHead.className = 'inv-row-head';
    rowHead.style.setProperty('--grade-color', g.hex);
    if (g.sparkle) rowHead.classList.add('sparkle');
    rowHead.title = g.label;
    rowHead.textContent = g.label;
    table.append(rowHead);

    for (const s of SHAPES) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';

      const preview = document.createElement('div');
      preview.className = 'inv-preview';
      drawMiniShape(preview, s, g);
      cell.append(preview);

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.inputMode = 'numeric';
      input.value = String(state.inventory[g.key][s] || 0);
      input.addEventListener('input', () => {
        const v = Math.max(0, Math.floor(Number(input.value) || 0));
        state.inventory[g.key][s] = v;
        saveState();
      });
      cell.append(input);

      table.append(cell);
    }
  }

  el.inventory.append(table);
}

function cornerCell(text) {
  const d = document.createElement('div');
  d.className = 'inv-corner';
  d.textContent = text;
  return d;
}

function drawMiniShape(container, shape, grade) {
  container.innerHTML = '';
  const coords = SHAPE_ORIENTATIONS[shape][0];
  const maxR = Math.max(...coords.map(c => c[0]));
  const maxC = Math.max(...coords.map(c => c[1]));
  const cell = 6;
  const w = (maxC + 1) * cell;
  const h = (maxR + 1) * cell;
  container.style.width = `${w}px`;
  container.style.height = `${h}px`;
  for (const [r, c] of coords) {
    const b = document.createElement('div');
    b.className = 'mini-block';
    b.style.left = `${c * cell}px`;
    b.style.top = `${r * cell}px`;
    b.style.width = `${cell}px`;
    b.style.height = `${cell}px`;
    b.style.background = grade.hex;
    if (grade.sparkle) b.classList.add('sparkle');
    container.append(b);
  }
}

// === ソルバー ===
function runSolve() {
  const keys = selectedBoardKeys();
  if (keys.length === 0) {
    setStatus('使用する盤を選択してください');
    return;
  }

  // インベントリを「ピースインスタンス」群へ展開。品質の高い順＋サイズの大きい順で並べる。
  const pieces = [];
  for (const g of GRADES) {
    for (const s of SHAPES) {
      const n = state.inventory[g.key][s] | 0;
      for (let i = 0; i < n; i++) {
        pieces.push({ id: `${g.key}_${s}_${i}`, shape: s, grade: g.key });
      }
    }
  }
  pieces.sort((a, b) => {
    const pg = gradeMap[b.grade].priority - gradeMap[a.grade].priority;
    if (pg !== 0) return pg;
    const szA = SHAPE_ORIENTATIONS[a.shape][0].length;
    const szB = SHAPE_ORIENTATIONS[b.shape][0].length;
    return szB - szA;
  });

  // 盤ごとに固定(locked)と既存配置の状態をコピー
  const boardStates = {};
  for (const k of keys) {
    const { rows, cols } = BOARDS[k];
    const emptyGrid = () => Array.from({ length: rows }, () => Array(cols).fill(null));
    boardStates[k] = {
      cells:    state.boards[k].cells.map(r => r.slice()),
      locked:   state.boards[k].locked.map(r => r.slice()),
      shapes:   (state.boards[k].shapes   || emptyGrid()).map(r => r.slice()),
      pieceIds: (state.boards[k].pieceIds || emptyGrid()).map(r => r.slice()),
      meta: BOARDS[k]
    };
  }

  // 既存の非ロックセルはソルバー用にクリア(前回の配置を消す)
  for (const k of keys) {
    for (let r = 0; r < boardStates[k].meta.rows; r++) {
      for (let c = 0; c < boardStates[k].meta.cols; c++) {
        if (!boardStates[k].locked[r][c]) {
          boardStates[k].cells[r][c]    = null;
          boardStates[k].shapes[r][c]   = null;
          boardStates[k].pieceIds[r][c] = null;
        }
      }
    }
  }

  const placements = []; // { boardKey, pieceId, grade, cells: [[r,c],...] }
  const used = new Set();

  // 盤の優先順: selectedBoardKeys() がメインを先頭にする
  for (const k of keys) {
    fillBoardGreedy(boardStates[k], pieces, used, placements, k);
  }

  // 反映
  for (const k of keys) {
    state.boards[k].cells    = boardStates[k].cells;
    state.boards[k].shapes   = boardStates[k].shapes;
    state.boards[k].pieceIds = boardStates[k].pieceIds;
    // locked は変更しない (ユーザー指定のみ locked)
  }
  const unused = pieces.filter(p => !used.has(p.id));
  state.solveResult = { placements, unused };

  saveState();
  renderBoards();
  renderUnused();

  let msg = `最適化完了: ${placements.length} 配置, 未使用 ${unused.length}`;
  const lineSummary = keys.map(k => `${BOARDS[k].name}=${fullLinesOf(boardStates[k].cells).length}`).join(', ');
  setStatus(`${msg} | ラインs ${lineSummary}`);
}

// 1盤を貪欲+ライトなローカル探索で埋める。
// 方針: 残っている位置のうち最も「左上」のセルを起点に、そのセルを埋められるユニットを
// 現状の評価値が最大になるように選ぶ。評価値はライン完成重視＋品質スコア。
function fillBoardGreedy(boardState, pieces, used, placements, boardKey) {
  const { meta } = boardState;
  while (true) {
    const empty = findTopLeftEmpty(boardState.cells, meta);
    if (!empty) break;

    let best = null;
    for (const piece of pieces) {
      if (used.has(piece.id)) continue;
      for (const orient of SHAPE_ORIENTATIONS[piece.shape]) {
        for (const [dr, dc] of orient) {
          const baseR = empty.r - dr;
          const baseC = empty.c - dc;
          if (!canPlaceOrient(boardState.cells, orient, baseR, baseC, meta)) continue;
          const score = scorePlacement(boardState.cells, orient, baseR, baseC, meta, piece);
          if (!best || score > best.score) {
            best = { score, piece, orient, baseR, baseC };
          }
        }
      }
    }

    if (!best) {
      // このセルは埋められない → そのセルをスキップ扱いにするため、番兵として次のループで同じ場所を見ないよう
      // 「埋められない印」を一時的に入れる必要はない。以下でセルを探し直すだけ。
      // 左上から探すので、このセルが残っている限り無限ループになる → 強制的に抜ける。
      boardState.cells[empty.r][empty.c] = '__SKIP__';
      continue;
    }

    // 配置
    const cells = [];
    for (const [dr, dc] of best.orient) {
      const rr = best.baseR + dr;
      const cc = best.baseC + dc;
      boardState.cells[rr][cc]    = best.piece.grade;
      boardState.shapes[rr][cc]   = best.piece.shape;
      boardState.pieceIds[rr][cc] = best.piece.id;
      cells.push([rr, cc]);
    }
    used.add(best.piece.id);
    placements.push({ boardKey, pieceId: best.piece.id, grade: best.piece.grade, cells });
  }

  // 番兵を戻す
  for (let r = 0; r < meta.rows; r++) {
    for (let c = 0; c < meta.cols; c++) {
      if (boardState.cells[r][c] === '__SKIP__') boardState.cells[r][c] = null;
    }
  }
}

function findTopLeftEmpty(cells, meta) {
  for (let r = 0; r < meta.rows; r++) {
    for (let c = 0; c < meta.cols; c++) {
      if (cells[r][c] === null) return { r, c };
    }
  }
  return null;
}

function canPlaceOrient(cells, orient, baseR, baseC, meta) {
  for (const [dr, dc] of orient) {
    const r = baseR + dr, c = baseC + dc;
    if (r < 0 || r >= meta.rows || c < 0 || c >= meta.cols) return false;
    if (cells[r][c] !== null) return false;
  }
  return true;
}

function scorePlacement(cells, orient, baseR, baseC, meta, piece) {
  // 仮置きして評価
  const placed = [];
  for (const [dr, dc] of orient) {
    const r = baseR + dr, c = baseC + dc;
    cells[r][c] = piece.grade;
    placed.push([r, c]);
  }
  let completedLines = 0;
  const affectedRows = new Set(placed.map(p => p[0]));
  const isRealCell = v => v && v !== '__SKIP__';
  for (const r of affectedRows) {
    if (cells[r].every(isRealCell)) completedLines++;
  }
  // 行の埋まり率(密集)を加点
  let denseScore = 0;
  for (const r of affectedRows) {
    const filled = cells[r].filter(isRealCell).length;
    denseScore += filled;
  }
  // 戻す
  for (const [r, c] of placed) cells[r][c] = null;

  const gradeScore = gradeMap[piece.grade].priority;
  return completedLines * 10000 + denseScore * 10 + gradeScore;
}

// === 未使用ユニット表示 ===
function renderUnused() {
  const res = state.solveResult;
  if (!res || res.unused.length === 0) {
    el.unusedPanel.hidden = true;
    el.unusedList.innerHTML = '';
    return;
  }
  el.unusedPanel.hidden = false;
  el.unusedList.innerHTML = '';

  // 集計: grade × shape -> count
  const counts = {};
  for (const p of res.unused) {
    const k = `${p.grade}_${p.shape}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(counts)) {
    const [gradeKey, shape] = k.split('_');
    const g = gradeMap[gradeKey];
    const chip = document.createElement('div');
    chip.className = 'unused-chip';
    const preview = document.createElement('div');
    preview.className = 'inv-preview';
    drawMiniShape(preview, shape, g);
    chip.append(preview);
    const cnt = document.createElement('span');
    cnt.textContent = `× ${n}`;
    chip.append(cnt);
    el.unusedList.append(chip);
  }
}

function setStatus(msg) {
  el.status.textContent = msg;
}

init();
