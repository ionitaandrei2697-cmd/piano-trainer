# Third-party licenses

This app bundles the following open-source libraries in `lib/`. All are
permissively licensed (MIT / BSD-3-Clause). No code was copied from Midiano or
any non-open-source project.

| Library | Version | License | Use |
|---|---|---|---|
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | 2.1.3 | BSD-3-Clause | Music notation rendering + cursor |
| [Tone.js](https://github.com/Tonejs/Tone.js) | 15.1.22 | MIT | Audio context, synth, scheduling primitives |
| [@tonejs/midi](https://github.com/Tonejs/Midi) | 2.0.28 | MIT | MIDI file parsing |
| [soundfont-player](https://github.com/danigb/soundfont-player) | 0.2.1 | MIT | Optional sampled instruments |
| [VexFlow](https://github.com/0xfe/vexflow) | (bundled inside OSMD) | MIT | Notation engraving engine used by OSMD |

Sampled instrument audio comes from the freely redistributable
[midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) General-MIDI
sets (MusyngKite). The acoustic grand piano set IS bundled
(`lib/acoustic_grand_piano-mp3.js`) so the app sounds like a piano offline;
the other instruments (bright/electric piano, harpsichord, vibraphone, music
box) are fetched at runtime. (An earlier version of this file said no sample
data was bundled — that stopped being true when the offline piano was added.)

## Spoken metronome counts

`lib/voice-counts.js` holds the words the metronome says ("one" ... "eight",
"and"; "unu" ... "opt", "și"), synthesised once, offline, with:

| Tool | Licence | Notes |
|---|---|---|
| [eSpeak NG](https://github.com/espeak-ng/espeak-ng) 1.51 | GPL-3.0-or-later | The program. Audio it produces is program output, not covered by the GPL. |
| MBROLA voices `us1` (English) and `ro1` (Romanian) | MBROLA database licence | "May not be sold or incorporated into any product which is sold without prior permission from the Diphone Database Owner"; free copying and distribution is allowed when no charge is made. |

This app is free and non-commercial, which those terms allow. **If it were
ever sold**, regenerate the counts with eSpeak NG's own voices (no such
restriction) or obtain permission from the database owner. Each clip carries
its measured perceptual onset, used to start the word early so it lands on
the beat.

OpenSheetMusicDisplay's built-in audio player is a sponsor-only feature and is
**not** in the open-source build; this app drives playback and the cursor with
its own transport instead.

The fingering algorithm in `src/fingering.js` (the ergonomic cost model of
Parncutt, Sloboda, Clarke, Raekallio & Desain, 1997, with Jacobs' 2001
refinements, extended as documented in the file), the key-estimation and
pitch-spelling code in `src/theory.js` (Krumhansl–Schmuckler profiles;
PS13-style line-of-fifths spelling), and both converters
(`src/convert-midi-to-xml.js`, `src/convert-xml-to-midi.js`) are original
implementations of published, non-proprietary algorithms; no third-party
conversion or fingering code is included.

---

## BSD-3-Clause — OpenSheetMusicDisplay

Copyright 2019 PhonicScore

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software without
   specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DAMAGES ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE.

---

## MIT — Tone.js, @tonejs/midi, soundfont-player, VexFlow

These components are released under the MIT License (full Tone.js and
soundfont-player notices are in `lib/Tone.js.LICENSE.txt` and
`lib/soundfont-player.LICENSE.txt`). The MIT License permits use, copying,
modification, and distribution provided the copyright and permission notice are
retained; the software is provided "as is", without warranty of any kind.
