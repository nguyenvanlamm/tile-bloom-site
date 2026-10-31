/* Quarterbloom — the game's real rules, ported from lib/features/game/domain/*.dart for this site.
 *
 * Same PRNG (mulberry32), generator, rules, par, hint and scoring as the Flutter app, so
 * TB.levels.spec(16) and TB.daily.spec('2026-10-12') give the very boards the app shows.
 *
 * Loaded by index.html before assets/js/home.js; everything is on window.TB.
 *
 * Board model: tile t = row * cols + col. Corners are [TL, TR, BR, BL] (clockwise). A rotation
 * r turns the tile r quarter turns clockwise: cornerAt(t, r, k) = corners[t][(k - r) & 3].
 * Motif 0 is blank (the four outer corners of the floor); motifs 1..6 map to the shapes
 * disc, diamond, flower, star, ring, square.
 *
 * TB.mountBoard(el, puzzle, opts) gives a playable SVG board (tap = turn clockwise,
 * right-click or long-press = turn back) with undo / hint / restart. Prototypes may use it as is,
 * restyle it through opts + CSS, or draw their own board from the same rules.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- PRNG (mulberry32)
  function SeededRandom(seed) { this.s = seed >>> 0; }
  SeededRandom.prototype.nextUint32 = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), this.s | 1) >>> 0;
    t = ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  SeededRandom.prototype.nextInt = function (max) { return this.nextUint32() % max; };
  SeededRandom.prototype.nextDouble = function () { return this.nextUint32() / 4294967296; };

  // ---------------------------------------------------------------- puzzle
  function buildVertices(rows, cols) {
    const out = [];
    for (let vr = 0; vr <= rows; vr++) {
      for (let vc = 0; vc <= cols; vc++) {
        const touches = [];
        if (vr > 0 && vc > 0) touches.push([(vr - 1) * cols + vc - 1, 2]);
        if (vr > 0 && vc < cols) touches.push([(vr - 1) * cols + vc, 3]);
        if (vr < rows && vc > 0) touches.push([vr * cols + vc - 1, 1]);
        if (vr < rows && vc < cols) touches.push([vr * cols + vc, 0]);
        if (touches.length >= 2) out.push({ id: vr * (cols + 1) + vc, row: vr, col: vc, touches, isEdge: touches.length === 2 });
      }
    }
    return out;
  }

  function cornerAt(p, tile, rotation, corner) { return p.corners[tile][(corner - rotation) & 3]; }

  function vertexIdOf(p, tile, corner) {
    const r = Math.floor(tile / p.cols), c = tile % p.cols;
    const [vr, vc] = [[r, c], [r, c + 1], [r + 1, c + 1], [r + 1, c]][corner];
    return vr * (p.cols + 1) + vc;
  }

  function isOuterCornerVertex(p, id) {
    const vr = Math.floor(id / (p.cols + 1)), vc = id % (p.cols + 1);
    return (vr === 0 || vr === p.rows) && (vc === 0 || vc === p.cols);
  }

  function neighboursOf(p, t) {
    const r = Math.floor(t / p.cols), c = t % p.cols, out = [];
    if (r > 0) out.push(t - p.cols);
    if (c < p.cols - 1) out.push(t + 1);
    if (r < p.rows - 1) out.push(t + p.cols);
    if (c > 0) out.push(t - 1);
    return out;
  }

  function isBloomed(p, rot, v) {
    const [t0, c0] = v.touches[0];
    const m = cornerAt(p, t0, rot[t0], c0);
    if (m === 0) return false;
    for (let i = 1; i < v.touches.length; i++) {
      const [t, c] = v.touches[i];
      if (cornerAt(p, t, rot[t], c) !== m) return false;
    }
    return true;
  }
  function bloomed(p, rot) { const s = new Set(); for (const v of p.vertices) if (isBloomed(p, rot, v)) s.add(v.id); return s; }
  function isSolved(p, rot) { return p.vertices.every((v) => isBloomed(p, rot, v)); }

  function looksSolved(base, rotation) {
    for (let k = 0; k < 4; k++) if (base[(k - rotation) & 3] !== base[k]) return false;
    return true;
  }
  function turnsToSolve(base, rotation) {
    for (let k = 0; k < 4; k++) if (looksSolved(base, (rotation + k) & 3)) return k;
    return 0;
  }
  function par(p) { let n = 0; for (let t = 0; t < p.tileCount; t++) n += turnsToSolve(p.corners[t], p.scramble[t]); return n; }

  function bloomableCorners(p, t) { let n = 0; for (let k = 0; k < 4; k++) if (!isOuterCornerVertex(p, vertexIdOf(p, t, k))) n++; return n; }
  function bloomedCorners(p, set, t) { let n = 0; for (let k = 0; k < 4; k++) if (set.has(vertexIdOf(p, t, k))) n++; return n; }
  function settledTiles(p, set) { const s = new Set(); for (let t = 0; t < p.tileCount; t++) if (bloomedCorners(p, set, t) === bloomableCorners(p, t)) s.add(t); return s; }

  function pickHint(p, rot, locked) {
    let best = null, bestScore = -1;
    for (let t = 0; t < p.tileCount; t++) {
      if (locked.has(t) || looksSolved(p.corners[t], rot[t])) continue;
      const score = neighboursOf(p, t).filter((n) => looksSolved(p.corners[n], rot[n])).length;
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  }

  /** 3★ at or under par, 2★ within ⌈1.5 × par⌉, else 1★; each hint lowers the ceiling by one. */
  function stars({ moves, par: pr, hintsUsed = 0 }) {
    const byMoves = moves <= pr ? 3 : moves <= Math.ceil(pr * 1.5) ? 2 : 1;
    return Math.min(byMoves, Math.max(1, Math.min(3, 3 - hintsUsed)));
  }

  function generate(spec) {
    const rng = new SeededRandom(spec.seed);
    const { rows, cols } = spec, stride = cols + 1;
    const vertex = new Array((rows + 1) * stride).fill(0);
    for (let vr = 0; vr <= rows; vr++) {
      for (let vc = 0; vc <= cols; vc++) {
        const outer = (vr === 0 || vr === rows) && (vc === 0 || vc === cols);
        if (!outer) vertex[vr * stride + vc] = 1 + rng.nextInt(spec.motifs);
      }
    }
    const corners = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      corners.push([vertex[r * stride + c], vertex[r * stride + c + 1], vertex[(r + 1) * stride + c + 1], vertex[(r + 1) * stride + c]]);
    }
    const scrambleTile = (base) => {
      const options = [1, 2, 3].filter((r) => !looksSolved(base, r));
      const roll = rng.nextDouble();
      if (!options.length || roll >= 0.85) return 0;
      return options[rng.nextInt(options.length)];
    };
    for (let attempt = 0; attempt < 32; attempt++) {
      const scramble = corners.map(scrambleTile);
      const p = { spec, id: spec.id, rows, cols, motifs: spec.motifs, tileCount: rows * cols, corners, scramble, vertices: buildVertices(rows, cols) };
      if (!isSolved(p, scramble)) { p.par = par(p); return p; }
    }
    throw new Error('generator: solved 32 times');
  }

  // ---------------------------------------------------------------- catalogue (lib/features/levels, lib/features/daily)
  const LAYOUT = [
    [2, 2], [2, 3], [3, 2], [3, 3], [3, 3], [3, 4], [3, 4], [4, 3], [4, 3], [4, 4], [4, 4], [4, 5],
    [5, 3], [5, 4], [5, 4], [5, 5], [5, 5], [5, 6], [5, 4], [5, 5], [6, 4], [6, 5], [6, 5], [6, 6],
    [6, 4], [6, 5], [6, 5], [6, 6], [7, 4], [7, 5], [7, 5], [7, 6], [7, 4], [7, 5], [7, 6], [7, 6],
  ];
  const levels = {
    count: 36,
    maxStars: 108,
    chapters: [
      { index: 0, first: 1, last: 12, name: 'The Porch', blurb: 'Your first tiles — learn how they fit.' },
      { index: 1, first: 13, last: 24, name: 'The Living Room', blurb: 'Bigger floors, more patterns.' },
      { index: 2, first: 25, last: 36, name: 'The Courtyard', blurb: 'Grand courtyards for steady hands.' },
    ],
    sizeOf: (n) => LAYOUT[n - 1][0],
    chapterOf: (n) => levels.chapters.find((c) => n >= c.first && n <= c.last),
    spec: (n) => ({ id: 'level-' + n, rows: LAYOUT[n - 1][0], cols: LAYOUT[n - 1][0], motifs: LAYOUT[n - 1][1], seed: 1000 + n * 7919 }),
  };
  const BY_WEEKDAY = { 1: [4, 4], 2: [5, 4], 3: [5, 5], 4: [6, 5], 5: [6, 6], 6: [7, 5], 7: [7, 6] };
  const daily = {
    epoch: Date.UTC(2026, 9, 1),
    parse: (key) => { const [y, m, d] = key.split('-').map(Number); return { y, m, d, utc: Date.UTC(y, m - 1, d) }; },
    number: (key) => Math.round((daily.parse(key).utc - daily.epoch) / 86400000) + 1,
    weekday: (key) => { const wd = new Date(daily.parse(key).utc).getUTCDay(); return wd === 0 ? 7 : wd; },
    spec: (key) => {
      const { y, m, d } = daily.parse(key), [size, motifs] = BY_WEEKDAY[daily.weekday(key)];
      return { id: 'daily-' + key, rows: size, cols: size, motifs, seed: ((y * 10000 + m * 100 + d) ^ 0x5EED5) >>> 0 };
    },
  };

  // ---------------------------------------------------------------- art (lib/core/widgets/tile_art.dart)
  /** The app's motif colours, by motif 1..6 (index 0 unused). Prototypes may pass their own. */
  const APP_PALETTE = [null, '#A8432C', '#24406B', '#9A6A10', '#2F6F62', '#6E3A66', '#2A2622'];
  const SHAPES = ['disc', 'diamond', 'flower', 'star', 'ring', 'square'];
  const shapeOf = (m) => SHAPES[(m - 1) % 6];
  const f = (n) => +n.toFixed(2);

  function starPath(outer, inner, points) {
    let d = '';
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner, a = -Math.PI / 2 + i * Math.PI / points;
      d += (i ? 'L' : 'M') + f(Math.cos(a) * r) + ' ' + f(Math.sin(a) * r);
    }
    return d + 'Z';
  }
  function petalPath(len, w) {
    return `M0 0C${f(len * .25)} ${f(-w * .62)} ${f(len * .72)} ${f(-w * .6)} ${f(len)} 0C${f(len * .72)} ${f(w * .6)} ${f(len * .25)} ${f(w * .62)} 0 0Z`;
  }

  /** SVG markup of a whole motif centred on (0, 0); r = outer radius (the app uses 0.40 × tile side). */
  function motifSVG(m, { r = 40, palette = APP_PALETTE, base = '#EFE4D2', alpha = 1 } = {}) {
    if (m === 0) return `<circle r="${f(r * .52)}" fill="none" stroke="${base === '#EFE4D2' ? '#C9B494' : 'currentColor'}" stroke-opacity=".9" stroke-width="1.1"/>`;
    const fill = palette[m] || APP_PALETTE[m], op = alpha < 1 ? ` opacity="${alpha}"` : '';
    switch (shapeOf(m)) {
      case 'disc': return `<g${op}><circle r="${f(r * .92)}" fill="${fill}"/><circle r="${f(r * .34)}" fill="${base}"/></g>`;
      case 'diamond': { const a = r, b = r * .42; return `<g${op}><path d="M0 ${-a}L${a} 0L0 ${a}L${-a} 0Z" fill="${fill}"/><path d="M0 ${f(-b)}L${f(b)} 0L0 ${f(b)}L${f(-b)} 0Z" fill="${base}"/></g>`; }
      case 'flower': {
        let s = `<g${op}>`;
        for (let i = 0; i < 4; i++) s += `<path transform="rotate(${45 + i * 90})" d="${petalPath(r * 1.05, r * .62)}" fill="${fill}"/>`;
        return s + `<circle r="${f(r * .2)}" fill="${base}"/></g>`;
      }
      case 'star': return `<g${op}><path d="${starPath(r, r * .52, 8)}" fill="${fill}"/><circle r="${f(r * .22)}" fill="${base}"/></g>`;
      case 'ring': return `<g${op}><circle r="${f(r * .95)}" fill="${fill}"/><circle r="${f(r * .6)}" fill="${base}"/><circle r="${f(r * .28)}" fill="${fill}"/></g>`;
      case 'square': { const a = r * .75, b = r * .31; return `<g${op}><rect x="${f(-a)}" y="${f(-a)}" width="${f(a * 2)}" height="${f(a * 2)}" fill="${fill}"/><rect x="${f(-b)}" y="${f(-b)}" width="${f(b * 2)}" height="${f(b * 2)}" fill="${base}"/></g>`; }
    }
    return '';
  }

  /** One tile in its base orientation, local coords 0..100, quarter motifs clipped to the tile. */
  function tileSVG(corners, o = {}) {
    const rad = o.radius ?? 6, base = o.tileFill ?? '#EFE4D2', line = o.tileLine ?? '#CDBFA8';
    const pts = [[0, 0], [100, 0], [100, 100], [0, 100]];
    let s = `<rect width="100" height="100" rx="${rad}" fill="${base}"/>`;
    s += `<g clip-path="url(#${o.clipId || 'tb-clip'})">`;
    corners.forEach((m, k) => {
      s += `<g transform="translate(${pts[k][0]} ${pts[k][1]})">${motifSVG(m, { r: o.motifR ?? 40, palette: o.palette, base, alpha: o.idleAlpha ?? 1 })}</g>`;
    });
    s += `</g>`;
    if (o.sparkle !== false) s += `<path transform="translate(50 50)" d="${starPath(9, 3.5, 4)}" fill="${line}"/>`;
    if (line && o.tileStroke !== false) s += `<rect x=".7" y=".7" width="98.6" height="98.6" rx="${rad}" fill="none" stroke="${line}" stroke-width="1.4"/>`;
    return s;
  }

  // ---------------------------------------------------------------- playable board
  let boardSeq = 0;
  /**
   * opts: palette, tileFill, tileLine, radius (tile corner radius, units of 100), gap (grout, units),
   *       grout (colour or 'none'), idleAlpha, motifR, bloomGlow (colour or null), spinMs, easing,
   *       sparkle (bool), rotations (start state), onChange(state), onSolve(state)
   * returns { state(), undo(), hint(), restart(), turn(t, dir), el }
   */
  function mountBoard(el, p, opts = {}) {
    const id = 'tbb' + (++boardSeq), gap = opts.gap ?? 4, step = 100 + gap;
    const W = p.cols * step - gap, H = p.rows * step - gap;
    const spinMs = opts.spinMs ?? 220, easing = opts.easing ?? 'cubic-bezier(.2,.9,.25,1.15)';
    let spins = (opts.rotations || p.scramble).slice(), moves = 0, hints = 0, locked = new Set(), history = [], prevBloom = new Set();
    const rot = () => spins.map((s) => ((s % 4) + 4) % 4);

    const tileOpts = { ...opts, clipId: id + '-clip' };
    let svg = `<svg class="tb-board" viewBox="${-gap} ${-gap} ${W + gap * 2} ${H + gap * 2}" width="100%" style="display:block;touch-action:manipulation;user-select:none;-webkit-user-select:none">`;
    svg += `<defs><clipPath id="${id}-clip"><rect width="100" height="100" rx="${opts.radius ?? 6}"/></clipPath>`;
    svg += `<radialGradient id="${id}-glow"><stop offset="0" stop-color="${opts.bloomGlow || '#F6C35B'}" stop-opacity=".55"/><stop offset=".6" stop-color="${opts.bloomGlow || '#F6C35B'}" stop-opacity=".16"/><stop offset="1" stop-color="${opts.bloomGlow || '#F6C35B'}" stop-opacity="0"/></radialGradient></defs>`;
    if (opts.grout !== 'none') svg += `<rect x="${-gap}" y="${-gap}" width="${W + gap * 2}" height="${H + gap * 2}" fill="${opts.grout || '#C9B494'}"/>`;
    svg += `<g class="tb-glows"></g>`;
    for (let t = 0; t < p.tileCount; t++) {
      const x = (t % p.cols) * step, y = Math.floor(t / p.cols) * step;
      svg += `<g class="tb-tile" data-t="${t}" transform="translate(${x} ${y})" style="cursor:pointer">` +
        `<g class="tb-spin" style="transform-origin:50px 50px;transition:transform ${spinMs}ms ${easing};transform:rotate(${spins[t] * 90}deg)">${tileSVG(p.corners[t], tileOpts)}</g>` +
        `<circle class="tb-lock" cx="50" cy="50" r="9" fill="${opts.lockColor || '#A9741A'}" style="display:none"/></g>`;
    }
    svg += `<g class="tb-blooms" style="pointer-events:none"></g></svg>`;
    el.innerHTML = svg;
    const root = el.querySelector('svg'), glows = root.querySelector('.tb-glows'), blooms = root.querySelector('.tb-blooms');
    const tiles = [...root.querySelectorAll('.tb-tile')];

    function state(newly = []) {
      const r = rot(), b = bloomed(p, r);
      return { puzzle: p, rotations: r, moves, hints, locked: new Set(locked), bloomed: b, bloomedCount: b.size, total: p.vertices.length,
        settled: settledTiles(p, b), solved: isSolved(p, r), par: p.par, stars: stars({ moves, par: p.par, hintsUsed: hints }), newlyBloomed: newly };
    }
    function paint(animate) {
      const r = rot(), b = bloomed(p, r), newly = [...b].filter((v) => !prevBloom.has(v));
      tiles.forEach((g, t) => {
        g.querySelector('.tb-spin').style.transform = `rotate(${spins[t] * 90}deg)`;
        g.querySelector('.tb-lock').style.display = locked.has(t) ? '' : 'none';
        g.classList.toggle('tb-settled', settledTiles(p, b).has(t));
      });
      const delay = animate ? spinMs : 0;
      clearTimeout(paint.timer);
      blooms.innerHTML = ''; glows.innerHTML = '';
      paint.timer = setTimeout(() => {
        let gs = '', bs = '';
        for (const vid of b) {
          const vr = Math.floor(vid / (p.cols + 1)), vc = vid % (p.cols + 1);
          const cx = vc * step - gap / 2, cy = vr * step - gap / 2, v = p.vertices.find((x) => x.id === vid);
          const m = cornerAt(p, v.touches[0][0], r[v.touches[0][0]], v.touches[0][1]);
          const fresh = newly.includes(vid) ? ' tb-fresh' : '';
          if (opts.bloomGlow !== null) gs += `<circle class="tb-glow${fresh}" cx="${cx}" cy="${cy}" r="62" fill="url(#${id}-glow)"/>`;
          if (opts.redrawBlooms) bs += `<g class="tb-bloom${fresh}" transform="translate(${cx} ${cy})">${motifSVG(m, { r: opts.motifR ?? 40, palette: opts.palette, base: opts.tileFill ?? '#EFE4D2' })}</g>`;
        }
        glows.innerHTML = gs; blooms.innerHTML = bs;
      }, delay);
      prevBloom = b;
      const s = state(newly);
      opts.onChange && opts.onChange(s);
      if (s.solved && opts.onSolve) setTimeout(() => opts.onSolve(s), delay + 250);
      return s;
    }
    function turn(t, dir = 1) {
      if (locked.has(t) || isSolved(p, rot())) return;
      history.push(spins.slice()); spins[t] += dir; moves++; paint(true);
    }
    // tap = clockwise; right-click or long-press = back
    let pressTimer = null, longPressed = false;
    root.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.tb-tile'); if (!g) return;
      longPressed = false;
      pressTimer = setTimeout(() => { longPressed = true; turn(+g.dataset.t, -1); }, 450);
    });
    root.addEventListener('pointerup', () => clearTimeout(pressTimer));
    root.addEventListener('pointerleave', () => clearTimeout(pressTimer));
    root.addEventListener('click', (e) => { const g = e.target.closest('.tb-tile'); if (g && !longPressed) turn(+g.dataset.t, 1); });
    root.addEventListener('contextmenu', (e) => { const g = e.target.closest('.tb-tile'); if (g) { e.preventDefault(); turn(+g.dataset.t, -1); } });

    paint(false);
    return {
      el: root,
      state: () => state(),
      turn,
      undo() { if (!history.length) return; spins = history.pop(); moves = Math.max(0, moves - 1); paint(true); },
      hint() {
        if (hints >= 3) return null;
        const t = pickHint(p, rot(), locked); if (t === null) return null;
        history.push(spins.slice());
        spins[t] += turnsToSolve(p.corners[t], rot()[t]); locked.add(t); hints++; moves++;
        paint(true); return t;
      },
      restart() { spins = p.scramble.slice(); moves = 0; hints = 0; locked = new Set(); history = []; prevBloom = new Set(); paint(false); },
      solveAllBut(n = 1) { // prototype helper: jump near the end of a board
        const wrong = []; spins = p.corners.map((base, t) => { if (looksSolved(base, p.scramble[t])) return p.scramble[t]; wrong.push(t); return p.scramble[t] + turnsToSolve(base, p.scramble[t]); });
        wrong.slice(0, n).forEach((t) => { spins[t] = p.scramble[t]; });
        paint(false);
      },
    };
  }

  window.TB = {
    SeededRandom, generate, cornerAt, vertexIdOf, isOuterCornerVertex, neighboursOf, bloomed, isSolved, looksSolved,
    turnsToSolve, par, settledTiles, pickHint, stars, levels, daily, APP_PALETTE, shapeOf, motifSVG, tileSVG, mountBoard,
  };
})();
