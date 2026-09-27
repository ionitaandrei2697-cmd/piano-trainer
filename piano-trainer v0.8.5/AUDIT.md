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

---

## Round 3 — the import error, fingering for your hand, the interface

Reported: *"Error: given music sheet was incomplete or could not be loaded"*,
often. That sentence is the notation library's (OSMD's) catch-all: it appears
whenever its MusicXML reader throws, for any reason. So the method was to find
every reason, not one:

1. **Real scores from three corpora** through the app's own file input — OSMD's
   test data (336 files), MuseScore's MusicXML import/export tests (447) and a
   music21 subset (232: Bach, Beethoven, Mozart, Joplin, Schumann…).
2. **Mutations**: 160 kinds of damage a hand-edited, converted or OCR'd score
   carries (bad part lists, misplaced chord marks, invalid pitches, unended
   lines, odd time signatures…), each applied to four scores — 647 files with
   the encoding variants.
3. **The app's own converter**: 1,600 random MIDI-like pieces and 60 random MIDI
   files (tempo and meter changes, overlaps, 1-1,500 notes) through *Convert to
   sheet music*, at every grid.

The converter never failed. The failures all came from the score files:

| # | Sev | Finding | How it was reproduced |
|---|-----|---------|-----------------------|
| 22 | S2 | **The reported error.** OSMD throws "incomplete" when a `<part>` has no `<score-part>` in the part list, when the ids disagree, when the part list is empty, or when a part has no bars — what a score with a deleted/hidden instrument, or a converted/hand-edited file, contains. | Mutations: all four scores, every one of these four faults → exactly this message. |
| 23 | S2 | **UTF-16 scores could not be read.** Finale and older exporters write UTF-16; the app decoded everything as UTF-8. In `.mxl` form the app said *"doesn't contain a MusicXML score"*, as `.xml` OSMD said *"the document which was provided is invalid"*. | 42 of 232 music21 scores (18%); 5 of 447 MuseScore test files; 1 OSMD test file. |
| 24 | S1 | **Silent loss of most of a score.** OSMD reads bars only while *every* part still has one, so a part shorter than the others ended the piece there — no error, just fewer notes (Ode to Joy with a one-bar extra part: 46 notes → 6). | Mutation, verified by note count. |
| 25 | S3 | Crashes on content: `<chord/>` on a rest or on the first note after `<backup>` (`getHalfTone`), a step that is not A-G such as German "H" (`toLowerCase`), a time signature like "a/b" (VexFlow *Invalid time spec NaN/NaN*), an 8va that never ends (OSMD 1.9.9, `realValue`), `<divisions>` of 0, a note lasting 0, a part with no clef or divisions before its first note (`parent`). | Mutations; 2 MuseScore and 1 OSMD test file. |
| 26 | S2 | Files were read by their extension: a zipped score saved as `.xml` (OSMD: *Invalid MXL file*), a MIDI file named `.musicxml`, a web page saved as `.xml` (a failed download) all ended in an engine error. | Built files. |
| 27 | S2 | `score-timewise` (valid MusicXML) was rejected. | Built from a partwise score. |
| 28 | S3 | **Multi-part scores gave the wrong hands.** Staff 0 was "the right hand" and every other staff "the left": in a song for voice and piano the vocal line became the right hand and *both* piano staves the left, so Wait mode demanded the melody and the whole accompaniment at once. A piano written as two one-staff parts ("Piano (right)" / "Piano (left)", the Clementi test file) had to keep both. | Built voice+piano score; Clementi from the OSMD corpus. |
| 29 | S3 | Grace notes were filed at their main note's onset and became chord notes: Wait mode required the ornament and the note *together*. | Built score. |
| 30 | S3 | **Hand size had no control in the page** (the README said to set it "in the profile"), and the model it drove was wrong: every span of Parncutt's table was multiplied by the size factor, so for a small hand fingers 3-4 on a whole step — a plain five-finger position — counted as a stretch, and simple melodies broke into jumps. | Method-book agreement for a hand that reaches an octave: **61.6%** (average hand 97.4%). |
| 31 | S4 | Opening the same MusicXML file again created a new saved piece (id from the clock): duplicates in *Saved pieces*, and its fingering edits and best score were not found. | Code path; MIDI already used a content hash. |
| 32 | S3 | `sheet-view` re-drew the cursor through `this.cursor`, which never existed: after a panel re-flow the cursor stayed at its old pixel position until playback next moved it. | Code path. |
| 33 | S3 | A quick first tap before the audio had started: its release was handled before the note began, so the note then rang forever. | Code path (`ensureStarted().then(noteOn)` without a still-held check). |
| 34 | S4 | The **C** shortcut cleared the repeat without resetting its pass counter. | Code path. |
| 35 | S4 | The test suite ran only on its author's machine: 49 files hard-coded `/home/claude/…` and one Chrome binary; `round8.js` passed `?debug` to a harness that ignored it (it failed on the original build too); two `probe.js` checks still asserted behaviour the README had since changed on purpose. | Ran the suite here. |
| 36 | S4 | A score with no playable notes was announced as "0 notes · C-1–C-1". | MuseScore test file. |

**Fixes.** A new module, `src/score-import.js`, sits between the file and the
notation engine: it decodes by byte-order mark, byte pattern and XML
declaration (Windows-1252 for legacy 8-bit files); recognises zip, MIDI and RMI
by their bytes; repairs the XML syntax faults a browser rejects; converts
score-timewise; and makes the part list and the parts agree, pads short parts,
supplies a missing clef or divisions, and repairs each crash above in place.
What it changed is listed in the load message (and in *Settings → This piece*).
If the engine still refuses a score, a simplified copy (notes, rests and
structure only) is tried, and after that an independent reader opens the piece
**as notes only** — falling notes, keyboard, scoring and every mode work, and
*Make a simple score* re-engraves it — so a score is never simply refused.
OSMD was updated from 1.9.9 to 2.1.3 (it no longer crashes on an unended 8va,
and loads the test scores 1.6-2.7x faster in this app: Clementi op. 36/3
1.3-1.5 s → 0.5-0.6 s).

| Corpus | before | after |
|---|---|---|
| OSMD test data (336) | 334 | **336** |
| MuseScore MusicXML tests (447) | 439 | **447** |
| music21 subset (232) | 188 | **232** |
| damaged / re-encoded files (647) | — | **645 with notation**; the MIDI file named `.musicxml` opens as MIDI; the web page gets a clear message |

Of the 1,015 real scores, 999 open untouched and 16 with a repair — among them
five Beethoven string quartets (UTF-16) that the renderer only draws in their
simplified form. `tests/scoreimport.js` rebuilds 31 of the damaged cases from
the bundled samples; the old build fails it. (One case, notes with a duration
of 0, crashes OSMD 2.1.3 where 1.9.9 drew it; normalize() now derives the
duration from the written note value.)

**Fingering (30).** Hand size now scales only the stretch *beyond* a
five-finger position (the keys are the same width for every hand). The hand is
described as the widest thumb-to-little-finger interval, or a hand span in cm.
Four styles are searched exactly and compared on the open piece — *Balanced*,
*Stay in position* (stretch rather than move), *Relaxed hand* (never stretch),
*Legato* (pass rather than lift) — with their shifts, passes and stretches;
fast repeated notes change finger (3-2-1); chords wider than the hand are
marked with an arpeggio sign. Method-book agreement for a hand that reaches an
octave: 61.6% → **95.7%**; the average hand is unchanged (96.1% / 100%, the
exact minimum of hand moves on all 13 melodies). `tests/fingervariants.js`.

### Honest caveats

- I could not see the files that produced the reported error, so which of
  the causes in 22-27 was "often" for this user is inference. Every cause found
  is fixed, and the fallback means an unknown one still opens the piece.
- The cm → interval conversion (a white key is 2.35 cm, ~2 cm lost to the
  fingertips) is a **rule of thumb**, not a measurement; the interval played at
  the keyboard is the better input, and the page says so.
- The repeated-note thresholds (one finger up to ~5 strokes a second, finger
  changes from ~8) and the style suggested for a hand size are **rules of
  thumb**; they choose between fingerings that are all valid, and can be
  overridden per piece.
- `round6.js` (dropdown option colours) fails on the original build as well;
  `scorecheck.js` now counts the faded top of the next system as part of the
  first at 1280x800 — the grand staff itself is fully visible (screenshot
  checked).

---

## Round 4 — reported on a real piece

A two-track pop arrangement (1,534 notes, 120 BPM), converted to sheet music.
Four reports, each reproduced on the file before changing anything:

| # | Sev | Finding | How it was reproduced |
|---|-----|---------|-----------------------|
| 37 | S3 | **One key, different fingers in one line.** Bar 29, E E E-E E E-E A E (eighths with pairs of sixteenths): 3 3 3 **2** 3 3 **2** 5 2. The round-3 rule for fast repeated notes judged each repetition by its own interval, and 0.125 s (sixteenths at 120 BPM) is fast, 0.25 s is not — so only the pairs alternated. | Fingers dumped for bars 29-32 of the file: 9 repeated E's changed finger (29 in the piece), each one struck 0.125 s after the note before it — the notes after a sixteenth. |
| 38 | S2 | **White page after Convert to sheet music** until reload. Introduced in round 3: the import ladder showed the score panel only after the engine had drawn it, and a MIDI file hides that panel, so the score was laid out 0 px wide. The resize observer ignored 0 px, so showing the panel again at the same width did not count as a change. | SVG width after Convert: **0 px** (height 19,197 px). |
| 39 | S3 | **Missing finger numbers.** Every note had a finger; the disc was drawn only when a full-size one fitted the note (height >= 24 px, lane >= 12 px). | 44 of 1,534 notes at 1440 px, 231 at 1024 px (201 of them on black-key lanes). |
| 40 | S4 | The two hand-move marks (two bars, an arc) had no legend on screen, only a tooltip in Settings. | Reported. |

**Fixes.** (37) A repeated key changes finger only inside a *run* — at least four
strokes, each within 0.14 s — and then in the pianist's cycle (towards the
thumb, starting again on 3 or 4: 4-3-2-1, 3-2-1-3-2-1); anything shorter keeps
one finger. Bar 29 is now 2 2 2 2 2 2 2 5 2; four fast repeats then F G give
4-3-2-1 2-3. The thresholds are **rules of thumb** (a finger re-strikes
comfortably for a few strokes at 6-7 a second; it is a sustained run past that
which wants the fingers to take turns). (38) The panel is shown before the
engine draws; a score loaded into a hidden panel is drawn when the panel shows
(`sheet.pendingRender`). (39) Short notes get a smaller disc (radius >= 5.5 px),
narrow lanes a disc that overhangs the lane. (40) A legend in the corner of the
falling notes, listing only the marks the piece has.

Verified by `tests/round10.js` (7 checks; the previous commit fails 4 of them)
and `tests/fingervariants.js` (19; bar 29 and the 4-3-2-1 run are in it). The
average-hand results are unchanged: 96.1% / 100% method-book agreement, the
exact minimum of hand moves on all 13 melodies.

## Round 5 — fingering reported on *Für Elise*

A player with an average hand marked four places in the opening (bars 1-8) where
the suggested fingering was harder than necessary, and gave the easier one.
Each was reproduced on the MIDI file before changing anything; the causes are
general, so each fix is a rule, not a patch for the piece.

| # | Sev | Finding | How it was reproduced |
|---|-----|---------|-----------------------|
| 41 | S3 | **E D# E D# E B D C A came out 5 4 5 4 5 1 3 2, then a jump for A** (the thumb on B4). The position model said a finger plays one key per position, so finger 4 on D#5 and then on D5 counted as a move; avoiding it put the thumb on B. | Fingers dumped for bars 1-3 and 6-7 (the same figure: 5 4 5 4 5 2 3, jump, 5 4). |
| 42 | S3 | **C4 E4 A4 B4 as 1 2, a jump, 3 4** (bar 7) instead of 1 2 4 5. Every jump cost the same, so a jump in mid-figure was as cheap as one in the rest before it. | Bar 7: the jump on A4, 0.2 s after E4, legato; the rest before C4 unused. |
| 43 | S3 | **E4 G#4 B4 C5 as 2 1 4 5** — the thumb passing onto G#4, cheaper (one pass) than re-placing the hand in the rest before E4 (a jump, two). | Bar 4 and its 7 repeats: 8 thumbs on G#4 in the piece. |
| 44 | S4 | The load message named the tracks "Piano□, Piano□": the file's track names end in a NUL byte, shown as a box. | Track names read from the file: `"Piano\u0000"`. Fixed in `src/parser.js` (control characters dropped from MIDI names); `tests/probe.js` fails on the previous commit. |

**Fixes** (`src/fingering.js`). (41) A finger may slide a semitone between a
black key and the white key beside it, without a change of position, if it
did not play the note just before; it costs a little comfort (0.8). Not
between two white keys: that is a whole key width, and allowing it made the
method-book set worse (Happy Birthday gained a move; small-hand stretches
appeared). (42) A jump during a rest (a gap over 0.12 s) counts as one move,
like a pass; between connected notes it still counts two. (43) is fixed by
either (41) or (42) alone. Also: a thumb pass that lands the thumb on a black
key now counts two, like a jump — no effect on these bars, but it makes F major
the textbook 1234-1234.

**Which rule does what** (each switched off in turn, bars 1-8): without the
slide, bars 1-3 return to 5 1 3 2 + jump and bar 6 gets a jump on B; without
the rest rule, bar 3 becomes 2, jump, 1 (pass), 3 4; without the black-key pass
rule, nothing changes here, and the tuning set falls back to 96.1%.

**Results.** Bars 1-8 are now 5 4 5 4 5 2 4 3 1 | 1 2 4 5 | 1 2 4 5 |
1 5 4 5 4 5 2 4 3 1 | 1 2 4 5 | 1 5 4 3, the hand moving only in the rests and
on the octave E4-E5; the same a fourth, a fifth and an octave lower. Whole
piece, right hand: jumps between connected notes 69 → 45, thumb on a black key
in a line 9 → 2, the same finger on two different keys in a row between
connected notes 8 → 0. Method-book agreement 96.1% → **99.3%** (tuning set:
F major is now 1-2-3-4-1-2-3-4, the black-key pass rule) and 100% held-out; average hand in
`fingervariants.js` 97.4% → 99.6%, small hand unchanged at 95.7%; the exact
minimum of hand moves still holds on all 13 melodies. `tests/fingervariants.js`
gained 5 checks (bars 1-9 with the file's timing, three transpositions); the
previous commit fails all 5.

### Honest caveats

- **Not fixed: the fast chromatic run in bar 104** still puts the thumb on
  A#6 and F#6 (2 1 4 3 2 1 on B6 A#6 A6 G#6 G6 F#6). A thumb-on-white
  fingering needs more crossings, and every crossing counts one move however
  small. Four general fixes were tried and measured: counting a thumb step
  onto a black key as a move (bar 104 fixed; two jumps between fast connected
  notes appeared instead); letting the thumb shift a step under the hand
  (fixed; broke *Frère Jacques* — 2 3 4 2 for C D E C — and bars 18 and 48);
  cheaper crossings between neighbouring keys (fixed; broke bar 8, one of the
  reported bars); a surcharge on fast jumps (double thumb-unders in the bar
  103 arpeggio). None shipped.
- The four reports are one player's hand. The rules they led to are checked on
  the method-book set, the 13 melodies and three transpositions, not on other
  players.
- 0.8 for a slide and "a jump in a rest counts one" are **modelling choices**
  set from these examples and the benchmark, not measurements.

## Round 6 — the left hand cutting into the right hand's line

Reported with a screenshot of *Für Elise*, the E-D# passage before the theme
returns (bars 107-113 of the converted score): *"I don't understand the left
hand coming in here."*

| # | Sev | Finding | How it was reproduced |
|---|-----|---------|-----------------------|
| 45 | S3 | **The left hand plays D#5 E5 in the middle of the right hand's E D# E D#.** The MIDI file puts those notes in the left-hand track; a file's two piano tracks were taken as the hands, as they are. So the left hand reached up among the right hand's keys and back twice a bar while the right hand was free, and the converted score put the notes above the bass staff on ledger lines. | Notes of the file by track: 5 left-hand notes at D#5/E5 in bars 22-24, the same in its three repeats (bars 36-38, 73-75, 117-119). |
| 46 | S4 | **Right hand: E5 with 5, then after a rest the same E5 with 1** (once the passage is one hand's). A move across a rest that is geometrically a thumb crossing (B4 with 2, then E5 with the thumb, a fourth higher) could only be scored as a crossing, which the comfort rules charge heavily; the engine kept 5 and re-placed the hand at the next rest. | Fingering dump of bars 22-23 after the fix for 45. |

**Fixes.** (45) `parser.untangleHands`, run on every MIDI file after the
tracks become hands: at the ends of a run of one hand's onsets between two of
the other hand's, notes in the other hand's register go to it if they
interrupt it — it plays the same key or the one beside it among its two onsets
just before and its two just after — if their own hand's line is more than a
fourth away (its last note before, its next note after), the other hand can
take them (single notes, no two notes closer than 0.1 s, each ending by the
next, nothing held through them) and the other hand plays within 1 s on both
sides. The load message says how many notes moved. Scores are never touched.
(46) Across a rest, a move that is a crossing can also be a lift; the search
takes the cheaper.

**Checked against false positives first.** In real two-staff piano scores the
staves are the hands, so every note the rule would move there is a mistake.
89 piano parts from the corpora of round 3 (31,611 notes; a few pieces are in
two corpora and count twice), each at six tempos (0.5x to 3x): the first
version moved 58 notes at 1x (Bach's C major prelude, where
the left hand holds its second note; Gounod's Ave Maria, the same figure
without ties; arpeggios passed from hand to hand in Schumann and Clara
Schumann; the leap-frogging hands of the Maple Leaf Rag). Each guard above was
added for one of those; the final rule moves **none** of them, and on the
Für Elise file moves the 24 notes of the passage at every tempo from 0.5x to
2.5x. `tests/hands.js` (13 checks) has the passage and the six kinds of
accompaniment, each blocked by the guard it needs.

**Results.** Für Elise bars 22-25: left hand E2 E3 E4 (and E4 once more), the
right hand E5 E5 E5 E6 then D#5 E5 … with 5-4. Everywhere else in the piece
the fingering is the same except one chord (bar 100, left hand, E3+G#3 after a
rest: 5-3 → 2-1). Method-book agreement (99.3% / 100%) and the exact minimum
of hand moves are unchanged.

### Honest caveats

- The corpus check measures false positives only in engraved scores. What the
  rule misses in other MIDI files (true interruptions it leaves alone) is not
  measured: Für Elise is the only real case I have.
- 1 s, 0.1 s, "the same key or the one beside it" and "more than a fourth" are
  **rules of thumb**, set so the corpus stays untouched; they are not
  measurements of how pianists divide a line.
- Not fixed, noted on the way: the converted score spells that D#5 as E♭5
  (the key-centre speller has no rule for a chromatic neighbour that resolves
  up a semitone). The sounding notes and the fingering are unaffected.

