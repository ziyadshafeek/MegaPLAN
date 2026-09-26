import { timingSafeEqual } from 'node:crypto';
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
async function gh(path,options={}){const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;if(!token)throw Error('GitHub Actions dispatch is not configured.');const r=await fetch(`https://api.github.com${path}`,{...options,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});const t=await r.text();if(!r.ok)throw Error(`GitHub Actions API HTTP ${r.status}.`);return t?JSON.parse(t):{}}
function authorized(req){const supplied=String(req.headers?.['x-agent-write-token']||'');const expected=process.env.AGENT_WRITE_TOKEN||'';const a=Buffer.from(supplied),b=Buffer.from(expected);return !!expected&&a.length===b.length&&timingSafeEqual(a,b)}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'POST only'});
 for(const k of ['GITHUB_ACTIONS_DISPATCH_TOKEN','GITHUB_OWNER','GITHUB_REPO','AGENT_WRITE_TOKEN'])if(!process.env[k])return json(res,503,{error:'Autonomous Actions is not configured on this deployment.'});
 if(!authorized(req))return json(res,401,{error:'Operator authorization required.'});
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return json(res,400,{error:'Invalid JSON.'})}
 const prompt=String(body?.prompt||'').trim().slice(0,7000);if(prompt.length<8)return json(res,400,{error:'Enter a build request of at least 8 characters.'});
 const owner=String(process.env.GITHUB_OWNER),repo=String(process.env.GITHUB_REPO),workflow=process.env.GITHUB_AGENT_WORKFLOW||'agent-online-store.yml',branch=process.env.GITHUB_BRANCH||'main';
 try{await gh(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',body:JSON.stringify({ref:branch,inputs:{prompt}})});return json(res,202,{ok:true,queued:true,workflow,branch,queuedAt:new Date().toISOString()})}catch(e){return json(res,502,{error:e.message||'Unable to queue autonomous run.'})}
}
