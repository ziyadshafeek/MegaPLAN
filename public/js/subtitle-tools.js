/**
 * Subtitle work: parsing SRT and VTT, repairing timings, and writing a file that
 * a player will actually accept.
 *
 * `Subtitle Formatter` used to be `input.replace(/\r/g, '')`, which is not a
 * formatter. These are the pure parts, so the rules can be pinned by tests
 * instead of asserted in prose.
 */

/** Parses `00:01:02,500` or `00:01:02.500` or `01:02.5` into milliseconds. */
export function parseTimestamp(text) {
  const m = String(text || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const ms = m[4] ? Number(m[4].padEnd(3, '0').slice(0, 3)) : 0;
  return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + ms;
}

export function formatTimestamp(ms, comma = false) {
  const n = Number(ms);
  // A file must never come back with "Infinity:NaN" written into a timestamp.
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  const s = Math.floor(v / 1000);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` +
    `${comma ? ',' : '.'}${String(v % 1000).padStart(3, '0')}`;
}

/** Reads SRT or VTT into cues. Numbers and cue settings are kept aside. */
export function parseCues(text) {
  const clean = String(text || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const isVtt = /^WEBVTT/.test(clean.trim());
  const cues = [];
  for (const block of clean.split(/\n{2,}/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (/^WEBVTT/.test(lines[0])) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const [fromRaw, rest] = lines[ti].split('-->').map(x => x.trim());
    const toRaw = (rest || '').split(/\s+/)[0];
    const from = parseTimestamp(fromRaw);
    const to = parseTimestamp(toRaw);
    if (from == null || to == null) continue;
    cues.push({
      from, to,
      settings: (rest || '').split(/\s+/).slice(1).join(' '),
      index: /^\d+$/.test(lines[ti - 1] || '') ? Number(lines[ti - 1]) : null,
      text: lines.slice(ti + 1).join('\n')
    });
  }
  return { cues, isVtt };
}

/** Writes cues back as SRT or VTT, numbered from 1. */
export function formatCues(cues, { vtt = false, maxLineLength = 0, maxLines = 2 } = {}) {
  const body = cues.map((c, i) => {
    let text = c.text.replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    if (maxLines > 0) {
      const lines = text.split('\n');
      if (lines.length > maxLines) {
        // Too many lines: merge them, then wrap to the line cap.
        text = wrapText(lines.join(' '), maxLineLength || 84, maxLines);
      } else if (maxLineLength > 0) {
        text = lines.map(l => wrapText(l, maxLineLength, 99)).join('\n');
      }
    }
    return `${vtt ? '' : i + 1 + '\n'}${formatTimestamp(c.from, !vtt)} --> ${formatTimestamp(c.to, !vtt)}${vtt && c.settings ? ' ' + c.settings : ''}\n${text}`;
  }).join('\n\n');
  return (vtt ? 'WEBVTT\n\n' : '') + body + (body ? '\n' : '');
}

/** Greedy word wrap that keeps the line count in hand. */
export function wrapText(text, width = 84, maxLines = 99) {
  if (!text) return '';
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) { line = word; continue; }
    if ((line + ' ' + word).length <= width) { line += ' ' + word; continue; }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (maxLines > 0 && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[,;:]?$/, '') + '…';
    return kept.join('\n');
  }
  return lines.join('\n');
}

/**
 * Repairs a subtitle file and reports what it had to do.
 *
 * @param {string} text
 * @param {{shiftMs?:number, minGapMs?:number, minDurationMs?:number, maxLineLength?:number,
 *          maxLines?:number, dropOverlaps?:boolean, targetCps?:number}} opts
 */
export function repairSubtitles(text, {
  shiftMs = 0, minGapMs = 40, minDurationMs = 900, maxLineLength = 42, maxLines = 2,
  fixOverlaps = true, targetCps = 17, trimIdle = true, vtt = null
} = {}) {
  const { cues, isVtt } = parseCues(text);
  const notes = [];
  if (!cues.length) return { text: '', notes: ['No subtitle cues were found. The file needs lines like `00:00:01,000 --> 00:00:03,000`.'], cues: [] };

  const out = [];
  let dropped = 0, extended = 0, moved = 0, trimmed = 0, slowed = 0;
  for (const cue of cues) {
    let from = Math.max(0, cue.from + shiftMs);
    let to = Math.max(0, cue.to + shiftMs);
    if (to <= from) { dropped++; continue; }
    if (to - from < minDurationMs) { to = from + minDurationMs; extended++; }

    const words = cue.text.split(/\s+/).filter(Boolean).length;
    const seconds = (to - from) / 1000;
    // Reading speed is the thing most players and most viewers complain about.
    // A target of zero turns the reading-speed rules off, which is what a plain
    // format conversion needs: it must not touch a single timing.
    if (targetCps > 0 && words > 0 && seconds > 0 && words / seconds > targetCps) {
      const needed = Math.ceil((words / targetCps) * 1000 / 100) * 100;
      to = from + needed;
      slowed++;
    }
    if (trimIdle && targetCps > 0 && words > 0 && to - from > words * 1000 / 2 + 4000) {
      to = from + words * 1000 / 2 + 4000;
      trimmed++;
    }

    const previous = out[out.length - 1];
    if (fixOverlaps && previous && from < previous.to + minGapMs) {
      // Shortening the earlier cue is only allowed while it keeps its minimum
      // length. If it does not, this cue moves later instead — overlapping cues
      // that still overlap after a "fix" are worse than the original.
      const shortened = from - minGapMs;
      if (shortened >= previous.from + minDurationMs) {
        previous.to = shortened;
      } else {
        from = previous.to + minGapMs;
        to = Math.max(to, from + minDurationMs);
      }
      moved++;
    }
    out.push({ ...cue, from, to });
  }

  if (dropped) notes.push(`${dropped} cue(s) had no usable timing and were dropped.`);
  if (extended) notes.push(`${extended} cue(s) were held on screen for the minimum ${minDurationMs}ms.`);
  if (slowed) notes.push(`${slowed} cue(s) were lengthened to stay under ${targetCps} characters per second.`);
  if (trimmed) notes.push(`${trimmed} cue(s) were shortened to match their reading time.`);
  if (moved) notes.push(`${moved} overlap(s) between cues were separated by ${minGapMs}ms.`);

  const useVtt = vtt == null ? isVtt : vtt;
  const used = formatCues(out, { vtt: useVtt, maxLineLength, maxLines });
  const over = targetCps > 0 ? out.filter(c => c.text.split(/\s+/).filter(Boolean).length / Math.max(0.1, (c.to - c.from) / 1000) > targetCps).length : 0;
  if (over) notes.push(`${over} cue(s) are still faster than ${targetCps} characters per second; the text is too long for the time available.`);
  notes.unshift(`${out.length} cues, ${useVtt ? 'VTT' : 'SRT'}${shiftMs ? `, shifted ${shiftMs > 0 ? '+' : ''}${(shiftMs / 1000).toFixed(2)}s` : ''}.`);
  return { text: used, notes, cues: out, isVtt: useVtt };
}

/** The plain dialogue, for translation, search and quoting. */
export function subtitleText(text) {
  const { cues } = parseCues(text);
  if (!cues.length) return String(text || '').replace(/\r\n?/g, '\n').trim();
  return cues.map(c => c.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Total spoken time and the rate it is read at. */
export function subtitleStats(text) {
  const { cues } = parseCues(text);
  if (!cues.length) return null;
  const end = Math.max(...cues.map(c => c.to));
  const start = Math.min(...cues.map(c => c.from));
  const words = cues.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0);
  const seconds = (end - start) / 1000;
  return {
    cues: cues.length,
    words,
    startMs: start,
    endMs: end,
    seconds,
    cps: seconds > 0 ? +(words / seconds).toFixed(2) : 0,
    readingMinutes: +(words / 160).toFixed(2)
  };
}
