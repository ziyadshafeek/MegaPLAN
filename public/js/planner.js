/**
 * MegaPLAN AI Mode — universal planner.
 *
 * This module is deliberately pure: no DOM, no network, no storage, no timers.
 * It turns "any request + any files + any links" into an ordered, executable plan
 * over the whole tool registry plus AI Mode's own built-in capabilities.
 *
 * Design rules
 *  - Deterministic: the same input always yields the same plan (no randomness).
 *  - Universal: every registry tool is addressable through the search index, so a
 *    request is never limited to a handful of scripted recipes.
 *  - Honest: a step is only marked auto-runnable when an executor really exists.
 *    Anything AI Mode cannot do becomes an explicit gap, never a pretend result.
 *
 * Unit-tested in tests/ai-mode-planner.mjs.
 */

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'from', 'by',
  'at', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'me', 'my', 'we', 'you', 'your', 'he', 'she', 'they', 'them', 'do', 'does',
  'did', 'can', 'could', 'would', 'should', 'please', 'kindly', 'now', 'then', 'also', 'into',
  'per', 'each', 'all', 'any', 'some', 'more', 'most', 'using', 'use', 'via', 'about', 'over'
]);

/** Lowercase, strip punctuation, drop stopwords. Keeps numbers and units. */
export function tokens(value) {
  const base = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/[-/]+/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^\.+|\.+$/g, ''))
    .filter(t => t.length > 1 && !STOP.has(t));
  // "sha256" must be able to meet "SHA-256": keep the whole token plus its parts.
  const out = [];
  for (const t of base) {
    out.push(t);
    const m = t.match(/^([a-z+#]{2,})(\d{1,4})$/) || t.match(/^(\d{1,4})([a-z+#]{2,})$/);
    if (m) { if (m[1].length > 1) out.push(m[1]); if (m[2].length > 1) out.push(m[2]); }
  }
  return out;
}

/**
 * User wording → words that actually appear in the registry.
 * Curated on purpose: a synonym that crosses domains (energy→calorie) creates
 * noise, so morphology is handled by stemming instead.
 */
const SYNONYMS = {
  // formats and file kinds
  jpg: ['jpeg', 'image'], jpeg: ['jpg', 'image'], png: ['image'], gif: ['image'], webp: ['image'],
  heic: ['image', 'converter'], avif: ['image'], tiff: ['image'], svg: ['image', 'vector'],
  photo: ['image'], photos: ['image'], picture: ['image'], pictures: ['image'], pic: ['image'],
  mp3: ['audio'], wav: ['audio'], m4a: ['audio'], flac: ['audio'], aac: ['audio'], ogg: ['audio'],
  mp4: ['video'], mov: ['video'], mkv: ['video'], avi: ['video'], webm: ['video'],
  doc: ['word', 'document'], docx: ['word', 'document'], xls: ['excel', 'sheet'], xlsx: ['excel', 'sheet'],
  ppt: ['powerpoint', 'presentation'], pptx: ['powerpoint', 'presentation'],
  md: ['markdown'], txt: ['text'], csv: ['sheet', 'table'], json: ['data'],
  // operations
  compress: ['compressor', 'reduce', 'shrink', 'optimizer'], shrink: ['compress', 'reduce'],
  size: ['filesize', 'bytes'], big: ['size', 'filesize'], filesize: ['size', 'bytes'], bytes: ['size'],
  resize: ['resizer', 'dimensions', 'scale'], crop: ['cropper'], trim: ['trimmer', 'cut'],
  merge: ['merger', 'combine', 'join'], combine: ['merge', 'join'], join: ['merge'],
  split: ['splitter', 'divide', 'separator', 'cut'], divide: ['split'], separate: ['split'], cut: ['split', 'trim', 'trimmer'],
  convert: ['converter', 'conversion'], extract: ['extractor', 'extraction'],
  remove: ['remover', 'delete', 'strip'], delete: ['remove'], clean: ['cleaner', 'cleanup'],
  count: ['counter'], calculate: ['calculator', 'compute'], compute: ['calculator'],
  generate: ['generator'], generator: ['generate'], create: ['maker'], maker: ['create'],
  format: ['formatter', 'beautify'], formatter: ['format'], validate: ['validator', 'checker'],
  check: ['checker', 'inspect'], inspect: ['inspector', 'viewer'], viewer: ['preview'],
  encode: ['encoder'], decode: ['decoder'], summarize: ['summarizer', 'summary'],
  summary: ['summarizer', 'abstract'], summarise: ['summarizer', 'summary'],
  translate: ['translation', 'translator'], transcribe: ['transcript', 'speech'],
  transcript: ['transcribe', 'captions', 'subtitles'], subtitles: ['subtitle', 'srt', 'vtt'],
  captions: ['subtitle', 'srt', 'vtt'], ocr: ['scan', 'scanned', 'recognize'],
  scan: ['ocr', 'scanned'], scanned: ['ocr'], rename: ['filename', 'name', 'renamer'], renamer: ['rename', 'filename'],
  smaller: ['compress', 'reduce', 'shrink', 'resize'], bigger: ['upscale', 'resize', 'enlarge'],
  larger: ['upscale', 'resize'], lower: ['reduce', 'compress'], higher: ['upscale'],
  old: ['age'], older: ['age'], born: ['age', 'birthday', 'dob'], dob: ['age', 'birthday'],
  birthday: ['age', 'dob'], months: ['month'], weekly: ['week'], monthly: ['month'],
  yearly: ['year'], annual: ['year'], daily: ['day'],
  sort: ['sorter', 'order'], dedupe: ['deduplicator', 'duplicate'], deduplicate: ['deduplicator'],
  duplicate: ['deduplicator'], compare: ['diff', 'difference'], diff: ['compare'],
  encrypt: ['hash', 'secure'], hash: ['checksum', 'digest'], checksum: ['hash', 'manifest'],
  watermark: ['stamp'], sign: ['signature'], signature: ['sign'], mask: ['masking', 'redact'],
  redact: ['mask', 'blackout'], anonymize: ['anonymizer', 'mask'], anonymise: ['anonymizer'],
  rotate: ['rotation', 'flip'], flip: ['rotate', 'mirror'], reverse: ['flip', 'backwards'],
  // domains
  pdf: ['document'], document: ['pdf'], ebook: ['epub', 'book'], book: ['ebook', 'library'],
  books: ['library', 'ebook'], library: ['books'],
  youtube: ['video', 'playlist'], video: ['youtube'], playlist: ['youtube', 'videos'],
  audio: ['sound', 'voice'], sound: ['audio'], voice: ['audio', 'speech'], speech: ['voice', 'text'],
  music: ['song', 'audio', 'track'], song: ['music', 'track'], track: ['music', 'song'],
  map: ['maps', 'location', 'place'], maps: ['map', 'location'], location: ['map', 'place'],
  place: ['places', 'location'], places: ['place', 'location'], nearby: ['around', 'near'],
  route: ['routing', 'directions'], directions: ['route'], distance: ['route', 'between'],
  geocode: ['geocoding', 'location'], address: ['location', 'place'],
  wikipedia: ['wiki', 'encyclopedia', 'article'], wiki: ['wikipedia'], article: ['wikipedia', 'page'],
  research: ['search', 'sources', 'study'], search: ['find', 'lookup'], find: ['search'],
  lookup: ['search', 'interface'], directory: ['index', 'listing'],
  presentation: ['pptx', 'slides', 'deck', 'powerpoint'], slides: ['presentation'],
  slide: ['presentation', 'slides'], deck: ['presentation'], powerpoint: ['presentation', 'pptx'],
  invoice: ['billing', 'bill', 'quotation'], bill: ['invoice'], quotation: ['quote', 'invoice'],
  receipt: ['invoice', 'payment'], payslip: ['salary', 'payroll'], salary: ['payslip', 'payroll'],
  payroll: ['salary', 'payslip'], resume: ['cv'], cv: ['resume'],
  gst: ['tax', 'india'], tax: ['gst', 'tds'], emi: ['loan'], loan: ['emi', 'interest'],
  weather: ['forecast'], forecast: ['weather'],
  password: ['passphrase', 'strength'], passphrase: ['password'], privacy: ['private', 'pii'],
  pii: ['privacy', 'mask'], qr: ['barcode'], barcode: ['qr', 'label'], label: ['barcode', 'shipping'],
  username: ['handle', 'profile'], instagram: ['social', 'profile'], social: ['profile', 'username'],
  dns: ['domain'], domain: ['dns', 'whois', 'url'], url: ['link', 'uri'], link: ['url'],
  website: ['url', 'web'], ip: ['address', 'network'], asn: ['ip', 'network'],
  tls: ['certificate', 'ssl'], ssl: ['certificate', 'tls'], certificate: ['tls', 'ssl'],
  headers: ['http', 'header'], http: ['headers'], redirect: ['redirects', 'chain'],
  sitemap: ['robots', 'seo'], robots: ['sitemap'], seo: ['meta', 'search'],
  metadata: ['exif', 'properties'], exif: ['metadata'],
  json2: [], yaml: ['xml'], xml: ['yaml'], sql: ['query', 'database'],
  regex: ['pattern'], cron: ['schedule'], uuid: ['guid', 'identifier'],
  timestamp: ['epoch', 'unix'], epoch: ['timestamp', 'unix'], unix: ['timestamp', 'epoch'],
  base64: ['encode', 'decode'], jwt: ['token', 'decode'], semver: ['version'],
  cidr: ['subnet', 'ip'], subnet: ['cidr', 'ip'], mime: ['type'],
  color: ['colour', 'palette', 'hex'], colour: ['color'], palette: ['color', 'colors'],
  gradient: ['color'], css: ['style', 'web'], html: ['web', 'page'], meta: ['tag', 'seo'],
  favicon: ['icon'], manifest: ['web'],
  game: ['games'], games: ['game'], chess: ['game'], snake: ['game'], tetris: ['game'],
  minesweeper: ['game'], sudoku: ['puzzle', 'game'], puzzle: ['game'],
  timer: ['stopwatch', 'countdown', 'pomodoro'], stopwatch: ['timer'], countdown: ['timer'],
  pomodoro: ['timer', 'focus'], calendar: ['date', 'planner'], timetable: ['schedule', 'table'],
  schedule: ['timetable', 'planner'], planner: ['plan'], plan: ['planner'],
  habit: ['tracker'], tracker: ['track', 'log'], checklist: ['check', 'list'],
  note: ['notes'], notes: ['note', 'study'], flashcard: ['flashcards', 'study'],
  flashcards: ['flashcard'], quiz: ['mcq', 'exam'], exam: ['question', 'quiz'],
  question: ['exam', 'quiz'], study: ['notes', 'exam'], guide: ['study', 'notes'],
  citation: ['reference', 'bibliography'], reference: ['citation'], apa: ['citation'],
  mla: ['citation'], chicago: ['citation'], bibliography: ['citation'],
  grade: ['cgpa', 'marks'], cgpa: ['gpa', 'grade'], gpa: ['cgpa'], marks: ['percentage', 'grade'],
  percentage: ['percent', 'marks'], bmi: ['body', 'weight'], bsa: ['body'],
  calorie: ['calories', 'energy'], calories: ['calorie'],
  age: ['birthday', 'dob'], birthday: ['age'], timezone: ['time', 'zone'],
  currency: ['exchange', 'money'], money: ['currency', 'finance'], price: ['cost', 'pricing'],
  cost: ['price', 'expense'], expense: ['expenses', 'budget'], budget: ['money', 'expense'],
  profit: ['margin', 'roi'], margin: ['markup', 'profit'], markup: ['margin'],
  discount: ['sale', 'offer'], tip: ['bill'], vat: ['tax', 'sales'], sales: ['vat', 'tax'],
  roi: ['return', 'roas'], roas: ['roi', 'ads'], utm: ['marketing', 'tracking'],
  inventory: ['stock', 'sku'], stock: ['inventory'], sku: ['inventory', 'product'],
  product: ['products', 'item'], products: ['product'], shipping: ['shipment', 'delivery'],
  shipping2: [], meeting: ['agenda', 'minutes'], agenda: ['meeting'], minutes: ['meeting'],
  task: ['tasks', 'todo'], tasks: ['task'], todo: ['task', 'checklist'],
  team: ['teams', 'group'], teams: ['team'], dice: ['random', 'roller'], coin: ['flip', 'random'],
  random: ['picker', 'shuffle'], picker: ['random', 'choose'], wheel: ['decision', 'random'],
  lorem: ['placeholder', 'dummy'], placeholder: ['lorem', 'dummy'],
  palindrome: ['anagram'], anagram: ['palindrome'], typing: ['keyboard', 'speed'],
  keyboard: ['typing'], screen: ['display', 'resolution'], resolution: ['screen'],
  browser: ['web', 'feature'], network: ['speed', 'ip'],
  ruler: ['printable', 'measure'], printable: ['print', 'paper'], print: ['printable', 'paper'],
  a4: ['paper', 'page'], paper: ['a4', 'page'], papers: ['paper'],
  file: ['files'], files: ['file'], folder: ['directory', 'tree'], tree: ['folder', 'structure'],
  filename: ['filenames', 'name'], filenames: ['filename'],
  batch: ['bulk'], bulk: ['batch'], multiple: ['batch', 'bulk'],
  word: ['words', 'text'], words: ['word'], character: ['characters', 'char'],
  characters: ['character'], sentence: ['sentences'], sentences: ['sentence'],
  paragraph: ['paragraphs'], paragraphs: ['paragraph'], line: ['lines', 'rows'],
  lines: ['line'], row: ['rows', 'line'], rows: ['row'], column: ['columns'],
  columns: ['column'], table: ['grid', 'csv'], list: ['lists', 'lines'],
  case: ['uppercase', 'lowercase'], uppercase: ['case', 'caps'], lowercase: ['case'],
  whitespace: ['spaces', 'trim'], slug: ['permalink', 'url'],
  email: ['mail', 'message'], mail: ['email'], letter: ['letterhead'],
  letterhead: ['letter', 'business'], proposal: ['quote', 'business'],
  business: ['company', 'office'], company: ['business'], card: ['cards', 'business'],
  cards: ['card'], timesheet: ['attendance', 'hours'], attendance: ['timesheet'],
  purchase: ['order', 'procurement'], order: ['purchase'],
  credit: ['debit', 'note'], debit: ['credit', 'note'], challan: ['delivery', 'india'],
  packing: ['shipping', 'delivery'], proforma: ['invoice'],
  pettypetty: [], grammar: ['spelling', 'proofread'], spelling: ['grammar'],
  proofread: ['grammar', 'edit'], rewrite: ['rewriter', 'paraphrase'], paraphrase: ['rewrite'],
  cleaner: ['clean'], text2: [], statistics: ['stats'], stats: ['statistics'],
  reading: ['read'], read: ['reading', 'ocr'],
  abstract: ['summary'], keypoints: ['points', 'key'], points: ['keypoints'],
  entities: ['entity'], entity: ['entities'], classifier: ['classify'], classify: ['classifier'],
  extractor: ['extract'], lecture: ['notes', 'study'], meeting2: [],
  assistant: ['ai', 'helper'], agent: ['assistant', 'ai'], ai: ['assistant', 'agent'],
  smart: ['ai'], inception: ['ai'], self: ['byok'],
  osint: ['public', 'intel'], public: ['osint', 'data'],
  whois: ['domain'], exif2: [], hex2: [], binary: ['hex', 'bytes'],
  bytes: ['byte', 'binary'], byte: ['bytes'], size: ['sizes', 'file'],
  sizes: ['size'], dimension: ['dimensions'], dimensions: ['dimension'],
  dpi: ['dpi', 'resolution'], iso: [],
  upi: ['qr', 'payment'], payment: ['upi', 'receipt'],
  indian: ['india'], india: ['indian', 'gst'], gstin: ['gst', 'india'],
  pan: ['india', 'tax'], aadhaar: ['india', 'masking'], ifsc: ['bank', 'india'],
  pincode: ['postal', 'zip'], postal: ['pincode'], lakh: ['crore'], crore: ['lakh'],
  vehicle: ['number', 'registration'], number: ['numbers', 'format'],
  numbers: ['number'], formatter: ['format'], interface: ['viewer', 'lookup'],
  helper: ['tool', 'utility'], tool: ['tools', 'utility'], tools: ['tool'],
  utility: ['tool', 'helper'], generator2: [], converter2: [], calculator2: [],
  hospital: ['hospitals', 'clinic'], hospitals: ['hospital'], clinic: ['hospital', 'health'],
  cafe: ['cafes', 'restaurant'], cafes: ['cafe'], restaurant: ['restaurants', 'cafe'],
  restaurants: ['restaurant'], hotel: ['hotels'], hotels: ['hotel'],
  school: ['schools'], schools: ['school'], college: ['colleges'], colleges: ['college'],
  bank: ['banks', 'atm'], banks: ['bank'], atm: ['atms', 'bank'], atms: ['atm'],
  pharmacy: ['pharmacies', 'medical'], pharmacies: ['pharmacy'],
  park: ['parks'], parks: ['park'], petrol: ['fuel', 'pump'], station: ['stations'],
  stations: ['station'], airport: ['airports'], airports: ['airport'],
  temple: ['temples'], temples: ['temple'], church: ['churches'], churches: ['church'],
  mosque: ['mosques'], mosques: ['mosque'], shop: ['shops', 'store'], shops: ['shop'],
  store: ['shop', 'stores'], stores: ['store'], mall: ['malls'], malls: ['mall'],
  gym: ['gyms', 'fitness'], gyms: ['gym'], salon: ['salons', 'beauty'], salons: ['salon'],
  bakery: ['bakeries'], supermarket: ['supermarkets', 'shop'], library2: [],
  kochi: ['cochin'], cochin: ['kochi'], trivandrum: ['thiruvananthapuram'],
  thiruvananthapuram: ['trivandrum'], kerala: ['trivandrum', 'kochi'],
  bangalore: ['bengaluru'], bengaluru: ['bangalore'], calicut: ['kozhikode'], kozhikode: ['calicut'],
  alleppey: ['alappuzha'], alappuzha: ['alleppey']
};

/** Very light stemming so plurals and agent nouns match ("words"→"word"). */
export function stem(token) {
  const t = String(token || '').toLowerCase();
  if (t.length <= 3) return t;
  if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y';
  if (t.endsWith('sses')) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

/** Expand user wording with registry wording (one hop, no recursion loops). */
export function expandTokens(list) {
  const out = new Set(list);
  for (const t of list) for (const s of SYNONYMS[t] || []) out.add(s);
  return [...out];
}

/* ------------------------------------------------------------------ *
 * Word classes — the difference between "what to do" and "what about"
 * ------------------------------------------------------------------ */

/** Verbs that actually discriminate between tools. Generic ones are excluded. */
const SPECIFIC_VERBS = [
  'convert', 'compress', 'split', 'merge', 'combine', 'extract', 'resize', 'crop', 'rotate', 'flip',
  'trim', 'cut', 'join', 'stitch', 'count', 'calculate', 'compute', 'format', 'minify', 'beautify',
  'validate', 'verify', 'encode', 'decode', 'encrypt', 'hash', 'rename', 'sort', 'deduplicate',
  'dedupe', 'translate', 'summarize', 'summarise', 'paraphrase', 'rewrite', 'proofread', 'transcribe',
  'ocr', 'scan', 'sign', 'redact', 'watermark', 'annotate', 'bookmark', 'impose', 'normalize',
  'normalise', 'mask', 'anonymize', 'anonymise', 'clean', 'repair', 'optimize', 'optimise', 'shrink',
  'upscale', 'blur', 'sharpen', 'pixelate', 'invert', 'transpose', 'pivot', 'compare', 'diff',
  'inspect', 'lookup', 'geocode', 'route', 'navigate', 'measure', 'estimate', 'amortize', 'preview',
  'print', 'download', 'export', 'import', 'upload', 'merge', 'batch', 'shuffle', 'reverse', 'number',
  'slugify', 'escape', 'unescape', 'parse', 'serialize', 'quantize', 'remove', 'delete', 'add',
  'insert', 'replace', 'hide', 'show', 'fix', 'change', 'adjust', 'align', 'attach', 'embed',
  'flatten', 'strip', 'purge', 'filter', 'group', 'ungroup', 'label', 'tag', 'rate', 'rank',
  'fetch', 'read', 'write', 'render', 'draw', 'plot', 'chart', 'graph', 'map', 'locate', 'search'
];
const GENERIC_VERBS = ['make', 'create', 'generate', 'build', 'produce', 'prepare', 'give', 'get', 'do', 'use', 'find', 'show', 'list', 'write', 'need', 'want', 'please', 'run', 'start', 'open', 'search', 'check', 'tell', 'help', 'turn', 'change',
  // Operations that name a subject but are not the subject itself: "research Kerala", not "research kerala".
  'research', 'analyse', 'analyze', 'summarise', 'summarize', 'explain', 'describe', 'compare',
  'translate', 'extract', 'explore', 'investigate', 'collect', 'gather', 'brief'];
const FORMAT_WORDS = [
  'pdf', 'csv', 'tsv', 'json', 'jsonl', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'md',
  'markdown', 'html', 'css', 'xml', 'yaml', 'yml', 'epub', 'zip', 'rar', '7z', 'srt', 'vtt', 'jpg',
  'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'tiff', 'svg', 'ico', 'bmp', 'mp3', 'wav', 'm4a',
  'flac', 'ogg', 'opus', 'aac', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'gifv', 'sql', 'rtf', 'odt',
  'ods', 'odp', 'numbers', 'key', 'mobi', 'azw3', 'nup', 'a4', 'letter', 'upi', 'qr', 'barcode',
  'base64', 'hex', 'md5', 'sha256', 'sha512', 'jwt', 'uuid', 'regex', 'cron', 'semver', 'cidr'
];
/** Words that mean "a thing in the world", not an operation. Used as subjects. */
const NON_SUBJECTS = new Set([...GENERIC_VERBS, ...SPECIFIC_VERBS, ...FORMAT_WORDS, ...STOP,
  'file', 'files', 'folder', 'data', 'text', 'image', 'images', 'video', 'videos', 'audio', 'sound',
  'document', 'documents', 'page', 'pages', 'result', 'results', 'output', 'input', 'thing', 'stuff',
  'one', 'two', 'three', 'first', 'second', 'last', 'next', 'new', 'old', 'good', 'best', 'free',
  'online', 'offline', 'here', 'there', 'where', 'when', 'how', 'why', 'what', 'who', 'which',
  'step', 'steps', 'way', 'kind', 'type', 'types', 'lot', 'lots', 'many', 'much', 'very', 'really',
  'website', 'web', 'internet', 'google', 'youtube', 'wiki', 'wikipedia', 'notebooklm', 'gemini',
  'chatgpt', 'ai', 'mode', 'agent', 'tool', 'tools', 'megaplan', 'app', 'application', 'system',
  'per', 'each', 'every', 'both', 'either', 'between', 'after', 'before', 'during', 'while',
  'year', 'years', 'month', 'months', 'week', 'weeks', 'day', 'days', 'hour', 'minute', 'second',
  'km', 'kms', 'kilometres', 'kilometers', 'miles', 'minutes', 'hours', 'days', 'seconds', 'metres',
  'meters', 'feet', 'inch', 'inches', 'cm', 'mm', 'kg', 'grams', 'litres', 'liters', 'gb', 'mb', 'tb',
  'rupees', 'rs', 'inr', 'usd', 'eur', 'percent', 'percentage', 'px', 'rem', 'em', 'vh', 'vw',
  'hz', 'khz', 'dpi', 'ppm', 'bit', 'bits', 'pixel', 'pixels', 'unit', 'units', 'value', 'values',
  'big', 'small', 'large', 'tiny', 'huge',
  // Deliverable nouns. "with sources" asks for citations, it does not ask about sources.
  'source', 'sources', 'citation', 'citations', 'reference', 'references', 'bibliography'
]);

/**
 * Work-material nouns. "question paper textbook notes" describes a task, not a
 * subject to research, so it must never become a Wikipedia query.
 */
const TASK_NOUNS = new Set(['question', 'paper', 'textbook', 'note', 'essay', 'resume', 'cv',
  'letter', 'email', 'invoice', 'item', 'receipt', 'scan', 'assignment', 'homework', 'syllabus',
  'chapter', 'lecture', 'class', 'exam', 'sheet', 'form', 'contract', 'agreement', 'post',
  'caption', 'comment', 'review', 'weather', 'tomorrow', 'today', 'tonight', 'tax', 'salary',
  'rent', 'bill', 'order', 'product', 'image', 'photo', 'video', 'song', 'audio', 'file',
  'page', 'slide', 'deck', 'code', 'script', 'error', 'bug', 'log', 'data', 'dataset',
  'table', 'row', 'column', 'list', 'name', 'number', 'url', 'link', 'password', 'username',
  'document', 'report', 'folder', 'directory', 'template', 'sample', 'example', 'test',
  'result', 'output', 'input', 'content', 'text', 'paragraph', 'sentence', 'word',
  'character', 'line', 'column', 'value', 'field', 'record', 'entry', 'batch', 'set',
  'emi', 'monthly', 'yearly', 'annual', 'old', 'born', 'age', 'year', 'month', 'week',
  'today', 'tomorrow', 'yesterday', 'loan', 'interest', 'salary', 'tax', 'gst', 'profit',
  'loss', 'total', 'average', 'sum', 'count', 'size', 'weight', 'height', 'length',
  'video', 'videos', 'youtube', 'playlist', 'channel', 'caption', 'subtitle', 'qr',
  'palette', 'website', 'profile', 'account', 'payment', 'leave', 'silence',
  // Study-work nouns. "make notes and revision questions" operates on the material you
  // attach; it is not a request to research "revision questions".
  'revision', 'revisions', 'revision_note', 'revision_notes', 'recap', 'recaps',
  'digest', 'summary', 'summaries', 'tldr', 'key_point', 'key_points', 'takeaway', 'takeaways']);

const CONV_WORDS = new Set([...FORMAT_WORDS, 'word', 'excel', 'powerpoint', 'text', 'image', 'images',
  'audio', 'video', 'document', 'markdown', 'html', 'pdf', 'csv', 'json', 'yaml', 'xml', 'epub']);

/** Detect "X to Y" conversions so the plan keeps the direction the user asked for. */
export function detectConversion(prompt) {
  const text = String(prompt || '').toLowerCase();
  const norm = w => {
    if (!w) return null;
    const st = stem(w);
    if (FORMAT_WORDS.includes(w)) return w;
    if (FORMAT_WORDS.includes(st)) return st;
    if (CONV_WORDS.has(w)) return w;
    if (CONV_WORDS.has(st)) return st;
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if ((key === w || key === st) && syns.some(x => CONV_WORDS.has(x) || FORMAT_WORDS.includes(x))) {
        return syns.find(x => FORMAT_WORDS.includes(x)) || syns.find(x => CONV_WORDS.has(x));
      }
    }
    return null;
  };
  const pairs = text.matchAll(/\b([a-z0-9+#]{2,14})(?:\s+(?:file|files|document|documents|format))?\s+(?:to|into|2)\s+(?:an?\s+)?([a-z0-9+#]{2,14})\b/gi);
  for (const m of pairs) {
    const from = norm(m[1]), to = norm(m[2]);
    if (from && to && from !== to) return { from, to };
  }
  const lone = text.match(/\b(?:to|into|as)\s+(?:an?\s+)?([a-z0-9+#]{2,14})\b/);
  if (lone) {
    const to = norm(lone[1]);
    if (to) return { from: null, to };
  }
  return null;
}

/** Split a request into operation verbs, formats and real subjects. */
export function splitRequest(prompt) {
  const list = tokens(prompt);
  const verbs = [], formats = [], subjects = [];
  for (const t of list) {
    const direct = new Set(list);
    const st = stem(t);
    if (FORMAT_WORDS.includes(t)) { formats.push(t); continue; }
    if (FORMAT_WORDS.includes(st)) { formats.push(st); continue; }
    if (SPECIFIC_VERBS.includes(t)) { verbs.push(t); continue; }
    if (SPECIFIC_VERBS.includes(st)) { verbs.push(st); continue; }
    // "compressor"/"converter"/"splitter" style nouns carry the operation too.
    const stemmed = t.replace(/(?:or|er|ers|ors|ion|ing|s)$/, '');
    if (stemmed.length > 3 && SPECIFIC_VERBS.some(v => v === stemmed || v.startsWith(stemmed) || stemmed.startsWith(v))) {
      verbs.push(SPECIFIC_VERBS.includes(stemmed) ? stemmed : SPECIFIC_VERBS.find(v => v === stemmed || v.startsWith(stemmed) || stemmed.startsWith(v)));
      continue;
    }
    if (GENERIC_VERBS.includes(t)) continue;
    if (NON_SUBJECTS.has(t)) continue;
    if (t.length < 3) continue;                                     // "mp" from mp3, "sha" from sha256
    if (/^\d/.test(t)) continue;                                  // 800px, 2km, 1080p
    if (/\d/.test(t) && /(px|kb|mb|gb|tb|kg|cm|mm|ml|km|in|ft|hz|dpi|p)$/i.test(t)) continue;
    if (!direct.size) continue;
    subjects.push(t);
  }
  return {
    verbs: [...new Set(verbs)],
    formats: [...new Set(formats)],
    subjects: [...new Set(subjects)],
    generic: [...new Set(list.filter(t => GENERIC_VERBS.includes(t)))]
  };
}

/* ------------------------------------------------------------------ *
 * Registry index (universal tool matching)
 * ------------------------------------------------------------------ */

export function buildIndex(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const docs = list.map(tool => {
    const title = tokens(tool.title);
    const slug = tokens(String(tool.slug || '').replace(/-/g, ' '));
    const category = tokens(tool.category);
    const description = tokens(tool.description);
    const expanded = expandTokens([...new Set([...title, ...slug, ...category])]);
    return { tool, title, slug, category, description, expanded, norm: normTitle(tool.title) };
  });
  const df = new Map();
  for (const doc of docs) {
    for (const t of new Set([...doc.title, ...doc.slug, ...doc.category, ...doc.description, ...doc.expanded])) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  const N = Math.max(1, docs.length);
  const idf = t => Math.log(1 + N / Math.max(1, df.get(t) || 0));
  const bySlug = new Map(docs.map(d => [String(d.tool.slug), d]));
  const byTitle = new Map(docs.map(d => [d.norm, d]));
  return { docs, idf, bySlug, byTitle, size: docs.length };
}

export function normTitle(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Score every registry tool against a query.
 * Returns [{ tool, score, matched }] sorted by score, highest first.
 */
export function searchTools(index, query, { limit = 12, minScore = 1.2 } = {}) {
  if (!index || !index.docs.length) return [];
  const qRaw = tokens(query);
  if (!qRaw.length) return [];
  const q = expandTokens(qRaw);
  const qSet = new Set(q);
  const norm = normTitle(query);
  const scored = [];
  for (const doc of index.docs) {
    let score = 0;
    const matched = [];
    if (norm && doc.norm === norm) score += 500;
    else if (norm.length > 3 && (doc.norm.includes(norm) || norm.includes(doc.norm))) score += 120 + norm.length;
    const titleSet = new Set([...doc.title, ...doc.title.map(stem)]);
    const slugSet = new Set([...doc.slug, ...doc.slug.map(stem)]);
    const catSet = new Set([...doc.category, ...doc.category.map(stem)]);
    const descSet = new Set(doc.description);
    const expSet = new Set(doc.expanded);
    let hits = 0;
    for (const t of qSet) {
      const idf = index.idf(t) || 1;
      const ts = stem(t);
      let w = 0;
      if (titleSet.has(t) || titleSet.has(ts)) { w = 9 * idf; matched.push(t); }
      else if (slugSet.has(t) || slugSet.has(ts)) { w = 7 * idf; matched.push(t); }
      else if (expSet.has(t) || expSet.has(ts)) { w = 5.5 * idf; matched.push(t); }
      else if (catSet.has(t) || catSet.has(ts)) { w = 3.2 * idf; }
      else if (descSet.has(t)) { w = 1.6 * idf; }
      if (w) { score += w; hits++; }
    }
    // Reward covering the whole query, punish single-word noise matches.
    const direct = qRaw.filter(t => titleSet.has(t) || slugSet.has(t)).length;
    if (direct) score *= 1 + 0.35 * (direct / qRaw.length);
    if (hits === 1 && qRaw.length > 2) score *= 0.55;
    if (doc.tool.status === 'live') score *= 1.06;
    if (score >= minScore) scored.push({ tool: doc.tool, score: Math.round(score * 100) / 100, matched: [...new Set(matched)] });
  }
  scored.sort((a, b) => b.score - a.score || String(a.tool.title).localeCompare(String(b.tool.title)));
  return scored.slice(0, limit);
}

const FORMAT_CATEGORY = {
  jpg: 'Images', jpeg: 'Images', png: 'Images', gif: 'Images', webp: 'Images', avif: 'Images',
  heic: 'Images', tiff: 'Images', svg: 'Images', ico: 'Images', bmp: 'Images',
  mp3: 'Audio', wav: 'Audio', m4a: 'Audio', flac: 'Audio', ogg: 'Audio', opus: 'Audio', aac: 'Audio',
  mp4: 'Video', mov: 'Video', mkv: 'Video', avi: 'Video', webm: 'Video',
  pdf: 'PDF', csv: 'Files & Data', tsv: 'Files & Data', xlsx: 'Files & Data', xls: 'Files & Data',
  json: 'Developer', xml: 'Developer', yaml: 'Developer', yml: 'Developer', sql: 'Developer',
  docx: 'Business', doc: 'Business', pptx: 'Business', ppt: 'Business', epub: 'Education',
  srt: 'Video', vtt: 'Video', zip: 'Files & Data', md: 'Text', markdown: 'Text', txt: 'Text', html: 'Design & Web'
};

/**
 * Universal tool ranking for a normalised request.
 * Operations matter most (the user's verb), then the file/format object, then the subject.
 * Pure noise matches are pushed below the threshold instead of filling the plan.
 */
export function rankTools(index, ctx, { limit = 24 } = {}) {
  const query = ctx.prompt || ctx.topic || '';
  const base = searchTools(index, query, { limit: Math.max(limit * 2, 40), minScore: 0.5 });
  const verbs = new Set(ctx.verbs), formats = new Set(ctx.formats), subjects = new Set(ctx.subjects);
  const want = verbs.size + formats.size;
  const out = [];
  for (const m of base) {
    const rawTitle = [...tokens(m.tool.title), ...tokens(String(m.tool.slug || '').replace(/-/g, ' '))];
    const title = new Set([...rawTitle, ...rawTitle.map(stem)]);
    const cat = new Set(tokens(m.tool.category).flatMap(t => [t, stem(t)]));
    const expanded = new Set(expandTokens(rawTitle));
    const hit = (w) => title.has(w) || title.has(stem(w)) || expanded.has(w) || expanded.has(stem(w)) ||
      (SYNONYMS[w] || []).some(syn => title.has(syn) || title.has(stem(syn)));
    let verbHits = 0, formatHits = 0, subjectHits = 0;
    for (const w of verbs) if (hit(w)) verbHits++;
    for (const w of formats) if (title.has(w) || expanded.has(w) || expanded.has(stem(w))) formatHits++;
    for (const w of subjects) if (title.has(w) || title.has(stem(w)) || cat.has(w)) subjectHits++;
    let score = m.score;
    score += verbHits * 16 + formatHits * 8 + subjectHits * 22;
    if (subjects.size && subjectHits === subjects.size) score *= 1.8;   // covers the whole subject
    if (want) score *= 1 + 0.45 * ((verbHits + formatHits) / want);
    if (want && verbHits + formatHits === 0) score *= 0.28;            // noise
    if (verbs.size && verbHits === 0) score *= 0.4;                    // ignores the operation asked for
    if (!want && subjectHits === 0) score *= 0.05;                     // nothing in common at all
    if (subjects.size && subjectHits === 0) score *= 0.6;              // ignores what it is about
    const wantCats = new Set([...formats].map(f => FORMAT_CATEGORY[f]).filter(Boolean));
    if (wantCats.size) score *= wantCats.has(m.tool.category) ? 1.5 : 0.55;
    if (ctx.aboutDocument && !DOCUMENT_CATEGORIES.has(m.tool.category)) score *= 0.15;
    if (ctx.conversion && ctx.conversion.to) {
      const tname = String(m.tool.title).toLowerCase();
      const { from, to } = ctx.conversion;
      const hasTo = tname.includes(String(to));
      const hasFrom = from && tname.includes(String(from));
      const forward = hasTo && (!from || (hasFrom && tname.indexOf(from) < tname.indexOf(to)));
      const backward = from && hasFrom && hasTo && tname.indexOf(to) < tname.indexOf(from);
      if (forward) score *= 2.2;
      else if (backward) score *= 0.3;
    }
    if (m.tool.status === 'catalogued') score *= 0.7;                 // unimplemented runners last
    if (m.tool.status === 'beta') score *= 0.92;
    out.push({ ...m, score: Math.round(score * 100) / 100, verbHits, formatHits, subjectHits });
  }
  out.sort((a, b) => {
    if (Math.abs(b.score - a.score) > Math.max(6, b.score * 0.12)) return b.score - a.score;
    const la = tokens(a.tool.title).length, lb = tokens(b.tool.title).length;
    if (la !== lb) return la - lb;                                  // focused titles first
    return b.score - a.score || String(a.tool.title).localeCompare(String(b.tool.title));
  });
  return out.slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Request normalisation
 * ------------------------------------------------------------------ */

export function fileKind(file) {
  const name = String(file?.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  const type = String(file?.type || '').toLowerCase();
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('image/') || /^(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif|svg|ico|raw|cr2|nef|arw)$/i.test(ext)) return 'image';
  if (type.startsWith('audio/') || /^(mp3|wav|m4a|aac|flac|ogg|opus|aiff?|wma|mid|midi|amr)$/i.test(ext)) return 'audio';
  if (type.startsWith('video/') || /^(mp4|mov|mkv|avi|webm|m4v|flv|wmv|3gp|mpg|mpeg)$/i.test(ext)) return 'video';
  if (type === 'text/csv' || /^(csv|tsv)$/i.test(ext)) return 'csv';
  if (type === 'application/json' || ext === 'json' || ext === 'jsonl' || ext === 'ndjson') return 'json';
  if (/^(xlsx?|xlsm|numbers|ods)$/i.test(ext)) return 'sheet';
  if (/^(docx?|odt|rtf|txt|md|markdown|srt|vtt|ass|log|tex|html?|xml|ya?ml|css|js|mjs|ts|py|java|c|cpp|go|rs|rb|php|sh|sql)$/i.test(ext) || type.startsWith('text/')) return 'text';
  if (/^(zip|rar|7z|tar|gz|bz2|xz)$/i.test(ext)) return 'archive';
  if (/^(pptx?|odp|key)$/i.test(ext)) return 'slides';
  if (/^(epub|mobi|azw3?)$/i.test(ext)) return 'ebook';
  return 'other';
}

export function linkKind(url) {
  const s = String(url || '');
  let host = '';
  try { host = new URL(s).hostname.toLowerCase(); } catch { host = s.toLowerCase(); }
  if (/youtu\.be|youtube\.com|youtube-nocookie\.com/.test(host) || /^@[A-Za-z0-9_-]{6,}$/.test(s.trim())) return 'youtube';
  if (/vimeo\.com/.test(host)) return 'vimeo';
  if (/^(https?:\/\/|\w+\.\w)/.test(s)) return 'web';
  return 'other';
}

const NOISE_WORDS = [
  'please', 'kindly', 'can', 'you', 'could', 'would', 'i', 'want', 'need', 'like', 'to',
  'make', 'makes', 'making', 'create', 'creates', 'creating', 'generate', 'generates',
  'build', 'builds', 'give', 'gives', 'get', 'gets', 'produce', 'produces', 'prepare',
  'download', 'downloads', 'export', 'exports', 'write', 'writes', 'do', 'does', 'run',
  'use', 'uses', 'using', 'via', 'with', 'from', 'the', 'a', 'an', 'me', 'for', 'my',
  'this', 'that', 'it', 'and', 'then', 'after', 'before', 'now', 'also', 'some', 'any',
  'into', 'onto', 'out', 'up', 'of', 'on', 'in', 'at', 'by', 'as', 'be', 'is', 'are',
  'was', 'were', 'am', 'have', 'has', 'had', 'will', 'shall', 'should', 'must'
];
const TOPIC_NOISE_WORDS = [
  'pdf', 'pdfs', 'ppt', 'pptx', 'powerpoint', 'presentation', 'slides', 'slide', 'deck',
  'doc', 'docx', 'word', 'document', 'documents', 'file', 'files', 'text', 'txt',
  'csv', 'json', 'xlsx', 'excel', 'sheet', 'mp3', 'wav', 'audio', 'video', 'mp4',
  'image', 'images', 'png', 'jpg', 'jpeg', 'zip', 'epub', 'markdown', 'md', 'html',
  'report', 'reports', 'notes', 'note', 'summary', 'summaries', 'article', 'articles',
  'page', 'pages', 'poster', 'card', 'cards', 'list', 'table', 'chart', 'graph'
];
const SOURCE_PHRASES = [
  /(?:from|on|in|via|using)\s+(?:the\s+)?wikipedia(?:\s+(?:website|site|page|article))?/gi,
  /(?:using|via|through|from)\s+(?:the\s+)?(?:wiki|wikipedia|internet|web|online|google|openverse|osm|openstreetmap)/gi,
  /on\s+(?:the\s+)?(?:internet|web|online)/gi,
  /from\s+(?:the\s+)?(?:web|internet|online|sources?)\b/gi
];

/**
 * Pull the subject out of a free-form request. Returns '' when the request is an
 * operation on a format ("convert csv to json") rather than a subject to research.
 */
export function extractTopic(prompt) {
  const raw = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const quoted = raw.match(/["“”']([^"“”']{3,140})["“”']/);
  if (quoted) return cleanTopic(quoted[1]);
  let work = raw;
  for (const re of SOURCE_PHRASES) work = work.replace(re, ' ');
  work = work.replace(/\bhttps?:\/\/\S+/gi, ' ');
  const aboutMatch = work.match(/\b(?:about|on|regarding|covering|for|of)\s+([a-z0-9][^.!?\n]{2,120})$/i);
  const candidate = aboutMatch ? aboutMatch[1] : work;
  const cleaned = cleanTopic(candidate);
  if (!cleaned) return '';
  // A topic must contain at least one real subject word, otherwise it is just an operation.
  const parts = splitRequest(cleaned);
  const subjectWords = parts.subjects.filter(w => !/^\d/.test(w));
  if (!subjectWords.length) return '';
  if (subjectWords.every(w => TASK_NOUNS.has(stem(w)))) return '';
  // "vitamin D deficiency" \u2014 a lone capital letter inside the subject belongs to it,
  // otherwise the query quietly becomes "vitamin deficiency".
  const glued = [];
  for (const w of subjectWords) {
    const prev = glued[glued.length - 1];
    const pair = prev ? cleaned.match(new RegExp(`\\b${prev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([A-Z])\\s+${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)) : null;
    glued.push(pair ? `${prev} ${pair[1]} ${w}` : w);
  }
  return glued.join(' ').slice(0, 140);
}

function cleanTopic(value) {
  let topic = String(value || '').replace(/\s+/g, ' ').trim();
  topic = topic.replace(/[.!?]+$/g, '').replace(/^(?:and|then|also)\s+/i, '');
  const words = topic.split(' ');
  // Drop leading command/format noise ("make a pdf of X" → "X").
  while (words.length && (NOISE_WORDS.includes(words[0].toLowerCase()) || TOPIC_NOISE_WORDS.includes(words[0].toLowerCase()) || FORMAT_WORDS.includes(words[0].toLowerCase()))) words.shift();
  while (words.length && (NOISE_WORDS.includes(words[words.length - 1].toLowerCase()) || TOPIC_NOISE_WORDS.includes(words[words.length - 1].toLowerCase()) || FORMAT_WORDS.includes(words[words.length - 1].toLowerCase()))) words.pop();
  topic = words.join(' ').replace(/\s+/g, ' ').trim();
  if (topic.length < 2) return '';
  return topic.slice(0, 140);
}

const PLACE_RE = /\b(?:in|at|near|nearby|around|from|to|within)\s+([A-Z][A-Za-z'’.\-]*(?:\s+[A-Z][A-Za-z'’.\-]*){0,3})/;
const KNOWN_PLACES = /\b(?:trivandrum|thiruvananthapuram|kochi|cochin|kozhikode|calicut|kollam|thrissur|kannur|kasaragod|alappuzha|alleppey|palakkad|malappuram|wayanad|idukki|pathanamthitta|kottayam|ernakulam|kerala|chennai|bengaluru|bangalore|mumbai|delhi|hyderabad|kolkata|pune|jaipur|goa|india|london|paris|new york|tokyo|dubai|singapore)\b/i;

/** Best-effort place name for map intents. */
export function extractPlace(prompt) {
  const raw = String(prompt || '');
  const coords = raw.match(/(-?\d{1,3}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/);
  if (coords) return { text: `${coords[1]}, ${coords[2]}`, lat: Number(coords[1]), lng: Number(coords[2]) };
  const m = raw.match(PLACE_RE);
  if (m) {
    const name = m[1].replace(/[.,]+$/g, '').trim();
    if (name && !/^(?:the|a|an|my|this|that|order|km|minutes|min|hours)$/i.test(name)) return { text: name };
  }
  const known = raw.match(KNOWN_PLACES);
  if (known) return { text: known[0] };
  return null;
}

const LANGUAGES = ['malayalam', 'tamil', 'hindi', 'telugu', 'kannada', 'bengali', 'marathi', 'gujarati', 'punjabi', 'urdu', 'english', 'spanish', 'french', 'german', 'portuguese', 'russian', 'arabic', 'chinese', 'japanese', 'korean', 'italian', 'dutch', 'turkish', 'indonesian', 'sanskrit'];
export function extractLanguage(prompt) {
  const lower = String(prompt || '').toLowerCase();
  for (const lang of LANGUAGES) {
    if (new RegExp(`\\b(?:in|to|into|from)\\s+${lang}\\b`).test(lower)) return lang;
  }
  for (const lang of LANGUAGES) if (lower.includes(lang)) return lang;
  return null;
}

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
export function youtubeId(url) {
  const s = String(url || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(YOUTUBE_ID);
  if (m) return m[1];
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) { const id = u.pathname.split('/').filter(Boolean)[0]; if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id; }
    const v = u.searchParams.get('v'); if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const list = u.searchParams.get('list'); if (list) return { playlist: list };
  } catch { /* not a URL */ }
  return null;
}

/** Normalise whatever the UI hands us into a planner context. */
export function normalizeRequest(raw = {}) {
  const prompt = String(raw.prompt ?? raw.request ?? '').replace(/\r\n/g, '\n').trim();
  const files = (Array.isArray(raw.files) ? raw.files : []).map((f, i) => ({
    index: i,
    name: String(f?.name || `file-${i + 1}`),
    size: Number(f?.size) || 0,
    type: String(f?.type || ''),
    kind: f?.kind || fileKind(f),
    ext: String(f?.name || '').includes('.') ? String(f.name).split('.').pop().toLowerCase() : ''
  }));
  const links = [];
  for (const l of Array.isArray(raw.links) ? raw.links : []) {
    const url = typeof l === 'string' ? l : String(l?.url || '');
    if (!url.trim()) continue;
    const kind = linkKind(url);
    const id = kind === 'youtube' ? youtubeId(url) : null;
    links.push({ url: url.trim(), kind, videoId: typeof id === 'string' ? id : null, playlist: id?.playlist || null });
  }
  // URLs pasted inside the prompt count as links too.
  for (const found of String(prompt).match(/\bhttps?:\/\/[^\s"'<>)]+/gi) || []) {
    if (links.some(l => l.url === found)) continue;
    const kind = linkKind(found);
    const id = kind === 'youtube' ? youtubeId(found) : null;
    links.push({ url: found, kind, videoId: typeof id === 'string' ? id : null, playlist: id?.playlist || null });
  }
  const conversion = detectConversion(prompt);
  const options = {
    mode: ['auto', 'batch', 'per'].includes(raw.options?.mode) ? raw.options.mode : 'auto',
    target: ['gemini', 'notebooklm', 'assistant', 'local', 'file'].includes(raw.options?.target) ? raw.options.target : 'file',
    hasKey: Boolean(raw.options?.hasKey),
    includeImages: raw.options?.includeImages !== false,
    language: raw.options?.language || extractLanguage(prompt) || null,
    depth: Math.max(1, Math.min(24, Number(raw.options?.depth) || 8))
  };
  const text = prompt.toLowerCase();
  const kinds = files.map(f => f.kind);
  const parts = splitRequest(prompt);
  return {
    prompt,
    text,
    words: tokens(prompt),
    verbs: parts.verbs,
    formats: parts.formats,
    subjects: parts.subjects,
    genericVerbs: parts.generic,
    conversion,
    topic: raw.topic != null ? String(raw.topic) : extractTopic(prompt),
    place: extractPlace(prompt),
    language: options.language,
    files,
    kinds,
    hasKind: k => kinds.includes(k),
    links,
    youtube: links.filter(l => l.kind === 'youtube'),
    webLinks: links.filter(l => l.kind === 'web'),
    options,
    say: re => re.test(prompt) || re.test(text),
    any: (...res) => res.some(re => re.test(prompt)),
    tools: Array.isArray(raw.tools) ? raw.tools : []
  };
}

/* ------------------------------------------------------------------ *
 * Intents
 * ------------------------------------------------------------------ */

const ACTION_VERBS = {
  create: /\b(make|create|generate|build|produce|prepare|write|compose|draft|design|draw|render|export|download|give me|output)\b/i,
  convert: /\b(convert|change|turn|transform|export to|to pdf|to csv|to json|to mp3|to png|to jpg|to text|to markdown|to word|to excel)\b/i,
  extract: /\b(extract|pull out|get the|read|ocr|transcribe|parse|scrape|capture|lift)\b/i,
  analyze: /\b(analyze|analyse|summarize|summarise|explain|compare|review|check|validate|verify|audit|diagnose|evaluate|inspect|detect|classify|count|measure|estimate|proofread)\b/i,
  organize: /\b(split|merge|combine|sort|group|deduplicate|dedupe|rename|reorder|arrange|batch|chunk|segment|clean|format|beautify|minify|compress|reduce|resize|crop|rotate|trim|cut|join|stitch)\b/i,
  find: /\b(find|search|look up|lookup|locate|discover|nearby|around|where|which|list|show me|recommend|suggest)\b/i,
  calculate: /\b(calculate|compute|how much|how many|price|cost|total|emi|gst|tax|salary|bmi|interest|discount|percentage|convert \d)\b/i,
  plan: /\b(plan|schedule|organize my|roadmap|itinerary|timeline|study plan|routine)\b/i,
  play: /\b(play|game|match|puzzle|solve the puzzle)\b/i,
  learn: /\b(learn|teach|tutorial|explain like|study|revise|practice|quiz me|flashcards)\b/i
};

export function detectActions(prompt) {
  return Object.entries(ACTION_VERBS).filter(([, re]) => re.test(String(prompt || ''))).map(([id]) => id);
}

const INTENT_RULES = [
  {
    id: 'research', label: 'Research a topic',
    test: c => {
      const hits = [];
      const wiki = /\bwikipedia\b|\bwiki\b|\bwikidata\b|\bencyclopedia\b/i.test(c.prompt);
      // Naming a scholarly source is the strongest research signal there is: the
      // user has already chosen where the answer should come from.
      const scholarly = /\b(pubmed|europe\s*pmc|arxiv|crossref|openalex|semantic scholar|doi|research paper|peer[- ]reviewed|papers?|articles?|journals?|literature|study|studies|systematic review|meta[- ]analysis|clinical trial|cohort study)\b/i.test(c.prompt);
      const scholarlyVerb = /\b(find|search|look up|list|get|pull|summari[sz]e|gather|collect|review|compare)\b[^.?!\n]{0,60}\b(papers?|articles?|studies|research|literature|evidence|trials?|journals?|reviews?)\b/i.test(c.prompt)
        || /\b(papers?|studies|research|evidence|literature|reviews?)\b[^.?!\n]{0,24}\b(on|about|regarding|for|of)\b/i.test(c.prompt);
      const infoWording = /\b(research|find (?:out|info|information|details)|tell me about|who (?:is|was)|what (?:is|are|was)|biography|life of|history of|article (?:on|about)|information (?:on|about)|details (?:on|about)|everything about|profile of|meaning of|definition of|explain|explain me|notes on|write about|report on|essay on|paragraph on)\b/i.test(c.prompt);
      const hasSubject = Boolean(c.topic) && c.subjects.length > 0;
      if (!hasSubject) return null;               // an operation on a format is not research
      const bare = !c.verbs.length && !c.genericVerbs.length && !c.files.length &&
        !c.links.length && !c.place && c.words.length <= 6;
      if (!wiki && !infoWording && !bare && !scholarly && !scholarlyVerb) return null;
      if (wiki) hits.push('mentions Wikipedia');
      if (scholarly) hits.push('names a scholarly source');
      if (scholarlyVerb) hits.push('asks for literature');
      if (infoWording) hits.push('asks for information');
      if (bare) hits.push('subject-only request');
      return { score: 2 + hits.length * 2, evidence: hits };
    }
  },
  {
    id: 'pdf-output', label: 'Produce a PDF',
    test: c => {
      if (!/\b(pdf|document|report|dossier|handout|printable|ebook)\b/i.test(c.prompt)) return null;
      if (/\bpdf\s+(?:to|2)\s+(?:text|json|csv|word|excel|markdown|html|image|jpg|png|epub|rtf|powerpoint)\b/i.test(c.prompt)) return null;
      if (/\b(?:to|into|as)\s+(?:a\s+)?(?:text|json|csv|xlsx|excel|word|docx|markdown|html|jpg|png|mp3|wav|srt|vtt)\b/i.test(c.prompt) &&
          !/\b(?:to|into|as)\s+(?:a\s+)?pdf\b/i.test(c.prompt)) return null;
      const deliverable = /\b(?:to|into|as)\s+(?:a\s+|an\s+)?(?:\w+\s+){0,2}(?:pdf|document|report|handout|ebook)\b/i.test(c.prompt) ||
        // "... then a PDF" / "... and a report" \u2014 the ask can sit in a later clause.
        /\b(?:and|then|also|plus|end\s+up\s+with)\s+(?:a\s+|an\s+)?(?:\w+\s+){0,2}(?:pdf|document|report|handout|ebook)\b/i.test(c.prompt) ||
        /\b(?:make|create|generate|build|produce|prepare|export|download|give|write|turn|render|print|save|compile|format)\b[^.!?\n]{0,80}\b(?:pdf|document|report|handout|ebook)\b/i.test(c.prompt) ||
        /\b(?:pdf|report|handout|ebook)\b[^.!?\n]{0,28}\b(?:of|about|on|for)\b/i.test(c.prompt);
      if (!deliverable) return null;
      const hits = ['wants a PDF/document as the deliverable'];
      if (/\b(from|using|out of|based on)\b/i.test(c.prompt)) hits.push('has a source in mind');
      return { score: 4 + hits.length, evidence: hits };
    }
  },
  {
    id: 'notes', label: 'Study notes / summary',
    test: c => {
      const hits = [];
      if (/\b(notes?|summary|summarize|summarise|study guide|revision|flashcards?|quiz|mind map|outline|key points|takeaways|tldr)\b/i.test(c.prompt) &&
          !/\b(?:to|into|as)\s+(?:a\s+)?(?:pdf|pptx|docx|csv)\b/i.test(c.prompt)) hits.push('asks for notes/summary');
      if (/\b(question paper|exam|syllabus|textbook|lecture|class|chapter|assignment)\b/i.test(c.prompt)) hits.push('study material mentioned');
      if (!hits.length) return null;
      return { score: 2 + hits.length * 2, evidence: hits };
    }
  },
  {
    id: 'ocr', label: 'Read text from scans/images',
    test: c => {
      const hits = [];
      if (/\b(ocr|scanned|scan|handwrit|read the text|extract text|image to text|photo of)\b/i.test(c.prompt)) hits.push('OCR requested');
      if (c.hasKind('image') && /\b(text|words|read|extract|ocr)\b/i.test(c.prompt)) hits.push('image file + text goal');
      if (c.hasKind('pdf') && /\b(scanned|scan|no text|image pdf|ocr)\b/i.test(c.prompt)) hits.push('PDF described as scanned');
      return hits.length ? { score: 3 + hits.length, evidence: hits } : null;
    }
  },
  {
    id: 'youtube', label: 'YouTube transcript / playlist',
    test: c => {
      const hits = [];
      if (c.youtube.length) hits.push(`${c.youtube.length} YouTube link(s) supplied`);
      if (/\b(youtube|yt|transcript|captions?|subtitles?|playlist|video)\b/i.test(c.prompt)) hits.push('YouTube wording used');
      return hits.length ? { score: 3 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'pdf-work', label: 'Operate on PDF files',
    test: c => {
      if (!c.hasKind('pdf') && !/\bpdfs?\b/i.test(c.prompt)) return null;
      const hits = [];
      if (c.hasKind('pdf')) hits.push(`${c.kinds.filter(k => k === 'pdf').length} PDF file(s) uploaded`);
      if (/\b(split|merge|combine|compress|rotate|reorder|extract pages?|delete pages?|watermark|page numbers?|sign|redact|crop|resize|n-up|booklet|form|fill|bookmark|pages per sheet|protect|unlock|flatten|cut|single pages?)\b/i.test(c.prompt)) hits.push('PDF operation requested');
      if (/\bpdfs?\b/i.test(c.prompt)) hits.push('PDF named in the request');
      return { score: 2 + hits.length * 2, evidence: hits };
    }
  },
  {
    id: 'map', label: 'Places, maps, routes, weather',
    test: c => {
      const hits = [];
      if (/\b(map|maps|location|place|places|address|addresses|nearby|around me|directions?|route|routing|distance|latitude|longitude|geocode|pincode|area|city|town|village|weather|forecast|temperature|rain)\b/i.test(c.prompt)) hits.push('map/place wording used');
      if (/\b(where (is|are)|locate|coordinates?|how far|how (do|can) i (get|reach)|show (it|them|me).*\bmap|postcode|pin ?code)\b/i.test(c.prompt)) hits.push('a place lookup was asked for');
      // A place name on its own is not a map request \u2014 "the Kerala backwaters" is a subject, not a destination.
      if (c.place && /\b(where|near|locat|address|map|weather|distance|direction|route|towards?)\b/i.test(c.prompt)) hits.push(`place detected: ${c.place.text}`);
      // A shop or a bank in a document request is not a place to look up:
      // "redact the bank details from this pdf" is about the file, not the map.
      const aboutFile = c.files?.length && !/\b(near|nearest|nearby|around|route|directions?|distance|weather|locate|where is|how far|address|map)\b/i.test(c.prompt);
      if (!aboutFile && /\b(cafe|cafes|restaurant|hotels?|hospital|school|college|bank|atm|pharmacy|park|petrol|station|airport|temple|church|mosque|shop|stores?|mall|gym|salon|clinic)\b/i.test(c.prompt)) hits.push('point-of-interest category named');
      return hits.length ? { score: 2 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'presentation', label: 'Slide deck',
    test: c => {
      if (!/\b(ppt|pptx|powerpoint|presentation|slide deck|slides?)\b/i.test(c.prompt)) return null;
      if (!/\b(make|create|generate|build|prepare|need|want|give|download)\b/i.test(c.prompt)) return null;
      return { score: 6, evidence: ['slide deck requested'] };
    }
  },
  {
    id: 'audio-work', label: 'Audio processing',
    test: c => {
      const hits = [];
      if (c.hasKind('audio')) hits.push('audio file uploaded');
      if (/\b(audio|sound|mp3|wav|m4a|flac|voice|song|music|podcast|denoise|noise|trim|cut|fade|volume|tempo|normaliz|normalis|loudness|silence|ringtone|recording)\b/i.test(c.prompt)) hits.push('audio wording used');
      return hits.length ? { score: 2 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'image-work', label: 'Image processing',
    test: c => {
      const hits = [];
      if (c.hasKind('image')) hits.push('image file uploaded');
      if (/\b(image|photo|picture|jpg|jpeg|png|webp|gif|svg|heic|avatar|logo|thumbnail|poster|wallpaper|screenshot|resize|crop|compress|watermark|background|passport photo|collage|meme)\b/i.test(c.prompt)) hits.push('image wording used');
      return hits.length ? { score: 2 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'video-work', label: 'Video processing',
    test: c => {
      const hits = [];
      if (c.hasKind('video')) hits.push('video file uploaded');
      if (/\b(video|mp4|mov|mkv|clip|footage|frame rate|bitrate|gif|reel)\b/i.test(c.prompt)) hits.push('video wording used');
      return hits.length ? { score: 2 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'data-work', label: 'Spreadsheet / data conversion',
    test: c => {
      const hits = [];
      if (c.hasKind('csv') || c.hasKind('sheet') || c.hasKind('json')) hits.push('data file uploaded');
      if (/\b(csv|tsv|xlsx|excel|spreadsheet|json|jsonl|yaml|xml|table|columns?|rows?|pivot|dedupe|deduplicate|normaliz|dataset)\b/i.test(c.prompt)) hits.push('data wording used');
      return hits.length ? { score: 2 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'text-work', label: 'Text processing',
    test: c => {
      const hits = [];
      if (c.hasKind('text')) hits.push('text file uploaded');
      if (/\b(word count|character count|case|uppercase|lowercase|title case|whitespace|trim|sort lines|reverse|remove duplicates|number lines|diff|compare text|slug|find and replace|lorem|typo|grammar|rewrite|paraphrase|clean text|join text|split text)\b/i.test(c.prompt)) hits.push('text operation requested');
      return hits.length ? { score: 2 + hits.length, evidence: hits } : null;
    }
  },
  {
    id: 'writing', label: 'Writing / language task',
    test: c => {
      const hits = [];
      if (/\b(write|draft|compose|email|letter|essay|blog|post|caption|speech|resume|cv|cover letter|sop|proposal|message|reply|apology|invitation|notice|announcement)\b/i.test(c.prompt)) hits.push('writing task');
      if (/\b(translate|translation)\b/i.test(c.prompt)) hits.push('translation asked');
      if (/\b(grammar|spelling|proofread|rewrite|paraphrase|improve|polish|tone|formal|professional)\b/i.test(c.prompt)) hits.push('editing asked');
      return hits.length ? { score: 2 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'developer', label: 'Developer utility',
    test: c => {
      const hits = [];
      if (/\b(json|yaml|xml|base64|jwt|uuid|nanoid|regex|cron|sql|sha-?256|sha-?512|md5|hmac|hash|hex|url encode|url decode|mime|semver|cidr|subnet|ip address|user agent|http header|minif|beautif|format code|escape|unescape)\b/i.test(c.prompt)) hits.push('developer wording used');
      if (/\b(code|script|api|endpoint|database|query|commit|git|deploy|debug)\b/i.test(c.prompt)) hits.push('code context');
      return hits.length ? { score: 2 + hits.length, evidence: hits } : null;
    }
  },
  {
    id: 'calculate', label: 'Calculation',
    test: c => {
      const hits = [];
      if (/\b(calculate|compute|how much|how many|how old|how long|how big|how large|file size|total|sum|average|percentage|discount|tip|markup|margin|profit|emi|loan|interest|gst|vat|tds|tax|salary|hra|pf|esi|gratuity|bmi|bsa|calorie|age|born|birthday|dob|date difference|business days|timezone|unit convert|roi|roas|ltv|cac|worth|costs?)\b/i.test(c.prompt)) hits.push('calculation asked');
      if (/\d/.test(c.prompt) && /\b(per|%|percent|years?|months?|km|kg|lb|inch|feet|cm|mm|litre|liter|gb|mb|tb|rupees?|rs|inr|usd|eur)\b/i.test(c.prompt)) hits.push('numbers with units present');
      return hits.length ? { score: 2 + hits.length, evidence: hits } : null;
    }
  },
  {
    id: 'business-doc', label: 'Business document',
    test: c => {
      if (!/\b(invoice|quotation|quote|receipt|purchase order|proforma|credit note|debit note|challan|packing slip|payslip|timesheet|attendance|expense report|inventory|sku|barcode|label|letterhead|business card|proposal|sop|shipping label|utr)\b/i.test(c.prompt)) return null;
      return { score: 5, evidence: ['business document requested'] };
    }
  },
  {
    id: 'design', label: 'Design / web asset',
    test: c => {
      if (!/\b(palette|color|colour|gradient|shadow|border radius|css|flexbox|grid|meta tag|open graph|twitter card|schema markup|canonical|favicon|manifest|og image|svg pattern|placeholder image|qr landing|responsive)\b/i.test(c.prompt)) return null;
      return { score: 4, evidence: ['design/web asset requested'] };
    }
  },
  {
    id: 'osint', label: 'Public-data lookup',
    test: c => {
      const hits = [];
      if (/\b(whois|dns|asn|tls|ssl certificate|http headers|redirect chain|robots\.txt|sitemap|exif|metadata|username|handle|profile|instagram|public page|favicon|ip address|email domain|phone country)\b/i.test(c.prompt)) hits.push('public-data lookup wording');
      if (c.webLinks.length) hits.push('web link supplied for inspection');
      return hits.length ? { score: 2 + hits.length * 2, evidence: hits } : null;
    }
  },
  {
    id: 'games', label: 'Play a game',
    test: c => {
      if (!/\b(play|game|chess|snake|2048|tic ?tac ?toe|minesweeper|tetris|puzzle|sudoku)\b/i.test(c.prompt)) return null;
      return { score: 5, evidence: ['game requested'] };
    }
  },
  {
    id: 'privacy', label: 'Privacy / redaction',
    test: c => {
      if (!/\b(pii|privacy|anonymiz|anonymis|mask|redact|hide|scrub|password|passphrase|secure|encrypt|sensitive)\b/i.test(c.prompt)) return null;
      return { score: 4, evidence: ['privacy task requested'] };
    }
  },
  {
    id: 'india', label: 'India-specific format',
    test: c => {
      if (!/\b(gstin|gst|pan|ifsc|aadhaar|pincode|lakh|crore|indian|inr|rupee|upi|tds|hra|pf|esi|india)\b/i.test(c.prompt)) return null;
      return { score: 4, evidence: ['India-specific wording'] };
    }
  }
];

export function detectIntents(ctx) {
  const found = [];
  for (const rule of INTENT_RULES) {
    let hit = null;
    try { hit = rule.test(ctx); } catch { hit = null; }
    if (hit && hit.score > 0) found.push({ id: rule.id, label: rule.label, score: hit.score, evidence: hit.evidence || [] });
  }
  // Uploaded files are strong evidence on their own.
  const evidence = [];
  if (ctx.hasKind('pdf')) evidence.push({ id: 'pdf-work', label: 'Operate on PDF files', score: 3, evidence: ['PDF file uploaded'] });
  if (ctx.hasKind('image')) evidence.push({ id: 'image-work', label: 'Image processing', score: 3, evidence: ['image file uploaded'] });
  if (ctx.hasKind('audio')) evidence.push({ id: 'audio-work', label: 'Audio processing', score: 3, evidence: ['audio file uploaded'] });
  if (ctx.hasKind('video')) evidence.push({ id: 'video-work', label: 'Video processing', score: 3, evidence: ['video file uploaded'] });
  if (ctx.hasKind('csv') || ctx.hasKind('sheet') || ctx.hasKind('json')) evidence.push({ id: 'data-work', label: 'Spreadsheet / data conversion', score: 3, evidence: ['data file uploaded'] });
  if (ctx.youtube.length) evidence.push({ id: 'youtube', label: 'YouTube transcript / playlist', score: 4, evidence: ['YouTube link supplied'] });
  for (const extra of evidence) {
    const existing = found.find(f => f.id === extra.id);
    if (existing) { existing.score = Math.max(existing.score, extra.score); existing.evidence = [...new Set([...existing.evidence, ...extra.evidence])]; }
    else found.push(extra);
  }
  // A task intent beats a vague research intent: "invoice for 3 items" is not a
  // request to read an encyclopedia, even though "items" is a subject word.
  const TASK_INTENTS = new Set(['games', 'business-doc', 'presentation', 'calculate', 'ocr', 'youtube',
    'data-work', 'text-work', 'image-work', 'audio-work', 'video-work', 'developer', 'design',
    'privacy', 'india', 'pdf-work', 'osint']);
  const research = found.find(f => f.id === 'research');
  if (research) {
    const wording = /\b(wikipedia|wiki|wikidata|encyclopedia)\b/i.test(ctx.prompt) ||
      /\b(who (?:is|was)|what (?:is|are|was)|tell me about|biography|life of|history of|research|information (?:on|about)|details (?:on|about)|everything about|meaning of|definition of|article (?:on|about)|essay on|report on|explain)\b/i.test(ctx.prompt);
    const strongerTask = found.some(f => TASK_INTENTS.has(f.id) && f.score >= research.score);
    if (!wording && strongerTask) {
      const keep = found.filter(f => f.id !== 'research');
      keep.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      return keep;
    }
  }
  found.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return found;
}

/* ------------------------------------------------------------------ *
 * Capability gaps — what MegaPLAN will not pretend to do
 * ------------------------------------------------------------------ */

const GAPS = [
  { test: /\b(download|save|grab|rip|extract (?:the )?audio|strip (?:the )?audio|mp3)\b[^\n]{0,40}\b(youtube|netflix|prime|hotstar|spotify|instagram|facebook|tiktok)\b/i,
    message: 'Downloading streams from YouTube/Netflix/Spotify/Instagram bypasses platform controls, so AI Mode will not do it. It can fetch public captions, thumbnails, playlists and metadata instead.',
    suggest: ['youtube-transcript', 'youtube-playlist-lister', 'youtube-thumbnail-downloader'] },
  { test: /\b(private|dm|dms|direct message|chat log|story|stories|followers list|password|login|hack|bypass|crack)\b[^\n]{0,40}\b(instagram|facebook|whatsapp|twitter|x|telegram|account)\b/i,
    message: 'Private account content and credential work is out of scope. Only public information is looked up.',
    suggest: ['public-profile-url-checker', 'url-metadata-inspector'] },
  { test: /\b(whois)\b/i,
    message: 'Live WHOIS needs a registry API MegaPLAN does not proxy. The WHOIS interface explains where to look and formats what you paste in.',
    suggest: ['domain-whois-interface'] },
  { test: /\b(slideshare|scribd|issuu|docdroid|pdfdrive|slides? from (?:a )?(?:presentation|deck))\b|\b(download|save|get)\b[^\n]{0,30}\b(slideshare|scribd|issuu)\b/i,
    message: 'SlideShare and its neighbours host other people\'s documents. AI Mode will not take those. Upload the file you have and the text extractors, the note tools and the PDF desk will read it here.',
    suggest: ['smart-note-maker', 'transcript-summarizer', 'pdf-text-extractor'] },
  { test: /\b(medical diagnosis|diagnose me|prescribe|dose for patient|legal advice|court|buy (?:guns?|weapons?|drugs?))\b/i,
    message: 'AI Mode will not give diagnoses, prescriptions or legal advice. Calculators and formatters are educational helpers only.',
    suggest: [] }
];

export function detectGaps(ctx) {
  return GAPS.filter(g => g.test.test(ctx.prompt)).map(g => ({ message: g.message, suggest: g.suggest }));
}

/* ------------------------------------------------------------------ *
 * Built-in capabilities (executors AI Mode can really run)
 * ------------------------------------------------------------------ */

export const CAPABILITIES = {
  research: { title: 'Search open sources', stage: 'gather', executor: 'research', output: 'json' },
  article: { title: 'Fetch article text', stage: 'gather', executor: 'article', output: 'text' },
  'article-pdf': { title: 'Build the PDF', stage: 'output', executor: 'article-pdf', output: 'file' },
  'web-read': { title: 'Read the linked page', stage: 'gather', executor: 'web-read', output: 'text' },
  'youtube-transcript': { title: 'Fetch captions', stage: 'gather', executor: 'youtube-transcript', output: 'text' },
  'youtube-playlist': { title: 'List playlist videos', stage: 'gather', executor: 'youtube-playlist', output: 'json' },
  'file-read': { title: 'Read file text', stage: 'gather', executor: 'file-read', output: 'text' },
  'pdf-read': { title: 'Extract PDF text + check for scans', stage: 'gather', executor: 'pdf-read', output: 'text' },
  'map-place': { title: 'Locate the place', stage: 'gather', executor: 'map-place', output: 'json' },
  'map-nearby': { title: 'Find nearby places', stage: 'gather', executor: 'map-nearby', output: 'json' },
  'map-route': { title: 'Plan the route', stage: 'output', executor: 'map-route', output: 'map' },
  'map-weather': { title: 'Local weather (Open-Meteo)', stage: 'output', executor: 'map-weather', output: 'json' },
  outline: { title: 'Turn gathered text into notes', stage: 'transform', executor: 'outline', output: 'text' },
  combine: { title: 'Combine step outputs', stage: 'transform', executor: 'combine', output: 'text' },
  prompts: { title: 'Write copy-paste prompts', stage: 'output', executor: 'prompts', output: 'text' },
  assistant: { title: 'Optional writing-assistant pass', stage: 'transform', executor: 'assistant', output: 'text', optional: true },
  presentation: { title: 'Create the .pptx', stage: 'output', executor: 'presentation', output: 'file' },
  toolbus: { title: 'Run a MegaPLAN tool', stage: 'transform', executor: 'toolbus', output: 'text' },
  'pdf-ops': { title: 'PDF operation on your file', stage: 'transform', executor: 'pdf-ops', output: 'file' },
  'pdf-answer': { title: 'Answer from the PDF, with page numbers', stage: 'transform', executor: 'pdf-answer', output: 'text' },
  'new-tool': { title: 'Draft a private tool', stage: 'output', executor: 'new-tool', output: 'json' }
};

const STAGE_ORDER = { gather: 0, transform: 1, output: 2, assist: 3 };

/**
 * The executor contract.
 *
 * A capability in CAPABILITIES without a real implementation must not be marked
 * `auto` — a step is only automatic when {@link canRun} says an executor
 * exists. `public/js/ai-executors.js` implements exactly this set, and
 * tests/ai-mode-planner.mjs asserts the two never drift apart.
 */
export const IMPLEMENTED_EXECUTORS = [
  'research', 'article', 'web-read', 'youtube-transcript', 'youtube-playlist',
  'file-read', 'pdf-read', 'pdf-answer', 'map-place', 'map-nearby', 'map-route', 'map-weather',
  'outline', 'combine', 'prompts', 'assistant', 'presentation', 'article-pdf',
  'toolbus', 'pdf-ops', 'new-tool'
];

/**
 * PDF tools AI Mode can genuinely run itself, mapped to the operation
 * `ai-pdf-ops.js` implements. Slugs that are absent (sign, fill, redact, OCR,
 * repair) deliberately keep the "open the studio" behaviour — those need a
 * human or a scanner and must never be faked.
 * Kept as a literal list so this pure planner never imports the executor module.
 */
export const PDF_RUNNABLE_OPS = {
  'merge-pdfs': 'merge', 'split-pdf': 'split', 'compress-pdf': 'compress', 'rotate-pdf': 'rotate',
  'extract-pdf-pages': 'extract', 'pdf-page-extractor': 'extract', 'delete-pdf-pages': 'delete',
  'reorder-pdf-pages': 'reorder', 'add-pdf-page-numbers': 'numbers', 'add-pdf-watermark': 'watermark',
  'remove-pdf-metadata': 'metadata', 'pdf-metadata-viewer': 'metadata', 'crop-pdf': 'crop',
  'pages-per-sheet': 'nup', 'two-pages-per-sheet': 'nup2', 'booklet-pdf-maker': 'nup2',
  'overlay-pdfs': 'overlay', 'compare-pdfs': 'compare', 'images-to-pdf': 'images',
  'jpg-to-pdf': 'images', 'png-to-pdf': 'images', 'webp-to-pdf': 'images',
  'pdf-page-counter': 'count', 'pdf-to-text': 'text', 'pdf-to-markdown': 'text',
  'pdf-form-field-viewer': 'forms', 'agentic-pdf-splitter': 'sections'
};

export function pdfOpFor(tool) {
  return PDF_RUNNABLE_OPS[String(tool?.slug || '')] || null;
}

/** What the studio hand-offs actually do, so the plan does not have to guess. */
const PDF_STUDIO_NOTE = {
  'sign-pdf': 'your signature is drawn or typed by you and placed where you want it',
  'fill-pdf': 'the fields are filled by you and the file is saved locally',
  'redact-pdf': 'redaction is drawn by hand, so you can see exactly what is removed',
  'annotate-pdf': 'notes and marks are placed by you',
  'repair-pdf': 'the damaged file is opened and recovered with your say-so',
  'ocr-pdf': 'scanned pages are read in this browser, page by page',
  'pdf-to-word': 'the conversion needs a layout engine a browser does not ship',
  'pdf-to-excel': 'tables are detected and mapped by hand',
  'pdf-to-powerpoint': 'slides are laid out by hand from the extracted text',
  'pdf-to-epub': 'the reflowable book is built with a library loaded on demand',
  'pdf-to-rtf': 'the document is rebuilt in the studio',
  'pdf-to-html': 'the page layout is rebuilt as HTML',
  'pdf-to-images': 'each page is rendered at the resolution you choose',
  'extract-pdf-images': 'the embedded images are listed and you pick which to save',
  'resize-pdf-pages': 'page sizes are changed one by one',
  'pdf-a-helper': 'the conformance report lists what is missing',
  'pdf-bookmark-helper': 'bookmarks are added by hand to a page list',
  'pdf-batch-rename': 'the new names are applied to a list you confirm',
  'word-to-pdf': 'the layout is rendered in this browser',
  'excel-to-pdf': 'each sheet is paginated in this browser',
  'powerpoint-to-pdf': 'each slide is rendered in this browser',
  'epub-to-pdf': 'the book is paginated in this browser'
};

/**
 * The wording for a studio hand-off. Every path that offers a tool AI Mode
 * cannot run unattended goes through here, so the plan always says the same
 * thing: this is a hand-off, this is what it does, nothing is uploaded.
 */
export function handoffWhy(tool, ctx, ruleWhy = '') {
  if (tool?.category === 'PDF') {
    const note = PDF_STUDIO_NOTE[tool?.slug] || 'the work is done in this browser with your file';
    const file = ctx?.files?.length ? ` (${ctx.files.filter(f => f.kind === 'pdf').map(f => f.name).join(', ') || 'your file'})` : '';
    return `AI Mode cannot do this one unattended, so it opens the ${tool.title} studio${file}: ${note}. Nothing is uploaded.`;
  }
  if (tool?.status === 'beta') return `${ruleWhy || 'This tool is still marked beta.'} It opens the tool so you can do it by hand.`;
  return ruleWhy || `Matched ${tool?.category || 'the library'}.`;
}

/** How each runnable PDF op reads, so the planner only claims what it can do. */
export const PDF_OP_VERB = {
  merge: 'Merge', split: 'Split', compress: 'Compress', rotate: 'Rotate', extract: 'Extract from',
  delete: 'Delete pages of', reorder: 'Reorder', numbers: 'Number', watermark: 'Watermark',
  metadata: 'Read', crop: 'Crop', nup: 'Arrange 4-up', nup2: 'Arrange 2-up', overlay: 'Overlay',
  compare: 'Compare', images: 'Build a PDF from', count: 'Count pages of', text: 'Read',
  forms: 'List the form fields of', sections: 'Search'
};

/**
 * Does the request carry the input this operation needs?
 * Pure guesswork from the request shape — the executor still fails honestly
 * when the file itself turns out to be unusable.
 */
export function pdfOpHasInput(op, files = []) {
  const pdfs = files.filter(f => /\.pdf$/i.test(f?.name || '') || f?.type === 'application/pdf');
  const images = files.filter(f => /^image\//.test(f?.type || '') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f?.name || ''));
  if (op === 'merge' || op === 'overlay') return pdfs.length >= 2;
  if (op === 'images') return images.length >= 1;
  if (op === 'count' || op === 'text' || op === 'sections' || op === 'compare') return pdfs.length >= 1;
  return pdfs.length >= 1;
}

/** Pull a page range the user typed out of their own request, for the executor. */
function pdfRangeFrom(prompt) {
  const m = String(prompt || '').match(/\b(?:pages?|page)\s+([\d\s,;&.\-–—to]+)/i);
  if (!m) return '';
  return m[1].replace(/\bto\b/gi, '-').replace(/\s*-\s*/g, '-').replace(/[.,;]+$/, '').trim();
}

/** True when AI Mode can really execute this capability on the client. */
export function canRun(executor) {
  return IMPLEMENTED_EXECUTORS.includes(String(executor || ''));
}

function step(partial) {
  const cap = CAPABILITIES[partial.executor] || {};
  return {
    id: partial.id,
    stage: partial.stage || cap.stage || 'transform',
    executor: partial.executor || null,
    kind: partial.kind || 'capability',
    title: partial.title || cap.title || 'Step',
    detail: partial.detail || '',
    tool: partial.tool || null,
    toolTitle: partial.toolTitle || null,
    category: partial.category || null,
    action: partial.action || (partial.executor ? 'run' : 'open'),
    input: partial.input || 'request',
    params: partial.params || {},
    why: partial.why || '',
    status: 'pending',
    result: null,
    auto: partial.auto != null ? partial.auto : Boolean(partial.executor) && canRun(partial.executor),
    requires: partial.requires || [],
    outputKind: partial.outputKind || cap.output || 'text',
    optional: Boolean(partial.optional)
  };
}

/* ------------------------------------------------------------------ *
 * Main planner
 * ------------------------------------------------------------------ */

/**
 * @param {{prompt?:string, files?:Array, links?:Array, options?:object, tools?:Array, index?:object}} raw
 * @returns {object} plan
 */
export function planRequest(raw = {}) {
  const ctx = normalizeRequest(raw);
  const index = raw.index || buildIndex(ctx.tools);
  const intents = detectIntents(ctx);
  const gaps = detectGaps(ctx);
  const intentIds = new Set(intents.map(i => i.id));
  const steps = [];
  const notes = [];
  let n = 0;
  const push = partial => { const s = step({ ...partial, id: `s${++n}` }); steps.push(s); return s; };

  const ranked = rankTools(index, ctx, { limit: 24 });

  const wantsPdf = intentIds.has('pdf-output');
  const wantsResearch = intentIds.has('research');
  const wantsNotes = intentIds.has('notes');
  const wantsMap = intentIds.has('map');
  const wantsYouTube = intentIds.has('youtube');
  const wantsPresentation = intentIds.has('presentation');
  const wantsOcr = intentIds.has('ocr');
  const wantsWriting = intentIds.has('writing');
  // "What is the dose of metformin in this document?" — the part that is
  // actually a question, with the attachment's own name taken out of it.
  const pdfQuestion = ctx.files.some(f => f.kind === 'pdf') && ctx.prompt
    ? ctx.prompt
      .replace(/\b(this|these|the|that|attached|uploaded|document|file|pdf|paper)\b/gi, ' ')
      .replace(/\b(in|from|of|inside|within|according to|as (?:stated|per|shown) in)\b/gi, ' ')
      .replace(/\b(in this|from this|of this)\b/gi, ' ')
      .replace(/\?+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    : '';
  // A question only counts if it is a question, not a job ("summarise this").
  // "Find the termination clause" and "where does it say X" are questions too.
  const isQuestion = /\?|\b(what|which|when|where|who|whom|whose|why|find|search|locate|show|tell me|list|say about|state)\b|\bhow (?:much|many|often|long|do|does|is|are)\b|\b(is|are|does|do|did|can|should|must) (?:it|this|they|the|we|you)\b/i.test(pdfQuestion);
  // A question about an attached document is answered from that document. Going
  // out to the web as well mixes the two, and a web summary is not a citation.
  const answerFromFile = isQuestion && pdfQuestion.length > 8 && ctx.files.some(f => f.kind === 'pdf');
  ctx.aboutDocument = answerFromFile;

  /* ---- 1. gather: things we can pull in automatically ---- */
  const gathered = [];
  let routeRequest = null;

  if (wantsYouTube) {
    for (const link of ctx.youtube) {
      if (link.playlist && !link.videoId) {
        gathered.push(push({ executor: 'youtube-playlist', title: `List playlist videos`, detail: link.url,
          params: { url: link.url }, why: 'A YouTube playlist link was supplied.', outputKind: 'json' }));
      } else if (link.videoId) {
        gathered.push(push({ executor: 'youtube-transcript', title: `Fetch captions for ${link.videoId}`, detail: link.url,
          params: { url: link.url, videoId: link.videoId, lang: ctx.options.language || 'en' },
          why: 'Captions are public for this video; AI Mode reads them through /api/youtube-transcript.', outputKind: 'text' }));
      } else {
        notes.push(`"${link.url}" does not look like a watchable YouTube link, so no captions were queued.`);
      }
    }
  }

  for (const link of ctx.webLinks) {
    gathered.push(push({ executor: 'web-read', title: `Read ${shortHost(link.url)}`, detail: link.url,
      params: { url: link.url }, why: 'A web link was supplied; its public text can feed later steps.', outputKind: 'text', optional: true }));
  }

  if (!answerFromFile && (wantsResearch || (wantsPdf && ctx.topic && !ctx.files.length))) {
    const q = ctx.topic || ctx.prompt;
    gathered.push(push({ executor: 'research', title: `Search open sources for “${q}”`,
      detail: 'Wikipedia, Wiktionary, Wikidata, Commons, Openverse, arXiv, Crossref, Europe PMC, Open Library, Gutenberg, Internet Archive, Stack Exchange, Hacker News, GitHub, npm, PyPI, OSM places, Open-Meteo, MusicBrainz, iTunes, TVMaze — all without an API key.',
      params: { query: q, language: ctx.options.language || 'en', groups: null },
      why: intents.find(i => i.id === 'research')?.evidence?.join('; ') || 'A subject to look up was detected.',
      outputKind: 'json' }));
    if (ctx.topic) {
      const art = push({ executor: 'article', title: `Fetch the full article text for “${ctx.topic}”`,
        detail: 'Plain-text Wikipedia extract with section headings, lead image and licence, plus a description from Wikidata when available.',
        params: { query: ctx.topic, language: ctx.options.language || 'en', includeImage: ctx.options.includeImages },
        why: wantsPdf ? 'The PDF needs real article text, not a summary snippet.' : 'Full text gives later steps something to work on.',
        outputKind: 'text' });
      gathered.push(art);
    }
  }

  if (ctx.files.length) {
    for (const f of ctx.files) {
      if (f.kind === 'pdf') {
        gathered.push(push({ executor: 'pdf-read', title: `Read “${f.name}”`,
          detail: 'Extract the text layer, read any scanned pages in this browser, and count the pages.',
          params: { fileIndex: f.index, name: f.name }, why: 'A PDF was uploaded; its text feeds every later step.',
          outputKind: 'text', requires: [] }));
      } else if (f.kind === 'text' || f.kind === 'csv' || f.kind === 'json') {
        gathered.push(push({ executor: 'file-read', title: `Read “${f.name}”`, detail: `Load the ${f.kind.toUpperCase()} contents into the chain.`,
          params: { fileIndex: f.index, name: f.name }, why: 'A readable text file was uploaded.', outputKind: 'text' }));
      } else if (f.kind === 'image' && (wantsOcr || /\b(text|read|extract|ocr|words)\b/i.test(ctx.prompt))) {
        gathered.push(push({ executor: 'toolbus', title: `Read text from “${f.name}”`, tool: 'ocr-image-to-text', toolTitle: 'OCR Image to Text', category: 'OCR & AI',
          params: { fileIndexes: [f.index] }, why: 'An image was uploaded and text was requested.', outputKind: 'text' }));
      }
    }
    if (answerFromFile) {
      gathered.push(push({
        executor: 'pdf-answer',
        title: `Answer from ${ctx.files.find(f => f.kind === 'pdf').name}`,
        detail: 'Rank every page with BM25, quote the sentences that carry the question, and name the page each came from.',
        params: { fileIndex: ctx.files.find(f => f.kind === 'pdf').index, question: pdfQuestion, name: ctx.files.find(f => f.kind === 'pdf').name },
        why: 'A question was asked about an uploaded document. The answer is quoted from the pages it is cited to.',
        outputKind: 'text', requires: []
      }));
    }
    if (wantsOcr && ctx.files.some(f => f.kind === 'pdf')) {
      notes.push('Scanned PDFs are read with in-browser OCR. If a PDF has no text layer, AI Mode opens OCR PDF with your file ready instead of guessing.');
    }
  }

  if (wantsMap) {
    const place = ctx.place?.text || ctx.topic || '';
    const poi = (ctx.prompt.match(/\b(cafe|cafes|restaurant|restaurants|hotel|hotels|hospital|hospitals|school|schools|college|colleges|bank|banks|atm|atms|pharmacy|pharmacies|park|parks|petrol|station|stations|airport|airports|temple|temples|church|churches|mosque|mosques|shop|shops|store|stores|mall|malls|gym|gyms|salon|salons|clinic|clinics|library|libraries|bakery|supermarket)\b/i) || [null])[0];
    if (place) {
      const geo = push({ executor: 'map-place', title: `Locate “${place}”`, detail: 'Nominatim (OpenStreetMap) geocoding — free, no API key.',
        params: { query: place }, why: 'A place name was detected.', outputKind: 'json' });
      gathered.push(geo);
      if (poi) {
        gathered.push(push({ executor: 'map-nearby', title: `Find nearby ${poi.replace(/s$/, '')}s`, detail: 'Overpass API around the located point (2 km), with a mirror fallback.',
          params: { poi: normalisePoi(poi), radius: 2000, origin: geo.id }, why: `"${poi}" was named as the thing to find.`, outputKind: 'json', requires: [geo.id] }));
      }
      if (/\b(weather|forecast|temperature|rain|humidity|climate)\b/i.test(ctx.prompt)) {
        gathered.push(push({ executor: 'map-weather', title: `Weather at ${place}`, detail: 'Open-Meteo current conditions + 3-day outlook, no API key.',
          params: { query: place, origin: geo.id }, why: 'Weather was asked for.', outputKind: 'json', requires: [geo.id] }));
      }
    } else if (/\b(route|directions|from .* to|navigate|reach)\b/i.test(ctx.prompt)) {
      notes.push('Tell me the start and end place (or two "lat, lng" pairs) and I will route it with OSRM.');
    } else {
      notes.push('No place name was detected for the map step. Add a city or "lat, lng" and re-run.');
    }
    if (/\b(route|directions|navigate|reach|from\s+\w+\s+to)\b/i.test(ctx.prompt)) {
      const routeText = ctx.prompt.match(/\bfrom\s+([^,.\n]{2,60})\s+to\s+([^,.\n]{2,60})/i);
      routeRequest = { from: routeText?.[1]?.trim() || null, to: routeText?.[2]?.trim() || null,
        origin: gathered.filter(g => g.executor === 'map-place').map(g => g.id) };
    }
  }

  /* ---- 2. transform ---- */
  const transforms = [];
  const gatherIds = gathered.map(g => g.id);

  const hasMaterial = gathered.length > 0 || ctx.files.length > 0 || ctx.prompt.length > 220;
  if ((wantsNotes || wantsWriting) && !hasMaterial) {
    notes.push('Paste the text or attach the file you want worked on — AI Mode will not invent the source material.');
  }
  if ((wantsNotes || wantsWriting) && hasMaterial) {
    const translating = /\b(translate|translation)\b/i.test(ctx.prompt);
    transforms.push(push({ executor: 'outline',
      title: translating ? `Structure the text for translation${ctx.language ? ` into ${ctx.language}` : ''}` : wantsNotes ? 'Build structured notes' : 'Summarise the gathered text',
      detail: translating
        ? 'Translation itself needs a language model: AI Mode prepares the text and the copy-paste prompt, and runs the hosted assistant when one is configured. It will not pretend to translate locally.'
        : 'Headings, key sentences, definitions, numbers and questions — produced on this device from the text gathered above. No invented facts.',
      params: { style: translating ? 'translate' : wantsNotes ? 'notes' : 'summary', mode: ctx.options.mode, language: ctx.options.language },
      why: intents.find(i => ['notes', 'writing'].includes(i.id))?.evidence?.join('; ') || 'Notes were requested.',
      requires: gatherIds, outputKind: 'text' }));
  }

  if (gathered.length > 1 && (wantsPdf || wantsNotes)) {
    transforms.push(push({ executor: 'combine', title: 'Merge everything into one document body',
      detail: 'Deduplicate sources, keep attribution, and order sections for the output step.',
      params: {}, why: 'Multiple gathered sources feed one output.', requires: gatherIds, outputKind: 'text' }));
  }

  /* ---- 3. tool steps from the universal registry match ---- */
  const toolSteps = [];
  // Why a listed tool cannot run, so no surface has to invent a reason.
  const refusals = new Map();
  const alsoMatched = [];
  const covered = new Set(steps.map(s => s.tool).filter(Boolean));
  const topScore = ranked[0]?.score || 0;
  // A near-exact title match can score very high; cap the reference so one winner
  // does not hide every other legitimate tool in the chain.
  const cut = Math.max(8, Math.min(topScore, 250) * 0.42);
  const FLOOR = 42;                       // absolute relevance floor, independent of the top match
  const composing = /\b(write|draft|compose|reply|email|letter|essay|caption|speech|apolog|translate|rewrite|paraphrase|summarize|summarise|proofread|explain)\b/i.test(ctx.prompt) &&
    (wantsWriting || wantsNotes) && !ctx.verbs.length;
  const pdfOps = /\b(split|merge|combine|compress|rotate|reorder|extract pages?|delete pages?|watermark|page numbers?|sign|redact|crop|resize|n-up|booklet|form|fill|bookmark|pages per sheet|protect|unlock|flatten|repair|compare|ocr)\b/i.test(ctx.prompt);
  const capCoversPdf = steps.some(s => s.executor === 'article-pdf');
  const capCoversYoutube = steps.some(s => s.executor === 'youtube-transcript' || s.executor === 'youtube-playlist');
  const capCoversMap = wantsMap || steps.some(s => String(s.executor || '').startsWith('map-'));
  const capCoversResearch = steps.some(s => s.executor === 'research');
  const MAX_AUTO_TOOLS = 4;
  let bespokeOpenSteps = 0;
  const coveredSignals = new Set();
  // PDF operations already spoken for, so alias slugs do not pile up.
  const coveredOps = new Set();
  for (const m of ranked) {
    const tool = m.tool;
    if (covered.has(tool.slug) || isSelfReferential(tool)) continue;
    if (tool.status === 'catalogued') {
      // Listed, and deliberately not runnable. It is never queued, and the
      // reason travels with it so nothing downstream invents a capability.
      const why = REFUSALS[tool.slug] || 'listed for reference; there is no runner behind it here';
      refusals.set(tool.slug, why);
      if (m.score >= cut) alsoMatched.push({ ...summariseMatch(m), unavailable: why });
      continue;
    }
    // A tool must actually touch the request: the operation, the format, or the subject.
    if (ctx.subjects.length && m.subjectHits === 0 && m.verbHits + m.formatHits < 2) continue;
    if (!ctx.subjects.length && m.verbHits + m.formatHits + m.subjectHits === 0) continue;
    const signals = toolSignals(tool, ctx);
    const fresh = signals.filter(x => !coveredSignals.has(x));
    const relevant = m.score >= cut || (fresh.length > 0 && m.score >= Math.max(FLOOR, cut * 0.34));
    if (!relevant) { alsoMatched.push(summariseMatch(m)); continue; }
    // Wrong-domain tools are out: a jpg request must not queue a video tool.
    const wantCats = new Set([...ctx.formats].map(f => FORMAT_CATEGORY[f]).filter(Boolean));
    if (wantCats.size && !wantCats.has(tool.category) && m.subjectHits === 0) { alsoMatched.push(summariseMatch(m)); continue; }
    // A question about an uploaded document is answered from that document. A
    // video or audio tool has nothing to say about a contract, however well its
    // title happens to match a word in the sentence.
    // No exemption for a matching noun here: "the escalation contact" must not
    // queue a contact-sheet maker. The answer comes from the document.
    if (answerFromFile && !DOCUMENT_CATEGORIES.has(tool.category)) {
      alsoMatched.push(summariseMatch(m));
      continue;
    }
    // After the first two tools, only complementary operations join the chain.
    if (toolSteps.filter(x => x.auto).length >= 1 && fresh.length === 0 && m.score < cut) { alsoMatched.push(summariseMatch(m)); continue; }
    const bespoke = isBespoke(tool);
    // "Write an email to my professor" is a composition task: noun-only matches
    // such as Email Masker are not what the user asked for.
    if (composing && m.verbHits + m.formatHits === 0) { alsoMatched.push(summariseMatch(m)); continue; }
    // Do not queue a generic tool when a built-in capability already does the job.
    if (capCoversPdf && tool.category === 'PDF' && !pdfOps) { alsoMatched.push(summariseMatch(m)); continue; }
    if (capCoversYoutube && /youtube/i.test(String(tool.slug))) { alsoMatched.push(summariseMatch(m)); continue; }
    if (capCoversMap && tool.slug !== 'maps' && /map|directory|kerala|trivandrum|spatial/i.test(String(tool.slug))) { alsoMatched.push(summariseMatch(m)); continue; }
    if (capCoversResearch && /^(wikipedia|research)/i.test(String(tool.slug))) { alsoMatched.push(summariseMatch(m)); continue; }
    if (/\b(compress|smaller|shrink)\b/i.test(ctx.prompt) && /\b(photo|image|jpg|png|picture)\b/i.test(ctx.prompt) &&
        /size-calculator|print-size|data-size|passport|photo-strip|collage/i.test(String(tool.slug))) { alsoMatched.push(summariseMatch(m)); continue; }
    // A PDF tool is normally "bespoke" (the studio is its own app), but AI Mode
    // can run the unambiguous operations itself on the attached file. That is
    // the difference between "open this app" and "this is already done".
    const pdfOp = bespoke && tool.category === 'PDF' ? pdfOpFor(tool) : null;
    // Several slugs are aliases of the same operation (Images to PDF, JPG to
    // PDF, PNG to PDF, WEBP to PDF). Queueing all of them is noise, so coverage
    // is tracked per operation as well as per tool.
    if (pdfOp && coveredOps.has(pdfOp)) { alsoMatched.push(summariseMatch(m)); continue; }
    const canRunPdf = pdfOp && pdfOpHasInput(pdfOp, ctx.files);
    const isAuto = (!bespoke || canRunPdf) && toolSteps.filter(x => x.auto).length < MAX_AUTO_TOOLS;
    const isTopBespoke = bespoke && !canRunPdf && !steps.some(s2 => s2.tool === tool.slug) &&
      (m === ranked[0] || m.score >= cut * 1.8) && bespokeOpenSteps < 2 && !capCoversMap;
    if (isTopBespoke) bespokeOpenSteps++;
    const payload = {
      executor: canRunPdf ? 'pdf-ops' : (isAuto ? 'toolbus' : null),
      kind: 'tool',
      title: isAuto ? `Run ${tool.title}` : `Open ${tool.title}`,
      detail: tool.description || '',
      tool: tool.slug, toolTitle: tool.title, category: tool.category,
      action: isAuto ? 'run' : 'open',
      auto: isAuto,
      input: needsFile(tool) ? 'file' : (transforms.length || gathered.length ? 'prev' : 'request'),
      params: canRunPdf
        ? { op: pdfOp, prompt: ctx.prompt, range: pdfRangeFrom(ctx.prompt), text: ctx.topic || ctx.prompt }
        : { matchScore: m.score, matched: m.matched, text: ctx.topic || ctx.prompt },
      why: canRunPdf
        ? `AI Mode runs this itself on the attached file (${PDF_OP_VERB[pdfOp]?.toLowerCase() || pdfOp})${ctx.files.length ? `: ${ctx.files.map(f => f.name).join(', ')}` : ''} — no need to open the studio.`
        : (isTopBespoke && tool.category === 'PDF'
          ? handoffWhy(tool, ctx)
          : `Matched ${(m.matched || []).join(', ') || tool.category} in the ${index.size}-tool library${m.verbHits ? ` (operation: ${ctx.verbs.join('/')})` : ''}.`),
      outputKind: isAuto ? (canRunPdf ? 'file' : 'text') : 'link',
      stage: isAuto ? 'transform' : 'output',
      // A step that genuinely runs is not a "maybe" — only hand-offs and the
      // surplus companion step are optional.
      optional: toolSteps.length >= 2 || (bespoke && !canRunPdf)
    };
    if (isAuto || isTopBespoke) {
      covered.add(tool.slug);
      if (canRunPdf) coveredOps.add(pdfOp);
      toolSteps.push(push(payload));
      signals.forEach(x => coveredSignals.add(x));
    } else alsoMatched.push(summariseMatch(m));
  }

  /* ---- 3b. purpose-built tools for well-known workflows ---- */
  const PURPOSE_BUILT = [
    // A big attached PDF plus a topic is the "1000-page" ask: find the pages
    // that matter first, then read only those. Nothing is uploaded.
    { when: () => ctx.hasKind('pdf') && /\b(find|search|locate|which pages?|relevant pages?|about|regarding|regarding)\b/i.test(ctx.prompt)
        && /\b(page|pages|section|chapter|part|topic|subject|diabetes|information|answer|question|note)\b/i.test(ctx.prompt)
        && !/\b(split|cut|separate|rotate|merge|watermark|number|compress|crop|delete|remove)\b/i.test(ctx.prompt),
      slugs: ['agentic-pdf-splitter'], why: 'The splitter reads the text layer in your browser and ranks the pages against your own words, then saves the matching ones as one PDF.' },
    { when: () => wantsNotes && /\b(question paper|questions?|exam|textbook|chapter|syllabus|assignment)\b/i.test(ctx.prompt),
      slugs: ctx.hasKind('pdf') ? ['agentic-pdf-splitter', 'question-paper-to-notes'] : ['question-paper-to-notes', 'pdf-study-pack-maker'],
      why: 'Per-question study work is what these tools were built for; your files stay on this device.' },
    { when: () => wantsOcr && (ctx.hasKind('pdf') || /\bpdfs?\b/i.test(ctx.prompt)), slugs: ['ocr-pdf'],
      why: 'Scanned PDFs need the in-browser OCR reader.' },
    { when: () => wantsOcr && ctx.hasKind('image'), slugs: ['ocr-image-to-text', 'image-ocr'],
      why: 'Images are read with in-browser OCR.' },
    { when: () => intentIds.has('osint') && /\b(instagram|username|handle|profile)\b/i.test(ctx.prompt),
      slugs: ['osint-advanced', 'public-profile-url-checker'], why: 'Public-profile lookups only; nothing private is touched.' },
    { when: () => intentIds.has('osint') && /\b(dns|tls|ssl|headers|redirect|robots|sitemap|whois)\b/i.test(ctx.prompt),
      slugs: ['url-metadata-inspector'], why: 'The public inspector answers protocol questions without leaving the browser for anything private.' },
    { when: () => wantsYouTube && ctx.youtube.some(l => l.playlist && !l.videoId), slugs: ['youtube-playlist-lister'],
      why: 'Playlist links are listed by the dedicated playlist tool.' },
    { when: () => wantsYouTube && !ctx.youtube.length, slugs: ['youtube-transcript'],
      why: 'Paste the video link (or drop it in the links box) and AI Mode reads the captions itself.' },
    { when: () => wantsPdf && ctx.hasKind('image') && !ctx.hasKind('pdf'), slugs: ['image-to-pdf', 'jpg-to-pdf'],
      why: 'Images become a PDF in the image-to-PDF tool.' },
    { when: () => /\b(sign|signature|signing|signed)\b/i.test(ctx.prompt) && ctx.hasKind('pdf'),
      slugs: ['sign-pdf'], why: 'A signature is placed by hand, so the studio is the honest place for it.' },
    { when: () => /\b(fill (?:in|out)|fill the (?:form|fields?)|fillable|form fields?)\b/i.test(ctx.prompt) && ctx.hasKind('pdf'),
      slugs: ['fill-pdf'], why: 'Form fields are filled one by one in the studio.' },
    { when: () => /\b(annotate|comments? in|highlight)\b/i.test(ctx.prompt) && ctx.hasKind('pdf'),
      slugs: ['annotate-pdf'], why: 'Marks are placed by hand in the studio.' },
    { when: () => /\b(repair|fix|broken|corrupt|damaged|unreadable)\b/i.test(ctx.prompt) && /\bpdf\b/i.test(ctx.prompt),
      slugs: ['repair-pdf'], why: 'A damaged file is recovered with your say-so, in the studio.' },
    { when: () => /\b(ocr|scan(ned)?|read (?:this )?(?:pdf|file)|searchable)\b/i.test(ctx.prompt) && ctx.hasKind('pdf'),
      slugs: ['ocr-pdf'], why: 'Scanned pages are read in this browser, page by page.' },
    { when: () => intentIds.has('privacy') && /\b(mask|redact|hide|pii|anonymi[sz]e)\b/i.test(ctx.prompt),
      slugs: ctx.hasKind('pdf') ? ['redact-pdf'] : ['pii-masker', 'text-anonymizer'], why: 'Redaction and masking are permanent, local operations.' },
    { when: () => intentIds.has('business-doc') && /\b(invoice|bill)\b/i.test(ctx.prompt), slugs: ['invoice-maker', 'invoice-pdf-maker'],
      why: 'Invoice layout and totals are handled by the invoice tools.' },
    { when: () => /\bpdfs?\b/i.test(ctx.prompt) && /\b(split|cut|separate|divide|single pages?|chapters?)\b/i.test(ctx.prompt),
      slugs: ['split-pdf', 'agentic-pdf-splitter'], why: 'Splitting a PDF is a dedicated studio tool.' },
    { when: () => wantsPdf && /\b(notes?|text|essay|markdown|md)\b/i.test(ctx.prompt) && !wantsResearch,
      slugs: ['text-to-pdf', 'markdown-to-pdf'], why: 'Plain text or notes become a PDF in the text-to-PDF studio.' },
    { when: () => /\b(how old|age|born in|date of birth|dob)\b/i.test(ctx.prompt),
      slugs: ['age-calculator', 'date-difference'], why: 'Age and date-difference calculators cover this without inventing a new tool.' },
    { when: () => /\b(how big|how large|filesize|file size)\b/i.test(ctx.prompt) && !/\b(compress|smaller|shrink|photo|image|jpg|png)\b/i.test(ctx.prompt),
      slugs: ['file-size-calculator', 'image-file-size-calculator'], why: 'File size is a dedicated calculator.' },
    { when: () => /\b(smaller|compress|shrink|reduce)\b/i.test(ctx.prompt) && /\b(photo|image|jpg|jpeg|png|picture)\b/i.test(ctx.prompt),
      slugs: ['image-compressor'], why: 'Making a photo smaller in bytes is the image compressor.' },
    { when: () => /\b(silence|trim|cut)\b/i.test(ctx.prompt) && /\b(mp3|wav|audio|m4a|flac)\b/i.test(ctx.prompt),
      slugs: ['silence-remover', 'audio-trimmer'], why: 'Silence and trim are dedicated audio tools, complementary to format conversion.' }
  ];
  for (const rule of PURPOSE_BUILT) {
    if (!rule.when()) continue;
    for (const slug of rule.slugs) {
      const doc = index.bySlug.get(slug);
      if (!doc || covered.has(slug)) continue;
      const tool = doc.tool;
      covered.add(slug);
      const bespoke = isBespoke(tool);
      // A purpose-built PDF tool is still runnable in place when the request
      // carries the file it needs — same rule as the generic matcher.
      const op = bespoke && tool.category === 'PDF' ? pdfOpFor(tool) : null;
      const canRun = op && pdfOpHasInput(op, ctx.files) && !coveredOps.has(op);
      if (canRun) coveredOps.add(op);
      toolSteps.push(push({
        executor: canRun ? 'pdf-ops' : (bespoke ? null : 'toolbus'), kind: 'tool',
        title: bespoke && !canRun ? `Open ${tool.title}` : `Run ${tool.title}`,
        detail: tool.description || '', tool: tool.slug, toolTitle: tool.title, category: tool.category,
        action: bespoke && !canRun ? 'open' : 'run', auto: !bespoke || canRun,
        input: needsFile(tool) ? 'file' : 'prev',
        params: canRun
          ? { op, prompt: ctx.prompt, range: pdfRangeFrom(ctx.prompt), purpose: true, mode: ctx.options.mode, target: ctx.options.target }
          : { mode: ctx.options.mode, target: ctx.options.target, purpose: true },
        why: canRun
          ? `${rule.why} AI Mode runs it on the attached file directly.`
          : (bespoke && !canRun ? handoffWhy(tool, ctx, rule.why) : rule.why),
        outputKind: bespoke && !canRun ? 'link' : (canRun ? 'file' : 'text'),
        stage: bespoke && !canRun ? 'output' : 'transform'
      }));
      break;                                    // first existing slug wins
    }
  }
  if (wantsNotes && (['gemini', 'notebooklm'].includes(ctx.options.target) || ctx.options.mode !== 'auto')) {
    notes.push(`Mode "${ctx.options.mode}" → ${ctx.options.mode === 'per' ? 'one block per question, which suits NotebookLM' : 'one batch, which suits a 1M-context assistant'}.`);
  }

  /* ---- 4. outputs ---- */
  const outputs = [];
  if (wantsPresentation) {
    outputs.push(push({ executor: 'presentation', title: 'Create the .pptx',
      detail: 'Research → slides with source links, built by the Presentation engine.',
      params: { topic: ctx.topic || ctx.prompt }, why: 'A slide deck was requested.', outputKind: 'file', requires: gatherIds }));
  }
  const pdfSource = steps.find(s => ['article', 'combine', 'outline', 'research', 'pdf-read', 'file-read', 'youtube-transcript'].includes(s.executor));
  if (wantsPdf && !wantsPresentation && pdfSource) {
    const sourceStep = pdfSource;
    outputs.push(push({ executor: 'article-pdf', title: `Build “${ctx.topic || 'document'}.pdf”`,
      detail: 'Title page, sections, lead image (when fetchable and licensed), numbered pages and a source list with retrieval date.',
      params: { title: ctx.topic || 'MegaPLAN document', includeImage: ctx.options.includeImages, source: sourceStep?.id || null },
      why: 'You asked for a PDF; this step writes the real file to your downloads.',
      outputKind: 'file', requires: sourceStep ? [sourceStep.id] : [] }));
  } else if (wantsPdf && !wantsPresentation && !steps.some(s => /pdf/i.test(String(s.tool || '')))) {
    notes.push('Nothing to put in the PDF yet: name a topic, paste text, or attach the file you want turned into a PDF.');
  }
  if (['gemini', 'notebooklm', 'assistant'].includes(ctx.options.target)) {
    outputs.push(push({ executor: 'prompts', title: `Copy-paste prompt pack for ${targetLabel(ctx.options.target)}`,
      detail: 'Everything gathered above, formatted for the external assistant you chose. Nothing is sent anywhere by MegaPLAN.',
      params: { target: ctx.options.target, mode: ctx.options.mode }, why: `You selected ${targetLabel(ctx.options.target)} as the target.`,
      outputKind: 'text' }));
  }
  if (routeRequest) {
    outputs.push(push({ executor: 'map-route', title: 'Plan the route', stage: 'output',
      detail: 'OSRM driving route with distance, duration and turn geometry, drawn on the map.',
      params: { from: routeRequest.from, to: routeRequest.to },
      why: 'A route/directions request was detected.', outputKind: 'map', requires: routeRequest.origin }));
  }
  if (wantsMap) {
    outputs.push(push({ executor: null, kind: 'tool', action: 'open', auto: false, title: 'Open the result on the map',
      tool: 'maps', toolTitle: 'Maps', category: 'Productivity',
      params: { place: ctx.place?.text || '', poi: null },
      why: 'Map steps are drawn on the Maps tool, which accepts a deep link.', outputKind: 'link', stage: 'output' }));
  }
  if (composing && !hasMaterial) {
    outputs.push(push({ executor: 'prompts', title: 'Prepare a copy-paste writing prompt',
      detail: 'AI Mode writes the instruction pack (topic, tone, length, audience) so you can run it in any assistant you have. It will not invent the email itself.',
      params: { target: ctx.options.hasKey ? 'assistant' : ctx.options.target, task: 'compose' },
      why: 'A composition task needs source material or an assistant; the prompt pack is the honest first step.',
      outputKind: 'text', stage: 'output' }));
  }

  /* ---- 5. optional assistant pass ---- */
  if ((ctx.options.target === 'assistant' || wantsWriting) && hasMaterial) {
    outputs.push(push({ executor: 'assistant', title: 'Writing-assistant pass (optional)',
      detail: ctx.options.hasKey ? 'Uses your own provider key directly from this browser.' : 'Uses the hosted writing assistant when this deployment has one configured; otherwise it is skipped and the local result stands.',
      params: { task: wantsNotes ? 'notes' : wantsWriting ? 'rewrite' : 'custom' },
      why: 'A writing/summary task benefits from a language pass, but it is never required for the plan to work.',
      outputKind: 'text', optional: true, stage: 'assist', requires: gatherIds }));
  }

  /* ---- 6. deficit → private tool ---- */
  for (const gap of gaps) {
    for (const slug of gap.suggest || []) {
      const doc = index.bySlug.get(slug);
      if (!doc || covered.has(slug)) continue;
      covered.add(slug);
      const tool = doc.tool;
      outputs.push(push({ executor: null, kind: 'tool', action: 'open', auto: false,
        title: `Open ${tool.title} instead`, detail: tool.description || '',
        tool: tool.slug, toolTitle: tool.title, category: tool.category,
        params: {}, why: 'This is the lawful, working alternative for what you asked.',
        outputKind: 'link', stage: 'output' }));
    }
  }
  if (steps.length === 0 && !gaps.length && !ctx.files.length && !ctx.links.length) {
    notes.push('I could not read a task from that text. Add a verb and an object — for example "convert this CSV to JSON and count the rows".');
  }
  const deficit = !gaps.length && (steps.length === 0 || (intents.length === 0 && ranked.length === 0 && !ctx.topic));
  let newTool = null;
  if (deficit) {
    newTool = draftToolSpec(ctx);
    outputs.push(push({ executor: 'new-tool', title: `Draft a private tool: ${newTool.title}`,
      detail: `No existing tool covers this. AI Mode drafts a private tool (saved under your session code) that you can push for public review later.`,
      params: { spec: newTool }, why: 'Nothing in the 590-tool library matched, so the honest answer is a new tool, not a fake result.',
      outputKind: 'json', stage: 'output' }));
  }

  const all = [...gathered, ...transforms, ...toolSteps, ...outputs];
  all.sort((a, b) => (STAGE_ORDER[a.stage] ?? 1) - (STAGE_ORDER[b.stage] ?? 1) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  // Renumber for display, keeping the dependency graph intact.
  const remap = new Map(all.map((s, i) => [s.id, `s${i + 1}`]));
  all.forEach((s, i) => { s.n = i + 1; s.id = `s${i + 1}`; });
  for (const s of all) {
    s.requires = [...new Set((s.requires || []).map(r => remap.get(r) || r))].filter(r => r !== s.id && all.some(x => x.id === r));
  }

  const prompts = buildPromptPack(ctx, all);
  const summary = summarise(ctx, intents, all, gaps, newTool);

  return {
    version: 2,
    id: `plan-${all.length}-${hashString(ctx.prompt + ctx.files.map(f => f.name).join())}`,
    created: Date.now(),
    request: {
      prompt: ctx.prompt, topic: ctx.topic, place: ctx.place, language: ctx.options.language,
      files: ctx.files.map(f => ({ name: f.name, kind: f.kind, size: f.size })),
      links: ctx.links.map(l => ({ url: l.url, kind: l.kind })),
      options: ctx.options
    },
    intents, gaps, steps: all, notes: dedupe([...notes, ...gaps.map(g => g.message)]),
    alsoMatched: alsoMatched.slice(0, 12),
    library: ranked.slice(0, 12).map(m => ({ ...summariseMatch(m), ...(refusals.has(m.tool.slug) ? { unavailable: refusals.get(m.tool.slug) } : {}) })),
    needsNewTool: Boolean(newTool), newTool,
    prompts, summary,
    stats: {
      steps: all.length,
      auto: all.filter(s => s.auto).length,
      manual: all.filter(s => !s.auto).length,
      capabilities: new Set(all.filter(s => s.kind !== 'tool').map(s => s.executor)).size,
      tools: all.filter(s => s.kind === 'tool').length,
      librarySize: index.size
    }
  };
}

/**
 * What each catalogued tool will not do, in words a person can act on, and the
 * tool that does the same job lawfully. A refusal without an alternative is a
 * dead end; these are the answers, not the refusals.
 */
const REFUSALS = {
  'youtube-video-downloader': 'MegaPLAN does not download or re-host hosted video, and will not work around a site that does not want it downloaded. If you have the file, Video Trimmer, Video Compressor and Extract Audio will work on it here.',
  'youtube-audio-extractor': 'MegaPLAN does not pull the audio out of someone else\'s video. If you already have the file, Extract Audio turns it into a WAV on this device.',
  'slideshare-downloader': 'SlideShare hosts other people\'s documents; this desk will not take them. Upload the file you have and Text Extractor, CSV to XLSX and the summarisers will read it.'
};

/** Which of the request's own words this tool covers — used to keep chains complementary. */
function toolSignals(tool, ctx) {
  const raw = [...tokens(tool.title), ...tokens(String(tool.slug || '').replace(/-/g, ' '))];
  const set = new Set([...raw, ...raw.map(stem), ...expandTokens(raw)]);
  const out = [];
  for (const w of [...ctx.verbs, ...ctx.formats, ...ctx.subjects]) {
    if (set.has(w) || set.has(stem(w)) || (SYNONYMS[w] || []).some(syn => set.has(syn) || set.has(stem(syn)))) out.push(w);
  }
  return out;
}

function summariseMatch(m) {
  return { slug: m.tool.slug, title: m.tool.title, category: m.tool.category, status: m.tool.status || 'beta',
    description: m.tool.description || '', score: m.score, matched: m.matched || [], bespoke: isBespoke(m.tool),
    ...(m.unavailable ? { unavailable: m.unavailable } : {}) };
}

function targetLabel(target) {
  return { gemini: 'Google AI Studio (1M context)', notebooklm: 'NotebookLM', assistant: 'the MegaPLAN writing assistant', local: 'this browser', file: 'a file output' }[target] || target;
}

function normalisePoi(word) {
  const map = { cafes: 'cafe', restaurants: 'restaurant', hotels: 'hotel', hospitals: 'hospital', schools: 'school', colleges: 'college', banks: 'bank', atms: 'atm', pharmacies: 'pharmacy', parks: 'park', stations: 'station', airports: 'airport', temples: 'temple', churches: 'church', mosques: 'mosque', shops: 'shop', stores: 'shop', malls: 'mall', gyms: 'fitness_centre', salon: 'beauty', salons: 'beauty', clinics: 'clinic', libraries: 'library', bakery: 'bakery', supermarket: 'supermarket', petrol: 'fuel' };
  return map[String(word || '').toLowerCase()] || String(word || '').toLowerCase().replace(/s$/, '');
}

function shortHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return String(url).slice(0, 40); }
}

function isSelfReferential(tool) {
  return ['ai-mode'].includes(String(tool.slug));
}

/** Tools whose UI is a bespoke app the generic bus cannot drive blindly. */
const BESPOKE_SLUGS = new Set(['ai-mode', 'audio-studio', 'maps', 'map-directory', 'map-auto-scraper', 'kerala-ai', 'presentation-creator', 'osint-advanced', 'instagram-osint-checker', 'youtube-transcript', 'youtube-playlist-lister', 'youtube-chapter-generator', 'agentic-pdf-splitter', 'question-paper-to-notes', 'data-sources-status', 'trivandrum-music-places', 'trivandrum-shop-directory', 'music-directory', 'product-directory', 'chess', 'snake-game', 'tetris', 'minesweeper', 'tic-tac-toe', 'game-2048', 'inception-tool', 'reviewed-image-link-directory', 'wiki-agent', 'self-agent']);
const BESPOKE_CATEGORIES = new Set(['Games', 'Maps']);

/** Categories that can plausibly help with a document that was just uploaded. */
const DOCUMENT_CATEGORIES = new Set([
  'PDF', 'Text', 'Files & Data', 'Productivity', 'OCR & AI', 'Business', 'Education', 'Developer', 'AI', 'Health & Medical'
]);

export function isBespoke(tool) {
  if (!tool) return true;
  // The measured contract table wins over inference when it is present:
  // S = an app or interactive studio, C = no runner, F = not verifiably real.
  // Everything else falls back to the rules below.
  if (tool.toolClass === 'S' || tool.toolClass === 'C' || tool.toolClass === 'F') return true;
  if (BESPOKE_SLUGS.has(String(tool.slug))) return true;
  if (BESPOKE_CATEGORIES.has(String(tool.category))) return true;
  if (/^(chess|2048|snake|minesweeper|tic|tetris)/i.test(String(tool.slug))) return true;
  if (tool.category === 'PDF') return true;                 // the PDF studio is its own app
  if (tool.status === 'catalogued') return true;            // no real runner behind it
  return false;
}

function needsFile(tool) {
  return /\b(file|upload|choose|drop|image|audio|video|pdf|csv|document)\b/i.test(String(tool?.description || ''));
}

function dedupe(list) { return [...new Set(list.filter(Boolean))]; }

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function slugify(value, fallback = 'custom-tool') {
  const slug = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return slug || fallback;
}

/** When nothing matches, propose a concrete private tool instead of guessing. */
export function draftToolSpec(ctx) {
  const topic = ctx.topic || ctx.prompt.slice(0, 60) || 'custom workflow';
  const actions = detectActions(ctx.prompt);
  return {
    slug: slugify(topic, 'private-tool'),
    title: titleCase(topic).slice(0, 60),
    summary: `Private tool drafted from: “${ctx.prompt.slice(0, 160)}”. It combines ${ctx.files.length} uploaded file(s), ${ctx.links.length} link(s) and the ${actions.join('/') || 'requested'} operation. Nothing is published until you push it for review.`,
    actions: actions.length ? actions : ['custom'],
    inputs: [
      ...(ctx.files.length ? ctx.files.map(f => ({ label: f.name, kind: f.kind })) : []),
      ...(ctx.links.length ? ctx.links.map(l => ({ label: l.url, kind: l.kind })) : []),
      { label: 'Instructions', kind: 'text' }
    ],
    outputs: [{ label: 'Result', kind: wantsFileOutput(ctx) ? 'file' : 'text' }],
    basedOn: ctx.prompt.slice(0, 300)
  };
}

function wantsFileOutput(ctx) {
  return /\b(pdf|pptx?|csv|json|xlsx|zip|mp3|wav|png|jpg|download)\b/i.test(ctx.prompt);
}

function titleCase(value) {
  return String(value || '').replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

/** Copy-paste prompt pack for external assistants; never sent anywhere by us. */
function buildPromptPack(ctx, steps) {
  const gathered = steps.filter(s => s.stage === 'gather').map(s => s.title);
  const outputs = steps.filter(s => s.stage === 'output').map(s => s.title);
  const corpus = [
    `Request: ${ctx.prompt}`,
    ctx.topic ? `Subject: ${ctx.topic}` : '',
    ctx.files.length ? `Files: ${ctx.files.map(f => `${f.name} (${f.kind})`).join(', ')}` : '',
    ctx.links.length ? `Links: ${ctx.links.map(l => l.url).join(', ')}` : '',
    `Chain MegaPLAN planned: ${steps.map(s => s.title).join(' → ')}`
  ].filter(Boolean).join('\n');
  const perItem = ctx.options.mode === 'per';
  const gemini = [
    `You are given source material and must answer only from it.`,
    `Task: ${ctx.prompt || 'Summarise the source material.'}`,
    perItem ? 'Work one item at a time and label each answer with the item it belongs to.' : 'Work in one batch and keep answers grouped by section.',
    'Cite the section or page for every claim. If the source does not contain the answer, say so — never invent it.',
    '',
    corpus,
    '',
    'Sources gathered by MegaPLAN:', gathered.map((g, i) => `${i + 1}. ${g}`).join('\n') || '(none)',
    'Expected output shape:', outputs.map((o, i) => `${i + 1}. ${o}`).join('\n') || '(free text)'
  ].join('\n');
  const notebooklm = [
    'Answer using only the uploaded sources.',
    ctx.topic ? `Topic: ${ctx.topic}` : '',
    perItem ? 'Produce one answer block per question/item.' : 'Produce a single structured summary with headings.',
    'Include a short source note for each block.',
    '',
    corpus
  ].filter(Boolean).join('\n');
  const assistant = [
    `Rewrite the following as ${ctx.options.mode === 'per' ? 'one clear block per item' : 'one clear document'}.`,
    'Keep every fact, keep the attribution lines, and do not add claims that are not in the text.',
    '',
    corpus
  ].join('\n');
  return { gemini, notebooklm, assistant, corpus };
}

function summarise(ctx, intents, steps, gaps, newTool) {
  const auto = steps.filter(s => s.auto).length;
  const manual = steps.length - auto;
  const head = intents.length ? intents.slice(0, 2).map(i => i.label).join(' + ') : 'General request';
  const bits = [`${head}: ${steps.length} step${steps.length === 1 ? '' : 's'} (${auto} run here, ${manual} open a tool or need you)`];
  if (ctx.topic) bits.push(`subject “${ctx.topic}”`);
  if (ctx.files.length) bits.push(`${ctx.files.length} file(s)`);
  if (ctx.youtube.length) bits.push(`${ctx.youtube.length} YouTube link(s)`);
  if (gaps.length) bits.push(`${gaps.length} honest limitation(s)`);
  if (newTool) bits.push('no library match → private tool drafted');
  return bits.join(' · ');
}

/** Plain-text rendering used by the chat thread and "Copy plan". */
export function planToText(plan) {
  const lines = [`Plan — ${plan.summary}`, ''];
  plan.steps.forEach(s => {
    const tag = s.auto ? 'RUN' : s.action === 'open' ? 'OPEN' : s.optional ? 'OPT' : 'YOU';
    lines.push(`${s.n}. [${tag}] ${s.title}${s.toolTitle ? ` — ${s.toolTitle}` : ''}`);
    if (s.why) lines.push(`   why: ${s.why}`);
    if (s.detail) lines.push(`   ${s.detail}`);
  });
  if (plan.notes.length) { lines.push('', 'Notes:'); plan.notes.forEach(x => lines.push(`- ${x}`)); }
  return lines.join('\n');
}

export const PLANNER_VERSION = '2.0.0';
