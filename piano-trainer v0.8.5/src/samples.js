/* ============================================================================
 * samples.js  —  Built-in demo scores
 * ----------------------------------------------------------------------------
 * Embedded as strings so "Samples" works from file:// (no fetch). The three
 * pieces are original engravings of public-domain music (Beethoven's Ode to
 * Joy, Petzold's Minuet in G, and the traditional Twinkle), validated through
 * OSMD + the parser at build time.
 * ========================================================================== */
(function (root) {
  "use strict";
  root.PT = root.PT || {};
  root.PT.samplesOrder = ["scale","twoHand","odeToJoy","minuetG","twinkle"];
  root.PT.samples = {
    scale: {
      title: "C Major Scale (one octave)",
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>
`,
    },
    twoHand: {
      title: "Two-Hand Demo (chords, ties)",
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Two-Hand Test</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
        <staves>2</staves></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff><tie type="start"/><notations><tied type="start"/></notations></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
      <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
      <note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff><tie type="stop"/><notations><tied type="stop"/></notations></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><chord/><pitch><step>B</step><octave>2</octave></pitch><duration>4</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>
`,
    },
    odeToJoy: {
      title: "Ode to Joy (Beethoven)",
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Ode to Joy</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>108</per-minute></metronome></direction-type><sound tempo="108"/></direction>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="3">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="4">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>6</duration><voice>1</voice><type>quarter</type><dot/><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="5">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="6">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="7">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="8">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>6</duration><voice>1</voice><type>quarter</type><dot/><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`,
    },
    minuetG: {
      title: "Minuet in G (Petzold)",
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Minuet in G</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>116</per-minute></metronome></direction-type><sound tempo="116"/></direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>B</step><octave>2</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="3">
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="4">
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>B</step><octave>2</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="5">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="6">
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="7">
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="8">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`,
    },
    twinkle: {
      title: "Twinkle, Twinkle",
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Twinkle, Twinkle, Little Star</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="100"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>F</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="3">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>F</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="4">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="5">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="6">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="7">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="8">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="9">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="10">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>F</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="11">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>F</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="12">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
