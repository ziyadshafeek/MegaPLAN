function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body))}
async function gh(path){const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;if(!token)throw Error('GitHub Actions dispatch is not configured.');const r=await fetch(`https://api.github.com${path}`,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`}});const t=await r.text();if(!r.ok)throw Error(`GitHub Actions API HTTP ${r.status}.`);return t?JSON.parse(t):{}}
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{error:'GET only'});for(const k of ['GITHUB_ACTIONS_DISPATCH_TOKEN','GITHUB_OWNER','GITHUB_REPO'])if(!process.env[k])return json(res,503,{error:'Autonomous Actions is not configured.'});
 const u=new URL(req.url,`https://${req.headers.host||'localhost'}`),runId=u.searchParams.get('run_id'),queuedAfter=Date.parse(u.searchParams.get('queued_after')||'');
 try{const o=process.env.GITHUB_OWNER,r=process.env.GITHUB_REPO,w=process.env.GITHUB_AGENT_WORKFLOW||'agent-online-store.yml',b=process.env.GITHUB_BRANCH||'main';
  if(runId){const j=await gh(`/repos/${o}/${r}/actions/runs/${encodeURIComponent(runId)}`);return json(res,200,{ok:true,run:{id:j.id,status:j.status,conclusion:j.conclusion,html_url:j.html_url,created_at:j.created_at,updated_at:j.updated_at}})}
  if(!Number.isFinite(queuedAfter))return json(res,400,{error:'Provide run_id or queued_after.'});
  const j=await gh(`/repos/${o}/${r}/actions/workflows/${encodeURIComponent(w)}/runs?branch=${encodeURIComponent(b)}&per_page=10`);const runs=(j.workflow_runs||[]).filter(x=>Date.parse(x.created_at)>=queuedAfter-5000).sort((a,z)=>Date.parse(a.created_at)-Date.parse(z.created_at));
  if(!runs.length)return json(res,200,{ok:true,pending:true});const x=runs[0];return json(res,200,{ok:true,pending:false,run:{id:x.id,status:x.status,conclusion:x.conclusion,html_url:x.html_url,created_at:x.created_at,updated_at:x.updated_at}})
 }catch(e){return json(res,502,{error:e.message||'Unable to read Actions status.'})}
}
