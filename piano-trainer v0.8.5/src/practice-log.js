/* ============================================================================
 * practice-log.js  —  Session history, day totals, and streaks
 * ----------------------------------------------------------------------------
 * The README says the one thing the app can't do for you is SPACE your practice
 * across days, because distributed practice with sleep between sessions
 * consolidates motor memory better than the same minutes massed into one
 * sitting (Simmons 2012; Duke, Simmons & Cash 2009). It can't make you come
 * back — but it can make the pattern visible, which is the part software is
 * actually good at. So every run is recorded and shown as: minutes per day for
 * the last two weeks, a consecutive-day streak, and the accuracy trend per
 * piece.
 *
 * A "session" is one continuous stretch of playing with a piece loaded. Only
 * time while the transport is actually running counts, so leaving the tab open
 * doesn't inflate anything.
 *
 * Records: { id, dayKey, pieceId, pieceName, mode, hand, seconds,
 *            correct, wrong, missed, accuracy, points, at }
 *
 * Pure logic + a tiny storage adapter; the aggregation helpers are testable in
 * Node with no browser.
 * ========================================================================== */
(function (root) {
  "use strict";

  const MIN_SESSION_SEC = 20;     // ignore accidental taps

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayKeyOffset(ts, deltaDays) {
    const d = new Date(ts);
    d.setDate(d.getDate() + deltaDays);
    return dayKey(d.getTime());
  }

  /** Minutes per day for the last `days` days, oldest first. */
  function dailyTotals(records, days, now) {
    days = days || 14;
    now = now || Date.now();
    const byDay = new Map();
    for (const r of records || []) byDay.set(r.dayKey, (byDay.get(r.dayKey) || 0) + (r.seconds || 0));
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const k = dayKeyOffset(now, -i);
      out.push({ day: k, seconds: byDay.get(k) || 0 });
    }
    return out;
  }

  /**
   * Consecutive days with practice, counting back from today. Today not having
   * started yet doesn't break a streak — yesterday still anchors it — so the
   * number only drops after a full day is genuinely skipped.
   */
  function streak(records, now) {
    now = now || Date.now();
    const days = new Set((records || []).map((r) => r.dayKey));
    let start = days.has(dayKey(now)) ? 0 : (days.has(dayKeyOffset(now, -1)) ? 1 : null);
    if (start === null) return 0;
    let n = 0;
    for (let i = start; i < 400; i++) {
      if (!days.has(dayKeyOffset(now, -i))) break;
      n++;
    }
    return n;
  }

  /** Accuracy over time for one piece (scored runs only), oldest first. */
  function pieceTrend(records, pieceId) {
    return (records || [])
      .filter((r) => r.pieceId === pieceId && r.mode !== "listen" && (r.correct + r.wrong + r.missed) > 0)
      .sort((a, b) => a.at - b.at)
      .map((r) => ({ at: r.at, accuracy: r.accuracy, points: r.points }));
  }

  function totalSeconds(records) {
    return (records || []).reduce((s, r) => s + (r.seconds || 0), 0);
  }

  class PracticeLog {
    /** @param {object} store  PT.Storage instance (may be null/unavailable) */
    constructor(store) {
      this.store = store;
      this.records = [];
      this._open = null;      // the session being accumulated
    }

    async load() {
      if (!this.store) return [];
      this.records = (await this.store.getAll("sessions")) || [];
      this.records.sort((a, b) => (a.at || 0) - (b.at || 0));
      return this.records;
    }

    /** Begin (or continue) a session for a piece. */
    begin(pieceId, pieceName, mode, hand) {
      if (this._open && this._open.pieceId === pieceId && this._open.mode === mode) return this._open;
      this._open = { pieceId, pieceName, mode, hand, seconds: 0,
                     correct: 0, wrong: 0, missed: 0, accuracy: 100, points: 0, at: Date.now() };
      return this._open;
    }

    /** Add elapsed *playing* time (ms). */
    addTime(ms) { if (this._open && ms > 0) this._open.seconds += ms / 1000; }

    get openSeconds() { return this._open ? this._open.seconds : 0; }

    /** Close the session, writing it if it was long enough to mean anything. */
    async end(result) {
      const s = this._open;
      this._open = null;
      if (!s || s.seconds < MIN_SESSION_SEC) return null;
      Object.assign(s, result || {});
      s.id = "sess-" + s.at + "-" + Math.random().toString(36).slice(2, 7);
      s.dayKey = dayKey(s.at);
      s.seconds = Math.round(s.seconds);
      this.records.push(s);
      if (this.store) await this.store.put("sessions", s);
      return s;
    }

    dailyTotals(days) { return dailyTotals(this.records, days); }
    streak() { return streak(this.records); }
    pieceTrend(pieceId) { return pieceTrend(this.records, pieceId); }
    totalSeconds() { return totalSeconds(this.records); }
    todaySeconds() {
      const k = dayKey(Date.now());
      return this.records.filter((r) => r.dayKey === k).reduce((s, r) => s + r.seconds, 0) + this.openSeconds;
    }
  }

  const api = { PracticeLog, dailyTotals, streak, pieceTrend, totalSeconds, dayKey, MIN_SESSION_SEC };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.PracticeLog = PracticeLog; root.PT.practiceLog = api; }
})(typeof window !== "undefined" ? window : globalThis);
