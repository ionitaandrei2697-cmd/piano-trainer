# Piano Trainer — audit

Method: full read of all ~5,000 lines, then two test rigs to check the reading
rather than trust it — a Node harness for the pure modules, and a headless
Chrome rig that boots the real app, drives the real DOM, and measures real audio
output. Every finding below was reproduced before it was fixed. Both rigs ship
in `tests/` so you can re-run them.

Severity key: **S1** silently corrupts saved data · **S2** breaks a documented
feature · **S3** wrong output you can hear or see · **S4** robustness / speed.

---

## Findings

| # | Sev | Finding | How it was reproduced |
|---|-----|---------|-----------------------|
| 1 | S1 | Fingering overrides keyed on `note.id`, which no module assigned. The key became the string `"undefined"`, so `applyFingerOverrides()` matched **every** note on the next load — one edit repainted the whole piece. | Node: parsed notes have `id === undefined`. Browser: IndexedDB `fingerings` store held a single key `"undefined"`. |
| 2 | S2 | `nearestNoteOfPitch` was never defined (app.js:299) — `ReferenceError` on every note-on while fingering-edit was on, which also aborted the `practice.noteOn()` call later in the same handler, so scoring stopped too. | Live `PAGEERROR` in the browser rig. |
| 3 | S2 | `setFinger` ignored the falling note the user clicked and re-searched by pitch from the playhead — contradicting the README's "click the falling note you mean". | Code path; the clicked-note reference was stored and never read. |
| 4 | S3 | MIDI hand mapping `staff = min(trackIndex, 1)`: a single-track (format 0) file put every note in the right hand, so Left-hand practice had nothing to play; 3+ note tracks collapsed into "left hand"; and track order decided the hand even when the bass track came first. | `@tonejs/midi` round-trips of a 1-track, a 3-track and a bass-first 2-track file. |
| 5 | S3 | Notes sitting exactly on a Wait-mode gate were scheduled **twice** — the look-ahead cap included the gate itself, then the resume re-queued them. | Node transport sim with a fake clock: note 62 scheduled at `0.500` **and** `0.505`. |
| 6 | S3 | Same off-by-one at a loop end: the note on B sounded at every wrap although it is outside the loop body. | Same sim. |
| 7 | S3 | Pause / seek / loop-wrap never cancelled the ~120 ms of already-queued notes. `PolySynth.releaseAll()` only releases voices that are *already sounding*. | **Measured with a live `AnalyserNode`:** a note scheduled 300 ms out peaked at **0.7818 both with and without** the `releaseAll()` call. |
| 8 | S2 | The Drill suggestion counted every Wait-mode gate as a miss (the match set it inspected is only populated in Follow mode), so it proposed drilling the entire piece after a clean Wait run. | Node: clean wait run → all gates unmatched. |
| 9 | S2 | Pieces with no `<work-title>` were saved under OSMD's placeholder `"Untitled Score"` — the guard only rejected the exact string `"Untitled"`. | Found by the test rig: the C-major-scale sample appeared in Saved pieces as "Untitled Score". |
| 10 | S3 | Press one on-screen key, release over another → note-off went to the second key; the first stayed lit and sounding. | Browser rig, synthetic pointer events. |
| 11 | S3 | Nothing sounded before the first Play: `ensureStarted()` only ran from `doPlay()`. | Code path; audio engine returns early when `!_started`. |
| 12 | S3 | `Ctrl+S`, `Cmd+A` etc. triggered computer-keyboard notes. | Browser rig. |
| 13 | S2 | Best score only saved on a full playthrough — Stop, Pause or a mode change discarded the run. | Code path. |
| 14 | S3 | Metronome accents counted from beat zero, so a pickup measure shifted every downbeat accent. | Code path. |
| 15 | S4 | Sheet cursor could dereference a null `currentTimeStamp` at the end of a score. | Code path (`ts()` unguarded in the backward loop). |
| 16 | S4 | Saved MIDI device preference was written to the `<select>` but `midi.setActive()` was never called. | Code path. |
| 17 | S4 | MIDI export wrote meta text with `charCodeAt`, so any non-ASCII title (an umlaut, a Romanian diacritic) emitted a byte > 255 truncated into garbage. | Code path. |
| 18 | S4 | The falling-notes view scanned every note every frame and did a linear key lookup per note; the sounding-note scan restarted at note 0 each frame. | **Measured on a 12,000-note piece:** 1.77 → 0.90 ms/frame at the start, 1.00 → 0.38 ms in the middle. |

All eighteen are fixed. Twenty-two automated checks cover them; `node tests/regress.js` runs the lot.

---

## Deliberately not fixed

- **Repeats, voltas and multi-movement jumps** — the sheet cursor still assumes
  a linear pass. Following them properly means modelling the score's jump graph
  and reconciling it with a linear audio timeline; that is a feature, not a bug
  fix, and the falling-notes view and audio are unaffected either way.
- **Mid-piece time-signature changes** — the metronome and the beat grid use the
  meter the piece starts in. The parser reads only the first measure's
  signature. Fixing it is a contained change (a meter map alongside the tempo
  map) but it touches the count-in, the accent logic and the bar map together,
  so it wants its own pass.
- **MIDI tempo changes and the bar map** — playback honours them; the derived
  bar map for imported MIDI uses the header tempo, so bar numbers can drift on a
  file with heavy tempo automation. Notation pieces use the score's real measure
  table and are exact.
- **Quantization of rubato, triplets and swing** in the MIDI→notation converter.
  This is the honest limit of every non-ML converter and is already documented.
- **Two voices per staff** in that converter — overlapping notes in one hand are
  still clipped to the next onset to keep the MusicXML valid.

---

## Trade-offs worth knowing about

**Replacing `Tone.PolySynth` with raw Web Audio voices for scheduled notes.**
The alternative was to keep Tone and accept the ghost notes, or to shrink the
look-ahead (which doesn't fix it, only shortens it). Measurement decided it:
`releaseAll()` demonstrably cannot cancel a queued note. The cost is that the
default sound path is now hand-rolled — the waveform (triangle) and envelope
(A .004 / D .45 / S .18 / R .9) are copied exactly from the previous PolySynth
configuration, so it should sound identical, but it is new code in the most
audible place in the app. It also removes the 48-voice polyphony ceiling, and
voice-stealing kicks in at 64. Tone is still used for the AudioContext and the
gesture unlock.

**Timing reported as mean ± spread rather than a single "timing score".**
A single number would be tidier and would hide the distinction that makes it
useful. Consistently 120 ms early is a tempo problem; ±120 ms scatter around
zero is a steadiness problem; they score identically on accuracy and need
different practice. Verified with two synthetic runs that produce identical
accuracy and clearly different timing readouts.

**`.mxl` via `DecompressionStream` rather than a bundled inflate library.**
Zero bytes added, but it needs Chrome/Edge 80+, Safari 16.4+ or Firefox 113+.
Older browsers get a clear message pointing at uncompressed export rather than
a silent failure. Bundling something like fflate would widen support at the cost
of a dependency; given the app already requires Chrome/Edge for MIDI input, the
platform API was the better trade.

**The practice log stores a row per run.** It only counts time with the
transport actually running, so leaving the tab open doesn't inflate it, and runs
under 20 seconds are discarded. It is local-only (IndexedDB), like everything
else here.

---

## Visual overhaul — what was verified

Screenshots are not a proof, so the design was checked the same way the bugs
were. `tests/designqa.js` and `tests/fit.js` re-run all of it.

| Check | Result |
|---|---|
| Contrast, every text style | all pass WCAG AA; the smallest uppercase labels went from **3.7:1 to 5.0:1** (`--fg-faint` was too dark) |
| Hand colours on the instrument well | gold **9.95:1**, lapis **6.98:1**, ivory hit line **16.6:1** |
| Score ink on the page | **14.3:1** |
| Falling notes / keyboard seam | **0px** — one object, measured from the two elements' rectangles |
| Canvas palette | sampled from the rendered pixels: warm and cool families both present, ivory "now" line present |
| Three views + transport above the fold | fits at 1440x900, 1280x800, 1200x900, 1512x982, 1024x768, 390x844 |
| Toolbar height | 433px -> **80px** at 390px wide, 199px -> **80px** at 1024px, with nothing hidden |
| Horizontal overflow | 0px at every width tested |
| Web fonts unavailable | verified to fall back to the system serif/sans/mono cleanly |
| Regression suite | 22/22 still passing after the overhaul |

Two problems the measurements caught that eyeballing would probably have
missed: the micro-labels failing contrast, and — more seriously — the fact that
at a 900px-tall window the keyboard sat **320px below the fold**, so the app's
whole premise (following the music three ways *at once*) did not actually hold
on a laptop. That is why the workspace now flexes to the window instead of each
panel having a fixed `vh` height.

### Honest caveats

- **The fonts need the network on first load.** Newsreader and IBM Plex are
  loaded from Google Fonts and cached by the service worker's runtime cache
  afterwards; they are not vendored, because they cannot be fetched from this
  build environment. The fallback stack was tested and degrades cleanly, but the
  typographic character does depend on that first fetch.
- **I could not view the rendered screenshots in this session**, so the design
  was validated by measurement — computed styles, contrast maths, element
  rectangles, and sampling the actual rendered pixels by region — rather than by
  eye. Composition was confirmed that way (ivory page, `#080c14` instrument
  well, ivory keys, zero seam), but if something looks off to you, that is the
  gap: taste is the one thing I checked indirectly.

---

## Follow-up round

Three issues reported after the overhaul. All three were reproduced and
measured before being changed.

**19. The sheet cursor was mis-calibrated** (pre-existing, present in the
original build). Reported as "begins somewhat to the right of the first note,
and at the end of the row it gets out of the notes space" — which is the
signature of a *scale* error rather than an offset, and that is exactly what it
was. OSMD lays the score out to `container.clientWidth`, and `clientWidth`
includes padding: 36px of side padding on the engraving container made OSMD
engrave 1290px of music into a 1218px content box, after which
`svg { max-width: 100% }` scaled the SVG by 0.9442. The cursor is an
absolutely-positioned `<img>` *outside* the SVG, so it kept unscaled
coordinates.

| position in a system | notehead, displayed | cursor | error |
|---|---|---|---|
| first note | 195px | 207px | **+11.5px** |
| middle | 661px | 700px | +39px |
| end of the row | 1180px | 1250px | **+70px** |

Fixed by moving the side inset off the engraving container and letting the
score scroll rather than be scaled, so the two coordinate spaces can never
disagree. A `ResizeObserver` re-engraves and re-places the cursor when the panel
changes width, since the flexed layout can now resize it without a window
resize. Worst misalignment, sampled across a piece:

| zoom | before | after |
|---|---|---|
| 70% | 51.9px | **2.4px** |
| 100% | 58.9px | **3.5px** |
| 200% | 52.7px | **7.0px** |

The cursor bar is 21px wide, so anything under ~10px still covers the notehead.

**20. The left-hand staff was cut off.** A grand-staff system measures 159-174px
in these samples, but the score panel bottomed out at 150px with 44px of its own
padding — about 106px of visible music, enough for the treble stave and nothing
else. Two changes: the panel now takes the larger share of the stage
(`flex: 7` against the instrument's `5`, minimum 222px), and OSMD's page margins
— 5 units (50px) on every side by default, sized for a printed page and for a
title the app no longer engraves there — were cut to 1.0-1.5. Verified at four
window sizes: a complete grand staff is now **100% visible** at all of them,
where before it was 57-94% at three of the four. The 60px this cost the falling
notes was taken back from the toolbar instead, by widening the compact
single-row breakpoint to 1320px.

**21. Note names moved from the falling notes to the keys.** They are gone from
the roll entirely rather than duplicated: a falling block already states its
pitch by the lane it occupies, the letter only fitted on notes longer than about
a quarter (so the labelling was inconsistent), and it competed with the
fingering number for the same block. Verified: with the toggle on, 52 labels
appear on the keys and the falling-notes canvas is byte-identical to the
toggle-off state.
