# Piano Trainer — feature & UX audit

What would take this from a good practice tool to one that measurably changes
how fast someone learns a piece. Three axes, as asked: ease of use, learning
efficacy, and enhancements to what exists. Each recommendation states what,
why, what it costs, and what it trades away. Priorities are at the end, along
with a list of things I would deliberately *not* build and what remains
uncertain.

I have tried to separate three kinds of claim throughout: **measured** (from
the test rig), **evidence** (from the motor-learning and music-education
literature, with the caveat that most of it studied simpler skills than
two-hand piano), and **judgement** (design opinion). Rules of thumb are labelled
as such.

---

## Where it stands

The app now does the core job well: three synchronized views of the music,
three practice modes, hands-separate practice with the other hand played for
you, an A–B loop that snaps to the music, a scoring model that separates
*which note* from *when* from *how long*, a log that shows practice spacing,
and an automatic drill that points at where errors cluster. It is offline,
private, and runs from a folder.

Its ceiling, as built, is that it is **reactive**. It measures a run and shows
you the result; it does not yet carry state about *what you have mastered*, and
so it cannot decide what you should practise next. Almost everything in the
"learning efficacy" section is about closing that gap.

---

## 1. Ease of use

### 1.1 Feedback is far from the eyes  — judgement, high value, low cost
During practice the eyes are on the instrument at the bottom; the status line
("Play together: C3 + E3 + G3…", "A touch early.") is at the top. Move
transient feedback into a small heads-up pill over the falling-notes panel
(top-left, fading after a few seconds; persistent while a Wait gate is open).
Keep the masthead status for load/error messages. *Trade-off:* anything drawn
over the notes is clutter; the mitigation is size, opacity and fade, and a
setting to turn it off.

### 1.2 First contact  — judgement, high value, medium cost
Nothing in the interface explains what Listen / Follow / Wait *are* or why you
would use them in that order. A "Start here" card on the empty state that loads
a sample, sets Wait + Right hand, and says one sentence per step ("The keyboard
is waiting for the highlighted key — play it") would remove the biggest
barrier. Not a tour; a first piece. *Trade-off:* cards that never go away are
noise; dismiss permanently after the first completed run.

### 1.3 Latency calibration  — measured need, high value, low cost
Follow mode judges timing against the audio clock. Bluetooth headphones add
100–250 ms of output latency, and USB-MIDI adds a few ms of input latency, so
a player on wireless audio will read as "late" on every note through no fault
of their own — and the timing readout, which is one of the app's best features,
becomes misinformation. Add a calibration step: click for eight beats, the
player taps along, the median offset is stored and subtracted. Thirty lines of
code; it should be offered the first time Follow is used.

### 1.4 The library will outgrow a dropdown  — judgement, medium cost
Saved pieces is a flat list. Past ten pieces it needs a view: name, when last
practised, best accuracy at what tempo, hands mastered. This is also where the
mastery data in §2 would surface. *Trade-off:* a second screen in a
single-screen app; a modal or a collapsible panel keeps it one page.

### 1.5 Small ergonomics, all cheap
- Drag-and-drop a file anywhere on the page.
- Show the shortcut key on each button's tooltip (they are in the dialog only).
- ~~Seven toolbar groups is at the edge of scannable.~~ Done: four groups on
  one row; the rest is in a Settings window.
- `Escape` should stop; `Enter` should restart the current loop.
- ~~The zoom slider could move out of the transport.~~ Done: it lives in
  Settings → Show, under Fit score.

---

## 2. Learning efficacy

The evidence base the app already cites (deliberate practice — Ericsson et al.
1993; error-location predicts retention — Duke, Simmons & Cash 2009; spacing —
Simmons 2012, Cepeda et al. 2006; contextual interference — Shea & Morgan
1979, Carter & Grahn 2016; reduced feedback frequency — Winstein & Schmidt
1990; variability of practice — Schmidt 1975) points in one direction: the
learner should work on *the hardest part, in short sections, with graded
difficulty, spaced over days, with feedback that informs without becoming a
crutch.* The app has the pieces for this but no structure that assembles them.
One caveat governs everything below: Wulf & Shea (2002) showed that principles
from simple laboratory tasks do not always transfer to complex skills, and
two-hand piano is about as complex as motor skills get. Treat the literature
as a strong prior, not a proof.

### 2.1 Sections and a mastery model  — evidence-backed, the biggest win, medium cost
Split each piece into sections automatically (phrase boundaries: rests, 4- or
8-bar groups, double barlines) and let the player adjust them. Record, per
section × hand × tempo, every scored pass. Define *mastered* explicitly —
e.g. ≥95% accuracy at 100% tempo on three passes spread over at least two
days — and show it on the score itself as a heat map on the bars. This is the
single change that converts the app from a scorekeeper into a coach, because
everything that follows (what to practise next, what is due, what to
interleave) reads from this table. *Trade-off:* the mastery definition is a
rule of thumb; expose the thresholds.

### 2.2 "Practise next"  — evidence-backed, high value, low cost once 2.1 exists
A button that picks the weakest section for the current hand and tempo, loops
it, and sets a tempo one step below the last clean pass. That is deliberate
practice operationalised: aim work at the failure point. The Drill feature
does this for one run; this does it across the piece's history.

### 2.3 Spaced review  — evidence-backed, high value, low cost once 2.1 exists
The log knows when each section was last practised and how well. Schedule
reviews with growing intervals as mastery holds (the same logic flashcard
software uses) and show a "due today" list on the empty state. Spacing is the
best-replicated finding in the whole literature, and the app currently only
*displays* spacing; this would *drive* it. *Trade-off:* schedules that nag get
ignored — keep it a suggestion, never a lock.

### 2.4 Guide volume for the practised hand  — evidence-informed, high value, very low cost
Today the practised hand is fully muted: you supply it. A slider from 0 to 100%
lets the app play your hand faintly under you as a scaffold you fade out over
sessions. The guidance hypothesis (Salmoni, Schmidt & Walter 1984) says
guidance that is *withdrawn* helps; guidance that stays creates dependency —
so default it to 0 and make it easy to raise briefly. Ten lines of code in the
note filter.

### 2.5 Summary feedback option  — evidence-backed, low cost
Per-note flashes are concurrent feedback. Winstein & Schmidt (1990) and the
broader "reduced knowledge of results" work found that *less frequent* feedback
during acquisition produces better retention, plausibly because the learner
does their own error detection. Offer "Coach feedback: every note / summary at
the end of each pass". Default beginners to every note, suggest summary once a
section is near mastery. The end-of-pass report already exists.

### 2.6 Interleaving  — evidence-backed, medium cost
The README admits the app cannot interleave. It can: a "Rotate" mode that
cycles through the two or three weakest sections (or pieces) with N passes
each. Contextual interference feels worse during practice and tests better
afterwards; the interface must say so, or users will turn it off because it
feels bad. *Trade-off:* the clarinet study (Carter & Grahn) is the closest
evidence in music; it is one study.

### 2.7 Variable tempo  — evidence-informed, low cost, expert option
Playing a mastered section at randomly varied tempos (±10%) improves transfer
(variability of practice). Cheap to add to the auto-ramp as an option; hide it
behind "advanced coach settings" because it confuses beginners.

### 2.8 Rhythm-only and pitch-only drills  — judgement, low cost
Wait mode isolates pitch. Add a Follow option "any pitch counts" to isolate
rhythm — hit the beat on any key. Beginners' sight-reading fails on rhythm far
more than on pitch, and the app has no way to train it separately.

### 2.9 Reading ahead  — judgement, low cost
Fade the notes just played (the last beat or two) in the falling-notes view and
mask the bar behind the cursor in the score. It forces the eye forward, which
is the skill that separates readers from decoders. Make it a Show toggle.

### 2.10 Record and play back  — judgement, high value, medium cost
Capture the MIDI of each pass. Hearing your own playing back is the oldest
self-assessment tool there is and the app has all the events already. Play it
back through the same engine; export as `.mid`. The falling notes could show
your recording as a ghost against the score's notes.

### 2.11 Hesitation as a signal  — judgement, low cost
In Wait mode, a gate that takes more than ~2 s to clear is a *reading* hazard
(an accidental, a position shift, a hand crossing), not a motor one. Log the
time-to-clear per gate, and feed the slow ones into the drill selector with the
wrong presses and misses. Different cause, different remedy: hesitations want
slow reading, not repetition.

### 2.12 Dynamics  — judgement, medium cost
Velocity arrives from the keyboard and is ignored. Scores carry dynamics
(`p`, `f`, hairpins). Even a crude readout — "you played that *forte*
passage at the same level as the *piano* one" — adds a musical dimension the
app is currently blind to. *Trade-off:* velocity curves differ wildly between
instruments; calibrate per profile.

### 2.13 Sight-reading generator  — judgement, high value, high cost
Random short exercises in a chosen key, range and rhythmic vocabulary. The app
already builds MusicXML (the MIDI converter emits it), so generation is
feasible. This is the feature that makes the app useful *between* pieces.

---

## 3. Enhancements to existing features

### Score
- **Repeats, voltas, D.S. / D.C. al coda.** The cursor assumes a linear pass.
  Real pieces have repeats; this is the most requested fix on the known-limits
  list. Medium-high cost: model the jump graph, expand it to a linear timeline,
  keep the cursor and the falling notes in sync through the jumps.
- **Mid-piece time-signature changes** — the bar map and metronome use the
  opening meter. Medium cost.
- **Editorial fingerings from the file.** MusicXML carries `<fingering>`
  elements and many scores have them; the heuristic currently overrides them.
  Prefer the file's fingering and fall back to the heuristic. Low cost, real
  quality gain.
- **Score-following** of pedal marks and articulation (staccato dots, slurs) in
  the note-length judgement, which currently treats every note as legato.

### Falling notes
- Show the *next* section's fingering earlier; show hand-position blocks
  (where the hand sits) rather than only per-note fingers.
- Draw the player's own recording as a ghost (see 2.10).
- Velocity as brightness.

### Keyboard
- Label the black keys too when note names are on.
- Velocity-sensitive lighting.

### MIDI import
- Use the file's tempo map for the bar grid (it drives playback already).
- When a file has more than two note-bearing tracks, ask which is which
  instead of guessing by pitch.
- Converter: two voices per staff, triplet detection, pickup measures.

### Audio
- Latency calibration (§1.3).
- Velocity → gain, with a per-profile curve.
- A larger sampled piano as an optional download.

### Data
- **Backup and restore.** Everything lives in one browser's IndexedDB. Clearing
  site data, switching browsers or reinstalling loses pieces, fingerings,
  scores and the log. Export/import a single JSON file. Low cost, high
  importance — and a precondition for anyone trusting the mastery data in §2.
- Practice-log export as CSV.
- Self-host the two font families so the typography does not depend on the
  network on first load.

---

## Priorities

If only five things get built, in this order:

1. **Backup/restore** — everything else accumulates data that must not be lost.
2. **Latency calibration** — the timing readout is wrong for every wireless
   listener until this exists.
3. **Sections + mastery model** — the foundation for a coach.
4. **Practise-next + spaced review** — the coach itself, cheap once 3 exists.
5. **Guide volume + summary-feedback option** — two evidence-backed knobs that
   take an afternoon.

Then repeats in the score, recording/playback, and the heads-up feedback pill.

## What I would not do

- **Gamification beyond the current points.** Streaks and badges are shown to
  increase *engagement*, not learning; for a self-directed adult learner they
  add noise to a tool whose value is honest measurement.
- **Accuracy blended into one score.** The three-way split (which note / when /
  how long) is the app's best idea; a single "94/100" would hide exactly the
  distinctions that tell you what to practise.
- **Auto-advancing difficulty without a floor.** The auto-ramp lowers tempo on
  a rough pass; keep that. A system that only ever gets harder trains failure.
- **A cloud account.** The app's privacy and offline properties are features.
  Backup by file preserves them.

## Uncertainties

- The auto-ramp thresholds (95% up, 70% down), the timing windows (±180/350/500
  ms) and the note-length bands (55% / 175%) are rules of thumb I set. They are
  defensible starting points, not tuned values; a mastery model would let them
  be tuned against retention rather than guessed.
- The feedback-frequency and variability findings come mostly from gross motor
  tasks. They probably transfer to piano; they have not been shown to.
- I could not view the rendered interface during this work; every visual claim
  above is measured (contrast ratios, element rectangles, sampled pixels)
  rather than seen. Taste was checked indirectly.
