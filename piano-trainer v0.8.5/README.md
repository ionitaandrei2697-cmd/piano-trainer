# Piano Trainer

A standalone, client-side app for learning piano by playing along. It shows a
piece three synchronized ways at once, plays it back, listens to your MIDI
keyboard, scores how you do, and works offline.

Everything runs in your browser. No build step, no account, nothing leaves your
machine.

---

## How to run

**Double-click `index.html`** and it opens in your browser. Pick a piece from
**Samples** (or press **Learn it** on the start screen) and press **Play** or
the spacebar. Everything works from the folder: playback, the three views,
scoring, the practice modes, fingering, repeats, the typing keyboard.

**A MIDI keyboard usually works from there too.** Press **Connect keyboard** at
the top of the page; the browser asks once whether the page may use MIDI
devices. **Confirmed on a Surface Pro 11 with a USB MIDI keyboard: it works
straight from the folder**, no server needed. (In Chromium-based browsers a page
opened from disk is a *secure context* and gets the same prompt as a web
address.) If some other browser refuses, the app says so and points to the
next option.

**Optionally, double-click `Start Piano Trainer.cmd`** (Windows) — not needed for
MIDI, but it is how the app installs as an app and works fully offline. It serves the app at
`http://127.0.0.1:8765` using the PowerShell that every Windows PC already has —
nothing to install — and opens your browser there. Keep its window open while
you play; close it to stop. Served this way the app also works fully offline
after the first visit, and Edge can install it as an app from its menu.

- Windows may ask for confirmation the first time you run a `.cmd` that came
  from a download. That is normal for a script you didn't write yourself; the
  file is short and readable (`tools/serve.ps1` is the whole server).
- It listens on **this computer only** (127.0.0.1) — nothing on your network
  can reach it. Verified: the port answers on 127.0.0.1 and refuses on the
  machine's network address.
- The address stays the same on purpose. The browser keeps saved pieces,
  fingerings and the practice log **per address**, so the folder and the
  launcher are two separate memories to it. **Settings → Your data → Save a
  backup** in one and **Restore a backup** in the other brings everything
  across.

On macOS or Linux, any static server works (`python3 -m http.server`), with the
same caveat about the address.

> **Browsers.** Edge and Chrome are the simplest. Firefox supports Web MIDI from
> version 108 but asks for extra permission steps; Safari does not support it.

---

## The three views (toggle any of them)

- **Sheet** — real engraved notation (OpenSheetMusicDisplay) with a cursor that
  follows playback. **Fit score** (on by default) picks the zoom at which a
  whole system fits the panel, so both staves of a grand staff are always on
  screen without touching the zoom slider; drag the slider and it becomes manual,
  tick Fit to hand control back. The noteheads themselves become the **record of
  your run**: green when you played them, red when you missed them (Follow) or
  played something else while the app was waiting for them (Wait). The colours
  stay until Stop, so after a pass the score shows you where it went wrong.
- **Falling notes** — Synthesia-style notes descending to a hit line that sits
  directly above the keyboard, each column aligned to its key. Right-hand notes
  are gold, left-hand lapis; fingering numbers ride on the notes. A **beat grid**
  scrolls with them: barlines with bar numbers, plus lighter beat lines inside
  each bar (from the score's real measure map, so tempo changes and odd meters
  stay honest). Wrong notes and missed notes leave a fading mark exactly where
  they happened. Turn the grid off in **Views**.
- **Keyboard** — an on-screen piano. It lights the notes being played in the matching hand colour (right gold,
  left lapis),
  the keys you press (cyan), and — in Wait mode — the notes it's waiting for
  (outlined). Click keys with the mouse to preview, too.

**Falling-notes lead time (a deliberate choice):** notes fall at a *fixed speed
in pixels per second, independent of tempo*. So the visual speed your hands
learn stays constant, and when you slow the piece down to practice, the notes
simply **spread out and give you proportionally more reaction time** instead of
the whole picture slowing down. Adjust the fall speed with the **Note speed**
slider; the lead time is just the view height divided by that speed.

---

## Practice modes

- **Listen** — the app plays the whole piece; no scoring.
- **Follow** — the piece plays at tempo and your hits are scored against the
  nearest note within a timing window. The hand you're practising is **muted in
  the audio** so you supply it; missed notes are counted as they pass.
- **Wait** — the playhead **holds at each note until you play the right key(s)**,
  then continues. Best for learning the notes before worrying about timing. A
  chord has to be **held together**: every note struck since the last one
  cleared and all of them down at once. Pressing C, letting go, then E, then G
  doesn't pass — that trains exactly the wrong movement. The status line says
  what is still missing while you build the chord.
  **Wait has no play bar.** The keys to press light up as soon as the app is
  waiting — when you choose the mode, open a piece, jump somewhere or reach the
  end — and **the first right note starts it**. After the last note your score
  stays on screen, the first key lights up, and playing it starts a fresh run.
  The freed height goes to the score and the falling notes. Tempo is still on
  **[** and **]**; volume and fall speed are in Settings.

The toolbar holds only what you touch while playing: **Mode**, **Hand**,
**Repeat**, **Metronome**, and the tools (Drill, Fingering, Settings).
Everything else lives in **Settings**, one section at a time: **This piece**
(what loading it did, its parts, export, reset fingering), **Hand & fingering**
(your hand, and the fingering styles for this piece), **View** (the panels, and
what to show on them — note names, beat grid, cursor, fit score, **Colour notes
as played**), **Coach** (timing window, note length, auto tempo), **Metronome**,
**Sound & keyboard**, and **Your data**.

**Practice hand** always means *the hand you're working on*. In **Listen** it
solos that hand — only it plays, so you can learn a part by ear. In
**Follow/Wait** the app plays **nothing you are learning** — you make those
sounds — and when you practise one hand, **the other hand is silent too**, so
you hear only what you play. (It used to play the other hand along; and with
both hands selected it played every note while you played them, so each of your
notes sounded twice.) If you want the other hand as accompaniment, **Settings →
Coach → Play the other hand for me**. Backing tracks of a MIDI arrangement keep
playing; set them to *Off* in the piece's track list to silence them. Whenever
one hand is selected, the other hand's falling notes fade back.

**Finger numbers** sit on the falling notes as dark discs with a large digit,
near the note's bottom edge (where it meets the keys), readable on the gold
right-hand notes and the blue left-hand ones alike. A ring around the disc
marks a finger you set yourself.

**Messages take no room.** The status line ("Waiting for C4…", "Hold it…",
what a file load did) is read out to screen readers but not shown in the page;
its latest text appears over the falling notes **while the pointer is over
them**. The explanation of each mode is in its button's tooltip. An error — the
rare message that needs you to act — shows for a few seconds regardless. (On a
touchscreen there is no hover: use the touchpad or a mouse to read them.) The
height this frees, and a larger share of the stage (score 5 : falling notes 6),
goes to the falling notes: at 1440×830 they grew from 124 to 166 px in Follow and
from 146 to 203 px in Wait, while the score still shows a full system.

**Scoring** tracks correct / wrong / missed, accuracy, current and best streak,
and a points tally (with a streak bonus). Your best score per piece is saved.

**Note length is part of being correct.** Pressing the right key at the right
moment is only two thirds of playing a note — how long you *hold* it is the
third. Every matched note is timed from press to release in song seconds (so the
reading does not change with practice tempo) and compared with its written
duration, and by default (**Settings → Coach → Note length: Required**):

- in **Wait**, the playhead does not move on until the chord has been held for
  most of its value (70% of the shortest note, at the current tempo, capped at
  1.2 s so a whole note at a crawl is not a four-second hold). The status says
  *Hold it… 0.7 s*. Let go early and the gate stays shut, the notehead turns
  amber, and that note must be struck again;
- in **Follow**, a clipped or overheld note is still the right note — it keeps
  its streak and points — but it comes off the accuracy and is painted amber.

*Reported only* restores the old contract (measured and shown, never held
against you), and *Ignored* switches it off. Notes written shorter than 0.12 s
are never judged — at speed their release says more about the key's action than
about you.

**Timing** is reported separately from accuracy, because "80% correct" hides
which problem you have. Every matched hit in Follow mode records its signed
offset from the beat, and the score panel shows two numbers: the **average
offset** (ahead of or behind the beat) and the **spread** after it. Landing
120 ms early on nearly every note is a tempo problem — you are playing a
different tempo from the one you set. Averaging zero with a ±120 ms spread is a
steadiness problem. Those want different practice, and they score identically
without this. The **timing window** next to the mode buttons decides how close
a hit has to land to count at all: ±500 ms while you are learning the notes,
±180 ms once you want the rhythm to be real.

---

## MIDI files on a smaller keyboard

A MIDI file you download for a song is usually a whole **arrangement**, written
for no keyboard in particular: piano tracks, but also bass, strings, guitar —
and drums, whose "notes" are drum sounds (MIDI note 36 is a kick drum, not the
C2 it would light up). Opened as-is on a 61-key keyboard like the Casio CT-S1
(C2–C7), that meant drums to "play", a bass line below your lowest key, and in
Wait mode a first note you couldn't press, so nothing ever started. Now:

- **Parts.** Each track is *Practice* (you play it), *Backing* (it plays with
  you, quieter, faint on the falling notes, never asked of you, no fingering) or
  *Off*. By default the piano tracks are Practice, every other instrument is
  Backing, and drums are Off; a file with no piano track practises all its
  pitched tracks. **Settings → This piece** lists the tracks (instrument, number
  of notes, range) and lets you change each one.
- **Fit to my keyboard, moving as little as possible.** When only a few notes
  are outside your keys (up to 15%), just those move in, each by the fewest
  octaves (a bass A1 becomes A2: an octave doubling, not a wrong note), and a
  note that lands on one already sounding is merged — so the rest of the music
  stays exactly where it was written. When many are outside — a file written an
  octave off — the whole part moves by whole octaves instead, which keeps its
  texture intact. Backing keeps its original register. The load message says
  what happened; changing the keyboard size or transpose re-fits the piece.
- **Chords one hand can't hold are shared.** A file split into hands by track
  can give one hand D2 and A4 at once. When a hand's chord is wider than its
  comfortable span (13 semitones for a medium hand), the note nearest the other
  hand moves across if that hand can take it; anything still out of reach is
  played for you.
- **Bars follow the file's time signatures, all of them.** Barlines, bar
  numbers, the metronome, the count-in and Repeat used only the first signature
  for the whole piece; a file that goes 5/8, 4/4, 9/8 … 23/16 now gets each bar
  its own length and beats (and a spoken count ticks past eight rather than
  miscount).
- **Opening the same file again finds the same piece** (its parts, fingering
  edits and best score) instead of adding a duplicate, and the title comes from
  the file name, tidied ("Death_Note_The_World" → "Death Note The World").
- **Nothing is ever asked of a key you don't have.** With fitting switched off
  (Settings → This piece), notes outside your keyboard stay where they were
  written and the app plays them for you. The same holds for MusicXML scores,
  which are never re-written (the score has to match the notation): their
  out-of-range notes play by themselves and the load message suggests Transpose.
- **Saved MIDI pieces reopen.** They used to be listed but impossible to open
  ("re-open it from disk"), because the file itself wasn't kept. It is now,
  with your part choices, and the last piece reopens when you start the app.

Leave the keyboard's own octave shift at 0 while practising here: the app fits
the piece to your keys itself.

## MIDI keyboard

Plug the keyboard in (USB) and press **Connect keyboard** in the top bar. From
then on the chip in the top bar shows the keyboard's name in green, and **the
app reconnects by itself** every time you open it — the browser remembers that
you allowed it, so the prompt appears only once. If you unplug the keyboard the
app says so; plug it back in and it's picked up again, and any key you were
holding is released instead of ringing forever. If connecting fails, the
message says why and what to do (for example, where to re-allow MIDI in the
site settings).

Note-on lights the key, sounds it live and feeds scoring. Velocity-zero
note-ons are treated as note-offs (the form many keyboards send), any MIDI
channel is accepted, and the **sustain pedal** (CC64) holds notes as it does on
the instrument.

**Hands-free.** In **Settings → Device & sound → Hands-free** you can make one
key of your keyboard start and pause the app, and another repeat the current
bar. Pick keys you never play — the top or bottom key is usual — because they
stop making sound. A keyboard with its own **Start / Stop** buttons works with
no setup. Useful when the tablet sits on the music stand out of reach.

**Wireless headphones hear everything late.** Bluetooth audio typically adds a
delay that makes every note you play in time read as *late* in Follow mode.
**Settings → Device & sound → Sound delay → Measure it** plays eight clicks for
you to tap along to, measures the delay, and shifts the falling notes, the
cursor and the scoring to match what you hear. (Tapping tends to run slightly
ahead of a beat, which pulls the figure down a few milliseconds; the slider is
there to trim it.)

**No hardware? Your computer keyboard is laid out like a piano.**

```
      W   E       T   Y   U       O   P            <- the black keys
    A   S   D   F   G   H   J   K   L   ;   '      <- the white keys
    C   D   E   F   G   A   B   C   D   E   F
```

The home row from **A** to **'** is the white keys, and the row above holds the
sharps, each one sitting in the gap between the two whites it divides. **R** and
**I** are deliberately silent: they fall over E–F and B–C, where a piano has no
black key, and that gap is exactly what lets you find your place by touch
instead of hunting for letters. The range is C4–F5, an octave and a fourth, and
**Z** / **X** move it an octave at a time — the stretch you can currently reach
is marked in green under the on-screen keyboard.

Keys are read by **physical position**, not by the character they produce, so
the layout is identical on a Romanian, German or French keyboard, where the `;`
and `'` keys do not type `;` and `'` at all.

---

## Other controls

- **Metronome** — one button in the toolbar (or **M**) turns it on and off;
  what it sounds like is in **Settings → Metronome**:
  - **Sound**: *Classic*, *Wood block*, *Tick*, *Bell*, *Cowbell*, or *Voice
    counts* ("one, two, three…"). Every sound is built on the audio clock and
    stops the instant you pause or seek; downbeats are accented.
  - **Count-in**: *Off*, *Voice counts* or *Clicks* — one bar before the music
    when you press Play, skippable with **Space** or the **Skip** button.
  - **Voice**: English or **Română** ("unu, doi, trei…").
  - **Beats per bar** follows the score's time signature (so the Minuet counts
    in three, and a pickup bar counts "3, 4" rather than "1, 2"). You can force
    2/4, 3/4, 4/4 or 6/8 — useful when a MIDI file's header is simply wrong.
  - **Subdivide** adds softer clicks *between* the beats — in 2 (eighths, and
    the voice says "and" / "și"), 3 (triplets) or 4 (sixteenths). This is a
    different thing from the time signature: the meter says how the beats are
    grouped, a subdivision fills in each beat, which is what makes a dotted
    rhythm or a triplet easy to place. Subdivisions stop exactly at a repeat's
    end and at a Wait gate, never spilling past them.
  - **Hear it** plays one bar with the current settings.

  *Why the voice is recorded, and started early.* The browser's own speech
  (Web Speech) starts with an unpredictable delay of up to hundreds of
  milliseconds — useless for counting in time. The counts are short recordings
  scheduled on the audio clock instead. And a spoken beat is heard at the
  **vowel**, not where the word begins: "three" and "șase" open with a hissing
  consonant, "eight" and "unu" with the vowel itself. Each word's perceptual
  onset was measured (8–120 ms) and the word starts that much early, so every
  count lands on the beat. (Measured on the rendered audio; how natural the
  voices sound is a matter of taste — they are synthesised.)
- **Tempo** — 30 %–150 % of the authored tempo; note durations scale with it.
  Slowing down also stretches the count-in and the falling notes' spacing.
- **Coach** — two practice aids grounded in motor-learning research. *Auto
  tempo ramp*: with a loop set in Follow mode, a pass played at ≥95% accuracy
  raises the tempo 5% (capped at 100%) — difficulty increases only after clean
  executions, the way graded practice is supposed to work. *Drill*: after a
  scored run, if your errors cluster in one passage, a teal **Drill 0:42–0:51**
  button appears; one click loops exactly that passage (deliberate practice —
  aim work at the failure point, not the whole piece). After ten minutes of
  continuous playing the status line suggests a short break once — spacing
  practice out measurably beats massing it.
- **Repeat** — the loop, renamed for what it is for: repeating a passage until
  it is clean. **This bar** (or **B**) repeats whichever bar the playhead is in;
  type a range of bar numbers to repeat more; **Off** (or **C**) stops. The
  repeated stretch is drawn as a band on the position slider and as a tinted
  region with a green margin on the falling notes, so you can see it coming.
  Each pass reports its own result — "Pass 3: 92% · 1 wrong · 0 missed" — and
  with **Auto tempo** on, a clean pass raises the tempo a step.
  Looping in Follow/Wait keeps scoring fair: each pass through the section
  counts as fresh attempts (accuracy is attempts-based).
- **Fingering** — automatic suggestions ride on the falling notes, and in Wait
  mode the suggested finger appears as a badge on each highlighted key. To
  change one: **Fingering**, then click the falling note you mean (or press its
  key), then **1–5** — or **Auto** (**0**) to go back to the suggestion. Choose
  where it applies first: **This note**, or **Every G2 · left hand (7)** — every
  note of that pitch in that hand, throughout the piece, with the count shown
  before you commit. The choice is remembered.

  An edit is not pasted on top: it is **pinned**, and the whole hand is
  re-fingered around it, so the notes before and after fit the new finger (the
  message says how many moved, e.g. "5 neighbouring fingers adjusted to fit").
  Where the hand changes position is marked on the falling notes — **‖** where
  it jumps, a small arc where the thumb passes — so you can see the moves and
  change them if you'd rather move elsewhere. **Your own fingers are
  underlined**, so a saved edit can't be mistaken for a suggestion, and opening
  a piece with edits says how many there are.
  **Settings → This piece → Reset fingering** forgets every edit. See
  *How the automatic fingering works* below for what the suggestions are based
  on and how often you should expect to disagree with them.
- **Keyboard size / transpose** — match your hardware (88/76/61/49/37 keys) and
  shift octaves so big pieces fit a small keyboard.
- **Sound** — pick your instrument. The *synth* is synthesized in code (a
  triangle oscillator with an envelope, built on plain Web Audio — kilobytes,
  hence always offline, and every voice can be un-scheduled precisely, which is
  what keeps a pause or a loop wrap from leaking the notes queued behind it). Every other sound is a
  set of ~88 *recordings* of a real instrument, which is why they have size.
  The **Grand piano is bundled with the app** (≈2 MB) and works fully offline;
  *Bright piano*, *Electric piano*, *Harpsichord*, *Vibraphone* and *Music box*
  download once from the General-MIDI soundfont CDN and then stay cached, so
  switching back is instant. Any load failure falls back to the synth.
- **Saved pieces** — pieces you load (MusicXML and MIDI) are remembered and
  reappear in the dropdown, and the last one reopens automatically next visit.
  Opening the same file again finds the same saved piece, with its fingering
  edits and best score.
- **Note names** — letter+octave labels on the white keys. They belong on the
  keyboard rather than on the falling notes: a falling block already tells you
  its pitch by which lane it is in, the letter only fitted on longer notes (so
  the labelling was inconsistent), and it competed with the fingering number.
  On the keys the letter sits on the thing you actually have to find.
- **Cursor bar** — hide the green bar on the sheet while it keeps following and
  auto-scrolling with playback (Views → Cursor bar).
- **Click-to-seek** — click anywhere on the falling notes to jump there (the hit
  line is "now"; clicking a falling note seeks to it). The **mouse wheel**
  scrubs the timeline pixel-for-pixel, and a **right-click** steps back one
  chord/onset at a time — handy for replaying the notes you just missed.
- **Sustain pedal** — a connected MIDI pedal (CC64) holds your live notes,
  exactly like on the instrument.
- **Shortcuts** — press **?** in the app for the full list, or the **Shortcuts**
  button: Space play/pause (and skip the count-in while it's running) · ←/→ seek 5 s · **,** / **.** step back/forward one
  chord · **M** metronome · **B** loop this bar · **C** clear the loop ·
  **[** / **]** tempo down/up 5% · **Z** / **X** move the typing keyboard an
  octave · 1–5 set a finger in fingering-edit mode, 0 back to automatic. The letter shortcuts moved
  to the bottom row when the home row became the piano.

- **Practice log** — every run is recorded (only time with the transport actually
  running counts). The panel shows minutes per day for the last two weeks, a
  consecutive-day streak, and the accuracy trend for the piece you have open.
  This is the one thing the research below says matters that the app previously
  had no way to support: it can't make you come back tomorrow, but it can make
  the pattern visible.
- **Saved pieces** can be removed with the **Remove** button next to the
  dropdown (it clears the piece's best score and fingering edits too).

Everything (active profile, view toggles, tempo, mode, hand, timing window,
fingering overrides, best scores, practice sessions) persists locally via
IndexedDB.

---

## Loading pieces

- **MusicXML** (`.xml`, `.musicxml`) → full notation + all three views. Files
  are read by what they contain, not by their extension (a zipped score saved
  as `.xml`, a MIDI file called `.musicxml`), in their real encoding (UTF-16
  from Finale and Sibelius, Latin-1 from old exporters), and repaired where the
  notation engine would otherwise refuse them — see *Scores that wouldn't
  open* below. The load message lists anything that was repaired.
- **Scores with several parts** (a song for voice and piano, a band
  arrangement): the piano part is the one you practise — its upper staff the
  right hand, its lower staff the left — and the other parts play along as
  backing. **Settings → This piece** lists the parts, as it does a MIDI file's
  tracks, and lets you change them. Grace notes are heard as ornaments and are
  never required (playing one isn't counted as a wrong note).
- **Compressed MusicXML** (`.mxl`) → the same, unzipped in the browser. This is
  what MuseScore and musescore.com hand you by default, so most scores you
  download open directly now. It uses the platform's own
  `DecompressionStream`, so no library is bundled for it; a browser without that
  API says so and asks for the uncompressed export instead.
- **MIDI** (`.mid`, `.midi`) → falling notes + keyboard + audio + scoring, but no
  sheet (MIDI carries no notation). Hands are worked out from the file: with
  exactly two note-bearing tracks the higher-pitched one becomes the right hand
  (track order isn't reliable), and single-track or many-track files are split
  by a moving pitch break instead.
- Five built-in samples in the **Samples** dropdown: a C-major scale, a
  two-hand demo, and three real public-domain pieces — Beethoven's *Ode to
  Joy*, Petzold's *Minuet in G* (3/4 — the metronome accents in three), and
  *Twinkle, Twinkle*.

---

## Converting between MIDI and sheet music

Both directions are built in:

**MIDI → sheet music.** Load a `.mid` file and click **Convert to sheet music**
(in the notice where the staff would be). The converter is an original
implementation of the classic published pipeline: it estimates the **key**
(Krumhansl–Schmuckler profile correlation), **spells** every pitch on the line
of fifths (a PS13-style sliding-window method, so F♯/G♭ choices follow the
tonal context), **quantizes** to a grid you choose (1/4–1/32), splits **hands**
onto two staves (respecting existing tracks, otherwise by an adaptive pitch
gap), reconstructs **measures** from the file's tempo and time signature, and
emits MusicXML with proper **ties** across barlines and durations decomposed
into honest note values (a 5-sixteenth note becomes quarter⌒16th, never a
mislabeled symbol). The result loads immediately with the moving cursor and is
saved to your pieces.

**Honest quality notes** for the hard direction: this produces a *faithful,
readable first draft*, not an engraved edition. Quantization means rubato,
triplets and swing land on the nearest grid step (a limitation shared by every
non-machine-learning converter — research systems use trained models for
exactly this step). When a note is still sounding as the next one starts in the
same hand, its written length is clipped to the gap so the score stays valid;
chords notate with a shared duration. Refine in MuseScore if you need
engraving-grade output.

**Sheet music → MIDI.** Click **Export MIDI** with any piece loaded. The note
model (exact pitches, onsets, durations, hands) is written as a format-1
Standard MIDI File: a tempo/conductor track plus separate right- and left-hand
tracks, so it re-imports anywhere with hands intact. For multi-tempo scores the
export uses the piece's base tempo with real-time-faithful note placement —
playback timing is exact; DAW barlines may not align in tempo-change sections.

---

## Known limitations

- **Sheet cursor** assumes a linear pass through the score — repeats, voltas and
  multi-movement jumps aren't followed by the cursor yet (the falling-notes view
  and audio are unaffected). Simple practice pieces are fine.
- **MIDI files** have no sheet view (no notation in the format).
- **Fingering** is a suggestion, not an authority. Even two professional
  pianists choose the same finger for only about 60–80% of notes, so edits will
  always be part of it — the aim is to get the standard cases right for *your*
  hand (Settings → Hand & fingering) and make an edit cheap (see *How the
  automatic fingering works*).
- **Realistic piano** and **web fonts** need the network the first time; the core
  app (synth, parsing, all views, scoring) is fully offline.
- **Tempo changes inside a MIDI file** are read for playback but the bar map (and
  so the beat grid and bar numbers) uses the header tempo. Notation pieces use
  the score's real measure table and are exact.
- **Time signature changes mid-piece** aren't followed: the metronome and the
  beat grid use the meter the piece starts in.
- **Wait mode** requires the notes, not the timing — it has nothing to say about
  how evenly you played, by design. Use Follow for that.

---

## File layout

```
piano-trainer/
  index.html              app shell + script load order
  styles.css              theme
  manifest.webmanifest    PWA manifest
  sw.js                   service worker (offline app shell)
  icon.svg                app icon
  lib/                    vendored libraries (MIT/BSD) — see LICENSES.md
  src/
    keys.js               shared keyboard geometry (keyboard ↔ falling notes)
    timing.js             musical-time ↔ seconds (tempo map)
    mxl.js                compressed MusicXML (.mxl) reader
    score-import.js       decode by real encoding, repair, fall back (why scores used to be refused)
    parser.js             note model from OSMD / MIDI
    fingering.js          automatic fingering (editable)
    profiles.js           hardware/keyboard profiles
    storage.js            IndexedDB persistence
    practice-log.js       session history, day totals, streaks
    samples.js            built-in demo scores
    audio-engine.js       synth + sampled backends, live + scheduled notes
    transport.js          master clock, look-ahead scheduler, tempo/loop/wait
    sheet-view.js         OSMD wrapper + cursor sync
    pianoroll-view.js     falling notes (canvas)
    keyboard-view.js      on-screen piano (SVG)
    midi-input.js         Web MIDI input
    practice.js           practice modes, gating, scoring
    app.js                bootstrap + UI wiring
  README.md
  LICENSES.md
  lib/voice-counts.js     spoken metronome counts, English + Romanian (loaded on first use)
  Start Piano Trainer.cmd serve the app on http://127.0.0.1:8765 (Windows, no install)
  tools/serve.ps1         the tiny loopback-only web server it runs
  tests/                  automated checks (see tests/README.md)
```

---

## How the automatic fingering works

**First: as few changes of hand position as possible.** A hand position is
what a teacher means by it: every finger rests on its own key — a key is always
played by the same finger, a finger always plays the same key, the fingers are
in pitch order, and no two are further apart than their *comfortable* span
(Parncutt's table; beyond *relaxed* is a stretch, which costs comfort, but the
hand hasn't moved). There are two ways to leave a position, and they are not
equal:

- a **thumb pass** — the thumb under a finger, or a finger over the thumb,
  between neighbouring notes: the hand glides on without lifting (every scale);
- a **jump** — the hand lifts and lands somewhere else: 5 then 1 on a repeated
  key, the same finger on the next key, a leap to a new position.

The search minimises **2 × jumps + passes exactly** — its state is the hand
position itself — and only then, among the fingerings with that minimum, picks
the most comfortable one by the ergonomic rules below. So a repeated note never
changes finger at ordinary speed (that would be a jump), and a chord shares its
position with the melody around it. The weight 2 was chosen by a sweep: at 1 a
two-octave scale turns into 12345-12345-12345 (two jumps rather than the
textbook's three passes); counting jumps alone turned *Twinkle* into nine thumb
passes to avoid one jump; 2 is the only value that keeps every textbook
fingering with the fewest moves.

**Where a jump goes, when one is unavoidable.** A jump breaks the line, which is
only audible where the line is connected: inside stepwise motion or on a
repeated note it is priced high, across a leap of a fifth or more it is nearly
free, and a rest discounts it like everything else. In *Ode to Joy* the hand
drops for the low G and comes back up across the sixth G3→E4, so the last phrase
starts in the C position — not two notes later, in the middle of the phrase.

**You can see them.** On the falling notes, a small **‖** under a note means the
hand jumps there; a small arc means the thumb passes (Settings → Show → *Hand
moves*).

**Then: comfort** — the model of Parncutt, Sloboda, Clarke, Raekallio & Desain
(1997), with Jacobs' (2001) refinements: for every pair of fingers six limits in
semitones (practical, comfortable, relaxed; minimum and maximum), and rules that
charge for leaving the relaxed range, stretching past the comfortable one, the
weak fourth finger, awkward thumb passes and thumbs on black keys. Extensions,
each for a stated reason: a finger coming back a third higher two notes later
means the whole hand moved; each (note, finger) implies a thumb position, and
moving it costs a little; a thumb pass is a movement of the hand, so the
finger-spread "impossible" limit doesn't apply to it (the two-octave arpeggio);
the rules against 3-then-4 and 3-4-5 exist because those fingers share tendons,
so they fade out between 0.10 s and 0.35 s between notes; across a jump, the
rules that describe fingers reaching key to key without moving the hand don't
apply (a stride bass lands the same finger again, and that is fine).

**How good is it?**

| | hand moves on 13 melodies (exact minimum 25) | textbook, tuning set | textbook, held-out set |
|---|---|---|---|
| before these changes | 35 (optimal on 10) — 2 repeated notes changed finger | 94.1% | 100% |
| now | **25 (optimal on all 13)** — none | **96.1%** | **100%** |
| the version before that | — | 94.8% | 64.6% |

The minimum is computed independently of the search (an exact programme over
all ways to cut a melody into positions), so "optimal" is checked, not assumed.
The search never needed more than 36 states per note; a 3,000-note piece with
chords takes about half a second.

**Still not perfect, and it can't be.** F major in the right hand still puts the
thumb on B♭ (the textbook is 1-2-3-4-1-2-3-4 — one *Every B♭4* edit fixes the
piece), and the left-hand C arpeggio comes out 5-3-2-1, which many teachers
accept for smaller hands. The definitions are modelling choices: "comfortable"
is Parncutt's table for an average adult hand, scaled to yours (see *Your hand*
below), and a thumb pass reaches up to a fifth. And
fingering is personal: two professional pianists choose the same finger for
only 60–80% of notes (Nakamura, Saito & Yoshii 2020). What the engine now
guarantees is narrower and checkable: under the definition above, no fingering
has fewer hand moves than the one it suggests.

### Your hand

**Settings → Hand & fingering** asks the question a teacher asks: *what is the
widest interval you can play, thumb to little finger?* — less than an octave,
an octave, a ninth, between a ninth and a tenth (the average adult hand the
model was built on), a tenth, an eleventh or more. Or type your hand span in
centimetres (thumb tip to little-finger tip, spread flat); it is turned into an
interval by a **rule of thumb** — a white key is 2.35 cm, about 2 cm goes to
the fingertips landing inside the keys — so the interval you actually play is
the better guide.

The size changes the **stretch beyond a five-finger position**, not the
position itself. The keys are the same width for every hand, so every hand
plays C-D-E-F-G (or C-D-E♭-F-G) comfortably; what a larger hand does is reach
further past it. (Scaling the whole table instead — what the engine used to do
— turned a small hand's five-finger position into a "stretch": its method-book
agreement fell to 61.6%. It is 95.7% now, and the average hand is unchanged.)

A chord wider than your hand can stretch gets an **arpeggio sign** — a wavy line
up its left edge on the falling notes: roll it, or take the far note with the
other hand.

### Fingering styles

There is no single right fingering, and much of the choice is about the hand.
The same exact search runs with four definitions of "one hand position", and
**Settings → Hand & fingering** shows each one's cost on the open piece —
*shifts* (the whole hand jumps), *passes* (thumb under, finger over), and
*stretches* (spans past what is comfortable for your hand):

| style | a hand position is… | good for |
|---|---|---|
| **Balanced** | within the comfortable span; fewest moves, then comfort | the method-book choice |
| **Stay in position** | up to the widest practical stretch | a hand that reaches a tenth: fewer shifts |
| **Relaxed hand** | never past a relaxed span | small hands, beginners: no stretching |
| **Legato** | as Balanced, but a jump costs three passes, not two | joined lines: pass rather than lift |

One is suggested for your hand (relaxed up to about an octave, stay-in-position
from a tenth — a rule of thumb); the one you pick is remembered per piece, and
your own finger edits stay pinned in every style.

**Fast repeated notes change finger** — 4-3-2-1 or 3-2-1, towards the thumb,
starting again on 3 or 4 — in a **run**: four or more strokes on one key, each
within 0.14 s of the last (about 7 a second or faster). A burst of two or three
quick notes inside a slower line keeps one finger: that is a wrist's job, and a
finger changing on every other note of a line reads as a mistake. Both numbers
are rules of thumb. A finger change on the same key is technique, not a move of
the hand, so it is never counted as a shift.

## Practice, by the research

Two of the app's features implement findings from the motor-learning and music-
education literature, and the rest of the workflow is compatible with them:

**Drill the rough passage.** After a scored run, the app finds where your
errors clustered and offers a one-click loop of exactly that passage. This is
the practice behavior that separated the best performers in Duke, Simmons &
Cash (2009, *Journal of Research in Music Education*): what predicted retention
was not how much they practiced but that they located errors precisely and
immediately corrected them — the core of deliberate practice (Ericsson, Krampe
& Tesch-Romer 1993).

**Auto tempo.** With the loop running in Follow mode, a clean pass (≥95%)
raises the tempo 5%, a rough one (<70%) lowers it, capped at the authored
tempo. Accuracy first, speed second — and the per-pass summary you see at each
wrap is deliberately *summary* feedback rather than a running commentary, which
the feedback literature associates with better retention than constant
guidance.

**Spacing, made visible.** Distributed practice with sleep between sessions
consolidates motor memory better than the same minutes massed into one sitting
(Simmons 2012, *JRME*; Duke et al. 2009). Software can't make you come back
tomorrow, but it can stop the pattern being invisible: the **Practice log**
records each run and shows minutes per day, a consecutive-day streak, and where
your accuracy on a piece is going. Two short days beat one long one, and the
panel says so when your practice is landing on a single day.

**Timing, separated from accuracy.** Reporting the mean offset and its spread
apart is a measurement choice, not a research finding — but it follows the same
logic as the drill feature: feedback is only useful if it points at the thing to
change, and "% correct" points at neither rushing nor unevenness.

**What the app still can't do for you:** *interleave*. Rotate between two or
three loops or pieces in one sitting instead of hammering one block.
Interleaving feels worse during practice and tests better afterwards — the
contextual-interference effect (Shea & Morgan 1979; in music: Carter & Grahn
2016, *Frontiers in Psychology*). The Saved-pieces dropdown and A–B loops make
rotating easy, but nothing in the app prompts it.

---

## Accessibility & keyboard

On a touchscreen every control grows to at least 44 px (above Microsoft's 40 px
touch guidance for Windows and WCAG 2.5.5's AAA level); with a mouse nothing is
below WCAG 2.2's 24 px minimum.

Every control is reachable and labelled. Tab moves through the controls with a
clear amber focus ring; the practice toggles are real radio/checkbox groups
(arrow keys move within a group). Icon-only transport buttons, every slider,
the falling-notes canvas and the keyboard all carry text labels for screen
readers, and the status line announces changes politely. The transport bar
stays pinned to the bottom of the window, so Play, the position slider and the
tempo are always in reach no matter how long the sheet is. If your system asks
for reduced motion, transitions are switched off.

Shortcuts: **Space** play/pause · **←/→** seek 5 s · **M** metronome · **B**/**C**
loop this bar / clear · **Z**/**X** typing octave · **1–5** set a finger while
fingering-edit is on. Every shortcut is read by physical key position, so they
work the same on any national layout.

---

## The look

The theme is **Urtext**, taken from the object a pianist actually has on the
stand: a scholarly edition. A cloth-bound blue-black board, gilt stamping,
ivory pages.

The app has two natures and the design stops fighting that. Notation is a
**paper** medium; the falling notes and the keyboard are an **instrument**. So
the score sits on ivory and the instrument is lacquered ink, joined by one type
system and one rule about colour.

**Colour means something — it is never decoration.**

| | |
|---|---|
| gold `#e2b15c` | the right hand |
| lapis `#6c9be8` | the left hand |
| jade `#59c2a0` | you — your own presses, and a correct hit |
| "now" | always the *opposite* medium: ivory on the dark instrument, ink on the ivory page |

Everything else — buttons, panels, rules — stays neutral, which is what makes
that hold. The falling notes, the lit keys and the sheet cursor all read from
the same CSS custom properties, so a note can never be painted in one colour
and lit in another.

**Type does three jobs.** *Newsreader* is the display serif; its italic does
what a score's expression marks do, so the status line and the practice-log
notes are set in it. *IBM Plex Sans* runs the interface. *IBM Plex Mono* is
reserved for **measurements** — times, BPM, milliseconds, bar numbers, scores.
Tabular by construction, so nothing jitters while the playhead moves, and a
readout reads as instrument data rather than as prose. All three fall back to
the system stack when there's no network.

**The instrument is one object.** The falling notes and the keyboard used to be
two panels with a gap between them, which quietly broke the thing the view is
for: notes did not land anywhere. They are now a single lacquered panel with a
seam of exactly zero — the notes pass the hit line, darken into a strike zone,
and arrive in the key they belong to.

**The workspace fills the window.** The three views share whatever is left after
the chrome instead of each having a fixed height, so on any normal screen you
never scroll while playing. The score takes the larger share, because it is the
panel that stops being usable first — half a grand staff is worth nothing, and
OSMD's generous page margins (sized for a printed page, and for a title the app
header now carries instead) were reclaimed to help it fit. Measured: at
1440x900, 1280x800, 1200x900, 1512x982, 1024x768 and 390x844, all three views
and the transport are above the fold, and a complete grand staff is 100%
visible. The practice log and the device settings sit deliberately *below* it —
they are things you read between sessions, not while your hands are busy.

Every text style meets WCAG AA contrast (the smallest labels measure 5.0:1, up
from 3.7:1). Below 1150px the toolbar becomes one swipeable row rather than
three stacked ones, which returned about 120px of height to the music without
hiding a single control. Reduced motion is respected, focus is always visible,
and the keyboard shortcuts reach everything.

---

## What changed in this revision

### Reported on a real piece: one key, one finger; a page that stayed white

Tested on a pop arrangement (two tracks, 1,534 notes, 120 BPM):

- **The same key got different fingers in one line** — E E E-E E E-E A E,
  eighths with pairs of sixteenths, came out 3 3 3 2 3 3 2. The rule for fast
  repeated notes judged each repetition on its own speed, so only the pairs of
  sixteenths changed finger. It now looks at **runs**: four or more strokes on
  one key, each within 0.14 s of the last, change finger in the pianist's cycle
  (4-3-2-1, 3-2-1, starting again on 3 or 4); a burst of two or three quick
  notes inside a slower line keeps one finger. That passage is now 2 2 2 2 2 2 2
  5 2. (Both thresholds are rules of thumb; see *Fingering styles*.)
- **After Convert to sheet music the page stayed white** until a reload: the
  score was drawn while its panel was still hidden (the MIDI view hides it), so
  it was laid out 0 px wide. The page is shown first now, and a score opened
  while the Score panel is off is drawn when the panel comes back.
- **Some falling notes had no finger number**: the disc was drawn only on notes
  tall and wide enough for a full-size one — 44 of the 1,534 notes at 1440 px,
  231 at 1024 px (the black-key lanes). Short notes get a smaller disc now, and
  every practised note shows its finger.
- **The marks under the falling notes have a legend** in the corner of the
  panel, for the marks the piece has: two bars **‖** — the whole hand lifts
  and lands in a new position (a jump); an arc **◡** — the thumb passes under,
  or a finger crosses over the thumb, and the hand glides on without lifting;
  a wavy line — a chord wider than your hand.

### Scores that wouldn't open, fingering for your hand, a calmer interface

**"Error: given music sheet was incomplete or could not be loaded."** That is
the notation library's catch-all: it says it whenever its reader fails, for any
reason. So every reason was hunted down — in 1,015 real scores from three
collections, 647 damaged or re-encoded files, and 1,660 pieces through the
app's own MIDI→notation converter (which never failed). What made scores fail:

- **A part list that disagrees with the parts** — a part the list doesn't name,
  mismatched ids, an empty list, a part with no bars. This is the reported
  message, word for word.
- **UTF-16 files** (Finale, Sibelius, older exporters) were decoded as UTF-8:
  18% of one collection's `.mxl` scores could not be opened.
- **Invalid content** that crashed the reader or the renderer: a chord mark on a
  rest, a German "H" for B, a missing octave, a time signature like "a/b", an 8va
  line that never ends.
- **The wrong kind of file** under a score's name: a zipped score saved as
  `.xml`, a MIDI file, a web page saved by a failed download.

Each is now repaired before the engine sees the file, and the load message says
what was changed. A score the engine still refuses is tried again simplified,
and failing that opens **as notes only** — the falling notes, the keyboard,
scoring and every mode work — with a button to *make a simple score* from the
notes. Found on the way: a part **shorter than the others silently cut the
score off** at its end (46 notes became 6), and in a song for **voice and piano
the vocal line was "the right hand"** and both piano staves "the left". Both
fixed; grace notes are now ornaments rather than chord notes. The notation
engine was updated (OSMD 2.1.3): it loads the test scores 1.6–2.7× faster here.
Result: every one of 1,015 real scores opens with notation (was 961).

**Fingering for your hand.** The hand size had no control in the page, and
the model it drove made a small hand's five-finger position a "stretch". Now
you describe your hand (Settings → Hand & fingering), the size scales only the
stretch beyond a five-finger position, four fingering styles are compared on
the piece with what each costs, fast repeated notes change finger, and chords
too wide for your hand are marked. See *Your hand* and *Fingering styles*.

**The interface.** Settings in sections instead of one long column; the start
screen on the page where the score will be, instead of a card above an empty
page; what just happened (a piece loaded, a setting changed, an error) as a
short notice under the toolbar instead of only on hover; no "Piano" label
eating the score's width when there is only one part; a two-row header on a
phone instead of three.

**Also fixed:** the sheet cursor stayed at a stale position after the panel
re-flowed (it was re-drawn through a property that didn't exist); a quick first
tap before the audio had started could leave a note ringing; the same MusicXML
file opened twice made two saved pieces; **C** didn't reset the repeat's pass
count; the test suite ran only on its author's machine (hard-coded paths, one
Chrome binary) — it now runs anywhere (`CHROME_PATH` for your Chromium). Details
and measurements are in `AUDIT.md`, round 3.

### One hand at a time, readable fingers, room for the falling notes

- **Practising one hand, the other hand is silent** in Follow and Wait (it used
  to play along); Settings → Coach → *Play the other hand for me* brings it
  back. Found on the way: with *both* hands selected, Follow and Wait played
  every note while you played it — each of your notes sounded twice. The app
  now never plays the part you are learning.
- **Finger numbers** are large digits on dark discs instead of 10 px text
  printed on the note.
- **Messages no longer cover the falling notes or take a line in the header**:
  they show over the falling notes on hover; the mode explanations live in the
  mode buttons' tooltips; errors still show for a moment. With the header down to
  one row and the stage re-balanced (5 : 6), the falling notes are about a third
  taller, and a full score system still fits at every tested size.

### A real MIDI file: "The World"

Tested on a real downloaded piano arrangement (two tracks, 852 notes, F#1–A5,
18 time-signature changes, on a 61-key keyboard). In the version before these
changes, 38 of its 487 Wait gates needed a key below C2 — the first one on the
**second note of the piece** — its barlines were all laid out in 5/8, and four
of its left-hand chords spanned up to 31 semitones. The first fitting rule
would have moved the whole piece up an octave for the sake of 39 bass notes,
putting its melody around A6. Now: only those 39 notes move (25 of them merge
with the octave above they were doubling), the four chords are shared between
the hands, all 35 bars have their real length and meter, and the whole piece —
all 487 gates, 827 notes — was played through in Wait mode on a simulated
61-key keyboard without a single unreachable key. Found on the way: every
opening of a MIDI file created a new saved piece (ids came from the clock), and
the parser's placeholder title "MIDI file" beat the file's own name. Both fixed.
The regression test (`tests/midireal.js`) uses a synthetic file with the same
structure, not the original.

### MIDI files that fit your keyboard

Downloaded MIDI files are arrangements, and on a 61-key keyboard they could
not be practised: drums were imported as piano notes, every instrument became
part of the left hand, notes below C2 or above C7 were asked of you — in Wait
mode the very first gate of the test arrangement needed E1, so it could never
start — and a saved MIDI piece couldn't be reopened. Now tracks are Practice /
Backing / Off (drums off, other instruments as quiet backing), the practised
part is fitted to your keyboard by whole octaves, no gate ever asks for a key
you don't have, and MIDI pieces are stored and reopen with your choices. See
*MIDI files on a smaller keyboard*. On the test arrangement: unplayable Wait
gates went from 7 of 24 (including the first) to none.

### Fingering: fewest hand moves, exactly

The fingering engine now minimises **changes of hand position** first — exactly,
with the hand position as the search state — and comfort second. A thumb pass
counts as one move, a jump (the hand lifts) as two; jumps are placed where the
line already breaks (a leap, a rest) rather than inside stepwise motion; chords
share the melody's position. On 13 melodies it reaches the exact minimum on
all of them (25 moves, down from 35), no repeated note changes finger any more
(the "D4 with 5, then 1" pattern), and textbook agreement rose to 96.1% on the
tuning set while staying at 100% on the held-out one. Where the hand moves is
marked on the falling notes: **‖** for a jump, an arc for a thumb pass.

Found on the way: a jump-marker colour identical to the right hand's gold (so
it was invisible there), and a three-note rule that compared fingers across a
jump as if the hand hadn't moved — both fixed before release.

**The "D4 with 5, then 1" in *Ode to Joy*.** No version of the engine produces
it on the melody itself (tested in C, G and D major, with and without the
middle section, every hand size, both hands). Of all 265 single edits one can
make to the piece, exactly one reproduced it in the previous engine: the first
D4 of bar 4 ("E. D D") pinned to 5, after which the re-fit put the next D4 on 1
— the old search had no notion of a position change and "repaired" the edit
with a jump on the repeated note. Now none of the 265 edits makes any repeated
note change finger (`tests/editswaps.js`): a jump on a repeated key costs double
a jump on a step, so when an edit forces a move, the move lands elsewhere. And
edits no longer pass for suggestions: **your fingers are underlined** on the
falling notes, and opening a piece says how many of your edits it applies and
where to reset them.

### Fingering, metronome, Wait mode

**Fingering, rewritten and measured.** The automatic fingering is now the
Parncutt/Jacobs ergonomic model with a second-order search and four documented
extensions (see *How the automatic fingering works*). On passages it was never
tuned on it went from 64.6% to 100% of notes matching the textbook fingering.
In *Ode to Joy* the left hand's G2 now gets the fifth finger by itself.

**Fingering edits with a scope.** *This note* or *Every G2 · left hand (7)*,
chosen before you press 1–5, with **Auto (0)** to undo one and **Reset
fingering** to undo all. An edit is pinned and the rest of the hand is
re-fingered around it.

**Metronome: one button, and a real count-in.** The toolbar has a single
Metronome toggle. Settings has the count-in (off / a voice that actually counts
/ clicks), six sounds (classic, wood block, tick, bell, cowbell, voice), the
language of the voice (English / Română), beats per bar (from the score, or
forced) and subdivisions (2, 3, 4). The spoken counts start early by each
word's measured onset so they land on the beat.

**Wait mode without a play bar.** The keys to press light up by themselves, the
first right note starts, the first note after the end starts again, and the
bar's height goes to the score and the falling notes. Volume and fall speed
moved into Settings so they are reachable in every mode.

**Two bugs found on the way:**

- **The score's colours could silently vanish after the window changed size.**
  The notation library ran its own resize handler, re-drawing the score behind
  the app's back, so the colours were painted onto elements no longer on the
  page — on a tablet, rotating or snapping the window could trigger it. The
  library's handler is off; the app's own re-flow (which re-maps the notes and
  re-applies the colours and the cursor) is the only one, and it now also
  re-fits the score when only the panel's *height* changes.
- **Practice time in Wait mode was barely counted**, because time was counted
  only while the playhead moved — and in Wait it mostly stands at a note, which
  is exactly when you are practising. It now counts the time between your key
  presses (a gap over 30 s counts as a break).

**Confirmed:** a USB MIDI keyboard works with the app opened straight from the
folder (tested on a Surface Pro 11), so no server is needed for MIDI.

### Usability audit

Every user-facing function was driven through the real interface by an
automated audit (`tests/audit.js`) — 66 checks, with a simulated USB MIDI
keyboard injected so the MIDI path runs through the app's own code. Everything
below was found by it or by measuring the layout, and re-verified after fixing.

**Bugs fixed**

- **Unplugging the keyboard mid-note left a stuck key**, lit and sounding
  forever, because its note-off can never arrive. Notes held on a keyboard that
  disappears are now released.
- **The keyboard had to be reconnected every session**, from inside Settings.
  It now reconnects by itself whenever the browser already allowed it, and a
  chip in the top bar shows its state and connects it in one tap.
- **MIDI errors were only visible inside the Settings dialog** — invisible
  exactly when you had just pressed Connect in the top bar — and told Windows
  users to run a Python command. They now appear where you are looking, and say
  what to do.
- **Every slider was a 4–8 px target.** The browser hit-tests a slider by its
  box, not by the thumb you see, so a finger had to land within a few pixels.
  They now have a 24 px hit area with a mouse and 44 px on touch; they look the
  same.
- **The played part of the position bar never filled in.** Its rule lost a CSS
  specificity contest to the generic slider rule (in the original build a
  static decorative gradient disguised this). Fixed and pixel-verified.
- **Touch-size slider rules were silently dropped**: a selector list that mixes
  `::-webkit-…` and `::-moz-…` pseudo-elements is discarded whole by a browser
  that doesn't know one of them. Split per vendor.
- **The top bar had grown to two rows**, taking height from the music. Export
  and Remove moved into **Settings → This piece**; **Remove now acts on the open
  piece** (before, you had to re-select a piece in the dropdown to enable it).
- **A finished run leaked into the next one**: pressing Play after the end
  inherited the old run's state (in Follow the first correct note scored as
  wrong). The next Play now starts clean.
- **The last notes of a piece were never counted as missed** in Follow, because
  the playhead stopped before passing their timing window.
- **Updates could be invisible**: the offline cache served its copies first, so
  a changed file was ignored until the cache was renamed. It now fetches first
  and falls back to the cache when offline (verified by stopping the server
  mid-session: the app still opens and plays).
- **Focus stayed on whatever you clicked**, so Space toggled a chip instead of
  playing and the arrow keys changed the mode. After a mouse or touch
  interaction controls now let go of focus — except dropdowns on the click that
  opens them, which would otherwise close instantly.

**Added**

- **Connect keyboard** chip, automatic reconnect, and plug/unplug announcements.
- **`Start Piano Trainer.cmd`** — the app on `http://127.0.0.1:8765` with nothing
  to install (tested against a real PowerShell: correct file types, refuses
  every attempt to read outside the app folder, answers only on this computer).
- **Backup and restore** of everything the app remembers (Settings → Your data).
- **Touch**: every control reaches at least 40 px on a touchscreen (Microsoft's
  guidance for Windows; 44 px here); drag the falling notes to scrub; tap 1–5 on
  a finger pad when editing fingering; sliding across the on-screen keys plays
  them instead of scrolling the page.
- **Feedback where your eyes are**: practice messages ("Hold it… 0.7 s", "Play
  together: C3 + E3 + G3", "Pass 3: 92%") appear over the falling notes when the
  pointer is over them, with a bar that fills while a Wait chord is held (the
  held key also fills on the keyboard).
- **Start screen**: *Hear it* and *Learn it* buttons that open a piece and set
  it up in one tap; drop a score file anywhere on the page to open it; a
  one-line explanation when you switch mode.
- **Sound-delay calibration** for wireless audio, and **hands-free** keys.

**Documentation corrected**: this README used to say a MIDI keyboard cannot
work from a file opened from disk, and that Firefox has no Web MIDI. The first
was not supported by testing (see *How to run*), the second is out of date.

### Earlier rounds


An audit pass over the whole app. The fixes, grouped by what they broke:

**Data loss**

- **Fingering overrides were keyed on `note.id`, which nothing ever set.** The
  key became the string `"undefined"`, so on the next load every note in the
  piece took that finger number. Notes now carry a stable id (pitch + onset +
  staff) assigned in the parser, and one edit changes one note.
- **`nearestNoteOfPitch` didn't exist.** It threw a `ReferenceError` on every
  key press while fingering-edit was on — which also killed scoring, since the
  scoring call sits after it in the same handler.
- **The note you clicked was ignored.** Fingering edits re-searched by pitch
  from the playhead, so clicking a note in bar 12 could re-finger one in bar 2.
- **Pieces without an embedded `<work-title>` were saved under OSMD's
  placeholder** ("Untitled Score") instead of the file or sample name.

**Audio**

- **Notes at a Wait-mode gate were scheduled twice** — once before the gate
  (the look-ahead window included the gate itself) and again on resume. The
  scheduling horizon is now half-open, so it stops just short of a gate or loop
  end.
- **Pause, seek and loop wraps leaked the notes already queued ahead.**
  `PolySynth.releaseAll()` only releases voices that are already sounding: a
  note scheduled 300 ms out measured the same peak amplitude with and without
  the call. Scheduled notes are now raw Web Audio voices that can be stopped
  before they start, and the transport cancels them at every discontinuity.
  The waveform and envelope are unchanged.
- **Nothing sounded before the first Play.** Audio is now unlocked on the first
  key you touch, so the on-screen keyboard and a MIDI keyboard work immediately.

**Input**

- **MIDI hand mapping was `min(trackIndex, 1)`.** A single-track file put every
  note in the right hand (so Left-hand practice had nothing to play); three or
  more note tracks collapsed into "left hand". Two-track files are now assigned
  by pitch, and everything else is split by a moving pitch break.
- **Stuck keys**: pressing one on-screen key and releasing over another left
  the first one lit and sounding. Fixed with pointer capture — and sliding
  across the keys while held now plays them.
- **Ctrl+S / Cmd+A played notes.** Modifier chords are ignored.
- The saved MIDI device preference was shown in the dropdown but never applied.
- All-notes-off (CC 120/123) is honoured; losing window focus releases held keys.

**Practice**

- **The Drill suggestion treated every Wait-mode gate as a miss**, because the
  match set it inspected is only ever filled in Follow mode — so it proposed
  drilling the whole piece. Misses are now recorded where they occur.
- **Best scores only saved on a full playthrough**; stopping or pausing threw
  the run away.
- Metronome accents follow the bar map instead of counting from beat zero, so a
  pickup measure no longer shifts every downbeat.

**Robustness and speed**

- The sheet cursor could dereference a null timestamp at the end of a score.
- MIDI export wrote titles with `charCodeAt`, corrupting any non-ASCII name.
- The falling-notes view scanned every note every frame and did a linear key
  lookup per note. On a 12,000-note piece: **1.77 → 0.90 ms/frame** at the
  start and **1.00 → 0.38 ms** in the middle. The keyboard's sounding-note scan
  now walks a cursor instead of restarting from note zero.

**New**

Compressed MusicXML (`.mxl`), the beat grid and bar numbers, note names on the
falling notes, timing analysis, the adjustable timing window, error marks in the
roll, "loop this bar" (**L**), the practice log, a shortcuts dialog (**?**), and
removal of saved pieces.

**Wait mode showed the wrong key.** Clearing a gate called the app's
`onGateCleared` handler *before* advancing the gate index — and that handler
resumes the transport, whose scheduler can reach the next hold and re-open a
gate synchronously inside the same call. So the app re-opened the gate you had
just played: the keyboard kept highlighting the note you were already done with
while the engine had moved on, one step out of step with the falling notes, and
playing the highlighted note scored as *wrong*. In a C-major scale the
highlighted key stayed on C4 forever; it now steps C4-D4-E4-F4-G4 in lockstep
with the playhead.

**The keyboard was clipped and the page had scrollbars.** The instrument
panel's minimum height was set independently of its two children, so when the
sum exceeded it `overflow:hidden` quietly cut the bottom off the keys — which
is why the note names only appeared once another panel was switched off and the
keyboard finally had room. Both halves are now sized from the same two CSS
variables and the panel's minimum is computed from them, so they cannot
disagree. The score's scrollbars are gone as furniture (the cursor scrolls the
page for you, and the wheel still works), the toolbar's group labels moved
inline to give two rows the height of one and a half, and all of that height
went to the three panels: at 1440x900 the falling notes went from 117px to
151px and the score from 304px to 319px.

**Cursor calibration.** The sheet cursor drifted to the right of the notes it
was marking, by a growing amount across each system. It was a scale error, not
an offset: OSMD lays a score out to the container's `clientWidth`, which
*includes padding*, so 36px of side padding made it engrave 1290px of music into
a 1218px box — and `max-width:100%` then shrank the SVG by 0.944. The cursor is
an absolutely positioned element *outside* that SVG, so it was not shrunk with
it. Measured drift: **+11px at the first note of a system, +70px by the end of
one**. The side inset now lives on the panel rather than on the engraving
container, and the score scrolls rather than being scaled, so cursor pixels and
engraving pixels are the same pixels. Worst misalignment across three zoom
levels went from **52-59px to 2.4-7px** — inside the cursor bar's own 21px width
at every zoom.

**Typing keyboard rebuilt as a piano.** It was one chromatic octave of letters
(`A W S E D F T G Y H U J K`). It is now two rows laid out like the instrument:
the home row **A** to **'** is the white keys, the row above holds the sharps in
the gaps they divide, **R** and **I** stay silent where a piano has no black key,
and the range is C4–F5 with **Z**/**X** shifting it an octave. Everything is
keyed on physical position rather than the character produced, so it behaves the
same on a non-US layout. The loop shortcuts moved from **L**/**K** to
**B**/**C**, since the home row now belongs to the piano.

**Note length is now required.** A matched note used to be correct the instant
it was struck, however briefly it was held. Now it is held to its length — in
Wait the gate opens only after the hold, in Follow a clipped or overheld note
comes off the accuracy — with a three-way setting to relax it. The score paints
these amber, a third state between green and red: right note, wrong length.

**Repeat, not "loop".** The A/B buttons (DAW jargon: set a start point, then an
end point, at the playhead) are gone. The group is called Repeat, works in bar
numbers, draws the region on the slider and the falling notes, counts passes,
and its tooltip says what it is for.

**Settings window.** The toolbar went from seven groups on two rows (87px) to
four groups on one (51px). Panels, Show, Coach and Device & sound moved into a
Settings dialog; the note overlay got an off switch there.

**Chords in Wait mode.** The gate cleared once every required note had been
pressed at some point — sequentially was fine. It now clears only when every
note was struck after the gate opened *and* is still physically down, so a
chord is a chord; releasing part of it reports what is still needed. A note
held over from the previous chord has to be re-struck.

**The score paints itself.** Each song note now carries a reference to the
OSMD source note it came from, and the sheet view keeps a map from source note
to engraved notehead that it rebuilds after every render (the SVG is thrown away
each time; the source objects are not). Scoring events colour the notehead
green or red, the state survives zoom and resize, and Stop / seek / loop-wrap
clear it from the affected point on.

**Auto-fit.** The tallest system's height is read from OSMD's own layout
(`MusicSystems[].PositionAndShape.Size.height`, in 10px units), and the zoom is
set so it fits the panel with a little headroom — two passes, since a changed
width can reflow the systems. Clamped to 50–140%.

**Dropdowns.** A `<select>`'s open list is drawn by the operating system and
inherited only our light text colour, so it came up grey on white.
`color-scheme: dark` asks for the system's dark popup, and explicit `<option>`
colours cover engines that honour those instead.

**Chrome trimmed again.** The piece title and status folded into the masthead
row, the transport slimmed; at 1440x900 the three panels now hold 73% of the
window (score 342px, falling notes 165px, keys 118px).

**Also in this round:** note names moved from the falling notes to the keys, the
toolbar split into *Panels* and *Show*, the count-in became skippable, and note
length joined the readout.

**And the visual overhaul** described under *The look* above: a new palette and
type system, segmented controls in place of a wall of identical chips, the
falling notes and keyboard fused into one instrument, a workspace that fits the
window, an ink sheet cursor instead of a green bar, the score's title moved out
of the engraving and into the header (which gave the page ~60px more music), and
contrast raised to WCAG AA throughout.
