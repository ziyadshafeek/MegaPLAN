import { timingSafeEqual } from 'node:crypto';
import { validateApiBlock } from '../../public/agent/expression.js';
const PAGE_PATH = slug => `data/agent-pages/${slug}.json`;
const PUBLIC_PAGE_PATH = slug => `public/data/agent-pages/${slug}.json`;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){2,69}$/;
const BLOCKS = new Set(['hero','text','markdown','list','table','note','tool-link','calculator','faq','api']);
const OPS = new Set(['percentage','discount','tip','gst','bmi','markup','margin','profit','break-even']);

function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
function validate(spec){
  if(!spec||spec.refusal) throw Error('Refused or missing page.');
  if(!SLUG.test(spec.slug||'')) throw Error('Invalid slug.');
  if(!spec.title||String(spec.title).length>140) throw Error('Invalid title.');
  if(!Array.isArray(spec.blocks)||!spec.blocks.length||spec.blocks.length>24) throw Error('Invalid blocks.');
  for(const b of spec.blocks){if(!BLOCKS.has(b?.type))throw Error('Unsupported block.');if(b.type==='calculator'&&!OPS.has(b.operation))throw Error('Unsupported calculator.');if(b.type==='api')validateApiBlock(b);const raw=JSON.stringify(b);if(raw.length>10000||/<script|javascript:|document\.cookie|localStorage|sessionStorage|fetch\(|XMLHttpRequest/i.test(raw))throw Error('Unsafe generated content rejected.')}
  if(!Array.isArray(spec.tests)||!spec.tests.length||spec.tests.length>6||spec.tests.some(t=>!['assert-text','assert-blocks','calculator-smoke'].includes(t?.action)))throw Error('Invalid browser tests.');
}
async function gh(path,options={}){
  const token=process.env.GITHUB_TOKEN;if(!token)throw Error('GitHub publisher is not configured.');
  const r=await fetch(`https://api.github.com${path}`,{...options,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
  const text=await r.text();if(!r.ok)throw Error(`GitHub API HTTP ${r.status}.`);return text?JSON.parse(text):{};
}

function authorized(req){const supplied=String(req.headers?.['x-agent-write-token']||'');const expected=process.env.AGENT_WRITE_TOKEN||'';const a=Buffer.from(supplied),b=Buffer.from(expected);return !!expected&&a.length===b.length&&timingSafeEqual(a,b)}
export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'POST only'});
  for(const k of ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','AGENT_WRITE_TOKEN'])if(!process.env[k])return json(res,503,{error:'GitHub publisher is not configured on this deployment.'});
  if(!authorized(req))return json(res,401,{error:'Operator authorization required.'});
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return json(res,400,{error:'Invalid JSON.'})}
  try{validate(body?.spec);if(body?.proof?.passed!==true)throw Error('Browser validation must pass before publishing.')}catch(e){return json(res,400,{error:e.message})}

  try{
    const owner=process.env.GITHUB_OWNER,repo=process.env.GITHUB_REPO,branch=process.env.GITHUB_BRANCH||'main';
    const ref=await gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);const parent=ref.object.sha;
    const commit=await gh(`/repos/${owner}/${repo}/git/commits/${parent}`);const baseTree=commit.tree.sha;
    const slug=body.spec.slug;
    const pagePath=PAGE_PATH(slug); const publicPagePath=PUBLIC_PAGE_PATH(slug);
    const page={...body.spec,publishedAt:new Date().toISOString(),source:'wiki-agent'};
    const pageBlob=await gh(`/repos/${owner}/${repo}/git/blobs`,{method:'POST',body:JSON.stringify({content:JSON.stringify(page,null,2)+'\n',encoding:'utf-8'})});
    let index=[];
    try{
      const current=await gh(`/repos/${owner}/${repo}/contents/data/agent-pages.json?ref=${encodeURIComponent(branch)}`);
      index=JSON.parse(Buffer.from(current.content,'base64').toString('utf8'));
    }catch(e){if(!/GitHub API HTTP 404\./.test(e.message))throw e}
    if(!Array.isArray(index))throw Error('Invalid published wiki index.');
    index=[...index.filter(x=>x.slug!==slug),{slug,title:page.title,summary:page.summary||'',path:pagePath}].sort((a,b)=>a.title.localeCompare(b.title));
    const indexBlob=await gh(`/repos/${owner}/${repo}/git/blobs`,{method:'POST',body:JSON.stringify({content:JSON.stringify(index,null,2)+'\n',encoding:'utf-8'})});
    const publicPageBlob=pageBlob;
    const publicIndexBlob=indexBlob;
    const tree=await gh(`/repos/${owner}/${repo}/git/trees`,{method:'POST',body:JSON.stringify({base_tree:baseTree,tree:[
      {path:pagePath,mode:'100644',type:'blob',sha:pageBlob.sha},
      {path:publicPagePath,mode:'100644',type:'blob',sha:publicPageBlob.sha},
      {path:'data/agent-pages.json',mode:'100644',type:'blob',sha:indexBlob.sha},
      {path:'public/data/agent-pages.json',mode:'100644',type:'blob',sha:publicIndexBlob.sha}
    ]})});
    const newCommit=await gh(`/repos/${owner}/${repo}/git/commits`,{method:'POST',body:JSON.stringify({message:`agent wiki: publish ${slug}`,tree:tree.sha,parents:[parent]})});
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,{method:'PATCH',body:JSON.stringify({sha:newCommit.sha,force:false})});
    let deploymentTriggered=false;
    if(process.env.VERCEL_DEPLOY_HOOK_URL){try{const d=await fetch(process.env.VERCEL_DEPLOY_HOOK_URL,{method:'POST'});deploymentTriggered=d.ok}catch{}}
    return json(res,200,{ok:true,commit:newCommit.sha,path:pagePath,deployed:deploymentTriggered});
  }catch(e){return json(res,502,{error:e.message||'Publish failed.'})}
}
