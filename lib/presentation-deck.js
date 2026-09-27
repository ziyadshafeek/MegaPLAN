import pptxgen from 'pptxgenjs';

const COLORS = { ink: '182B3A', accent: '087F8C', cream: 'F7F5EE', muted: '506273', rule: 'D8D2C6' };
const summarize = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 340);
const cleanTitle = value => summarize(value).replace(/[.?!]+$/, '').slice(0, 64);

/**
 * A point is either a plain string or `{ text, source }`.
 * Sources from `outline` win over snippet sources; user notes stay unattributed.
 */
function toPoints(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map(item => (typeof item === 'string'
      ? { text: summarize(item), source: null }
      : { text: summarize(item?.text ?? item?.point ?? item?.title), source: item?.source ?? item?.url ?? null }))
    .filter(p => p.text && p.text.length > 3);
}

/**
 * Build the deck plan.
 * Accepts either `notes` (free text, split into points) or an explicit
 * `outline` of `{ title, bullets }` slides — AI Mode sends the outline so the
 * deck follows the researched structure instead of raw snippets.
 */
export function planDeck({ topic, notes = '', outline = null, research, slideCount } = {}) {
  const requested = Number(slideCount) || (Array.isArray(outline) && outline.length ? outline.length + 2 : 5);
  const count = Math.max(3, Math.min(14, requested));

  const rawLines = String(notes).split(/[\n.!?]+/).map(s => s.trim()).filter(x => x.length > 8);
  const userPoints = rawLines.map(text => ({ text: summarize(text), source: 'User-provided notes' }));
  const facts = [...(research?.articles || []), ...(research?.web || []), ...(research?.dataset || [])]
    .map(item => ({ text: summarize(item.snippet || item.title), source: item.url || null, sourceName: item.source || null }))
    .filter(x => x.text);
  const outlineSlides = Array.isArray(outline)
    ? outline.map(s => ({ title: cleanTitle(s?.title || s?.heading || topic), bullets: toPoints(s?.bullets || s?.points || s?.body) })).filter(s => s.bullets.length)
    : [];

  if (!userPoints.length && !facts.length && !outlineSlides.length) {
    throw Object.assign(Error('No source text available. Provide notes or retry research when connected.'), { status: 503 });
  }

  let bodySlides = [];
  if (outlineSlides.length) {
    const maxBody = Math.max(1, count - 2);
    bodySlides = outlineSlides.slice(0, maxBody).map(s => ({ title: s.title, points: s.bullets.slice(0, 6) }));
  } else {
    const points = userPoints.length ? userPoints : facts;
    const groups = Math.max(1, count - 2);
    const per = Math.max(1, Math.ceil(points.length / groups));
    for (let i = 0; i < groups; i++) {
      const selected = points.slice(i * per, (i + 1) * per).slice(0, 6);
      if (selected.length) bodySlides.push({ title: `${cleanTitle(topic)} · ${i + 1}`, points: selected });
    }
  }

  const allReferences = [...outlineSlides, ...facts]
    .flatMap(s => toPoints(s.bullets || []).map(p => p.source))
    .filter(u => typeof u === 'string' && u.startsWith('https://'));
  const references = [...new Set(allReferences)].slice(0, 8);
  const omitted = rawLines.length > userPoints.length || rawLines.some(x => x.length > 340);

  return {
    topic,
    slides: bodySlides,
    references,
    images: (research?.images || []).slice(0, 4),
    fromOutline: outlineSlides.length > 0,
    note: outlineSlides.length
      ? 'Slides follow the researched outline. Every sourced line keeps its link; verify a source before you present it.'
      : userPoints.length
        ? `Slides based on the user’s notes. References are suggested reading, not fact verification.${omitted ? ' Some notes were shortened or omitted to fit the selected slide count.' : ''}`
        : 'Source snippets are attributed. Check source context before presenting.'
  };
}

export async function makePresentation(plan) {
  const deck = new pptxgen();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'MegaPLAN';
  deck.company = 'MegaPLAN';
  deck.subject = 'Source-linked presentation';
  deck.title = plan.topic;
  deck.lang = 'en-IN';
  deck.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };

  function base(title, number, { kicker = '' } = {}) {
    const slide = deck.addSlide();
    slide.background = { color: COLORS.cream };
    slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, line: { color: COLORS.accent }, fill: { color: COLORS.accent } });
    if (kicker) slide.addText(kicker.toUpperCase(), { x: 0.65, y: 0.28, w: 11.8, h: 0.26, fontSize: 10, color: COLORS.accent, charSpacing: 1.4, margin: 0 });
    const titleSize = kicker ? 28 : 30;
    const titleY = kicker ? 0.62 : 0.35;
    slide.addText(String(title).slice(0, 90), { x: 0.65, y: titleY, w: 11.8, h: 0.75, fontSize: titleSize, bold: true, color: COLORS.ink, margin: 0, valign: 'top' });
    slide.addShape(deck.ShapeType.line, { x: 0.68, y: titleY + 0.82, w: 1.1, h: 0, line: { color: COLORS.accent, width: 2 } });
    slide.addText(`MegaPLAN • ${number}`, { x: 0.65, y: 7.05, w: 11.8, h: 0.25, fontSize: 9, color: COLORS.muted, margin: 0 });
    return slide;
  }

  const number = () => plan.slides.length + 2;
  const title = base(plan.topic, 1, { kicker: 'Source-linked presentation' });
  title.addText(plan.note, { x: 0.72, y: 2.6, w: 11.2, h: 1.6, fontSize: 16, color: COLORS.muted, margin: 0, valign: 'top' });
  title.addText(`Prepared ${new Date().toISOString().slice(0, 10)}`, { x: 0.72, y: 4.6, w: 11.2, h: 0.3, fontSize: 12, color: COLORS.accent, margin: 0 });

  let n = 2;
  for (const group of plan.slides) {
    const slide = base(group.title, n++, { kicker: plan.fromOutline ? 'Key points' : 'Detail' });
    const count = group.points.length || 1;
    const h = Math.min(1.05, 5.2 / count);
    group.points.forEach((point, index) => {
      const y = 1.75 + index * (h + 0.16);
      slide.addText(String(index + 1).padStart(2, '0'), { x: 0.72, y: y + 0.06, w: 0.45, h: 0.3, fontSize: 11, bold: true, color: COLORS.accent, margin: 0 });
      slide.addText(point.text, { x: 1.25, y, w: 10.3, h, fontSize: 16, color: COLORS.ink, valign: 'top', margin: 0, breakLine: false });
      const link = typeof point.source === 'string' && point.source.startsWith('https://') ? point.source : null;
      if (link) slide.addText('Source ↗', { x: 11.35, y: y + 0.1, w: 1.0, h: 0.22, fontSize: 9, color: COLORS.accent, hyperlink: { url: link } });
      else if (point.source === 'User-provided notes') slide.addText('Your notes', { x: 11.35, y: y + 0.1, w: 1.0, h: 0.22, fontSize: 9, color: COLORS.muted });
    });
  }

  const ref = base('Sources & image references', number());
  ref.addText('Check every cited source and image license before reuse. Image links are references only; no image bytes are stored or embedded.', { x: 0.72, y: 1.75, w: 11.8, h: 0.7, fontSize: 13, color: COLORS.muted, margin: 0 });
  let y = 2.6;
  const refs = [...plan.references];
  if (!refs.length && !plan.images.length) {
    ref.addText('No external sources were used for this deck — it was built from the notes you supplied.', { x: 0.72, y, w: 11.6, h: 0.4, fontSize: 12, color: COLORS.ink, margin: 0 });
    y += 0.5;
  }
  for (const url of refs.slice(0, 6)) {
    ref.addText(url.slice(0, 118), { x: 0.76, y, w: 11.5, h: 0.3, fontSize: 10, color: COLORS.accent, hyperlink: { url }, margin: 0 });
    y += 0.4;
  }
  for (const item of plan.images.slice(0, 3)) {
    if (y > 6.6) break;
    ref.addText(`${item.title.slice(0, 40)} — ${item.creator.slice(0, 26)} (${item.license})`, { x: 0.76, y, w: 11.4, h: 0.3, fontSize: 11, color: COLORS.ink, hyperlink: item.landingUrl ? { url: item.landingUrl } : undefined, margin: 0 });
    y += 0.43;
  }
  return Buffer.from(await deck.write({ outputType: 'nodebuffer' }));
}
