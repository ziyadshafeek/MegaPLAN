
const $=id=>document.getElementById(id);
let selectedZip=null, entries=[];

function repoParts(){
  const v=$('repo').value.trim();
  const p=v.split('/');
  if(p.length!==2||!p[0]||!p[1])throw new Error('Repository must look like owner/name.');
  return p;
}
function branch(){return $('branch').value.trim()||'main'}
function token(){return $('token').value.trim()}
function baseApi(){const [o,n]=repoParts();return 'https://api.github.com/repos/'+encodeURIComponent(o)+'/'+encodeURIComponent(n)}
function headers(extra={}){return {'Accept':'application/vnd.github+json','Authorization':'Bearer '+token(),'X-GitHub-Api-Version':'2022-11-28',...extra}}
async function gh(path,opts={}){
  const r=await fetch(baseApi()+path,{...opts,headers:{...headers(),...(opts.headers||{})}});
  const body=await r.text();let data=null;try{data=body?JSON.parse(body):null}catch{}
  return {ok:r.ok,status:r.status,data,text:body};
}
function requireOk(x,label){if(!x.ok)throw new Error(label+': '+(x.data?.message||x.text||('HTTP '+x.status))+' [HTTP '+x.status+']');return x.data}
function setProgress(done,total,msg){const pct=total?Math.round(done/total*100):0;$('bar').style.width=pct+'%';$('progressText').textContent=msg+' · '+done+'/'+total+' ('+pct+'%)'}
function log(msg,cls=''){const el=$('pushStatus');el.className='log '+cls;el.textContent+=(el.textContent==='Nothing has been pushed yet.'?'':el.textContent+'\n')+msg;el.scrollTop=el.scrollHeight}
function status(el,msg,cls='muted'){el.textContent=msg;el.className='status '+cls}
function resetStats(){const s=$('stats');s.style.display='none';s.innerHTML=''}
function renderStats(c){const s=$('stats');s.style.display='grid';s.innerHTML=[['Total',c.total],['New',c.created],['Updated',c.updated],['Unchanged',c.skipped]].map(([k,v])=>'<div class="stat"><b>'+v+'</b><span class="small">'+k+'</span></div>').join('')}

$('zip').addEventListener('change',()=>{
  selectedZip=$('zip').files[0]||null;entries=[];$('inspect').disabled=!selectedZip;$('push').disabled=true;resetStats();
  $('zipInfo').textContent=selectedZip?('Selected: '+selectedZip.name+' · '+(selectedZip.size/1024).toFixed(1)+' KB'):'No ZIP selected.';
  $('progressText').textContent='Waiting for ZIP inspection.';$('bar').style.width='0%';
});

$('verify').onclick=async()=>{
  const el=$('verifyStatus');
  try{
    if(!token())throw new Error('Enter the GitHub token.');
    repoParts();
    status(el,'Checking repository and branch access…');
    const r=requireOk(await gh(''),'Repository access check');
    const rr=await gh('/git/ref/heads/'+encodeURIComponent(branch()));
    let branchText=rr.ok?'exists':'does not exist';
    if(!rr.ok&&rr.status!==404)throw new Error('Branch check: '+(rr.data?.message||rr.text)+' [HTTP '+rr.status+']');
    status(el,'Repository: '+r.full_name+' · visibility: '+r.visibility+' · branch '+branch()+': '+branchText,'ok');
  }catch(e){status(el,'Verification failed: '+e.message,'bad')}
};

async function sha1GitBlob(bytes){
  const header=new TextEncoder().encode('blob '+bytes.byteLength+'\0');
  const all=new Uint8Array(header.length+bytes.length);all.set(header);all.set(bytes,header.length);
  const digest=await crypto.subtle.digest('SHA-1',all);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function toBase64(bytes){let out='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(out)}
function safePath(path){
  if(!path||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>p==='..'||p===''))return false;
  if(path.includes('\0'))return false;
  return true;
}
function normalizedEntries(raw){
  if(!raw.length)throw new Error('ZIP contains no files.');
  const first=raw[0].split('/')[0];
  const wrapper=raw.every(n=>n.startsWith(first+'/'))?first+'/':'';
  const out=raw.map(n=>wrapper&&n.startsWith(wrapper)?n.slice(wrapper.length):n).filter(Boolean).map(path=>path.replace(/^\.\//,''));
  if(out.some(p=>!safePath(p)))throw new Error('ZIP contains an unsafe path.');
  const seen=new Set();for(const p of out){if(seen.has(p))throw new Error('ZIP contains duplicate path: '+p);seen.add(p)}
  return {wrapper,out};
}

$('inspect').onclick=async()=>{
  if(!selectedZip)return;
  try{
    const zip=await JSZip.loadAsync(selectedZip);
    const raw=Object.values(zip.files).filter(f=>!f.dir).map(f=>f.name);
    const {wrapper,out}=normalizedEntries(raw);
    entries=out.map((path,i)=>({path,zipName:raw[i]}));
    const list=entries.map(x=>x.path).slice(0,80).join('\n');
    $('zipInfo').textContent='ZIP ready.\n\nFiles: '+entries.length+'\nCommon wrapper stripped: '+(wrapper||'(none)')+'\n\n'+list+(entries.length>80?'\n…':'');
    $('push').disabled=false;
    setProgress(0,entries.length,'Ready to push');
  }catch(e){entries=[];$('push').disabled=true;$('zipInfo').textContent='ZIP inspection failed: '+e.message}
};

async function getSnapshot(){
  const ref=await gh('/git/ref/heads/'+encodeURIComponent(branch()));
  if(ref.ok){
    const commitSha=ref.data.object.sha;
    const commit=requireOk(await gh('/git/commits/'+commitSha),'Read branch commit');
    const treeSha=commit.tree.sha;
    const tree=requireOk(await gh('/git/trees/'+treeSha+'?recursive=1'),'Read repository tree');
    const map=new Map();for(const x of (tree.tree||[])){if(x.type==='blob')map.set(x.path,x.sha)}
    return {exists:true,commitSha,treeSha,map};
  }
  if(ref.status===404)return {exists:false,commitSha:null,treeSha:null,map:new Map()};
  throw new Error('Read branch: '+(ref.data?.message||ref.text)+' [HTTP '+ref.status+']');
}

async function createBlob(bytes){
  return requireOk(await gh('/git/blobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:toBase64(bytes),encoding:'base64'})}),'Create blob');
}
async function makeTree(baseTreeSha,changes){
  const body={tree:changes};if(baseTreeSha)body.base_tree=baseTreeSha;
  return requireOk(await gh('/git/trees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),'Create tree');
}
async function makeCommit(treeSha,parentSha){
  const body={message:'merge ZIP: MegaPLAN update',tree:treeSha};if(parentSha)body.parents=[parentSha];
  return requireOk(await gh('/git/commits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),'Create commit');
}
async function moveRef(commitSha,exists){
  if(exists)return requireOk(await gh('/git/refs/heads/'+encodeURIComponent(branch()),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:commitSha,force:false})}),'Advance branch');
  return requireOk(await gh('/git/refs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'refs/heads/'+branch(),sha:commitSha})}),'Create branch');
}

$('push').onclick=async()=>{
  if(!entries.length||!token())return;
  $('push').disabled=true;$('verify').disabled=true;$('inspect').disabled=true;$('pushStatus').textContent='';$('pushStatus').className='log';$('bar').style.width='0%';
  try{
    const zip=await JSZip.loadAsync(selectedZip);
    let attempt=0, final=null;
    while(attempt<2 && !final){
      attempt++;
      log('Attempt '+attempt+': reading current Git state…');
      const snap=await getSnapshot();
      const changes=[];let created=0,updated=0,skipped=0,done=0;
      setProgress(0,entries.length,'Comparing ZIP to current tree');
      for(const entry of entries){
        const bytes=new Uint8Array(await zip.files[entry.zipName].async('arraybuffer'));
        const blobSha=await sha1GitBlob(bytes);
        const oldSha=snap.map.get(entry.path);
        if(oldSha===blobSha){skipped++;done++;setProgress(done,entries.length,'Comparing ZIP to current tree');log('· unchanged '+entry.path);continue}
        const blob=await createBlob(bytes);
        changes.push({path:entry.path,mode:'100644',type:'blob',sha:blob.sha});
        if(oldSha)updated++;else created++;
        done++;setProgress(done,entries.length,'Uploading changed blobs');log('✓ '+(oldSha?'updated ':'added ')+entry.path);
      }
      renderStats({total:entries.length,created,updated,skipped});
      if(!changes.length){
        setProgress(entries.length,entries.length,'Nothing to change');
        $('pushStatus').className='log ok';
        log('COMPLETE — repository already contains these exact files. No commit created.','ok');
        final={noop:true};break;
      }
      changes.sort((a,b)=>a.path.localeCompare(b.path));
      log('Building one Git tree from '+changes.length+' changed file(s)…');
      const tree=await makeTree(snap.treeSha,changes);
      log('Creating one commit…');
      const commit=await makeCommit(tree.sha,snap.commitSha);
      log('Advancing '+branch()+' with fast-forward-only update…');
      const move=await gh(snap.exists?('/git/refs/heads/'+encodeURIComponent(branch())):'/git/refs',{method:snap.exists?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snap.exists?{sha:commit.sha,force:false}:{ref:'refs/heads/'+branch(),sha:commit.sha})});
      if(!move.ok&&(move.status===409||move.status===422)&&snap.exists&&attempt<2){log('Branch moved while pushing; rebuilding once from the new head…','warn');continue}
      requireOk(move,'Advance branch');
      const [o,n]=repoParts();
      setProgress(entries.length,entries.length,'COMPLETE');
      $('pushStatus').className='log ok';
      log('PUSH COMPLETE');
      log('Commit: '+commit.sha);
      log('Repository: https://github.com/'+o+'/'+n);
      log('Branch: '+branch());
      log('Files: '+entries.length+' · added '+created+' · updated '+updated+' · unchanged '+skipped);
      log('One new commit moved the branch. Earlier partial commits remain in history but were not rewritten.');
      final={noop:false};
    }
    if(!final)throw new Error('The repository changed during the push twice. No branch update was applied by this run. Run the push again.');
  }catch(e){
    setProgress(0,entries.length,'FAILED');
    $('pushStatus').className='log bad';
    log('PUSH FAILED: '+e.message,'bad');
    log('No per-file partial branch updates are performed by V5.2.','bad');
  }finally{
    $('push').disabled=false;$('verify').disabled=false;$('inspect').disabled=!selectedZip;
  }
};
