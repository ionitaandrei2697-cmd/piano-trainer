/* ============================================================================
 * midi-input.js  —  Web MIDI API input
 * ----------------------------------------------------------------------------
 * Enumerates MIDI input devices, listens for note-on/note-off, and reports them
 * via callbacks.
 *
 * WHERE IT WORKS. Web MIDI needs a secure context, and since Chrome 124 every
 * request is permission-gated (a prompt the first time). Tested in Chromium
 * 131: a page opened from file:// IS a secure context and gets the same prompt
 * as http://localhost, so the old advice here — "file:// won't work, run a
 * Python server" — was not accurate. What could not be verified without real
 * hardware is whether every browser GRANTS access to a file:// page once the
 * prompt is accepted; if it does not, `Start Piano Trainer.cmd` serves the app
 * on http://localhost with nothing to install. Safari/iOS have no Web MIDI.
 *
 * Connecting is automatic when the permission was granted before, so a
 * returning player never has to press Connect. Devices plugged in or pulled
 * out are announced, and a keyboard pulled out mid-note releases its notes
 * instead of leaving them ringing.
 *
 * MIDI status bytes used:
 *   0x90 note-on  (velocity 0 is treated as note-off, per the MIDI spec — the
 *                  running-status form many keyboards send)
 *   0x80 note-off
 *   0xB0 CC64 sustain, CC120/123 all-sound-off / all-notes-off
 *   0xFA/0xFB/0xFC start / continue / stop (one-byte real-time)
 * ========================================================================== */
(function (root) {
  "use strict";

  class MidiInput {
    constructor() {
      this.access = null;
      this.inputs = [];          // [{id, name}]
      this.activeId = "all";     // "all" or a device id
      this.enabled = false;

      this.onNoteOn = null;      // (midi, velocity 0..1)
      this.onNoteOff = null;     // (midi)
      this.onSustain = null;     // (down:boolean) — sustain pedal, CC64
      this.onDevices = null;     // (inputs[])
      this.onPanic = null;       // () — all-notes-off arrived
      this.onTransport = null;   // ("start"|"continue"|"stop") — MIDI real-time
      this.onStatus = null;      // (text, kind)
      this.onConnect = null;     // (name) — a keyboard appeared
      this.onDisconnect = null;  // (name) — a keyboard went away
      this._known = new Map();   // id -> name, to tell plug-in from pull-out
      this._held = new Map();    // id -> Set(notes) currently down on that device
    }

    /** "granted" | "prompt" | "denied" | "unsupported" — without prompting. */
    async permissionState() {
      if (!this.supported()) return "unsupported";
      try {
        const p = await navigator.permissions.query({ name: "midi" });
        return p.state;
      } catch (e) { return "prompt"; }        // query unsupported: asking is the only way
    }

    /** Connect silently if the player already allowed it. Never prompts. */
    async autoConnect() {
      if (this.enabled) return true;
      if ((await this.permissionState()) !== "granted") return false;
      return this.enable({ quiet: true });
    }

    supported() {
      return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
    }

    secureOk() {
      return typeof window !== "undefined" && window.isSecureContext;
    }

    /** Request access and wire up devices. Returns true on success. */
    async enable(opts) {
      opts = opts || {};
      if (this.enabled) { this._refresh(); return true; }
      if (!this.supported()) {
        this._status("This browser can't read MIDI keyboards \u2014 open the app in Edge or Chrome.", "err");
        return false;
      }
      if (!this.secureOk()) {
        this._status("This page isn't allowed to use MIDI. Start the app with \u201cStart Piano Trainer.cmd\u201d and connect again.", "err");
        return false;
      }
      try {
        this.access = await navigator.requestMIDIAccess({ sysex: false });
      } catch (e) {
        this._status(this._explain(e), "err");
        return false;
      }
      this.enabled = true;
      this.access.onstatechange = () => this._refresh();
      this._refresh();
      if (!opts.quiet) {
        this._status(this.inputs.length ? "Keyboard ready." : "Connected \u2014 but no MIDI keyboard found. Plug it in (USB) and it will appear.",
                     this.inputs.length ? "ok" : "warn");
      }
      return true;
    }

    /** Turn a rejected request into something the player can act on. */
    _explain(e) {
      const onFile = typeof location !== "undefined" && location.protocol === "file:";
      if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
        return onFile
          ? "The browser refused keyboard access for a file opened from disk. Start the app with \u201cStart Piano Trainer.cmd\u201d instead \u2014 nothing to install."
          : "Keyboard access is blocked for this page. Allow \u201cMIDI devices\u201d in the site settings (the icon left of the address bar), then reload.";
      }
      return "Couldn't reach the MIDI keyboard: " + (e && e.message ? e.message : e);
    }

    _refresh() {
      if (!this.access) return;
      const list = [];
      this.access.inputs.forEach((inp) => {
        if (inp.state === "disconnected") return;
        list.push({ id: inp.id, name: inp.name || "MIDI device" });
      });
      const now = new Map(list.map((d) => [d.id, d.name]));
      // Pulled out: a note held on that keyboard will never get its note-off,
      // so release it here — otherwise the key stays lit and keeps sounding.
      for (const [id, name] of this._known) {
        if (now.has(id)) continue;
        const held = this._held.get(id);
        if (held) { for (const n of held) if (this.onNoteOff) this.onNoteOff(n); this._held.delete(id); }
        if (this.onSustain) this.onSustain(false);
        if (this.onDisconnect) this.onDisconnect(name);
      }
      const first = this._known.size === 0 && !this._announcedOnce;
      for (const [id, name] of now) {
        if (!this._known.has(id) && this.onConnect) this.onConnect(name, first);
      }
      this._announcedOnce = true;
      this._known = now;
      this.inputs = list;
      // (re)bind handlers
      this.access.inputs.forEach((inp) => {
        inp.onmidimessage = (msg) => this._onMessage(inp.id, msg);
      });
      if (this.onDevices) this.onDevices(list);
    }

    setActive(id) { this.activeId = id || "all"; }

    _onMessage(deviceId, msg) {
      if (this.activeId !== "all" && deviceId !== this.activeId) return;
      const data = msg.data;
      if (!data || !data.length) return;
      // System real-time messages are ONE byte (FA start, FB continue, FC stop)
      // and used to be dropped by the length check below. A keyboard or pedal
      // with transport buttons can now drive the app hands-free.
      if (data[0] >= 0xf8) {
        const rt = { 0xfa: "start", 0xfb: "continue", 0xfc: "stop" }[data[0]];
        if (rt && this.onTransport) this.onTransport(rt);
        return;                       // clock / active sensing: ignore
      }
      if (data.length < 2) return;
      const status = data[0] & 0xf0;
      const note = data[1];
      const vel = data.length > 2 ? data[2] : 0;
      if (status === 0x90 && vel > 0) {
        this._track(deviceId, note, true);
        if (this.onNoteOn) this.onNoteOn(note, vel / 127);
      } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
        this._track(deviceId, note, false);
        if (this.onNoteOff) this.onNoteOff(note);
      } else if (status === 0xb0 && note === 64) {
        // Control Change 64 = sustain pedal; >=64 is down per the MIDI spec.
        if (this.onSustain) this.onSustain(vel >= 64);
      } else if (status === 0xb0 && (note === 120 || note === 123)) {
        // CC120 all-sound-off / CC123 all-notes-off: many keyboards send these
        // on power-up or patch change, and ignoring them left notes ringing.
        if (this.onSustain) this.onSustain(false);
        if (this.onPanic) this.onPanic();
      }
    }

    _track(id, note, down) {
      let set = this._held.get(id);
      if (!set) { set = new Set(); this._held.set(id, set); }
      if (down) set.add(note); else set.delete(note);
    }

    _status(t, k) { if (this.onStatus) this.onStatus(t, k); }
  }

  root.PT = root.PT || {};
  root.PT.MidiInput = MidiInput;
})(typeof window !== "undefined" ? window : globalThis);
