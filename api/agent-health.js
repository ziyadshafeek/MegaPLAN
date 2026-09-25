export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({ok:true,providerConfigured:!!process.env.NVIDIA_API_KEY,githubConfigured:!!process.env.GITHUB_TOKEN,branch:process.env.GITHUB_BRANCH||'main'});
}
