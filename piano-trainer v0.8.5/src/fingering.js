/* ============================================================================
 * fingering.js  —  Automatic fingering suggestion
 * ----------------------------------------------------------------------------
 * Assigns finger numbers (1 = thumb ... 5 = pinky) per hand by minimising an
 * ergonomic difficulty score over the whole passage.
 *
 * THE MODEL is Parncutt, Sloboda, Clarke, Raekallio & Desain (1997), "An
 * ergonomic model of keyboard fingering for melodic fragments" (Music
 * Perception 14(4)), with Jacobs' (2001) refinements. Its core is a table of
 * six span limits for every pair of fingers — practical, comfortable and
 * RELAXED minimum and maximum, in semitones — and rules that charge points for
 * leaving the relaxed range, for stretching past the comfortable one, for
 * weak-finger use, awkward thumb passes, and thumbs on black keys.
 *
 * WHY THIS REPLACED THE PREVIOUS MODEL. The old cost used the MAXIMUM
 * comfortable span of each finger pair as its zero point and only mildly
 * penalised narrower intervals. So a finger pair stretched to its limit was
 * "free", and the natural hand frame was charged as "cramped". Concretely: in
 * Ode to Joy the left hand alternates C3 and G2 (a fourth). Fingers 2-4 have a
 * maximum comfortable span of exactly a fourth, so 2-4 cost nothing and the
 * old model chose 4 for G2 — while pianists put 5 there, with the hand resting
 * on G-A-B-C-D. Parncutt's table places a fourth squarely inside the RELAXED
 * range of 2-5 and outside that of 2-4, which gives 5.
 *
 * SECOND ORDER. The rules that detect a change of hand position look at three
 * consecutive notes, so the optimiser is a Viterbi search over PAIRS of
 * fingers. Nakamura, Saito & Yoshii (2020) found a clear gain from first- to
 * second-order models on real pianists' fingerings. It is what gives the
 * Minuet in G its edition fingering 5-1-2-3-4-5-1-1: the first D is judged
 * together with the G-A that follow, not in isolation.
 *
 * RESTS relax the constraints: a hand can move freely through a silence, so
 * transitions across a gap cost a fraction of their normal price.
 *
 * PINS. Any note can be fixed to a finger (the player's own edits) and the
 * search re-optimises everything around it, so one correction changes the
 * neighbouring fingers too instead of leaving an inconsistent island.
 *
 * LIMITS, honestly. Even two professional pianists choose the same finger for
 * only about 60-80% of notes (Nakamura et al. 2020, PIG dataset), and the best
 * published statistical model reaches ~64%. No model removes the need for
 * personal edits; this one aims to get the textbook cases right and to make
 * edits cheap.
 *
 * Pure module, unit-testable in Node.
 * ========================================================================== */
(function (root) {
  "use strict";

  // HAND SIZE. Parncutt's table describes an average adult hand, whose widest
  // thumb-to-little-finger stretch (MaxPrac of the 1-5 pair) is 15 semitones
  // — between a ninth and a tenth. A player describes their own hand the way
  // teachers ask for it: "I can reach an octave / a ninth / a tenth" (1 to 5,
  // stretched). The presets are the same idea, in semitones.
  const AVERAGE_REACH = 15;
  const FIVE_FINGER_REACH = 7;          // a five-finger position, C to G: every hand has it
  const HAND_REACH = { XS: 12, S: 13.5, M: 15, L: 16.5, XL: 18 };
  /**
   * The STRETCH factor of a hand: 1 for the average hand, 0 for a hand that
   * can span a five-finger position and nothing wider. (See lim(): hand size
   * scales how far a hand stretches BEYOND a five-finger position.)
   * size: "XS".."XL" | { reach: semitones } | a number (the factor itself)
   */
  function scaleOf(size) {
    if (typeof size === "number" && size > 0) return size;
    const reach = size && typeof size === "object" && size.reach > 0 ? size.reach : (HAND_REACH[size] || AVERAGE_REACH);
    return Math.max(0.1, (reach - FIVE_FINGER_REACH) / (AVERAGE_REACH - FIVE_FINGER_REACH));
  }

  // Parncutt et al. (1997), Table 1 — right hand, semitones. For a pair f-g
  // (f < g) the value is the interval from f's note up to g's note; negative
  // entries mean the fingers are crossed (thumb under / finger over).
  //                MinPrac MinComf MinRel MaxRel MaxComf MaxPrac
  const SPAN = {
    "1-2": [-5, -3, 1,  5,  8, 10],
    "1-3": [-4, -2, 3,  7, 10, 12],
    "1-4": [-3, -1, 5,  9, 12, 14],
    "1-5": [-1,  1, 7, 10, 13, 15],
    "2-3": [ 1,  1, 1,  2,  3,  5],
    "2-4": [ 1,  1, 3,  4,  5,  7],
    "2-5": [ 2,  2, 5,  6,  8, 10],
    "3-4": [ 1,  1, 1,  2,  2,  4],
    "3-5": [ 1,  1, 3,  4,  5,  7],
    "4-5": [ 1,  1, 1,  2,  3,  5],
  };
  const MIN_PRAC = 0, MIN_COMF = 1, MIN_REL = 2, MAX_REL = 3, MAX_COMF = 4, MAX_PRAC = 5;
  for (const k in SPAN) Object.defineProperty(SPAN[k], "key", { value: k });
  /*
   * One limit of the table for a hand of a given size.
   *
   * The table used to be multiplied through by a size factor (0.8 for a
   * small hand). That shrank every span, including the ones no hand can
   * shrink: fingers 3 and 4 on neighbouring white keys (a whole step, 2
   * semitones) came out as "beyond comfortable" for a small hand, so a plain
   * five-finger position counted as a stretch and the search broke simple
   * melodies into jumps. Measured on the textbook set with a hand that
   * reaches an octave: 61.6% agreement with the method-book fingerings,
   * against 97.4% for the average hand. (The setting had no control in the
   * page, so nobody could see it.)
   *
   * The keys are the same width for every hand, so what size changes is the
   * STRETCH beyond a five-finger position. Each maximum is split into the
   * five-finger distance of that finger pair — the wider of the major and the
   * minor pentachord (C-D-E-F-G / C-D-Eb-F-G), which every hand plays — and
   * the part beyond it, which scales with the hand. Positive minima
   * (how close two fingers can sit) are set by the key width and don't
   * scale; negative minima — how far the thumb reaches when it crosses —
   * scale with the whole hand. At scale 1 this is exactly the published table.
   *
   * A scaled comfortable or relaxed maximum is then ROUNDED to the nearest
   * whole semitone (the practical one is not: it is the reach you gave). Intervals
   * are whole semitones and so is the table: its 5 for fingers 2-4 means "a
   * fourth is still comfortable", not a measurement to a tenth of a key.
   * Unrounded, a hand that reaches a ninth got 4.75 there, so E4-A4 with 2-4
   * counted as a stretch; to avoid it the search changed 114 notes of Für
   * Elise, putting back a move in the middle of C E A B (bar 7) — the very
   * pattern a player had reported as awkward — and a thumb crossing under 2
   * (bar 3), for a hand one semitone smaller than average. Rounded, that hand
   * plays the piece like the average one (4 left-hand notes differ), and
   * method-book agreement for a hand that reaches an octave rises from 95.7%
   * to 96.6%.
   */
  const FIVE_FINGER = { "1-2": 2, "1-3": 4, "1-4": 5, "1-5": 7, "2-3": 2, "2-4": 3, "2-5": 5, "3-4": 2, "3-5": 4, "4-5": 2 };
  function lim(L, k, scale) {
    const v = L[k];
    if (k === MIN_PRAC || k === MIN_COMF) {
      if (v >= 0) return v;
      return v * (FIVE_FINGER_REACH + (AVERAGE_REACH - FIVE_FINGER_REACH) * scale) / AVERAGE_REACH;
    }
    if (k === MIN_REL) return v;
    const floor = FIVE_FINGER[L.key] != null ? Math.min(v, FIVE_FINGER[L.key]) : 0;
    const x = floor + (v - floor) * scale;
    return k === MAX_PRAC ? x : Math.round(x);   // the practical 1-5 span is the reach you give: never more
  }
  // Which limit bounds a hand POSITION (see fingerHand): the comfortable
  // span (default), the relaxed one (never stretch: more position changes),
  // or the practical one (stretch rather than move).
  const FRAME_MAX = { rel: MAX_REL, comf: MAX_COMF, prac: MAX_PRAC };
  const REST_RELIEF = 0.35;   // cost multiplier for a transition across a rest
  // Hand position. Parncutt's rules judge finger PAIRS and triples, but not
  // where the hand as a whole sits — the class of error Nakamura et al. (2020)
  // single out (outer notes of a passage, normally 1 or 5, get other fingers).
  // Model: resting on the keys, finger f sits (f-1) white keys from the thumb,
  // so every (note, finger) implies a thumb position. Moving that position
  // costs FRAME_W per white key. It is what keeps "Mary had a little lamb" in
  // the C position (3-2-1-2-3) instead of drifting a finger up, and what puts
  // the pinky on G2 when the left hand rests on G-A-B-C-D.
  const FRAME_W = 0.5;
  // Finger COUPLING. Parncutt's three-to-four, four-on-black and 3-4-5 rules
  // exist because fingers 3, 4 and 5 share tendons, which limits how fast
  // they can alternate. That only matters in quick succession: at a quarter
  // note every half second, each finger has time to lift. These rules are
  // scaled by the time between the notes — full weight at 0.10 s or less,
  // none at 0.35 s or more (thresholds set before testing, not fitted).
  // Without timing information (the unit benchmark) they apply in full.
  function coupling(ioi) {
    if (ioi == null) return 1;
    return Math.max(0, Math.min(1, (0.35 - ioi) / 0.25));
  }
  const WHITE_INDEX = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
  // HAND POSITIONS, the way a teacher counts them: within one position every
  // finger stays on its own key — a key is always played by the same finger,
  // a finger always plays the same key, the fingers are in pitch order (a
  // thumb pass is a change) and no two are further apart than the RELAXED
  // span of that pair. Changing position is the expensive thing for a
  // learner, so each change costs CHANGE_W on top of the ergonomic rules —
  // enough that the search first minimises the NUMBER of changes and only
  // then picks the most comfortable fingering among those. It is NOT
  // discounted across a rest: moving during a silence is easier (the
  // ergonomic part is discounted), but it is still a move.
  // Exception: fast repeated notes (a finger change on one key is standard
  // technique there), faded out by the same speed curve as finger coupling.
  const CHANGE_W = 2;       // chosen by a sweep: 1-2 is a plateau (fewest changes, no textbook loss); 3+ starts breaking textbook fingerings
  function samePosition(p1, f1, p2, f2, scale) {    // right-hand space
    if (p1 === p2) return f1 === f2;
    if (f1 === f2) return false;
    const lo = f1 < f2 ? [p1, f1] : [p2, f2], hi = f1 < f2 ? [p2, f2] : [p1, f1];
    const d = hi[0] - lo[0];
    if (d <= 0) return false;
    const L = SPAN[lo[1] + "-" + hi[1]];
    return d >= lim(L, MIN_COMF, scale) && d <= lim(L, MAX_COMF, scale);
  }
  function whiteIndex(p) { return Math.floor(p / 12) * 7 + WHITE_INDEX[((p % 12) + 12) % 12]; }

  function isBlackKey(p) { const pc = ((p % 12) + 12) % 12; return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10; }

  /** Table key and signed distance for a finger pair, in right-hand space. */
  function pairOf(f1, p1, f2, p2) {
    return f1 < f2 ? { key: f1 + "-" + f2, d: p2 - p1 } : { key: f2 + "-" + f1, d: p1 - p2 };
  }

  /** Stretch + small-span + large-span rules (with the practical limits). */
  function spanCost(f1, p1, f2, p2, scale) {
    if (f1 === f2) return p1 === p2 ? 0 : 10 + 2 * Math.abs(p2 - p1);   // one finger, two keys: a jump
    const { key, d } = pairOf(f1, p1, f2, p2);
    const L = SPAN[key];
    const lm = (k) => lim(L, k, scale);
    const thumb = f1 === 1 || f2 === 1;
    const w = thumb ? 1 : 2;                 // Jacobs: non-thumb pairs cost double
    // A thumb PASS (crossed pair) is a lateral movement of the whole hand, not a
    // spread of the fingers — "it is easier to move the thumb sideways relative
    // to the other fingers" (Parncutt et al. 1997). The practical limit is a
    // limit on finger spread, so it isn't applied to a pass, and the stretch
    // penalty is halved: otherwise the standard two-octave arpeggio (thumb under
    // 3 across a fourth) is declared impossible.
    const crossed = thumb && d < 0;
    let c = 0;
    if (!crossed) {
      if (d < lm(MIN_PRAC)) c += 10 * (lm(MIN_PRAC) - d); else if (d > lm(MAX_PRAC)) c += 10 * (d - lm(MAX_PRAC));
    }
    const sw = crossed ? 1 : 2;
    if (d < lm(MIN_COMF)) c += sw * (lm(MIN_COMF) - d);  else if (d > lm(MAX_COMF)) c += sw * (d - lm(MAX_COMF));
    if (d < lm(MIN_REL))  c += w * (lm(MIN_REL) - d);   else if (d > lm(MAX_REL))  c += w * (d - lm(MAX_REL));
    return c;
  }

  /**
   * Cost of playing note i-1 with finger a and note i with finger b.
   * P = pitches in right-hand space (left hand mirrored), K = black-key flags.
   */
  function pairCost(a, b, i, P, K, scale, W, cpl) {
    let c = spanCost(a, P[i - 1], b, P[i], scale);
    if (W) c += FRAME_W * Math.abs((W[i] - W.sign * (b - 1)) - (W[i - 1] - W.sign * (a - 1)));  // thumb moved
    const k = cpl == null ? 1 : cpl;
    if (a === 3 && b === 4) c += k;                                            // three-to-four
    if ((a === 3 && b === 4 && !K[i - 1] && K[i]) || (a === 4 && b === 3 && K[i - 1] && !K[i])) c += k; // four-on-black
    if (b === 1 && K[i] && !K[i - 1]) c += 2;                                  // thumb onto black from white
    if (a === 1 && K[i - 1] && !K[i]) c += 2;                                  // thumb off black to white
    if (b === 5 && K[i] && !K[i - 1]) c += 1;                                  // pinky onto black from white
    if (a === 5 && K[i - 1] && !K[i]) c += 1;
    if (a !== b && (a === 1 || b === 1)) {                                     // thumb passing
      const { d } = pairOf(a, P[i - 1], b, P[i]);
      if (d < 0) {
        const t = a === 1 ? i - 1 : i, o = a === 1 ? i : i - 1;
        if (K[t] === K[o]) c += 1;
        else if (P[t] > P[o] && K[t] && !K[o]) c += 3;
      }
    }
    return c;
  }

  /** Rules over three consecutive notes (fingers a, b, c on notes i-2, i-1, i). */
  function tripleCost(a, b, c, i, P, scale, cpl) {
    let cost = 0;
    const p0 = P[i - 2], p1 = P[i - 1], p2 = P[i];
    if (a === c) {
      // The same finger on the first and third notes: if the pitch differs,
      // the WHOLE HAND moved by that interval (a finger's comfortable span with
      // itself is zero). Scored as a position change of that size — full when
      // the thumb pivots between them, as in Parncutt's position-change rule.
      if (p0 !== p2) {
        const between = (p1 - p0) * (p1 - p2) < 0;
        cost += (b === 1 && between ? 2 : 1) + Math.abs(p2 - p0);
      }
    } else {
      const { key, d } = pairOf(a, p0, c, p2);
      const L = SPAN[key];
      const lo = lim(L, MIN_COMF, scale), hi = lim(L, MAX_COMF, scale);
      if (d < lo || d > hi) {
        // position-change-count: full change (2) when the thumb is the pivot
        // between the outer notes and the span is beyond practical; else half (1)
        const between = (p1 - p0) * (p1 - p2) < 0;
        const outPrac = d < lim(L, MIN_PRAC, scale) || d > lim(L, MAX_PRAC, scale);
        cost += (b === 1 && between && outPrac) ? 2 : 1;
        cost += d < lo ? (lo - d) : (d - hi);    // position-change-size
      }
    }
    if (a !== b && b !== c && a !== c && a + b + c === 12 && Math.min(a, b, c) === 3) cost += (cpl == null ? 1 : cpl); // 3-4-5 in any order
    return cost;
  }

  function singleCost(f, i, K) {
    return (f === 4 ? 1 : 0) + (f === 1 && K[i] ? 1 : 0);   // weak finger (Jacobs: 4 only); thumb on black
  }

  /** Public for tests: difficulty of one transition (old API name kept). */
  function transitionCost(f1, p1, f2, p2, hand, scale) {
    const P = hand === "left" ? [-p1, -p2] : [p1, p2];
    return pairCost(f1, f2, 1, P, [isBlackKey(p1), isBlackKey(p2)], scale || 1);
  }

  /**
   * Finger a monophonic pitch sequence: second-order Viterbi over finger pairs.
   * @param {number[]} pitches  MIDI pitches in time order
   * @param {string} hand       "right" | "left"
   * @param {string} size       "XS".."XL"
   * @param {object} [opts]     { pins: [finger|null per note], relief: [0..1 per note] }
   */
  function fingerMonophonicWindowed(pitches, hand, size, opts) {
    const n = pitches.length;
    if (n === 0) return [];
    opts = opts || {};
    const scale = scaleOf(size);
    const P = hand === "left" ? pitches.map((p) => -p) : pitches.slice();   // mirror the left hand
    const K = pitches.map(isBlackKey);
    const W = pitches.map(whiteIndex);            // implied thumb = W - sign*(finger-1)
    W.sign = hand === "left" ? -1 : 1;           // left-hand fingers extend DOWNWARD from the thumb
    const pins = opts.pins || [];
    const relief = opts.relief || [];
    const ioi = opts.ioi || [];                   // seconds from onset i-1 to onset i
    const CW = opts.changeW == null ? CHANGE_W : opts.changeW;
    // a same-key finger change counts less the faster the repetition
    const change = (i, j, fi, fj) => {
      if (samePosition(P[i], fi, P[j], fj, scale)) return 0;
      if (P[i] === P[j] && j === i + 1 && ioi[j] != null) return CW * (1 - coupling(ioi[j]));
      return CW;
    };
    const cp = (i) => (ioi[i] == null ? null : coupling(ioi[i]));
    const cp3 = (i) => (ioi[i] == null || ioi[i - 1] == null ? null : Math.max(coupling(ioi[i]), coupling(ioi[i - 1])));
    const ALL = [1, 2, 3, 4, 5];
    const allowed = (i) => (pins[i] >= 1 && pins[i] <= 5 ? [pins[i]] : ALL);
    const r = (i) => (relief[i] == null ? 1 : relief[i]);

    if (n === 1) {
      let best = allowed(0)[0], bv = Infinity;
      for (const f of allowed(0)) { const v = singleCost(f, 0, K); if (v < bv) { bv = v; best = f; } }
      return [best];
    }
    // cur[a*10+b] = min cost with note i-1 on finger a and note i on finger b
    let cur = {};
    for (const a of allowed(0)) for (const b of allowed(1)) {
      cur[a * 10 + b] = singleCost(a, 0, K) + singleCost(b, 1, K) + r(1) * pairCost(a, b, 1, P, K, scale, W, cp(1)) + change(0, 1, a, b);
    }
    const back = [null, null];
    for (let i = 2; i < n; i++) {
      const next = {}, bk = {};
      for (const b of allowed(i - 1)) for (const c of allowed(i)) {
        const pc = r(i) * pairCost(b, c, i, P, K, scale, W, cp(i)) + singleCost(c, i, K) + change(i - 1, i, b, c);
        let best = Infinity, bx = 0;
        for (const a of allowed(i - 2)) {
          const prev = cur[a * 10 + b];
          if (prev === undefined) continue;
          // a change the two pairs miss: notes i-2 and i can't share a position
          // although each is fine with the note between them (C3 by 1, G2, C3 by 2)
          const hidden = (!change(i - 2, i - 1, a, b) && !change(i - 1, i, b, c) && !samePosition(P[i - 2], a, P[i], c, scale)) ? CW : 0;
          const v = prev + r(i) * tripleCost(a, b, c, i, P, scale, cp3(i)) + hidden;
          if (v < best) { best = v; bx = a; }
        }
        if (bx) { next[b * 10 + c] = best + pc; bk[b * 10 + c] = bx; }
      }
      cur = next; back.push(bk);
    }
    let bestKey = 0, bestV = Infinity;
    for (const k in cur) if (cur[k] < bestV) { bestV = cur[k]; bestKey = +k; }
    const out = new Array(n);
    out[n - 1] = bestKey % 10; out[n - 2] = Math.floor(bestKey / 10);
    for (let i = n - 1; i >= 2; i--) out[i - 2] = back[i][out[i - 1] * 10 + out[i]];
    return out;
  }

  /*
   * THE EXACT OPTIMISER. The search state is the hand position itself: which
   * finger rests on which key (a partial map, fingers in pitch order, every
   * pair within its COMFORTABLE span — beyond relaxed is a stretch, which the
   * ergonomic rules charge for, but not a move). At every onset the hand either
   * STAYS — the onset's keys are, or can be added to, the current map — or
   * MOVES to a fresh map, which counts one change of position.
   *
   * States are compared lexicographically: (number of position changes, then
   * ergonomic cost). So the result has the SMALLEST POSSIBLE number of hand
   * position changes for the piece, and among the fingerings that achieve it,
   * the most comfortable one by the Parncutt/Jacobs rules above. A repeated
   * note can never switch finger without that counting as a move; a chord
   * sits in the same position as the melody around it.
   *
   * Rests discount the ergonomic cost of a move (it is easier in a silence),
   * never the count: a move made in a rest is still a move — but when a move
   * is unavoidable, the search prefers to make it where it is easiest.
   */
  const BEAM = 600;                                 // safety bound on live states per onset
  // Two kinds of move, and only one of them is what a learner means by
  // "changing hand position". A THUMB PASS — the thumb under a finger, or a
  // finger over the thumb, between neighbouring notes — lets the hand glide
  // on without lifting; it is how every scale is played. A JUMP lifts the
  // hand: 5 -> 1 on a repeated key, 5 on G then 1 on the A above, any other
  // re-placement. The search minimises JUMPS first; a pass is priced by the
  // ergonomic rules (plus CROSS_COST, so it isn't free either). Counting passes
  // as moves too would finger a two-octave C scale 12345-12345-12345 (two
  // jumps) over the textbook 1231234-1231234-5 (three passes, no jump).
  // Both are moves, and both count: the search minimises
  //   JUMP_W x jumps + 1 x thumb passes
  // exactly, and only then the ergonomic cost. JUMP_W says how many passes one
  // jump is worth. At 1 a two-octave scale becomes 12345-12345-12345 (two
  // jumps instead of the textbook's three passes); counting jumps alone (an
  // infinite weight) turned "Twinkle" into nine thumb passes to avoid one
  // jump. The value was chosen by the sweep in tests/possweep.js.
  const JUMP_W = 2;
  // WHERE a jump goes. A jump lifts the hand, which breaks the line — and that
  // is only audible where the line is connected. Inside stepwise motion (or on
  // a repeated note: re-striking one key with a different finger is exactly
  // the "5 then 1 on D4" a player finds needless) the break costs up to
  // JUMP_LEGATO; across a leap of a fifth or more the gap is already there and
  // it costs nothing; across a rest the relief applies as to everything else.
  // This only chooses among fingerings with the same (minimal) number of moves.
  const JUMP_LEGATO = 3;
  // A jump ON a repeated key — striking the same key again with another finger
  // — costs double a jump on a step. At ordinary speed a repeated note keeps its
  // finger (the alternation 3-2-1 is a technique for fast repetitions), and it
  // is the move a player notices as needless: this was reported as "D4 with 5,
  // then with 1". It never adds a move; it only decides that when a move is
  // unavoidable nearby (a pinned finger can force one), it doesn't land there.
  const REPEAT_JUMP = 2;
  /*
   * WHAT A MOVE COSTS DEPENDS ON WHERE IT HAPPENS. Counting every jump as two
   * thumb passes, wherever it fell, made two kinds of fingering look better
   * than they are (both reported on Für Elise, for an average hand):
   *  - a jump inside a legato figure (C4 E4 | A4 B4 with the hand re-placed
   *    in mid-arpeggio) cost the same as the jump a pianist makes during the
   *    rest a bar later, when the right hand is off the keys anyway; and
   *  - any thumb pass counted as half a jump — even one that lands the thumb
   *    on a black key (E4 G#4 with 2-1, then B4 C5 on 4-5, cramped against it)
   *    rather than re-placing the hand in the rest before E4.
   * So a jump taken in a rest (the hand is off the keys: a gap of more than
   * 0.12 s, see handOnsets) now counts as one move, like a pass; a jump
   * between connected notes still counts JUMP_W; and a pass that puts the
   * thumb on a black key counts as much as a jump, since method books avoid
   * it exactly as they avoid breaking the line. Set from four Für Elise
   * passages a player reported (tests/fingervariants.js), then checked
   * against every textbook and melody set. (Switched off one at a time: the
   * rest rule and SLIDE_COST below each fix E4 G#4 on their own; the rule
   * for passes onto black keys is what makes F major 1234-1234, 96.1% ->
   * 99.3% on the tuning set, and changes nothing in Für Elise.)
   */
  const REST_JUMP_W = 1;
  // THE FINGER SLIDES A SEMITONE. A position is "each finger on its own key",
  // but a finger also plays the black key beside its white one (or the white
  // key beside its black one) without the hand moving: in Für Elise 4 plays
  // D#5 and, a beat later, D5 (E D# E D# E B D C A = 5 4 5 4 5 2 4 3 1, the
  // edition fingering). The strict model had to call that a change of
  // position, and to avoid it put the thumb on B and jumped for the A. A
  // slide keeps the position and costs a little comfort. Only between a black
  // and a white key: a black key sits between two white ones, so the finger
  // shifts about half a key sideways; two white keys a semitone apart (E-F,
  // B-C) are a whole key width apart, which is moving the hand — allowing
  // those too made the method-book fingerings worse (a rule of thumb, checked
  // on the benchmark, not a measurement). And only when the finger did not
  // play the note just before: it can't slide off a key it is still playing
  // (that is the chromatic scale's problem, which passes solve).
  const SLIDE_COST = 0.8;
  function legatoBreak(interval) {                  // semitones, 0 = repeated note
    const d = Math.abs(interval);
    if (d === 0) return REPEAT_JUMP;
    return Math.max(0, Math.min(1, (7 - d) / 5));   // 1 up to a second, 0 from a fifth
  }
  const PASS_REACH = 7;                             // semitones: a thumb pass reaches up to a fifth (arpeggios)
  // FAST REPEATED NOTES. A run of quick strokes on one key is played by
  // changing finger on every stroke (3-2-1, 4-3-2-1 — towards the thumb);
  // a PAIR of quick notes inside a slower line is not — one finger re-strikes
  // it, with the wrist. The first version judged each repetition on its own
  // speed, so in a line of eighths with the odd pair of sixteenths on the
  // same key (Yui, "Again": E E E-E E E-E A E at 120 BPM) only the pairs
  // changed finger: 3 3 3 2 3 3 2 on one key, which reads as a mistake and
  // trains an inconsistent hand. Now a repetition counts only as part of a
  // RUN: at least REP_RUN_MIN notes on one key, each within REP_RUN_IOI of
  // the last; a run changes finger throughout, anything else keeps one. A
  // burst of two or three quick strokes ("E-E E" in that song) is one
  // finger's job. Both thresholds are rules of thumb — a finger re-strikes
  // comfortably at around 6-7 strokes a second for a few strokes; it is a
  // sustained run past that which wants the fingers to take turns — not
  // measurements.
  const REP_RUN_IOI = 0.14;                         // seconds between strokes: ~7 a second or faster
  const REP_RUN_MIN = 4;                            // notes in a row on one key
  const REP_SAME = 2.5;                             // one finger re-striking inside such a run
  // The cycle runs towards the thumb (4-3-2-1, 3-2-1) and starts again from
  // 3 or 4; a run that STARTS on the thumb (1-3-2-1) is the unusual choice.
  function alternationCost(prev, next, first) {
    let c = next === prev - 1 ? 0 : (prev === 1 && (next === 3 || next === 4)) ? 0.6 : 1.5;
    if (first && prev === 1) c += 0.8;
    else if (first && prev === 2) c += 0.3;     // 3 or 4 is where a run begins
    return c;
  }
  function isThumbPass(f1, p1, f2, p2) {            // right-hand space, consecutive notes
    if (f1 === f2 || (f1 !== 1 && f2 !== 1) || p1 === p2) return false;
    const { d } = pairOf(f1, p1, f2, p2);
    return d < 0 && -d <= PASS_REACH && f1 !== 5 && f2 !== 5;
  }
  function spanOK(k1, f1, k2, f2, scale, frame) {   // right-hand space, k1 < k2
    if (f1 >= f2) return false;
    const L = SPAN[f1 + "-" + f2];
    const d = k2 - k1;
    return d >= lim(L, MIN_COMF, scale) && d <= lim(L, FRAME_MAX[frame] || MAX_COMF, scale);
  }
  /** All ways to give the keys `free` fingers, consistent with `fixed` (sorted pairs [key, finger]). */
  function extendMap(fixed, free, pins, scale, frame) {
    const keys = [...fixed.map((x) => x[0]), ...free].sort((a, b) => a - b);
    if (keys.length > 5) return [];
    const fixedF = new Map(fixed);
    const out = [];
    const cur = new Array(keys.length);
    const rec = (i, minF) => {
      if (i === keys.length) {
        const pairs = keys.map((k, j) => [k, cur[j]]);
        for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) {
          if (!spanOK(pairs[a][0], pairs[a][1], pairs[b][0], pairs[b][1], scale, frame)) return;
        }
        out.push(pairs);
        return;
      }
      const k = keys[i];
      const need = fixedF.has(k) ? fixedF.get(k) : (pins && pins.has(k) ? pins.get(k) : 0);
      const left = keys.length - 1 - i;               // fingers still needed after this one
      for (let f = minF; f <= 5 - left; f++) {
        if (need && f !== need) continue;
        cur[i] = f; rec(i + 1, f + 1);
      }
    };
    rec(0, 1);
    return out;
  }
  const mapKey = (m) => m.map((x) => x[0] + ":" + x[1]).join(",");

  /**
   * Finger one hand. onsets: [{ keys:[midi...], rep: midi, pins: Map(midi->finger) }]
   * (rep = the melodic note: top for the right hand, bottom for the left).
   * opts: { ioi:[...], relief:[...] } per onset.
   * Returns { fingers: [Map(midi->finger) per onset], moves: [bool per onset] }.
   */
  function fingerHand(onsets, hand, size, opts) {
    opts = opts || {};
    const n = onsets.length;
    if (!n) return { fingers: [], moves: [], jumps: [], alts: [], changes: 0, cost: 0 };
    const scale = scaleOf(size);
    // a stretch past the comfortable span may replace a move (see SMALL_STRETCH_W)
    const STW = opts.stretchW || 0;
    const frame = opts.frame || "comf";
    // with it, a position may span what the AVERAGE hand spans comfortably
    const fscale = STW > 0 && frame === "comf" ? Math.max(1, scale) : scale;
    const sg = hand === "left" ? -1 : 1;
    const O = onsets.map((o) => {
      const keys = [...new Set(o.keys)].map((k) => sg * k).sort((a, b) => a - b);
      const pins = new Map(); if (o.pins) for (const [k, f] of o.pins) pins.set(sg * k, f);
      return { keys, rep: sg * o.rep, pins };
    });
    const P = O.map((o) => o.rep);                            // rep line, right-hand space
    const real = O.map((o) => sg * o.rep);
    const K = real.map(isBlackKey);
    const W = real.map(whiteIndex); W.sign = sg;
    const relief = opts.relief || [], ioi = opts.ioi || [];
    const JW = opts.jumpW == null ? JUMP_W : opts.jumpW;
    // the right hand is off the keys before onset i (relief < 1 marks a rest)
    const restBefore = (i) => relief[i] != null && relief[i] < 1;
    const jumpW = (i) => (restBefore(i) ? Math.min(JW, REST_JUMP_W) : JW);
    const passW = (i, fb) => (fb === 1 && K[i] ? JW : 1);      // thumb passing under onto a black key
    const blackRH = (k) => isBlackKey(sg * k);
    // finger pairs of a position spread past this hand's comfortable span
    const nStretch = (m) => {
      if (!(STW > 0)) return 0;
      let c = 0;
      for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) {
        if (m[b][0] - m[a][0] > lim(SPAN[m[a][1] + "-" + m[b][1]], MAX_COMF, scale)) c++;
      }
      return c;
    };
    const validMap = (m) => {                                  // fingers in key order, every pair within the frame
      for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) {
        if (!spanOK(m[a][0], m[a][1], m[b][0], m[b][1], fscale, frame)) return false;
      }
      return true;
    };
    const r = (i) => (relief[i] == null ? 1 : relief[i]);
    const cp = (i) => (ioi[i] == null ? null : coupling(ioi[i]));
    const cp3 = (i) => (ioi[i] == null || ioi[i - 1] == null ? null : Math.max(coupling(ioi[i]), coupling(ioi[i - 1])));
    const repFinger = (m, i) => { for (const [k, f] of m) if (k === P[i]) return f; return 0; };
    const shapeCost = (m, i) => {                             // a chord's own spread
      if (O[i].keys.length < 2) return 0;
      let c = 0; const fs = O[i].keys.map((k) => m.find((x) => x[0] === k)[1]);
      for (let j = 1; j < fs.length; j++) c += spanCost(fs[j - 1], O[i].keys[j - 1], fs[j], O[i].keys[j], scale);
      return c;
    };
    // a single key struck again, right after itself
    const repeated = (i) => i >= 1 && O[i].keys.length === 1 && O[i - 1].keys.length === 1 && O[i].keys[0] === O[i - 1].keys[0];
    // runs of quick repetitions on one key (see REP_RUN_*): inside one, the
    // finger changes on every stroke; outside, a repeated key keeps its finger
    const inRun = new Array(n).fill(false);
    const quick = (i) => repeated(i) && ioi[i] != null && ioi[i] <= REP_RUN_IOI;
    for (let i = 1; i < n;) {
      if (!quick(i)) { i++; continue; }
      let j = i;
      while (j + 1 < n && quick(j + 1)) j++;
      if (j - i + 2 >= REP_RUN_MIN) for (let k = i; k <= j; k++) inRun[k] = true;   // notes i-1..j
      i = j + 1;
    }
    const stepCost = (m, i, fa2, fa1, jumped) => {
      const fb = repFinger(m, i);
      let c = singleCost(fb, i, K) + shapeCost(m, i);
      if (!jumped && fb === fa1 && inRun[i]) c += REP_SAME;
      if (jumped) {
        // The hand lifts: the pair and triple rules describe fingers reaching
        // from key to key WITHOUT moving the hand (a legato connection), which
        // a jump by definition doesn't make — the same finger landing again,
        // as in a stride bass, is fine. What a jump costs is how far the hand
        // travels, on top of the jump itself (counted in the primary total).
        if (i >= 1 && fa1) {
          c += r(i) * FRAME_W * Math.abs((W[i] - W.sign * (fb - 1)) - (W[i - 1] - W.sign * (fa1 - 1)));
          c += r(i) * JUMP_LEGATO * legatoBreak(P[i] - P[i - 1]);
        }
        return c;
      }
      if (i >= 1 && fa1) c += r(i) * pairCost(fa1, fb, i, P, K, scale, W, cp(i));
      if (i >= 2 && fa2 && fa1) c += r(i) * tripleCost(fa2, fa1, fb, i, P, scale, cp3(i));
      return c;
    };
    const better = (a, b) => !b || a.c < b.c - 1e-9 || (Math.abs(a.c - b.c) < 1e-9 && a.v < b.v - 1e-9);
    // a fresh position for onset i; if none is comfortable (a very wide chord),
    // fall back to the chord-shape heuristic rather than give up
    const fresh = (i) => {
      const f = extendMap([], O[i].keys, O[i].pins, fscale, frame);
      if (f.length) return f;
      const cf = fingerChord(O[i].keys.map((k) => sg * k), hand, size);
      return [O[i].keys.map((k, j) => [k, O[i].pins.get(k) || cf[j]])];
    };
    let states = new Map(); const hist = []; let beamHit = false; let maxStates = 0;
    for (const m of fresh(0)) {
      const st = { m, fa2: 0, fa1: repFinger(m, 0), c: STW * nStretch(m), v: stepCost(m, 0, 0, 0), prev: null, moved: false };
      const key = mapKey(m) + "|0," + st.fa1;
      if (better(st, states.get(key))) states.set(key, st);
    }
    hist.push(states);
    for (let i = 1; i < n; i++) {
      const next = new Map();
      const push = (st) => { const key = mapKey(st.m) + "|" + st.fa2 + "," + st.fa1; if (better(st, next.get(key))) next.set(key, st); };
      let bestPrev = null;
      for (const s of states.values()) if (better(s, bestPrev)) bestPrev = s;
      const freshI = fresh(i);                      // the same for every state: compute once
      for (const s of states.values()) {
        // stay: the onset's keys fit the current position (possibly adding keys)
        const have = new Set(s.m.map((x) => x[0]));
        const free = O[i].keys.filter((k) => !have.has(k));
        const pinClash = O[i].keys.some((k) => O[i].pins.has(k) && have.has(k) && s.m.find((x) => x[0] === k)[1] !== O[i].pins.get(k));
        if (!pinClash) for (const m of extendMap(s.m, free, O[i].pins, fscale, frame)) {
          push({ m, fa2: s.fa1, fa1: repFinger(m, i), c: s.c + STW * (nStretch(m) - nStretch(s.m)), v: s.v + stepCost(m, i, s.fa2, s.fa1), prev: s, moved: false });
        }
        // stay, with one finger sliding a semitone to a neighbouring key
        // (one of the two black) — see SLIDE_COST
        if (O[i].keys.length === 1 && free.length === 1) {
          const k = free[0];
          for (const [k2, f] of s.m) {
            if (Math.abs(k2 - k) !== 1 || f === s.fa1 || !(blackRH(k) || blackRH(k2))) continue;
            if (O[i].pins.has(k) && O[i].pins.get(k) !== f) continue;
            const m = s.m.map((x) => (x[0] === k2 ? [k, f] : x)).sort((a, b) => a[0] - b[0]);
            if (!validMap(m)) continue;
            push({ m, fa2: s.fa1, fa1: f, c: s.c + STW * Math.max(0, nStretch(m) - nStretch(s.m)), v: s.v + stepCost(m, i, s.fa2, s.fa1) + SLIDE_COST, prev: s, moved: false, slide: true });
          }
        }
        // a fast repeated note may change finger on the key (3-2-1) — the hand
        // stays where it is, so this is neither a jump nor a pass
        if (inRun[i]) for (const m of freshI) {
          const fb = repFinger(m, i);
          if (fb === s.fa1) continue;
          // (the weak-fourth rule is about 4 moving independently in a line;
          // re-striking one key it is as good as any, and 4-3-2-1 is standard)
          const v = s.v + (fb === 4 ? 0 : singleCost(fb, i, K)) + alternationCost(s.fa1, fb, !inRun[i - 1]);
          push({ m, fa2: 0, fa1: fb, c: s.c, v, prev: s, moved: false, alt: true });
        }
        // move to a fresh position: a thumb pass (glide, no jump) or a jump.
        // Only tried from states within one jump of the best — a state further
        // behind can never catch up, since after a move the future depends only
        // on the new position, which the better state can reach the same way.
        if (s.c <= bestPrev.c + JW - 1 + 1e-9) for (const m of freshI) {
          const fb = repFinger(m, i);
          const pass = isThumbPass(s.fa1, P[i - 1], fb, P[i]);
          // after a JUMP the next three-note rule must not look back across it
          // (the hand was re-placed; comparing a finger before the jump with one
          // after it describes a stretch that never happens) — fa2 = 0 turns it off
          push({ m, fa2: pass ? s.fa1 : 0, fa1: fb, c: s.c + (pass ? passW(i, fb) : jumpW(i)) + STW * nStretch(m), v: s.v + stepCost(m, i, s.fa2, s.fa1, !pass),
                 prev: s, moved: true, jump: !pass });
          // across a rest the hand is off the keys, so the same move can also be
          // a lift rather than a crossing (Für Elise, bar 22: B4 with 2, a rest,
          // then E5 — the thumb re-placed, not passed under 2 by a fourth; else
          // E5 got 5 and, after the next rest, 1)
          if (pass && restBefore(i)) push({ m, fa2: 0, fa1: fb, c: s.c + jumpW(i) + STW * nStretch(m), v: s.v + stepCost(m, i, s.fa2, s.fa1, true), prev: s, moved: true, jump: true });
        }
      }
      if (next.size > BEAM) {                               // bounded, best first
        const keep = [...next.entries()].sort((a, b) => (a[1].c - b[1].c) || (a[1].v - b[1].v)).slice(0, BEAM);
        beamHit = true;
        states = new Map(keep);
      } else states = next;
      hist.push(states);
      if (states.size > maxStates) maxStates = states.size;
    }
    let best = null;
    for (const s of states.values()) if (better(s, best)) best = s;
    const fingers = new Array(n), moves = new Array(n), jumps = new Array(n), alts = new Array(n);
    for (let i = n - 1, s = best; i >= 0; i--, s = s.prev) {
      const m = new Map(); for (const [k, f] of s.m) m.set(sg * k, f);
      fingers[i] = m; moves[i] = s.moved; jumps[i] = !!s.jump; alts[i] = !!s.alt;
    }
    // STRETCHES: where the chosen fingering goes past the comfortable span of
    // a finger pair — inside a chord, or from one note of the line to the
    // next without the hand moving. What a bigger hand does easily and a
    // smaller one should avoid, so it is reported per variant.
    let stretches = 0;
    const beyond = (f1, p1, f2, p2) => {
      if (f1 === f2) return false;
      const { key, d } = pairOf(f1, p1, f2, p2);
      const L = SPAN[key];
      return d > lim(L, MAX_COMF, scale) + 1e-9;
    };
    for (let i = 0; i < n; i++) {
      const keys = O[i].keys;
      const fm = fingers[i];
      for (let j = 1; j < keys.length; j++) if (beyond(fm.get(sg * keys[j - 1]), keys[j - 1], fm.get(sg * keys[j]), keys[j])) { stretches++; break; }
      if (i >= 1 && !jumps[i] && !alts[i] && !moves[i]) {
        const a = fingers[i - 1].get(sg * P[i - 1]), b = fm.get(sg * P[i]);
        if (a && b && beyond(a, P[i - 1], b, P[i])) stretches++;
      }
    }
    return { fingers, moves, jumps, alts, stretches, changes: best.c, cost: best.v, beamHit, maxStates };
  }

  /** Monophonic convenience wrapper (tests, benchmark): one note per onset. */
  function fingerMonophonic(pitches, hand, size, opts) {
    opts = opts || {};
    const pins = opts.pins || [];
    const onsets = pitches.map((p, i) => ({ keys: [p], rep: p, pins: pins[i] ? new Map([[p, pins[i]]]) : null }));
    const res = fingerHand(onsets, hand, size, opts);
    return pitches.map((p, i) => res.fingers[i].get(p));
  }

  // Natural (relaxed, not maximal) span in semitones from the THUMB to each
  // finger when the hand simply rests on the keys. Chord placement targets
  // these; stretches beyond them are tolerated but not preferred. (COMFY above
  // (the old melodic table) held *maximum* comfortable spans for melodic transitions — using those for
  // chords was the bug that fingered a G4+G5 octave as 1–3.)
  const NATURAL_FROM_THUMB = { 2: 2, 3: 4, 4: 5.5, 5: 7 };

  /**
   * Assign fingers to a chord (simultaneous pitches in one hand),
   * interval-aware: each note (counting outward from the thumb side) gets the
   * finger whose natural distance from the thumb best matches the note's
   * actual distance, under the constraints that fingers strictly increase
   * outward and enough fingers remain for the rest of the chord.
   * RH: thumb on the lowest note; LH: thumb on the highest (mirror).
   * Examples (RH): octave -> 1,5 · third -> 1,3 · second -> 1,2 ·
   * C-E-G -> 1,3,5 · C-D-E -> 1,2,3 · C-E-G-C -> 1,2,4,5.
   */
  function fingerChord(pitches, hand, size) {
    const n = pitches.length;
    const idx = pitches.map((p, i) => i).sort((a, b) => pitches[a] - pitches[b]);
    const order = hand === "right" ? idx : idx.slice().reverse(); // thumb side first
    const fingers = new Array(n);

    if (n >= 5) {
      // Five or more notes: all five fingers low-to-high from the thumb side.
      for (let i = 0; i < order.length; i++) fingers[order[i]] = Math.min(5, i + 1);
      return fingers;
    }

    const thumbPitch = pitches[order[0]];
    const spanTotal = Math.abs(pitches[order[n - 1]] - thumbPitch);
    // A fifth or wider: the pinky belongs on the outer note (an octave played
    // 1–5 is the NORMAL hand frame, not a stretch), and inner notes sit at
    // their proportional position inside that frame. Narrower chords place
    // each finger by its natural distance from the thumb.
    // (the natural distances are those of a hand resting on a five-finger
    // position, which every hand has — see lim() — so they don't scale)
    const pinkyAnchored = spanTotal >= 7 - 1e-9;

    fingers[order[0]] = 1;
    let prev = 1;
    for (let i = 1; i < n; i++) {
      const dist = Math.abs(pitches[order[i]] - thumbPitch);
      const remaining = n - 1 - i;               // notes still to place after this
      const minF = prev + 1;
      const maxF = 5 - remaining;                // leave room outward
      let best;
      if (pinkyAnchored && i === n - 1) {
        best = 5;
      } else if (pinkyAnchored) {
        // proportional position in the 1..5 frame, clamped to what's available
        const target = 1 + 4 * (dist / spanTotal);
        best = Math.max(minF, Math.min(maxF, Math.round(target)));
      } else {
        let bestD = Infinity;
        best = maxF;
        for (let f = minF; f <= maxF; f++) {
          // Stretching past the natural span is easier than cramping under it.
          const nat = NATURAL_FROM_THUMB[f];
          const d = dist >= nat ? (dist - nat) * 0.8 : (nat - dist) * 1.2;
          if (d < bestD) { bestD = d; best = f; }
        }
      }
      fingers[order[i]] = best;
      prev = best;
    }
    return fingers;
  }

  /*
   * VARIANTS. There is no single right fingering, and much of the choice is
   * about the hand: a large hand stretches where a small one has to move.
   * Each variant is the same exact search with a different definition of
   * "one hand position" and a different price on a jump:
   *   balanced  a position spans the COMFORTABLE reach of each finger pair;
   *             fewest moves (2 x jumps + thumb passes), then comfort.
   *   compact   a position may stretch to the PRACTICAL reach: fewer moves,
   *             more stretches — for a hand that stretches easily.
   *   relaxed   a position never goes past the RELAXED reach: no stretching,
   *             the hand moves (passes, jumps) more often instead.
   *   legato    as balanced, but a jump costs three thumb passes instead of
   *             two, so the line is joined by passing under/over wherever a
   *             pass can do the job of a lift.
   */
  /*
   * A SMALL HAND MAY STRETCH A LITTLE RATHER THAN MOVE. For the average hand
   * a position stays within the comfortable span (the published table). A
   * smaller hand's comfortable spans are that table scaled down, and in
   * music written for average hands that turns plain figures into moves: for
   * a hand that reaches an octave, C E A B (Für Elise) is 1 2 4 5 with 2-4 a
   * semitone past comfortable, so the search passed the thumb under 2 or
   * re-placed the hand in mid-arpeggio — what the average hand is spared.
   * So for a hand smaller than average (Balanced and Legato), a position may
   * span what the AVERAGE hand spans comfortably, and each finger pair spread
   * past this hand's own comfortable span counts half a thumb pass: a slight
   * stretch is preferred to a move, a move to two stretches. Capped at the
   * average hand's span, a smaller hand never stretches where the average one
   * moves (allowed its own practical span instead, a hand that reaches a
   * ninth stretched 11 times in Für Elise where the average hand does not).
   * Measured on Für Elise: a hand that reaches a ninth now plays exactly the
   * average hand's fingering; one that reaches an octave differs in 71 notes
   * (196 with the rounding alone): 157 jumps instead of 199, 30 thumb passes
   * instead of 40, 38 slight stretches instead of 3. Method-book agreement, with rounding
   * (above): 99.6% for a hand that reaches an octave or less, against 95.7%
   * before, and 78.4% with the style the app used to suggest for it.
   * The weight 0.5 is a rule of thumb. The rule leaves the average and larger
   * hands untouched.
   */
  const SMALL_STRETCH_W = 0.5;
  const STRATEGIES = {
    balanced: { frame: "comf", jumpW: 2 },
    compact:  { frame: "prac", jumpW: 2 },
    relaxed:  { frame: "rel",  jumpW: 2 },
    legato:   { frame: "comf", jumpW: 3 },
  };
  /** How far a hand spans, thumb to little finger, in semitones. */
  function handReach(size) {
    const sc = scaleOf(size);
    return { practical: lim(SPAN["1-5"], MAX_PRAC, sc), comfortable: lim(SPAN["1-5"], MAX_COMF, sc) };
  }
  /** The variant that suits a hand, as a starting point (a rule of thumb). */
  // A small hand used to be offered "relaxed" (never stretch). Measured for a
  // hand that reaches an octave, it avoids Balanced's slight stretches (3
  // instead of 38 in Für Elise) at the cost of 66 more jumps and 31 more thumb
  // passes, and matches the method books less often (95.7% against 99.6%).
  // It stays a choice for a hand that should not stretch at all.
  function suggestedStrategy(size) {
    const sc = scaleOf(size);
    if (sc >= 1.1) return "compact";      // reaches a tenth or more: fewer shifts, it can stretch
    return "balanced";
  }

  /** Group one hand's notes into onsets with the timing context the search needs. */
  function handOnsets(handNotes, hand, userPins) {
    const groups = new Map();
    for (const nn of handNotes) {
      const key = Math.round(nn.startSec * 1000);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(nn);
    }
    const onsetKeys = [...groups.keys()].sort((a, b) => a - b);
    const onsets = [], relief = [], ioi = [];
    let prevEnd = null, prevStart = null;
    for (const k of onsetKeys) {
      const g = groups.get(k);
      const pitches = g.map((x) => x.midi);
      const rep = hand === "right" ? Math.max(...pitches) : Math.min(...pitches);
      const pins = new Map();
      for (const nn of g) if (userPins && userPins.has(nn.id)) pins.set(nn.midi, userPins.get(nn.id));
      onsets.push({ keys: pitches, rep, pins });
      const start = g[0].startSec;
      relief.push(prevEnd != null && start - prevEnd > 0.12 ? REST_RELIEF : 1);
      ioi.push(prevStart == null ? null : start - prevStart);
      prevStart = start;
      prevEnd = Math.max(...g.map((x) => x.startSec + (x.durSec || 0)));
    }
    return { groups, onsetKeys, onsets, relief, ioi };
  }

  /**
   * Annotate a parsed song's notes with `.finger`.
   * Notes are grouped per hand and per onset; the search fingers every onset
   * of a hand at once (chords and the melodic line together). Rests between
   * onsets relax the transition costs across them.
   *
   * @param {object} song   from parser.js (notes have id, midi, startSec, durSec, staff)
   * @param {string|number|object} [size] hand: "XS".."XL", a scale, or { reach: semitones 1-5 }
   * @param {object} [opts] { pins: Map(noteId -> finger), strategy: "balanced" | "compact" | "relaxed" | "legato" }
   * Sets on each note: finger, pinned, handMove ("jump" | "pass" | "alt" | null)
   * and wide (the chord is wider than this hand can hold: roll it or share it).
   * Sets song.fingerStats = { strategy, jumps, passes, alternations, stretches, wideChords }.
   */
  function annotate(song, size, opts) {
    size = size || "M";
    opts = opts || {};
    const userPins = opts.pins || new Map();
    const strategy = STRATEGIES[opts.strategy] ? opts.strategy : "balanced";
    const S = STRATEGIES[strategy];
    const scale = scaleOf(size);
    if (!song || !song.notes || !song.notes.length) return song;
    let totalMoves = 0;
    const stats = { strategy, jumps: 0, passes: 0, alternations: 0, stretches: 0, wideChords: 0 };
    for (const nn of song.notes) if (nn.backing || nn.unreachable) { nn.finger = null; nn.handMove = null; nn.pinned = false; nn.wide = false; }
    // the widest chord a hand can hold at all: the practical 1-5 stretch
    const reach = lim(SPAN["1-5"], MAX_PRAC, scale);

    for (const hand of ["right", "left"]) {
      const staffMatch = hand === "right" ? (st) => st === 0 : (st) => st >= 1;
      const handNotes = song.notes.filter((nn) => !nn.backing && !nn.unreachable && staffMatch(nn.staff));   // not played by you
      if (!handNotes.length) continue;
      const { groups, onsetKeys, onsets, relief, ioi } = handOnsets(handNotes, hand, userPins);
      const stretchW = S.frame === "comf" && scale < 1 - 1e-9 ? SMALL_STRETCH_W : 0;
      const res = fingerHand(onsets, hand, size, { relief, ioi, frame: S.frame, jumpW: S.jumpW, stretchW });
      onsetKeys.forEach((k, gi) => {
        const rep = onsets[gi].rep;
        const g = groups.get(k);
        const lo = Math.min(...g.map((x) => x.midi)), hi = Math.max(...g.map((x) => x.midi));
        const wide = hi - lo > reach + 1e-9;
        if (wide) stats.wideChords++;
        for (const nn of g) {
          nn.finger = res.fingers[gi].get(nn.midi);
          nn.pinned = userPins.has(nn.id);          // the player's own finger, not a suggestion
          nn.wide = wide;
          // how the hand moves here — marked once per chord, on its outer note
          nn.handMove = nn.midi !== rep ? null : res.jumps[gi] ? "jump" : res.moves[gi] ? "pass" : res.alts[gi] ? "alt" : null;
        }
        if (res.jumps[gi]) stats.jumps++; else if (res.moves[gi]) stats.passes++;
        if (res.alts[gi]) stats.alternations++;
      });
      stats.stretches += res.stretches;
      totalMoves += res.changes;
    }
    song.handMoves = totalMoves;
    song.fingerStats = stats;
    return song;
  }

  /**
   * Every variant for this hand, measured on the piece without touching it.
   * @returns {Array<{ strategy, jumps, passes, alternations, stretches, wideChords, suggested }>}
   */
  function variants(song, size, opts) {
    opts = opts || {};
    const out = [];
    const suggested = suggestedStrategy(size);
    for (const name of Object.keys(STRATEGIES)) {
      const copy = { notes: song.notes.map((n) => ({ id: n.id, midi: n.midi, startSec: n.startSec, durSec: n.durSec, staff: n.staff, backing: n.backing, unreachable: n.unreachable })) };
      annotate(copy, size, { pins: opts.pins, strategy: name });
      out.push(Object.assign({}, copy.fingerStats, { suggested: name === suggested }));
    }
    return out;
  }

  const api = { annotate, variants, STRATEGIES, suggestedStrategy, scaleOf, handReach, AVERAGE_REACH, HAND_REACH, fingerHand, isThumbPass, fingerMonophonic, fingerMonophonicWindowed, fingerChord, transitionCost, samePosition, SPAN };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.fingering = api; }
})(typeof window !== "undefined" ? window : globalThis);
