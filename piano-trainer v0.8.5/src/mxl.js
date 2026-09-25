/* ============================================================================
 * mxl.js  —  Read compressed MusicXML (.mxl)
 * ----------------------------------------------------------------------------
 * A .mxl file is an ordinary ZIP archive holding the score. Almost everything
 * that exports MusicXML (MuseScore, Finale, Sibelius, musescore.com downloads)
 * hands you .mxl rather than raw .xml, so refusing it meant most real scores
 * had to be re-exported by hand before the app would open them.
 *
 * We read the ZIP directly — no library. Two parts:
 *   1. Central-directory walk to find entries and where their bytes start.
 *   2. Inflate via the platform's own DecompressionStream("deflate-raw").
 *      Chrome 80+, Edge 80+, Safari 16.4+, Firefox 113+. Stored (uncompressed)
 *      entries need no inflate at all.
 *
 * Which entry is the score? The spec puts a pointer in META-INF/container.xml:
 *   <rootfiles><rootfile full-path="score.xml"/></rootfiles>
 * We follow it, and fall back to the first .xml/.musicxml outside META-INF.
 *
 * Pure module (needs only TextDecoder + DecompressionStream); no DOM.
 * ========================================================================== */
(function (root) {
  "use strict";

  const EOCD_SIG = 0x06054b50;
  const CEN_SIG  = 0x02014b50;

  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }

  /** List the archive's entries: [{ name, method, offset, compSize, size }]. */
  function readEntries(buf) {
    const dv = new DataView(buf);
    const len = buf.byteLength;
    // The end-of-central-directory record is last, after an optional comment.
    let eocd = -1;
    const scanFrom = Math.max(0, len - 66000);
    for (let i = len - 22; i >= scanFrom; i--) {
      if (u32(dv, i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not a ZIP archive (no end-of-central-directory record).");
    const count = u16(dv, eocd + 10);
    let p = u32(dv, eocd + 16);
    const dec = new TextDecoder("utf-8");
    const out = [];
    for (let i = 0; i < count; i++) {
      if (u32(dv, p) !== CEN_SIG) break;
      const method = u16(dv, p + 10);
      const compSize = u32(dv, p + 20);
      const size = u32(dv, p + 24);
      const nameLen = u16(dv, p + 28);
      const extraLen = u16(dv, p + 30);
      const commentLen = u16(dv, p + 32);
      const localOff = u32(dv, p + 42);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      // The local header repeats the name and carries its own extra field,
      // whose length often differs from the central one — read it there.
      const lNameLen = u16(dv, localOff + 26);
      const lExtraLen = u16(dv, localOff + 28);
      out.push({ name, method, compSize, size, offset: localOff + 30 + lNameLen + lExtraLen });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser can't unzip .mxl — open an uncompressed .musicxml instead.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readEntry(buf, e) {
    const raw = new Uint8Array(buf, e.offset, e.compSize || e.size);
    if (e.method === 0) return raw;                 // stored
    if (e.method === 8) return await inflate(raw);  // deflate
    throw new Error("Unsupported compression in .mxl (method " + e.method + ").");
  }

  /**
   * The score entry's raw bytes. Decoding is the caller's job: Finale and
   * others store the score as UTF-16 inside the archive, and decoding it as
   * UTF-8 (which this function used to do) turned every such .mxl into
   * "doesn't contain a MusicXML score" — 42 of 232 scores in the music21
   * corpus. score-import.js decodes by BOM / byte pattern / declaration.
   * @returns {Promise<Uint8Array>}
   */
  async function extractBytes(buf) {
    const entries = readEntries(buf);
    if (!entries.length) throw new Error("The .mxl archive is empty.");
    const dec = new TextDecoder("utf-8");

    let wanted = null;
    const container = entries.find((e) => e.name.toLowerCase() === "meta-inf/container.xml");
    if (container) {
      const xml = dec.decode(await readEntry(buf, container));
      // the first rootfile that is MusicXML (an archive may also list a PDF);
      // attributes can be quoted either way
      const re = /<rootfile\b([^>]*)>/gi;
      let m;
      while (!wanted && (m = re.exec(xml))) {
        const path = /full-path\s*=\s*(["'])(.*?)\1/i.exec(m[1]);
        const type = /media-type\s*=\s*(["'])(.*?)\1/i.exec(m[1]);
        if (!path || (type && !/musicxml|xml/i.test(type[2]))) continue;
        wanted = entries.find((e) => e.name === path[2]) || null;
      }
    }
    if (!wanted) {
      wanted = entries.find((e) => !/^meta-inf\//i.test(e.name) && /\.(musicxml|xml)$/i.test(e.name));
    }
    if (!wanted) throw new Error("No MusicXML file inside the .mxl archive.");
    return readEntry(buf, wanted);
  }

  /**
   * Extract the MusicXML text from a .mxl ArrayBuffer.
   * @returns {Promise<string>} the score as MusicXML text
   */
  async function extract(buf) {
    const bytes = await extractBytes(buf);
    const si = root.PT && root.PT.scoreImport;
    const text = si ? si.decodeText(bytes) : new TextDecoder("utf-8").decode(bytes);
    if (!/<score-(partwise|timewise)/i.test(text)) {
      throw new Error("The .mxl archive doesn't contain a MusicXML score.");
    }
    return text;
  }

  const api = { extract, extractBytes, readEntries };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.mxl = api; }
})(typeof window !== "undefined" ? window : globalThis);
