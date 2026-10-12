(function () {
  'use strict';
  const TB = window.TB;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) document.documentElement.classList.add('anim');
  const $ = (s) => document.querySelector(s);
  const f = (n) => +n.toFixed(2);
  const CREAM = '#F3EADB', RIM = '#D8CAB2';
  const STAR = 'M0 -10L2.6 -2.6L10 0L2.6 2.6L0 10L-2.6 2.6L-10 0L-2.6 -2.6Z';

  /* polar helpers: angle in degrees, 0 = north, clockwise */
  const px = (cx, r, a) => cx + r * Math.sin(a * Math.PI / 180);
  const py = (cy, r, a) => cy - r * Math.cos(a * Math.PI / 180);
  function tickPath(cx, cy, r, step, len, filter) {
    let d = '';
    for (let a = 0; a < 360; a += step) {
      if (filter && !filter(a)) continue;
      d += `M${f(px(cx, r, a))} ${f(py(cy, r, a))}L${f(px(cx, r - len, a))} ${f(py(cy, r - len, a))}`;
    }
    return d;
  }

  /* ================================================== PLATE I: the planisphere floor */
  const sky = $('#sky'), sphere = $('#sphere'), boardEl = $('#board');
  const GAP = 6, STEP = 100 + GAP;
  const narrow = matchMedia('(max-width: 900px)');
  const frac = () => (narrow.matches ? 0.6 : 0.54);
  let level = 7, puzzle = null, board = null, prev = null, solvedShown = false, focusT = 4, lastBloomCount = -1;

  function geom(n) {
    const units = n * STEP + GAP, side = 1000 * frac(), s = side / units, x0 = 500 - side / 2;
    return { s, x0, side, at: (k) => x0 + (k * STEP + GAP / 2) * s };
  }

  function buildSky(n) {
    const g = geom(n), pitch = STEP * g.s, R = 440;
    let h = `<defs><clipPath id="sk-in"><circle cx="500" cy="500" r="${R}"/></clipPath>` +
      `<clipPath id="sk-disc"><circle cx="500" cy="500" r="480"/></clipPath>` +
      `<g id="sk-orbits"><ellipse cx="500" cy="500" rx="930" ry="250" transform="rotate(-17 500 500)"/>` +
      `<ellipse cx="500" cy="500" rx="700" ry="560" transform="rotate(28 500 500)" stroke-dasharray="3 9"/></g></defs>`;
    // orbits on the paper, in ink
    h += `<use href="#sk-orbits" class="orb-ink"/>`;
    // planets on the paper
    const pt = (rx, ry, rot, t) => {
      const c = Math.cos(t), s = Math.sin(t), cr = Math.cos(rot), sr = Math.sin(rot);
      return [500 + rx * c * cr - ry * s * sr, 500 + rx * c * sr + ry * s * cr];
    };
    const p1 = pt(700, 560, 28 * Math.PI / 180, Math.PI * 0.15), p2 = pt(700, 560, 28 * Math.PI / 180, Math.PI * 1.62);
    h += `<circle class="planet-blue" cx="${f(p1[0])}" cy="${f(p1[1])}" r="17"/>`;
    h += `<circle cx="${f(p1[0])}" cy="${f(p1[1])}" r="30" fill="none" stroke="#231F1A" stroke-opacity=".35" stroke-width="1.2"/>`;
    h += `<circle cx="${f(p2[0])}" cy="${f(p2[1])}" r="7" fill="#231F1A"/>`;
    // the night disc
    h += `<circle class="disc" cx="500" cy="500" r="480"/>`;
    // the graticule: grout lines carried out past the floor to the rim, with virtual meeting points
    let lines = '', dots = '';
    const kmin = -Math.ceil((g.at(0) - (500 - R)) / pitch), kmax = n + Math.ceil(((500 + R) - g.at(n)) / pitch);
    for (let k = kmin; k <= kmax; k++) {
      const v = g.at(0) + k * pitch;
      lines += `M${f(v)} 40V960M40 ${f(v)}H960`;
    }
    for (let i = kmin; i <= kmax; i++) for (let j = kmin; j <= kmax; j++) {
      const x = g.at(0) + i * pitch, y = g.at(0) + j * pitch;
      const inside = i >= 0 && i <= n && j >= 0 && j <= n;
      if (!inside && Math.hypot(x - 500, y - 500) < R - 14) dots += `<circle class="vdot" cx="${f(x)}" cy="${f(y)}" r="3"/>`;
    }
    h += `<g clip-path="url(#sk-in)"><path class="grat" d="${lines}"/>${dots}</g>`;
    // orbits continue across the disc, now in cream
    h += `<use href="#sk-orbits" class="orb-cream" clip-path="url(#sk-disc)"/>`;
    // the orbit a floor corner travels in a turn, with a gold body on it
    const half = g.side / 2 * Math.SQRT2;
    h += `<circle class="corner-orbit" cx="500" cy="500" r="${f(half + 8)}"/>`;
    h += `<g class="spin-slow"><circle class="planet-gold" cx="500" cy="${f(500 - half - 8)}" r="8"/></g>`;
    // rays: on solve, the grout lights out to the rim
    let rays = '';
    for (let k = 0; k <= n; k++) {
      const v = g.at(k), off = Math.sqrt(R * R - (v - 500) * (v - 500));
      rays += `<path pathLength="1" d="M${f(v)} ${f(g.x0)}V${f(500 - off)}"/><path pathLength="1" d="M${f(v)} ${f(g.x0 + g.side)}V${f(500 + off)}"/>`;
      rays += `<path pathLength="1" d="M${f(g.x0)} ${f(v)}H${f(500 - off)}"/><path pathLength="1" d="M${f(g.x0 + g.side)} ${f(v)}H${f(500 + off)}"/>`;
    }
    h += `<g class="rays" clip-path="url(#sk-in)">${rays}</g>`;
    // the degree ring: turns are quarter turns, so the quarters are inscribed
    h += `<g class="ring"><circle class="rimline" cx="500" cy="500" r="${R}"/><circle class="rimline" cx="500" cy="500" r="479"/>` +
      `<path class="ticks" d="${tickPath(500, 500, 479, 3, 12, (a) => a % 15)}"/>` +
      `<path class="ticks maj" d="${tickPath(500, 500, 479, 15, 24, (a) => a % 90)}"/>` +
      `<path class="ticks maj" d="${tickPath(500, 500, 479, 90, 39)}"/>`;
    [['0°', 0], ['90°', 90], ['180°', 180], ['270°', 270]].forEach(([t, a]) => {
      const x = px(500, 408, a), y = py(500, 408, a) + 12;
      h += `<text class="deg" x="${f(x)}" y="${f(y)}" text-anchor="middle">${t}</text>`;
    });
    h += `</g>`;
    sky.innerHTML = h;
  }

  function overlay() {
    const svg = boardEl.querySelector('svg');
    let g = svg.querySelector('.atlas');
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'atlas');
      g.setAttribute('pointer-events', 'none');
      g.innerHTML = '<g class="cl"></g><g class="mk"></g><g class="arcs"></g><g class="focus"></g>';
      svg.appendChild(g);
    }
    return g;
  }

  function vxy(vid) {
    const vr = Math.floor(vid / (puzzle.cols + 1)), vc = vid % (puzzle.cols + 1);
    return [vc * STEP - GAP / 2, vr * STEP - GAP / 2];
  }

  function drawMarks(s) {
    const mk = overlay().querySelector('.mk');
    let h = '';
    for (const vid of s.bloomed) {
      const [x, y] = vxy(vid), fresh = s.newlyBloomed.includes(vid) && !reduce;
      h += `<g class="mark${fresh ? ' fresh' : ''}" transform="translate(${x} ${y})"><circle r="47" pathLength="1"/>` +
        `<path d="M0 -52V-60M52 0H60M0 52V60M-52 0H-60"/></g>`;
    }
    mk.innerHTML = h;
  }

  function drawArc(t, q) {
    if (reduce) return;
    const r = Math.floor(t / puzzle.cols), c = t % puzzle.cols, cx = c * STEP + 50, cy = r * STEP + 50, R = 66;
    const a0 = -3 * Math.PI / 4, a1 = a0 + q * Math.PI / 2;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const large = Math.abs(q) >= 2 ? 1 : 0, sweep = q > 0 ? 1 : 0;
    const g = document.createElementNS(NS, 'g');
    g.innerHTML = `<path class="arc" pathLength="1" d="M${f(x0)} ${f(y0)}A${R} ${R} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}"/><circle class="arc-dot" cx="${f(x1)}" cy="${f(y1)}" r="6"/>`;
    const arcs = overlay().querySelector('.arcs');
    arcs.appendChild(g);
    setTimeout(() => g.remove(), 1200);
  }

  function drawFocus() {
    const fg = overlay().querySelector('.focus');
    if (!boardEl.classList.contains('kb')) { fg.innerHTML = ''; return; }
    const r = Math.floor(focusT / puzzle.cols), c = focusT % puzzle.cols;
    fg.innerHTML = `<rect x="${c * STEP - 3}" y="${r * STEP - 3}" width="106" height="106" rx="8"/><rect x="${c * STEP + 1}" y="${r * STEP + 1}" width="98" height="98" rx="5"/>`;
  }

  function drawConstellation() {
    const cl = overlay().querySelector('.cl');
    const W = puzzle.cols * STEP - GAP / 2, H = puzzle.rows * STEP - GAP / 2, o = -GAP / 2;
    let h = '';
    const midR = puzzle.rows / 2, midC = puzzle.cols / 2;
    for (let k = 0; k <= puzzle.rows; k++) {
      const y = k * STEP - GAP / 2, d = Math.abs(k - midR);
      h += `<path pathLength="1" style="animation-delay:${f(d * 120)}ms" d="M${o} ${y}H${W}"/>`;
    }
    for (let k = 0; k <= puzzle.cols; k++) {
      const x = k * STEP - GAP / 2, d = Math.abs(k - midC);
      h += `<path pathLength="1" style="animation-delay:${f(d * 120 + 60)}ms" d="M${x} ${o}V${H}"/>`;
    }
    cl.innerHTML = h;
  }

  const starSVG = (on) => `<svg viewBox="-11 -11 22 22" aria-hidden="true"><path d="${STAR}" fill="${on ? '#94600F' : 'none'}" stroke="#94600F" stroke-width="1.4"/></svg>`;
  const NOTE_IDLE = 'Tap a tile to turn it. Long-press or right-click turns it back.<span class="kbd">Keys: arrows pick a tile, Enter turns, Shift+Enter turns back, Z undoes, H hints.</span>';

  function onChange(s) {
    // the turn's orbit
    if (prev) {
      const changed = [];
      s.rotations.forEach((r, t) => { if (r !== prev.rotations[t]) changed.push(t); });
      if (changed.length === 1) {
        const t = changed[0];
        let q = (s.rotations[t] - prev.rotations[t] + 4) % 4;
        if (q === 3 && !(s.hints > prev.hints)) q = -1;
        drawArc(t, q);
      }
    }
    prev = { rotations: s.rotations.slice(), hints: s.hints };
    const token = puzzle;
    setTimeout(() => { if (token === puzzle) drawMarks(s); }, reduce ? 0 : 240);
    $('#r-moves').textContent = s.moves;
    $('#r-par').textContent = s.par;
    $('#r-bloom').textContent = s.bloomedCount;
    $('#r-total').textContent = s.total;
    $('#hint-n').textContent = 3 - s.hints;
    $('#t-hint').disabled = s.hints >= 3 || s.solved;
    $('#t-undo').disabled = s.moves === 0;
    if (s.bloomedCount !== lastBloomCount && lastBloomCount !== -1 && !s.solved) {
      $('#live').textContent = `${s.bloomedCount} of ${s.total} meeting points bloomed.`;
    }
    lastBloomCount = s.bloomedCount;
    if (!s.solved && solvedShown) {
      solvedShown = false;
      sphere.classList.remove('solved');
      overlay().querySelector('.cl').innerHTML = '';
      $('#note').innerHTML = NOTE_IDLE;
      $('#t-next').classList.remove('glow');
    }
    drawFocus();
  }

  function onSolve(s) {
    if (solvedShown) return;
    solvedShown = true;
    sphere.classList.add('solved');
    drawConstellation();
    const st = s.stars;
    $('#note').innerHTML = `<b>Floor complete.</b> ${s.moves} moves, par ${s.par}` +
      `<span class="stars" role="img" aria-label="${st} of 3 stars">${starSVG(st >= 1)}${starSVG(st >= 2)}${starSVG(st >= 3)}</span>` +
      `<br><a href="play/">Keep going: play Chapter I in your browser</a>`;
    $('#live').textContent = `Floor complete in ${s.moves} moves, par ${s.par}, ${st} of 3 stars.`;
    $('#t-next').classList.add('glow');
  }

  function mount(n) {
    level = n;
    puzzle = TB.generate(TB.levels.spec(n));
    prev = null; solvedShown = false; lastBloomCount = -1;
    focusT = Math.floor(puzzle.tileCount / 2);
    sphere.classList.remove('solved');
    buildSky(puzzle.rows);
    boardEl.style.width = frac() * 100 + '%';
    board = TB.mountBoard(boardEl, puzzle, {
      tileFill: CREAM, tileLine: RIM, grout: '#151311', gap: GAP, radius: 5,
      bloomGlow: '#F2C25E', lockColor: '#24406B', spinMs: reduce ? 0 : 240,
      onChange, onSolve,
    });
    $('#r-level').textContent = `Level ${n} · ${puzzle.rows}×${puzzle.cols}`;
    $('#t-prev').disabled = n <= 1;
    $('#t-next').disabled = n >= 8;
    $('#t-next').classList.remove('glow');
    $('#note').innerHTML = NOTE_IDLE;
    boardEl.setAttribute('aria-label', `Level ${n}, a playable ${puzzle.rows} by ${puzzle.cols} floor. Tap a tile to turn it clockwise; long-press or right-click turns it back. With a keyboard: arrow keys pick a tile, Enter or Space turns it, Shift with Enter turns it back, Z undoes, H gives a hint.`);
  }

  $('#t-undo').addEventListener('click', () => board.undo());
  $('#t-hint').addEventListener('click', () => board.hint());
  $('#t-restart').addEventListener('click', () => { prev = null; board.restart(); });
  $('#t-prev').addEventListener('click', () => { if (level > 1) mount(level - 1); });
  $('#t-next').addEventListener('click', () => { if (level < 8) mount(level + 1); });

  boardEl.addEventListener('pointerdown', (e) => {
    boardEl.classList.remove('kb');
    const g = e.target.closest && e.target.closest('.tb-tile');
    if (g) focusT = +g.dataset.t;
    drawFocus();
  });
  boardEl.addEventListener('blur', () => { boardEl.classList.remove('kb'); drawFocus(); });
  // Tabbing in shows the gold tile ring at once (WCAG 2.4.7); a click focuses without it.
  boardEl.addEventListener('focus', () => {
    if (boardEl.matches(':focus-visible')) { boardEl.classList.add('kb'); drawFocus(); }
  });
  boardEl.addEventListener('keydown', (e) => {
    const { rows, cols } = puzzle;
    let r = Math.floor(focusT / cols), c = focusT % cols, handled = true;
    switch (e.key) {
      case 'ArrowLeft': c = Math.max(0, c - 1); break;
      case 'ArrowRight': c = Math.min(cols - 1, c + 1); break;
      case 'ArrowUp': r = Math.max(0, r - 1); break;
      case 'ArrowDown': r = Math.min(rows - 1, r + 1); break;
      case 'Enter': case ' ': board.turn(focusT, e.shiftKey ? -1 : 1); break;
      case 'z': case 'Z': board.undo(); break;
      case 'h': case 'H': board.hint(); break;
      default: handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    focusT = r * cols + c;
    boardEl.classList.add('kb');
    drawFocus();
  });

  mount(level);
  narrow.addEventListener('change', () => {
    buildSky(puzzle.rows);
    boardEl.style.width = frac() * 100 + '%';
    if (solvedShown) sphere.classList.add('solved');
  });

  /* ================================================== PLATE II: figures */
  function plateRing(R) {
    return `<circle class="ring" r="${R}"/><circle class="ring" r="${R - 8}"/>` +
      `<path class="tk" d="${tickPath(0, 0, R, 6, 8, (a) => a % 30)}"/>` +
      `<path class="tk maj" d="${tickPath(0, 0, R, 30, 8, (a) => a % 90)}"/>` +
      `<path class="tk maj" d="${tickPath(0, 0, R + 6, 90, 22)}"/>`;
  }
  const glowDef = (id) => `<radialGradient id="${id}"><stop offset="0" stop-color="#F2C25E" stop-opacity=".75"/><stop offset=".55" stop-color="#F2C25E" stop-opacity=".22"/><stop offset="1" stop-color="#F2C25E" stop-opacity="0"/></radialGradient>`;
  const tileOpts = (id) => ({ clipId: id, tileFill: CREAM, tileLine: RIM, radius: 5 });

  // Fig 1 — the turn as an orbit
  $('#fig1').innerHTML = `<svg viewBox="-118 -118 236 236" role="img" aria-label="A tile turning a quarter turn clockwise; its corner travels a 90 degree arc." style="color:#A39176">
    <defs><clipPath id="f1c"><rect width="100" height="100" rx="5"/></clipPath></defs>
    ${plateRing(108)}
    <circle class="orbit" r="70.71"/>
    <g class="spin"><rect x="-100" y="-100" width="200" height="200" fill="none"/><g transform="translate(-50 -50)">${TB.tileSVG([1, 2, 3, 4], tileOpts('f1c'))}</g></g>
    <path class="arc" pathLength="1" d="M-50 -50A70.71 70.71 0 0 1 50 -50"/>
    <circle class="arc-dot" cx="50" cy="-50" r="4.5"/><circle class="arc-dot" cx="-50" cy="-50" r="2.5" opacity=".7"/>
    <text class="lbl" x="0" y="-80" text-anchor="middle">90°</text>
  </svg>`;

  // Fig 2 — four corners converge on one meeting point (a real 2×2: outer corners plain, edges and centre matched)
  const F2 = [[0, 4, 5, 2], [4, 0, 1, 5], [2, 5, 3, 0], [5, 1, 0, 3]];
  const F2pos = [[-103, -103, -1, -1], [3, -103, 1, -1], [-103, 3, -1, 1], [3, 3, 1, 1]];
  let f2 = '';
  F2.forEach((corners, i) => {
    const [x, y, dx, dy] = F2pos[i];
    f2 += `<g class="mv" style="--tx:${dx * 20}px;--ty:${dy * 20}px"><g transform="translate(${x} ${y})">${TB.tileSVG(corners, tileOpts('f2c'))}</g></g>`;
  });
  $('#fig2').innerHTML = `<svg viewBox="-160 -160 320 320" role="img" aria-label="Four tiles slide together; the four quarters at their shared corner make one ring." style="color:#A39176">
    <defs><clipPath id="f2c"><rect width="100" height="100" rx="5"/></clipPath>${glowDef('f2g')}</defs>
    ${plateRing(152)}
    <path class="axis" d="M-146 0H146M0 -146V146"/>
    ${f2}
    <circle class="glowc" r="64" fill="url(#f2g)"/>
    <circle class="mp" r="5"/>
  </svg>`;

  // Fig 3 — the bloom, drawn like an atlas plate inside a lens
  const flower = TB.motifSVG(3, { r: 40, base: CREAM });
  const petals = flower.replace(/<circle[^>]*\/>/g, '').replace(/fill="#9A6A10"/g, 'class="pet" pathLength="1"').replace(/<g>/, '<g>');
  let lens = '';
  [[-103, -103], [3, -103], [-103, 3], [3, 3]].forEach(([x, y]) => {
    lens += `<rect x="${x}" y="${y}" width="100" height="100" rx="5" fill="${CREAM}" stroke="${RIM}" stroke-width="1.4"/>`;
    lens += `<path transform="translate(${x + 50} ${y + 50})" d="M0 -9L3.5 -3.5L9 0L3.5 3.5L0 9L-3.5 3.5L-9 0L-3.5 -3.5Z" fill="${RIM}"/>`;
  });
  $('#fig3').innerHTML = `<svg viewBox="-118 -118 236 236" role="img" aria-label="At a meeting point the four quarters form a whole flower, drawn with compass lines and lit gold." >
    <defs><clipPath id="f3l"><circle r="92"/></clipPath>${glowDef('f3g')}</defs>
    ${plateRing(108)}
    <g clip-path="url(#f3l)"><g transform="scale(1.45)">
      <rect x="-100" y="-100" width="200" height="200" class="grout"/>
      ${lens}
      <circle class="glowc" r="70" fill="url(#f3g)"/>
      <g class="fill">${flower}</g>
      <path class="grout" d="M-3 -100h6v200h-6zM-100 -3h200v6h-200z"/>
      <g class="con"><circle r="40"/><circle r="24"/><circle r="62"/><path d="M-70 -70L70 70M70 -70L-70 70"/></g>
      ${petals}
    </g></g>
    <path class="axis" d="M-92 0H-118M92 0H118M0 -92V-118M0 92V118"/>
  </svg>`;
  // specimens: the key to the six motifs
  const MOTIFS = [['Disc', 'terracotta'], ['Diamond', 'indigo'], ['Four-petal flower', 'ochre'], ['Eight-point star', 'jade'], ['Ring', 'plum'], ['Square', 'ink']];
  $('#specimens').innerHTML = MOTIFS.map(([name, col], i) =>
    `<li><svg viewBox="-50 -50 100 100" aria-hidden="true"><rect x="-47" y="-47" width="94" height="94" rx="6" fill="${CREAM}" stroke="${RIM}" stroke-width="1.5"/>${TB.motifSVG(i + 1, { r: 31, base: CREAM })}</svg><b>${name}</b><span>${col}</span></li>`).join('');

  /* ================================================== PLATE III: the orrery of rooms */
  // Names, colours (slab, then light sky) and blurbs as the app has them (lib/core/strings.dart).
  const ROOMS = [
    ['The Porch', '#7A3A2D', '#F8E8DB', '1–12', 'Your first tiles — learn how they fit.'],
    ['The Living Room', '#24505B', '#E3EEEA', '13–24', 'Bigger floors, more patterns.'],
    ['The Courtyard', '#435A47', '#EAEFE2', '25–36', 'Grand courtyards for steady hands.'],
    ['The Kitchen', '#7A5A1C', '#F7F0DC', '37–48', 'All six motifs, warm and busy.'],
    ['The Stairwell', '#2B3E6B', '#E7EAF3', '49–60', 'Long, narrow flights of tile.'],
    ['The Balcony', '#6E3A66', '#F5E9F0', '61–72', 'Open floors, fewer colours to go by.'],
    ['The Rooftop', '#2A2622', '#EEEAE5', '73–84', 'The widest floors, under the sky.'],
  ];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  {
    const SX = 52, SY = 556, ANG = [30, 64, 18, 50, 76, 38, 60];
    let o = `<defs>${glowDef('og')}</defs>`;
    o += `<path class="axis" d="M${SX} ${SY}H610M${SX} ${SY}V8"/>`;
    ROOMS.forEach((rm, i) => {
      const r = 104 + i * 72;
      o += `<path class="orb" style="--i:${i}" pathLength="1" d="M${SX} ${SY - r}A${r} ${r} 0 0 1 ${SX + r} ${SY}"/>`;
      o += `<path class="tk" d="M${SX + r} ${SY}v10M${SX} ${SY - r}h-10"/>`;
    });
    o += `<circle cx="${SX}" cy="${SY}" r="78" fill="url(#og)"/>`;
    o += `<g transform="translate(${SX} ${SY})">${TB.motifSVG(3, { r: 30, base: '#F3EADB' })}</g>`;
    ROOMS.forEach((rm, i) => {
      const r = 104 + i * 72, a = ANG[i] * Math.PI / 180;
      const x = SX + r * Math.sin(a), y = SY - r * Math.cos(a), pr = 11 + i * 1.6;
      o += `<g class="pl" style="--i:${i}"><circle class="halo" cx="${f(x)}" cy="${f(y)}" r="${f(pr + 7)}"/>` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(pr)}" fill="${rm[1]}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(pr * .42)}" fill="${rm[2]}"/>` +
        `<text class="num" x="${f(x + pr + 12)}" y="${f(y - pr - 4)}">${ROMAN[i]}</text></g>`;
    });
    o += `<text class="ann b" x="${SX + 104}" y="${SY + 40}" text-anchor="middle">2×2</text>`;
    o += `<text class="ann" x="${(SX + 104 + SX + 536) / 2}" y="${SY + 40}" text-anchor="middle">boards grow</text>`;
    o += `<text class="ann b" x="${SX + 536}" y="${SY + 40}" text-anchor="middle">7×8</text>`;
    $('#orrery').innerHTML = `<svg viewBox="0 0 640 610" role="img" aria-label="An orrery of the seven rooms: seven orbits around a bloom, from The Porch at 2 by 2 on the inside to The Rooftop at 7 by 8 on the outside, each planet in its room's colours.">${o}</svg>`;
    $('#index').innerHTML = ROOMS.map((rm, i) => `<li><span class="num">${ROMAN[i]}</span><span class="name">${rm[0]}</span><span class="lead" aria-hidden="true"></span>` +
      `<span class="lv">Levels ${rm[3]}</span><span class="sw" aria-hidden="true"><i style="--c:${rm[1]}"></i><i style="--c:${rm[2]}"></i></span>` +
      (rm[4] ? `<span class="blurb">${rm[4]}</span>` : '') + `</li>`).join('');
  }

  /* ================================================== PLATE IV: today's floor + ephemeris */
  {
    const now = new Date(), pad = (n) => String(n).padStart(2, '0');
    const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const spec = TB.daily.spec(key), dp = TB.generate(spec), num = TB.daily.number(key), wd = TB.daily.weekday(key);
    TB.mountBoard($('#dboard'), dp, { tileFill: CREAM, tileLine: RIM, grout: '#151311', gap: 6, radius: 5, bloomGlow: '#F2C25E', spinMs: 0 });
    $('#refs-top').innerHTML = 'ABCDEFG'.slice(0, dp.cols).split('').map((c) => `<span>${c}</span>`).join('');
    $('#refs-left').innerHTML = Array.from({ length: dp.rows }, (_, i) => `<span>${i + 1}</span>`).join('');
    const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    $('#dcap').innerHTML = `<b>${num >= 1 ? `Daily tile #${num}` : 'Today’s floor'}</b>${date} · ${dp.rows}×${dp.cols}. Today’s floor as the game deals it, still unturned, and the same for everyone.`;
    const DAYS = [['Monday', 4], ['Tuesday', 5], ['Wednesday', 5], ['Thursday', 6], ['Friday', 6], ['Saturday', 7], ['Sunday', 7]];
    const glyph = (n) => {
      const s = 5, g = 1.6, w = n * (s + g) - g;
      let r = '';
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) r += `<rect x="${f(j * (s + g))}" y="${f(i * (s + g))}" width="${s}" height="${s}" rx="1"/>`;
      return `<svg width="${f(w)}" height="${f(w)}" viewBox="0 0 ${f(w)} ${f(w)}" fill="currentColor" opacity=".8" aria-hidden="true">${r}</svg>`;
    };
    $('#eph tbody').innerHTML = DAYS.map(([d, n], i) => `<tr class="${i + 1 === wd ? 'today' : ''}"><th scope="row">${d}${i + 1 === wd ? '<span class="tag">Today</span>' : ''}</th>` +
      `<td class="sz">${n} × ${n}</td><td class="gl">${glyph(n)}</td></tr>`).join('');
    const FACTS = [
      [2, 'The same floor for everyone', 'One floor a day, dealt alike to every player.'],
      [4, 'A day streak', 'Play each day and the streak keeps count.'],
      [5, 'A result to share', 'A plain-text result, ready to paste.'],
    ];
    $('#facts').innerHTML = FACTS.map(([m, b, t]) => `<li><svg viewBox="-50 -50 100 100" aria-hidden="true"><rect x="-46" y="-46" width="92" height="92" rx="7" fill="${CREAM}"/>${TB.motifSVG(m, { r: 30, base: CREAM })}</svg><div><b>${b}</b><span>${t}</span></div></li>`).join('');
  }

  /* ================================================== PLATE V: legend */
  {
    const P = [null, CREAM, CREAM, CREAM, CREAM, CREAM, CREAM];
    const L = [[5, 'Works offline', 'The app for iPhone, iPad and Android needs no connection.'], [6, 'No ads', 'Nothing breaks into a floor.'], [2, 'No account', 'Open it and play.'], [1, 'No tracking', 'No analytics or tracking of any kind.']];
    $('#legend').innerHTML = L.map(([m, b, t]) => `<li><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="48" fill="none" stroke="#F3EADB" stroke-opacity=".45"/>${TB.motifSVG(m, { r: 32, palette: P, base: '#24406B' })}</svg><b>${b}</b><span>${t}</span></li>`).join('');
  }

  /* ================================================== reveals */
  const rv = document.querySelectorAll('.rv, .fsv, .orrery');
  if (reduce || !('IntersectionObserver' in window)) rv.forEach((el) => el.classList.add('in'));
  else {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.18 });
    rv.forEach((el) => io.observe(el));
  }
})();
