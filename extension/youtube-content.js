const sleep = ms => new Promise(r => setTimeout(r, ms));
function visibleText(el) { return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim(); }
function isTranscriptButton(el) {
  const s = ((el.getAttribute?.('aria-label') || '') + ' ' + visibleText(el)).toLowerCase();
  return s.includes('show transcript') || s === 'transcript' || s.includes('open transcript');
}
async function openTranscriptPanel() {
  const candidates = [...document.querySelectorAll('button, tp-yt-paper-button, yt-button-renderer, ytd-button-renderer')];
  const btn = candidates.find(isTranscriptButton);
  if (btn) { btn.click(); await sleep(900); return true; }
  const more = [...document.querySelectorAll('button')].find(b => /more/i.test(visibleText(b)));
  if (more) { more.click(); await sleep(300); const b2=[...document.querySelectorAll('[role="menuitem"],button,tp-yt-paper-item')].find(isTranscriptButton); if(b2){b2.click();await sleep(900);return true;} }
  return false;
}
function readTranscript() {
  const segs = [...document.querySelectorAll('ytd-transcript-segment-renderer')];
  if (segs.length) return segs.map(s => { const ts=visibleText(s.querySelector('.segment-timestamp'))||visibleText(s.querySelector('[class*="timestamp"]')); const tx=visibleText(s.querySelector('.segment-text'))||visibleText(s); return (ts?ts+'\t':'')+tx; }).filter(Boolean);
  const generic=[...document.querySelectorAll('[class*="segment"]')].map(visibleText).filter(s => s.length>2 && s.length<500);
  return [...new Set(generic)].slice(0,2000);
}
function getVideoContext() {
  const url=location.href.split('&')[0];
  const title=document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/i,'').trim();
  const id=(new URL(location.href).searchParams.get('v')) || '';
  return {url,title,videoId:id,isYouTube:/youtube\.com|youtu\.be/.test(location.hostname)};
}
function collectLinks(){
  const links=[...document.querySelectorAll('a[href*="/watch?v="]')].map(a=>{try{return new URL(a.href,location.href).toString().split('&')[0]}catch{return null}}).filter(Boolean);
  return [...new Set(links)];
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async()=>{
    if(msg?.type==='GET_CONTEXT'){ sendResponse({ok:true,...getVideoContext()}); return; }
    if(msg?.type==='GET_TRANSCRIPT'){ const opened=await openTranscriptPanel(); const lines=readTranscript(); sendResponse({ok:lines.length>0,opened,lines,context:getVideoContext(),error:lines.length?'': 'YouTube transcript panel could not be read. Open Show transcript manually and retry.'}); return; }
    if(msg?.type==='COLLECT_LINKS'){ sendResponse({ok:true,links:collectLinks(),context:getVideoContext()}); return; }
    sendResponse({ok:false,error:'Unknown action'});
  })().catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));
  return true;
});
