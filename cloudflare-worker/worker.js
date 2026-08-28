/**
 * Cabinet Workshop OS — Cloudflare Worker backup bridge v2
 *
 * Endpoints:
 *   GET  /health         public health check
 *   POST /test-telegram  verifies Telegram credentials from Worker secrets
 *   POST /backup         receives .kwm/.xlsx/.pdf and sends to Telegram
 *
 * Secrets (Cloudflare Dashboard > Workers > Settings > Variables and Secrets):
 *   TELEGRAM_BOT_TOKEN  -> Secret
 *   TELEGRAM_CHAT_ID    -> Text or Secret
 *
 * Optional vars/secrets:
 *   ALLOWED_ORIGIN      -> e.g. https://mehrdadmb2.github.io
 *   BACKUP_SHARED_KEY   -> Secret (when set, app must send X-Backup-Key)
 *   TELEGRAM_THREAD_ID  -> for forum topics if needed
 */
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8'};

function cors(env, request){
  const reqOrigin = request.headers.get('Origin') || '';
  const allow = env.ALLOWED_ORIGIN ? (reqOrigin===env.ALLOWED_ORIGIN ? reqOrigin : env.ALLOWED_ORIGIN) : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'content-type,x-backup-key',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}
function respond(data,status,env,request){ return new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors(env,request)}}); }
function sanitize(name){return String(name||'file').replace(/[^\p{L}\p{N}._()\- ]/gu,'_').trim().slice(0,180)||'file';}
function sizeMB(bytes){return bytes/1024/1024;}

export default {
  async fetch(request, env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors(env,request)});
    const url=new URL(request.url);
    if(url.pathname==='/health' && request.method==='GET'){
      return respond({ok:true,service:'Cabinet Workshop OS Backup Worker',version:'2.0.0',telegramConfigured:!!(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID),time:new Date().toISOString()},200,env,request);
    }
    if(url.pathname==='/test-telegram' && request.method==='POST'){
      if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID) return respond({ok:false,error:'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured'},500,env,request);
      try{
        const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`,{method:'GET'});
        const d=await r.json();
        if(!r.ok||!d.ok) return respond({ok:false,error:d.description||`Telegram ${r.status}`},502,env,request);
        return respond({ok:true,bot:{id:d.result?.id,username:d.result?.username,first_name:d.result?.first_name}},200,env,request);
      }catch(e){return respond({ok:false,error:e.message||'Telegram connection failed'},502,env,request);}
    }
    if(url.pathname!=='/backup' || request.method!=='POST') return respond({ok:false,error:'Not found'},404,env,request);
    if(env.ALLOWED_ORIGIN && request.headers.get('Origin')!==env.ALLOWED_ORIGIN) return respond({ok:false,error:'Origin not allowed'},403,env,request);
    if(env.BACKUP_SHARED_KEY && request.headers.get('X-Backup-Key')!==env.BACKUP_SHARED_KEY) return respond({ok:false,error:'Unauthorized'},401,env,request);
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID) return respond({ok:false,error:'Telegram secrets are not configured'},500,env,request);

    let form;
    try{form=await request.formData();}catch(e){return respond({ok:false,error:'Expected multipart/form-data'},400,env,request);}
    const projectName=String(form.get('projectName')||'Cabinet Workshop Project');
    const projectId=String(form.get('projectId')||'unknown');
    const fields=['project','xlsx','pdf'];
    const results=[];
    for(const field of fields){
      const file=form.get(field);
      if(!(file && typeof file.arrayBuffer==='function')) continue;
      const bytes=await file.arrayBuffer();
      // Telegram currently documents 50 MB for sendDocument; keep a safety margin.
      if(sizeMB(bytes)>45){results.push({field,name:file.name||field,telegram:false,error:'File exceeds 45 MB safety limit'});continue;}
      const name=sanitize(file.name||`${field}.bin`);
      try{
        const tg=new FormData();
        tg.append('chat_id',env.TELEGRAM_CHAT_ID);
        if(env.TELEGRAM_THREAD_ID) tg.append('message_thread_id',env.TELEGRAM_THREAD_ID);
        tg.append('document',new File([bytes],name,{type:file.type||'application/octet-stream'}));
        tg.append('caption',`Cabinet Workshop OS\nProject: ${projectName}\nFile: ${name}\nProject ID: ${projectId}`);
        const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,{method:'POST',body:tg});
        const d=await r.json().catch(()=>({}));
        results.push({field,name,telegram:!!d.ok,error:d.ok?null:(d.description||`Telegram ${r.status}`)});
      }catch(e){results.push({field,name,telegram:false,error:e.message||'Upload failed'});}
    }
    const ok=results.length>0 && results.every(x=>x.telegram);
    return respond({ok,projectId,projectName,files:results,time:new Date().toISOString()},ok?200:502,env,request);
  }
};
