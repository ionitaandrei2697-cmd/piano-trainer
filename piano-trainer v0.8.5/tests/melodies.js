/* Test corpus for hand-position behaviour: whole melodies (public domain), the
 * app's own left-hand basses, and constructed passages like the one reported
 * (a repeated D4 at the boundary between two positions). Pitches are MIDI; no
 * fingering ground truth is claimed for these — the metric is the NUMBER of
 * hand-position changes, which can be computed exactly. */
const n=(s)=>s.trim().split(/\s+/).map(t=>{const m=t.match(/^([A-G])(#|b)?(-?\d)$/);const pc={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]==="#"?1:m[2]==="b"?-1:0);return 12*(+m[3]+1)+pc;});
module.exports=[
  {name:"Ode to Joy, full melody", hand:"right", p:n(`E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4  E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4
    D4 D4 E4 C4 D4 E4 F4 E4 C4 D4 E4 F4 E4 D4 C4 D4 G3  E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4`)},
  {name:"Twinkle, full melody", hand:"right", p:n(`C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4 G4 G4 F4 F4 E4 E4 D4 G4 G4 F4 F4 E4 E4 D4
    C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4`)},
  {name:"Mary Had a Little Lamb", hand:"right", p:n(`E4 D4 C4 D4 E4 E4 E4 D4 D4 D4 E4 G4 G4 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4`)},
  {name:"Frere Jacques", hand:"right", p:n(`C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4 E4 F4 G4 G4 A4 G4 F4 E4 C4 G4 A4 G4 F4 E4 C4 C4 G3 C4 C4 G3 C4`)},
  {name:"Happy Birthday", hand:"right", p:n(`G3 G3 A3 G3 C4 B3 G3 G3 A3 G3 D4 C4 G3 G3 G4 E4 C4 B3 A3 F4 F4 E4 C4 D4 C4`)},
  {name:"Jingle Bells, chorus", hand:"right", p:n(`E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4 F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4
    E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4 F4 F4 F4 F4 F4 E4 E4 E4 G4 G4 F4 D4 C4`)},
  {name:"Minuet in G, bars 1-8", hand:"right", p:n(`D5 G4 A4 B4 C5 D5 G4 G4 E5 C5 D5 E5 F#5 G5 G4 G4 C5 D5 C5 B4 A4 B4 C5 B4 A4 G4 F#4 G4 A4 B4 G4 A4`)},
  {name:"Twinkle, left hand", hand:"left", p:n(`C3 C3 F2 C3 F2 C3 G2 C3 C3 G2 C3 G2 C3 G2 C3 G2 C3 C3 F2 C3 F2 C3 G2 C3`)},
  {name:"Ode to Joy, left hand", hand:"left", p:n(`C3 C3 G2 G2 C3 C3 G2 G2 C3 C3 G2 G2 C3 C3 G2 C3`)},
  {name:"reported: repeated D4 at a boundary", hand:"right", p:n(`G3 A3 B3 C4 D4 D4 E4 F4 G4 A4`)},
  {name:"reported, reversed", hand:"right", p:n(`A4 G4 F4 E4 D4 D4 C4 B3 A3 G3`)},
  {name:"repeated D4, down then up", hand:"right", p:n(`D4 C4 B3 A3 G3 A3 B3 C4 D4 D4 E4 F4 G4 A4 G4 F4 E4 D4`)},
  {name:"repeated D4, left hand", hand:"left", p:n(`D4 C4 B3 A3 G3 G3 A3 B3 C4 D4 D4 E4 F4 G4 A4`)},
];
