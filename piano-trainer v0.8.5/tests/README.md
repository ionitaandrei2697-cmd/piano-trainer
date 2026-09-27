# Tests

Two rigs. The Node ones need nothing; the browser ones drive a real headless
Chrome so they exercise Web Audio, IndexedDB, canvas and the DOM.

```bash
npm i puppeteer          # browser rig only
node tests/probe.js          # pure modules: geometry, timing, scoring, fingering, theory
node tests/transport-sim.js  # scheduler with a fake clock — catches double-scheduled notes
node tests/regress.js        # 22 checks, one per fixed bug + the new features
node tests/exercise.js       # walks every mode and control looking for exceptions
node tests/perf.js <dir>     # falling-notes render cost on a 12,000-note piece
node tests/grid.js           # differential check that the beat grid actually draws
node tests/fileproto.js      # the file:// path the README promises

# design QA
node tests/designqa.js       # WCAG contrast, palette, the roll/keyboard seam, fonts
node tests/fit.js            # do all three views fit above the fold, at six screen sizes
node tests/compose.js        # sample the rendered pixels inside each measured element
node tests/fontcheck.js      # does the type degrade cleanly with no network
node tests/cursorfinal.js    # sheet-cursor alignment vs real noteheads, at 3 zoom levels
node tests/scorecheck.js     # is a complete grand staff visible, at 4 window sizes
node tests/labels.js         # note names land on the keys and not on the falling notes
node tests/waitbug.js        # wait-mode gates stay in step with the playhead
node tests/newfeatures.js    # count-in skip, note-length scoring, Panels/Show split, no clipping
node tests/kbcheck.js        # keyboard is never clipped and every note name is visible
node tests/typing.js         # every physical key of the typing piano, octave shift, moved shortcuts
node tests/fallback.js       # the typing piano still works without event.code
node tests/round6.js         # held chords, score overlay, auto-fit, dropdown palette
node tests/round7.js         # note length required (wait + follow), Repeat, settings window, colour toggle
node tests/chrome.js         # how much height the chrome costs; toolbar group widths
```

Several take a directory argument so you can diff against another build:
`node tests/cursorfinal.js ../piano-trainer`.

`harness.js` serves the app on a random port and returns a puppeteer page.
Every test finds the app relative to its own folder, so the suite runs from any
checkout. If puppeteer has no Chrome of its own, point it at any Chromium:
`CHROME_PATH=/path/to/chrome node tests/audit.js`.

## Usability audit

```bash
node tests/audit.js          # 66 checks: every user-facing function, through the real UI,
                             # with a simulated USB MIDI keyboard injected before load
node tests/touch.js          # target sizes with a mouse and on a touchscreen, at Surface-sized viewports
node tests/sliderpx.js       # the position bar's fill and thumb, pixel-sampled (TOUCH=1 for touch)
node tests/selectblur.js     # a dropdown keeps focus on the click that opens it
node tests/masthead.js       # what the top bar costs, and whether it wraps
node tests/pausedrift.js     # the display freezes after pause instead of drifting
node tests/midiorigin.js     # Web MIDI from file:// vs localhost (secure context, same prompt)
```

The launcher tests need the PowerShell server running first:

```bash
pwsh -NoProfile -File tools/serve.ps1 -Port 8765 -NoBrowser &   # echo $! > /tmp/serve.pid
node tests/viaserver.js      # the whole app served by tools/serve.ps1
node tests/offline.js        # stops the server (via /tmp/serve.pid) and reloads: must open from cache
```

## Fingering, metronome, Wait mode

```bash
node tests/fingerbench.js    # automatic fingering vs textbook fingerings: tuning set + a held-out set never tuned on
node tests/positiontest.js   # hand moves = exact minimum on 13 melodies; no repeated-note finger swaps; speed
node tests/posreport.js      # the same, as a readable report (2 x jumps + passes vs the exact minimum)
node tests/possweep.js       # how the jump weight was chosen
node tests/movemarks.js      # the jump / thumb-pass marks on the falling notes, and their toggle
node tests/editswaps.js      # no single fingering edit (265 tried on Ode to Joy) makes a repeated note change finger
node tests/fingeredit.js     # This note / Every G2 scopes, pinned re-fit of neighbours, Auto, persistence, reset
node tests/metronome.js      # one toggle; every sound rendered offline and measured; voice onsets; beats, meter, subdivisions
node tests/metroloop.js      # (Node) subdivisions never tick past a repeat's end or a Wait gate
node tests/waitmode.js       # no play bar in Wait; keys lit without Play; restart; practice time; colours survive a resize
```

## MIDI files

```bash
node tests/mkmidi.js         # writes tests/fixtures/arrangement.mid (piano + bass + strings + drums, C1-E7)
node tests/midiimport.js     # parts (drums off, backing), fitting to 61 keys, no unplayable gates, saved MIDI reopens, re-fit on 49 keys
node tests/midireal.js       # a real-world-shaped file: meter changes, few low basses (moved, merged), chords shared between hands,
                             # no duplicate on reopening, and the whole piece played through in Wait mode on 61 keys
node tests/smfdump.js FILE   # byte-level dump of any MIDI file: tracks, channels, programs, tempo and time-signature changes
```

## One hand at a time, finger discs, hover-only messages

```bash
node tests/round8.js         # quick start, first-run card, HUD over the falling notes, hold progress
node tests/round9.js         # other hand silent (and the opt-in), no doubled notes, hover-only messages,
                             # errors still shown, finger discs, taller falling notes
```

## Score import, fingering for your hand

```bash
node tests/scoreimport.js    # 31 checks: UTF-16/Latin-1/BOM files, .mxl variants, a zip saved as .xml,
                             # MIDI saved as .musicxml, part-list faults (the "incomplete" error),
                             # short parts, crashing content, score-timewise, voice + piano parts,
                             # grace notes, and the notes-only fallback when the engine refuses a score
node tests/fingervariants.js # (Node) small hands keep method-book fingerings, the four styles,
                             # fast repeated notes (3-2-1), chords too wide for the hand, suggestions,
                             # Für Elise bars 1-9 as reported (a finger sliding D#-D, moves only in rests)
node tests/hands.js          # (Node) a line the MIDI tracks split goes to one hand (Für Elise); accompaniments
                             # passed between the hands stay (Bach, Gounod, Schumann, Joplin, a held voice, a fast trill)
node tests/round11.js        # an old conversion reopened: repaired and redrawn once; a fresh one marked; real scores untouched
node tests/round10.js        # reported on a real piece: the page after Convert to sheet music, a score opened
                             # with the Score panel off, a finger number on every falling note, the move legend
```
