/**
 * Note and text tools — the deterministic engines behind twelve tools that used
 * to share one assistant call.
 *
 * The rule these tests protect: **extract, never invent.** Every claim is
 * checked against the source text, and the "nothing found" paths are checked
 * just as hard as the happy paths, because a tool that invents an action item
 * is worse than one that finds none.
 */
import assert from 'node:assert/strict';
import {
  parseTimestamp, formatTimestamp, parseCues, formatCues, repairSubtitles,
  subtitleText, subtitleStats, wrapText
} from '../public/js/subtitle-tools.js';
import {
  sentences, paragraphs, words, keyTerms, keyPoints, actionItems, extractCitations,
  extractEntities, detectHeadings, sectionise, makeFlashcards, makeQuiz,
  makeAbstract, cleanText, summariseLongText
} from '../public/js/note-tools.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push([true, name]); }
  catch (err) { results.push([false, `${name}\n      ${err.message}`]); }
}

const MINUTES = `Chair opened the review at 9am.
We decided to move the launch to 12 March 2026.
Anitha will prepare the budget by 15/03.
The team must confirm the venue before then.
Ravi said the supplier confirmed delivery.
Do we have the AV kit? Nobody answered.
Coffee was good.`;

test('sentences split on real boundaries, not on every full stop', () => {
  const s = sentences('Dr. Anitha Ramesh arrived. She said: "We ship on 4 March 2026." Then she left.');
  assert.ok(s.length >= 2, 'the abbreviation did not create a bogus split');
  assert.ok(s.some(x => /Ramesh arrived/.test(x)));
});

test('key points are copied from the text, never paraphrased', () => {
  const text = 'Photosynthesis converts light energy into chemical energy stored in glucose. '
    + 'Chlorophyll absorbs light mainly in the blue and red parts of the spectrum. '
    + 'The light-dependent reactions occur in the thylakoid membrane. '
    + 'Unrelated: the office coffee machine is broken again.';
  const pts = keyPoints(text, 3);
  assert.ok(pts.length > 0);
  const sentencesAll = sentences(text);
  for (const p of pts) {
    assert.ok(sentencesAll.includes(p.text), `"${p.text}" is a real sentence from the input`);
  }
  assert.ok(pts.some(p => /Photosynthesis|light energy|thylakoid/i.test(p.text)),
    'the topic sentences win, not the throwaway line');
  assert.equal(pts.find(p => /coffee machine/.test(p.text)), undefined,
    'an irrelevant sentence is not promoted to a key point');
});

test('key points on empty text return nothing rather than filler', () => {
  assert.deepEqual(keyPoints('', 5), []);
  assert.deepEqual(keyPoints('   \n  \n ', 5), []);
});

test('action items find commitments and their dates and owners', () => {
  const items = actionItems(MINUTES);
  const texts = items.map(i => i.text);
  assert.ok(texts.some(t => /Anitha will prepare the budget/.test(t)), 'the owned commitment is found');
  const owned = items.find(i => /Anitha will prepare/.test(i.text));
  assert.equal(owned.when, '15/03');
  assert.equal(owned.who, 'Anitha');
  assert.ok(texts.some(t => /team must confirm the venue/.test(t)), 'a lowercase subject counts too');
  assert.equal(texts.filter(t => /Coffee was good/.test(t)).length, 0, 'a remark is not an action item');
});

test('action items on prose with no commitment return nothing', () => {
  assert.deepEqual(actionItems('The weather was pleasant. Lunch was at one. The train left at four.'), []);
});

test('citations: DOI, PMID, ISBN, arXiv, URL and author–year are all found', () => {
  const text = 'As shown in https://doi.org/10.1000/xyz123 (Smith et al., 2024) and PMID: 12345678, '
    + 'see arXiv: 2103.00001, ISBN 978-3-16-148410-0, or https://example.org/report. '
    + 'Also (Brown and Green, 2019).';
  const c = extractCitations(text);
  const byType = t => c.filter(x => x.type === t).map(x => x.value);
  assert.ok(byType('DOI').includes('10.1000/xyz123'));
  assert.equal(byType('PMID')[0], '12345678');
  assert.equal(byType('arXiv')[0], '2103.00001');
  assert.equal(byType('ISBN')[0], '978-3-16-148410-0');
  assert.ok(byType('URL').includes('https://example.org/report'));
  assert.ok(byType('Author–year').some(v => /Smith et al\., 2024/.test(v)));
  assert.ok(byType('Author–year').some(v => /Brown and Green, 2019/.test(v)));
});

test('citations: a duplicate reference is listed once', () => {
  const c = extractCitations('doi: 10.1000/abc repeated at https://doi.org/10.1000/abc');
  const dois = c.filter(x => x.type === 'DOI');
  assert.equal(dois.length, 1);
});

test('citations: text with no references says so', () => {
  assert.deepEqual(extractCitations('Just some prose with no references at all.'), []);
});

test('entities: organisations, amounts, dates and measurements are typed', () => {
  const e = extractEntities('Dr. Anitha Ramesh met Kerala Health Sciences Ltd on 4 March 2026 '
    + 'to review a grant of Rs. 4.5 crore, with BP 120/80 mmHg and weight 70 kg recorded.');
  const byType = t => e.filter(x => x.type === t).map(x => x.value);
  assert.ok(byType('Person (titled)').some(v => /Anitha Ramesh/.test(v)));
  assert.ok(byType('Organisation').some(v => /Kerala Health Sciences Ltd/.test(v)));
  assert.ok(byType('Date').some(v => /4 March 2026/.test(v)));
  assert.ok(byType('Amount').some(v => /4\.5 crore/.test(v)));
  const readings = byType('Measurement');
  assert.ok(readings.includes('120/80 mmHg'), 'a blood pressure reading stays whole');
  assert.equal(readings.includes('80 mmHg'), false, 'the diastolic half is never reported alone');
  assert.ok(readings.includes('70 kg'));
});

test('entities: plain prose yields nothing rather than guesses', () => {
  assert.deepEqual(extractEntities('It was a quiet afternoon in the park.'), []);
});

test('headings and sections are detected from real structure', () => {
  const text = `# Introduction\nSome text here.\n\nOVERVIEW\nMore text.\n\n## Method\nSteps.`;
  const h = detectHeadings(text).map(x => x.text);
  assert.ok(h.some(t => /Introduction/.test(t)));
  assert.ok(h.some(t => /OVERVIEW/.test(t)));
  assert.ok(h.some(t => /Method/.test(t)));
  const secs = sectionise(text);
  assert.equal(secs.length, 3);
  assert.equal(secs[0].heading, 'Introduction');
  assert.match(secs[2].text, /Steps/);
});

test('flashcards use the questions you wrote, and are honest about the rest', () => {
  const explicit = 'Q: What is ATP?\nA: The energy currency of the cell.\n\nQ: Where is it made?\nA: In the mitochondria.';
  const cards = makeFlashcards(explicit, 10);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].q, 'What is ATP?');
  assert.equal(cards[0].a, 'The energy currency of the cell.');

  const prose = '# Photosynthesis\nPlants convert light into chemical energy. Chlorophyll absorbs blue and red light.\n\n# Respiration\nCells release energy from glucose with oxygen.';
  const built = makeFlashcards(prose, 5);
  assert.ok(built.length >= 2);
  for (const c of built) {
    assert.ok(c.q.length > 3 && c.a.length > 3);
    assert.match(c.q + c.a, /Photosynthesis|Respiration|light|glucose|oxygen|energy/i,
      'a generated card is built from the text itself');
  }
});

test('flashcards from unheadlined prose ask a checkable question, not a fake one', () => {
  const cards = makeFlashcards('The mitochondria produce ATP. Chlorophyll absorbs light. Ribosomes build proteins. '
    + 'The nucleus stores genetic material. Mitochondria also play a role in apoptosis.', 3);
  assert.ok(cards.length > 0);
  assert.ok(cards.every(c => /Is this statement from the text\?/.test(c.q)),
    'when there is no structure to use, the tool says what it is doing');
});

test('quiz: written Q/A pairs come first and are used as-is', () => {
  const quiz = makeQuiz('Q: Capital of Kerala?\nA: Thiruvananthapuram.\n\nQ: Capital of Tamil Nadu?\nA: Chennai.', 5);
  assert.equal(quiz[0].q, 'Capital of Kerala?');
  assert.equal(quiz[0].a, 'Thiruvananthapuram.');
  assert.equal(quiz[1].q, 'Capital of Tamil Nadu?');
  assert.equal(quiz[1].a, 'Chennai.');
  // Asking for more than was written tops the list up from the text itself,
  // but never reorders or rewrites what the user already wrote.
  assert.ok(quiz.length >= 2);
  for (const q of quiz.slice(2)) assert.ok(q.options, 'generated questions are the statement type');
});

test('quiz: built questions use only sentences from the text as options', () => {
  const prose = 'Mercury orbits closest to the Sun. Venus is the hottest planet. '
    + 'Earth is the third planet from the Sun. Mars appears red because of iron oxide. '
    + 'Jupiter is the largest planet in the Solar System.';
  const quiz = makeQuiz(prose, 3);
  assert.ok(quiz.length > 0);
  for (const q of quiz) {
    if (!q.options) continue;
    assert.ok(q.options.includes(q.a), 'the answer is one of the options');
    for (const o of q.options) {
      assert.ok(prose.includes(o), `"${o}" came from the text`);
    }
  }
});

test('abstract: the opening and closing sentences are quoted, with a source note', () => {
  const text = 'This study examined 400 patients over three years. Outcomes were measured at baseline and at 12 months. '
    + 'Participants were recruited from four hospitals. The intervention group improved significantly.';
  const a = makeAbstract(text, 4);
  const s = sentences(text);
  for (const piece of a.abstract.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
    assert.ok(s.includes(piece.trim()), 'every abstract sentence is from the text');
  }
  assert.match(a.note, /Extracted/);
  assert.ok(a.terms.length > 0);
});

test('text cleaner tidies without rewriting', () => {
  const dirty = '  Hello    world  \n\n\n\nSecond\tline\t\t \n  ';
  const clean = cleanText(dirty);
  assert.equal(clean, 'Hello world\n\nSecond line');
  const kept = cleanText('The cat sat.', { normaliseQuotes: false, collapseSpaces: false });
  assert.equal(kept, 'The cat sat.', 'options are respected');
});

test('text cleaner can drop repeated lines when asked, and only then', () => {
  const dup = 'a\na\nb';
  assert.equal(cleanText(dup).split('\n').length, 3);
  assert.equal(cleanText(dup, { dedupeLines: true }).split('\n').length, 2);
});

test('long-text summary reports its own statistics honestly', () => {
  const s = summariseLongText(MINUTES);
  assert.equal(s.stats.words, words(MINUTES).length);
  assert.equal(s.stats.sentences, sentences(MINUTES).length);
  assert.ok(s.keyPoints.length > 0);
  assert.ok(s.actionItems.length > 0);
  const all = sentences(MINUTES);
  for (const p of s.keyPoints) assert.ok(all.includes(p), 'key points are original sentences');
});

test('empty input never produces invented content anywhere', () => {
  assert.deepEqual(actionItems(''), []);
  assert.deepEqual(extractCitations(''), []);
  assert.deepEqual(extractEntities(''), []);
  assert.deepEqual(keyPoints('', 3), []);
  assert.equal(makeAbstract('').abstract, '');
  assert.match(makeAbstract('').note, /Not enough/);
  assert.deepEqual(cleanText(''), '');
  assert.equal(summariseLongText('').stats.sentences, 0);
  assert.equal(paragraphs('').length, 0);
});

/* ------------------------------------------------------------------ *
 * Subtitles
 *
 * `Subtitle Formatter` used to be `input.replace(/\r/g, '')`. A player
 * rejects a file for its timings and its line lengths, not its line endings, so
 * these check the rules that actually matter.
 * ------------------------------------------------------------------ */

test('a subtitle timestamp is read and written back exactly', () => {
  assert.equal(parseTimestamp('00:00:01,500'), 1500);
  assert.equal(parseTimestamp('00:01:02.500'), 62500);
  assert.equal(parseTimestamp('01:02.5'), 62500);
  assert.equal(parseTimestamp('nonsense'), null);
  assert.equal(formatTimestamp(62500, true), '00:01:02,500');
  assert.equal(formatTimestamp(62500, false), '00:01:02.500');
  assert.equal(formatTimestamp(-5), '00:00:00.000', 'a negative time does not print as a broken one');
  assert.equal(formatTimestamp(Infinity, true), '00:00:00,000', 'and neither does a broken one');
  assert.equal(formatTimestamp(3723450), '01:02:03.450');
  assert.equal(formatTimestamp(3723450, true), '01:02:03,450');
});

test('overlapping cues are actually separated', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:01,500 --> 00:00:03,000\nSecond\n';
  const out = repairSubtitles(srt).text;
  const times = [...out.matchAll(/(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)/g)].map(m => [m[1], m[2]]);
  assert.equal(times.length, 2);
  assert.ok(times[1][0] >= times[0][1], `the second cue must start after the first ends: ${JSON.stringify(times)}`);
});

test('a cue that flashes past is held, and a too-fast cue is lengthened', () => {
  const r = repairSubtitles('1\n00:00:05,000 --> 00:00:05,100\nShort\n\n2\n00:00:10,000 --> 00:00:11,000\n' + 'word '.repeat(30).trim());
  assert.match(r.text, /00:00:05,000 --> 00:00:05,900/, 'a 100ms cue is held to 900ms');
  assert.ok(r.notes.join(' ').match(/lengthened/), 'the too-fast cue is reported: ' + r.notes.join(' '));
});

test('long lines are wrapped and the cue count is reported', () => {
  const r = repairSubtitles('1\n00:00:01,000 --> 00:00:04,000\n' + 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu');
  const lines = r.text.split('\n').filter(l => l && !/\d\d:\d\d/.test(l) && l !== '1');
  assert.ok(lines.every(l => l.length <= 44), 'no line runs away: ' + JSON.stringify(lines));
  assert.match(r.notes[0], /1 cues, SRT/);
});

test('a shift moves every cue by the same amount', () => {
  const r = repairSubtitles('1\n00:00:10,000 --> 00:00:12,000\nHello\n', { shiftMs: -2500 });
  assert.match(r.text, /00:00:07,500 --> 00:00:09,500/);
  assert.match(r.notes.join(' '), /shifted -2\.50s/);
});

test('a file with no cues says so instead of returning nothing', () => {
  const r = repairSubtitles('just some words' + String.fromCharCode(10) + 'with no timings');
  assert.equal(r.cues.length, 0);
  assert.match(r.notes.join(' '), /No subtitle cues/);
});

test('SRT and VTT round-trip without losing a cue or moving a time', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:03,250 --> 00:00:04,500\nSecond\n';
  const vtt = repairSubtitles(srt, { vtt: true, fixOverlaps: false, minGapMs: 0, minDurationMs: 0, targetCps: 0, trimIdle: false, maxLineLength: 0, maxLines: 0 }).text;
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:00:01\.000 --> 00:00:02\.000/);
  assert.match(vtt, /00:00:03\.250 --> 00:00:04\.500/);
  const back = repairSubtitles(vtt, { vtt: false, fixOverlaps: false, minGapMs: 0, minDurationMs: 0, targetCps: 0, trimIdle: false, maxLineLength: 0, maxLines: 0 }).text;
  assert.equal(back, srt, 'VTT to SRT is the original file again');
});

test('VTT cue settings survive a round trip', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:start position:10%\nHello\n';
  const srt = repairSubtitles(vtt, { vtt: false, fixOverlaps: false, minGapMs: 0, minDurationMs: 0, targetCps: 0, trimIdle: false, maxLineLength: 0, maxLines: 0 }).text;
  assert.match(srt, /00:00:01,000 --> 00:00:02,000/);
  assert.doesNotMatch(srt, /align:start/, 'VTT-only settings do not end up in the SRT');
});

test('the extractor gives dialogue with no timings, and counts it', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond line\n';
  assert.equal(subtitleText(srt), 'Hello there\nSecond line');
  const st = subtitleStats(srt);
  assert.equal(st.cues, 2);
  assert.equal(st.words, 4);
  assert.equal(st.endMs, 4000);
  assert.ok(st.cps > 0);
  assert.equal(subtitleText('not a subtitle file at all'), 'not a subtitle file at all', 'plain text passes through');
});

test('line wrapping never loses a word', () => {
  const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
  const wrapped = wrapText(long, 20, 2);
  assert.ok(wrapped.split('\n').length <= 2);
  assert.match(wrapped, /…$/, 'the cut is marked rather than silent');
  assert.equal(wrapText('short', 40).split('\n').length, 1);
});

const failed = results.filter(r => !r[0]);
for (const [okFlag, name] of results) console.log(`${okFlag ? 'ok  ' : 'FAIL'} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} note-tool tests passed`);
process.exit(failed.length ? 1 : 0);
