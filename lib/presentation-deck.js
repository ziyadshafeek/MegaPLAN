import pptxgen from 'pptxgenjs';

const COLORS = { ink: '182B3A', accent: '087F8C', cream: 'F7F5EE', muted: '506273' };
const summarize = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 340);

export function planDeck({ topic, notes = '', research, slideCount = 5 }) {
  const count = Math.max(3, Math.min(8, Number(slideCount) || 5));
  const rawLines = String(notes).split(/[\n.!?]+/).map(s => s.trim()).filter(x => x.length > 8);
  const userLines = rawLines.slice(0, (count - 2) * 5).map(summarize);
  const omitted = rawLines.length > userLines.length || rawLines.some(x => x.length > 340);
  const facts = [...(research?.articles || []), ...(research?.web || []), ...(research?.dataset || [])].map(item => ({ text: summarize(item.snippet || item.title), source: item.url })).filter(x => x.text);
  if (!userLines.length && !facts.length) throw Object.assign(Error('No source text available. Provide notes or retry research when connected.'), { status: 503 });
  const points = userLines.length ? userLines.map(text => ({ text, source: 'User-provided notes' })) : facts;
  const bodySlides = [];
  const groups = count - 2;
  const per = Math.max(1, Math.ceil(points.length / groups));
  for (let i = 0; i < groups; i++) {
    const selected = points.slice(i * per, (i + 1) * per).slice(0, 5);
    if (selected.length) bodySlides.push({ title: `${topic} · ${i + 1}`, points: selected });
  }
  const references = [...new Set(facts.map(item => item.source).filter(Boolean))].slice(0, 5);
  return { topic, slides: bodySlides, references, images: (research?.images || []).slice(0, 4),
    note: userLines.length ? `Slides based on the user’s notes. References are suggested reading, not fact verification.${omitted ? ' Some notes were shortened or omitted to fit the selected slide count.' : ''}` : 'Source snippets are attributed. Check source context before presenting.' };
}

export async function makePresentation(plan) {
  const deck = new pptxgen();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'MegaPLAN';
  deck.subject = 'Source-linked presentation';
  deck.title = plan.topic;
  deck.lang = 'en-IN';
  deck.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
  function base(title, number) {
    const slide = deck.addSlide();
    slide.background = { color: COLORS.cream };
    slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, line: { color: COLORS.accent }, fill: { color: COLORS.accent } });
    slide.addText(title, { x: 0.65, y: 0.35, w: 11.8, h: 0.7, fontSize: 30, bold: true, color: COLORS.ink, breakLine: false, margin: 0 });
    slide.addText(`MegaPLAN • ${number}`, { x: 0.65, y: 7.05, w: 11.8, h: 0.25, fontSize: 9, color: COLORS.muted, margin: 0 });
    return slide;
  }
  const title = base(plan.topic, 1);
  title.addText('A source-linked presentation', { x: 0.72, y: 1.75, w: 11.1, h: 0.6, fontSize: 23, color: COLORS.accent });
  title.addText(plan.note, { x: 0.72, y: 3.0, w: 11.3, h: 1.2, fontSize: 16, color: COLORS.muted, breakLine: false });
  let number = 2;
  for (const group of plan.slides) {
    const slide = base(group.title, number++);
    const h = Math.min(1.0, 5.3 / group.points.length);
    group.points.forEach((point, index) => {
      const y = 1.35 + index * (h + 0.12);
      slide.addText(`•  ${point.text}`, { x: 0.76, y, w: 11.6, h, fontSize: 17, color: COLORS.ink, valign: 'mid', margin: 0.04, breakLine: false });
      if (point.source !== 'User-provided notes' && point.source?.startsWith('https://')) slide.addText('Source ↗', { x: 11.25, y: y + Math.min(h - 0.18, 0.45), w: 1.0, h: 0.2, fontSize: 9, color: COLORS.accent, hyperlink: { url: point.source } });
    });
  }
  const ref = base('Sources & image references', number);
  ref.addText('Check every cited source and image license before reuse. Image links are references only; no image bytes are stored or embedded.', { x: 0.72, y: 1.2, w: 11.8, h: 0.7, fontSize: 13, color: COLORS.muted });
  let y = 2;
  for (const url of plan.references.slice(0, 4)) {
    ref.addText(url.slice(0, 105), { x: 0.76, y, w: 11.6, h: 0.3, fontSize: 11, color: COLORS.accent, hyperlink: { url } });
    y += 0.42;
  }
  for (const item of plan.images.slice(0, 3)) {
    ref.addText(`${item.title.slice(0, 36)} — ${item.creator.slice(0, 25)} (${item.license})`, { x: 0.76, y, w: 11.4, h: 0.3, fontSize: 11, color: COLORS.ink, hyperlink: { url: item.landingUrl } });
    y += 0.43;
  }
  return Buffer.from(await deck.write({ outputType: 'nodebuffer' }));
}
