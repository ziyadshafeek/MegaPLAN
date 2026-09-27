/**
 * Medicine-shaped extraction, from OCR text or from typed notes.
 *
 * A prescription photo read by OCR arrives as a wall of lines like:
 *
 *   Tab. Metformin 500 mg   1 tab twice daily after meals  x 30 days
 *   2. Azithromycin 250 mg — 1 tab OD for 5 days
 *
 * There is no table in there, and asking a language model to invent one means a
 * dose gets transposed somewhere. So this is a reader, not a guesser: it pulls
 * the five fields a prescriber actually wrote, and leaves a cell blank when the
 * text does not say. A blank cell is honest. A filled-in one is a lie.
 *
 * Every function here is pure, so the behaviour can be tested against the exact
 * text a scan produces rather than described in a comment.
 */

/** Words that start a prescription line rather than naming a medicine. */
const LEADING = /^(?:tab|tabs|cap|caps|capls|capsule|capsules|syr|syrp|syp|syrup|inj|injection|cream|ointment|gel|drop|drops|sachet|sachets|tablet|tablets|patch|inhaler|suppository|tab\.?|cap\.)\b[\s.:,-]*/i;

/** Section headings OCR often glues onto the end of the previous line. */
const SECTION_WORDS = /(?:^|\s)(rx|℞|medication|medications|medicines|prescription|treatment|advice|investigations|doctors? note|follow[- ]?up|next visit|on review|allergies?)\b[:\-]?\s*$/i;

/** Form words. A line whose only "name" is one of these is a continuation, not a drug. */
const FORM_WORDS = new Set(['tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules', 'syr', 'syrup', 'inj', 'injection', 'drop', 'drops', 'cream', 'ointment', 'gel', 'sachet', 'sachets', 'patch', 'inhaler', 'suppository', 'dose', 'qty', 'quantity', 'take', 'after', 'before', 'with', 'empty', 'stomach', 'food', 'meals', 'meal', 'daily', 'day', 'days', 'night', 'morning', 'evening', 'fever', 'pain', 'advice',
  // Frequency abbreviations are not medicine names, however short they are.
  'od', 'bd', 'bid', 'tds', 'tid', 'qid', 'qds', 'hs', 'sos', 'prn', 'qd', 'qhs', 'qam', 'qpm', 'tds', 'times', 'time']);

/** How often. Ordered so the longer phrases are tried before their prefixes. */
const FREQUENCY = [
  [/\b(?:once|one\s+time)\s+(?:a|per|each)\s+day\b|\bonce\s+daily\b|\bOD\b|\bq\.?d\.?\b|\b1\s*(?:times?\s*)?(?:a|\/)\s*day\b/i, 'Once daily'],
  [/\b(?:twice|two\s+times?)\s+(?:a|per|each)\s+day\b|\btwice\s+daily\b|\b(?:BD|BID)\b|\bq\.?b\.?d\.?\b|\b2\s*(?:times?\s*)?(?:a|\/)\s*day\b/i, 'Twice daily'],
  [/\b(?:three\s+times|thrice)\s+(?:a|per|each)\s+day\b|\b(?:TDS|TID)\b|\bq\.?t\.?d\.?\b|\b3\s*(?:times?\s*)?(?:a|\/)\s*day\b/i, 'Thrice daily'],
  [/\b(?:four\s+times)\s+(?:a|per|each)\s+day\b|\b(?:QID|QDS)\b|\b4\s*(?:times?\s*)?(?:a|\/)\s*day\b/i, 'Four times daily'],
  [/\bevery\s+(\d+)\s*hours?\b|\bq\.?\s?(\d+)\s?h\b/i, null, 'hours'],
  [/\b(?:once|one\s+time)\s+(?:a|per|each)\s+week\b|\bonce\s+weekly\b|\bweekly\b/i, 'Once weekly'],
  [/\b(?:twice|two\s+times)\s+(?:a|per|each)\s+week\b|\btwice\s+weekly\b/i, 'Twice weekly'],
  [/\bat\s+bedtime\b|\b(?:HS|q\.?h\.?s\.?)\b|\bat\s+night\b/i, 'At bedtime'],
  [/\b(?:as\s+needed|when\s+required|if\s+required|\bSOS\b|\bPRN\b)\b/i, 'As needed']
];

/** When to take it — useful, but not one of the five columns. */
const TIMING = /\b(?:empty\s+stomach|before\s+(?:food|meals?|breakfast|lunch|dinner)|after\s+(?:food|meals?|breakfast|lunch|dinner)|with\s+(?:food|meals?)|at\s+night|on\s+waking|anytime\s+as\s+required)\b/i;

/** How long. Every pattern captures the number in 1 and the unit in 2. */
const DURATION = [
  /\bfor\s+(\d+)\s*(day|days|wk|week|weeks|mo|month|months|yr|year|years)\b/i,
  /\b[×x*]\s*(\d+)\s*(day|days|wk|week|weeks|mo|month|months|yr|year|years)\b/i,
  /\b(\d+)\s*(day|days|wk|week|weeks|mo|month|months|yr|year|years)\s*(?:course|treatment|regimen)\b/i,
  /\b(\d+)\s*(day|days|wk|week|weeks|mo|month|months|yr|year|years)\b/i
];

/** How much, e.g. "1 tab", "2 capsules", "half a tablet", "5 ml". */
const DOSE_AMOUNT = /\b(\d+\s*\/\s*\d+|\d+|½|half|one|two|three|four|five)\s*(?:a\s+)?(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|tsp|spoonfuls?|sachet|sachets|drop|drops|patch|unit|units|puff|puffs)\b(?:\s+of)?\s*(\d+(?:\.\d+)?)?\b/i;
const DOSE_VOLUME = /\b(\d+(?:\.\d+)?)\s*(ml|mL|tsp|tbsp)\b/i;

const UNIT_LONG = { day: 'day', days: 'days', wk: 'week', week: 'week', weeks: 'weeks', mo: 'month', month: 'month', months: 'months', yr: 'year', year: 'year', years: 'years' };
const UNIT_SHORT = { tabs: 'tab', tablets: 'tab', tab: 'tab', capsules: 'capsule', caps: 'capsule', cap: 'capsule', drops: 'drop', drop: 'drop', tsp: 'tsp', tbsp: 'tbsp', units: 'unit', unit: 'unit', puffs: 'puff', puff: 'puff', sachets: 'sachet', sachet: 'sachet' };
/** English counts: "1 tab" but "2 tabs", "2 capsules". */
const PLURAL = { tab: 'tabs', capsule: 'capsules', drop: 'drops', sachet: 'sachets', unit: 'units', puff: 'puffs' };
const NUMBER_WORDS = { half: '½', one: '1', two: '2', three: '3', four: '4', five: '5' };

/** Strength, with thousands separators kept: "60,000 IU", "5 mg/5 mL". */
const STRENGTH = /\b(\d[\d,]*(?:\.\d+)?)\s*(mg|mcg|µg|g|gm|mL|ml|%|units?|IU|iu|mEq|mmol|mg\/mL)\b/;

/** A drug name is whatever the line calls it; these make a weak name trustworthy. */
const KNOWN_DRUG = /metformin|azithromycin|amoxicillin|clavulan|paracetamol|acetaminophen|ibuprofen|atorvastatin|metoprolol|amlodipine|losartan|valsartan|omeprazole|pantoprazole|ranitidine|ondansetron|salbutamol|montelukast|levothyroxine|thyroxine|sertraline|escitalopram|lorazepam|alprazolam|gabapentin|pregabalin|clopidogrel|aspirin|warfarin|tramadol|diclofenac|celecoxib|nitroglycerin|glyceryl|trinitrate|insulin|glucose|furosemide|hydrochlorothiazide|doxycycline|ciprofloxacin|clindamycin|fluconazole|cetirizine|loratadine|ferrous|folic|calcium|potassium|vitamin|ors|thyroid|hepatitis|typhoid|diabet|migraine|gastritis|cholesterol|cough|anaemia|anemia/i;

// One word, with at most one attached continuation, so "Vitamin D3" survives
// but "ORS 1 sachet" stops at the number.
const NAME_TOKEN = /[A-Za-z][A-Za-z'()-]*(?:\s*[A-Za-z0-9]+)?/g;

/** Split OCR text into candidate lines, keeping their order. */
function medicineLines(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split(/[\n]+|\s*[;|]\s*|\s{6,}/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .map(l => l.replace(SECTION_WORDS, '').trim())
    .filter(Boolean);
}

/** Which of the five fields this line actually states. */
function fieldsIn(line) {
  const found = { dose: '', strength: '', frequency: '', duration: '', timing: '' };
  for (const [re, label, unitWord] of FREQUENCY) {
    const m = line.match(re);
    if (!m) continue;
    if (!label) found.frequency = `Every ${m[1] || m[2]} hours`;
    else found.frequency = label;
    if (unitWord === 'hours' && !label) break;
    break;
  }
  for (const re of DURATION) {
    const m = line.match(re);
    if (m) { found.duration = `${m[1]} ${UNIT_LONG[m[2].toLowerCase()] || m[2].toLowerCase()}`; break; }
  }
  const dose = line.match(DOSE_AMOUNT);
  if (dose) {
    const amount = NUMBER_WORDS[String(dose[1]).toLowerCase()] || String(dose[1]).replace(/\s+/g, '');
    const unit = UNIT_SHORT[dose[2].toLowerCase()] || dose[2].toLowerCase();
    const counted = PLURAL[unit] && amount !== '1' && amount !== '½' ? PLURAL[unit] : unit;
    found.dose = dose[3] ? `${amount} × ${dose[3]} ${counted}` : `${amount} ${counted}`;
  } else {
    const vol = line.match(DOSE_VOLUME);
    if (vol) found.dose = `${vol[1]} ${vol[2]}`;
  }
  const strength = line.match(STRENGTH);
  if (strength) found.strength = `${strength[1]} ${strength[2]}`;
  const timing = line.match(TIMING);
  if (timing) found.timing = timing[0].replace(/\s+/g, ' ').trim();
  return found;
}

/** The drug name: the leading words of the line, cleaned of route, form and number. */
function nameIn(line, hasKnown) {
  let head = line.replace(LEADING, '').replace(/^\s*\d+[.)]\s*/, '').replace(/^\s*(?:rx|℞)\s*[:.]?\s*/i, '');
  // A line that opens with a dose or a strength has no name of its own: it
  // belongs to the drug above it, so cut it off and let the caller attach it.
  for (const re of [STRENGTH, DOSE_AMOUNT, DOSE_VOLUME]) {
    const at = head.search(re);
    if (at >= 0) head = head.slice(0, at);
  }
  const words = (head.match(NAME_TOKEN) || [])
    .map(w => w.replace(/[.,:;()\[\]]/g, '').trim())
    .filter(w => w && !FORM_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));
  if (!words.length) return null;
  // A known drug name can be the whole head; otherwise keep a short run of words.
  const knownAt = words.findIndex(w => KNOWN_DRUG.test(w));
  const take = knownAt >= 0 ? knownAt + 1 : Math.min(words.length, 3);
  const name = words.slice(0, take).join(' ');
  if (name.length < 3) return null;
  if (!hasKnown && !/\s|[A-Z]/.test(name)) return null;
  return name;
}

/**
 * Read a medicine table out of OCR text.
 * @param {string} text
 * @param {{minFields?:number}} [opts] how many fields a line must state to count
 * @returns {{rows:object[], columns:string[], incomplete:number, source:'text'}}
 */
export function extractMedicines(text, opts = {}) {
  const minFields = Number(opts.minFields) || 2;
  const rows = [];
  let last = null;
  for (const line of medicineLines(text)) {
    const f = fieldsIn(line);
    const stated = ['dose', 'strength', 'frequency', 'duration'].filter(k => f[k]).length;
    const hasKnown = KNOWN_DRUG.test(line);
    const name = nameIn(line, hasKnown);
    if (!name) {
      // A dose, strength or duration with no name of its own belongs to the
      // drug above it — OCR very often breaks "500 mg" onto the next line.
      if (last && stated) {
        for (const k of ['strength', 'dose', 'frequency', 'duration', 'timing']) {
          if (f[k] && !last[k]) last[k] = f[k];
        }
        last.line += ` ${line}`;
      }
      continue;
    }
    if (!hasKnown && stated < minFields) continue;
    const row = { ...f, drug: name, line };
    rows.push(row);
    last = row;
  }
  const usable = rows.filter(r => r.strength && (r.dose || r.frequency));
  return {
    columns: ['Medicine', 'Strength', 'Dose', 'How often', 'For how long'],
    rows: rows.map(({ drug, strength, dose, frequency, duration }) => ({ drug, strength, dose, frequency, duration })),
    incomplete: rows.length - usable.length,
    source: 'text'
  };
}

/**
 * The same table as a plain text block, for a slide or a note. A cell the text
 * never stated says "—", which is what the document actually says.
 */
export function medicinesToText(table) {
  if (!table?.rows?.length) return '';
  return [table.columns.join(' | '),
    ...table.rows.map(r => [r.drug, r.strength, r.dose, r.frequency, r.duration].map(v => v || '—').join(' | '))]
    .join('\n');
}

/** A short, human sentence naming what the table could and could not read. */
export function describeMedicines(table) {
  const n = table?.rows?.length || 0;
  if (!n) return 'No medicine lines were recognised in this text.';
  const filled = table.rows.filter(r => r.dose || r.frequency).length;
  return `${n} medicine line${n === 1 ? '' : 's'} read; ${filled} carry a dose or frequency. Blank cells mean the text did not state them.`;
}

export const MED_KNOWN = KNOWN_DRUG;
