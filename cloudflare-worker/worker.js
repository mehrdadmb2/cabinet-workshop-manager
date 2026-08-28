/**
 * Cabinet Workshop OS — Cloudflare Worker backup bridge v3
 *
 * Endpoints:
 *   GET  /health
 *   POST /test-telegram  -> verifies token, verifies chat, and sends a real test message
 *   POST /backup         -> sends .kwm / .xlsx / .pdf to Telegram
 *
 * Required secrets:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID   (Text or Secret; string is accepted for groups/channels too)
 *
 * Recommended variable:
 *   ALLOWED_ORIGINS=https://mehrdadmb2.github.io,http://localhost:5173
 * Optional:
 *   BACKUP_SHARED_KEY
 *   TELEGRAM_THREAD_ID
 */
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8'};
function origins(env){return String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)}
function cors(env,request){
  const origin=request.headers.get('Origin')||''; const list=origins(env);
  const allow=!list.length?'*':(list.includes(origin)?origin:list[0]);
  return {'Access-Control-Allow-Origin':allow,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,x-backup-key','Access-Control-Max-Age':'86400','Vary':'Origin'};
}
function respond(data,status,env,request){return new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors(env,request)}})}
function sanitize(name){return String(name||'file').replace(/[^\p{L}\p{N}._()\- ]/gu,'_').trim().slice(0,180)||'file'}
async function tg(env,method,body){
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,body?{method:'POST',body}:{});
  const data=await r.json().catch(()=>({ok:false,description:`Telegram returned ${r.status}`}));
  return {http:r.status,data};
}
export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env,request)});
    const url=new URL(request.url);
    if(url.pathname==='/health'&&request.method==='GET'){
      return respond({ok:true,service:'Cabinet Workshop OS Backup Worker',version:'3.0.0',telegramConfigured:!!(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID),allowedOrigins:origins(env),time:new Date().toISOString()},200,env,request);
    }
    if(url.pathname==='/test-telegram'&&request.method==='POST'){
      if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return respond({ok:false,error:'TELEGRAM_BOT_TOKEN یا TELEGRAM_CHAT_ID در Worker تنظیم نشده است'},500,env,request);
      try{
        const me=await tg(env,'getMe'); if(!me.data.ok)return respond({ok:false,error:me.data.description||'Bot token invalid',bot:me.data},502,env,request);
        const chatFd=new FormData(); chatFd.append('chat_id',String(env.TELEGRAM_CHAT_ID));
        const chat=await tg(env,'getChat',chatFd);
        if(!chat.data.ok)return respond({ok:false,error:`Chat ID معتبر نیست یا Bot به Chat دسترسی ندارد: ${chat.data.description||'getChat failed'}`,bot:me.data.result,chat:chat.data},502,env,request);
        const msgFd=new FormData(); msgFd.append('chat_id',String(env.TELEGRAM_CHAT_ID)); msgFd.append('text',`✅ Cabinet Workshop OS\nارتباط Telegram موفق است.\nزمان: ${new Date().toLocaleString('fa-IR')}`);
        if(env.TELEGRAM_THREAD_ID)msgFd.append('message_thread_id',String(env.TELEGRAM_THREAD_ID));
        const msg=await tg(env,'sendMessage',msgFd);
        if(!msg.data.ok)return respond({ok:false,error:`Bot و Chat شناسایی شدند، ولی ارسال پیام شکست خورد: ${msg.data.description||'sendMessage failed'}`,bot:me.data.result,chat:chat.data},502,env,request);
        return respond({ok:true,bot:me.data.result,chat:{id:chat.data.result?.id,title:chat.data.result?.title||chat.data.result?.first_name||''},messageId:msg.data.result?.message_id,time:new Date().toISOString()},200,env,request);
      }catch(e){return respond({ok:false,error:e.message||'Telegram test failed'},502,env,request)}
    }
    if(url.pathname!=='/backup'||request.method!=='POST')return respond({ok:false,error:'Not found'},404,env,request);
    const allowed=origins(env);const origin=request.headers.get('Origin')||'';
    if(allowed.length&& !allowed.includes(origin))return respond({ok:false,error:'Origin not allowed'},403,env,request);
    if(env.BACKUP_SHARED_KEY&&request.headers.get('X-Backup-Key')!==env.BACKUP_SHARED_KEY)return respond({ok:false,error:'Unauthorized'},401,env,request);
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return respond({ok:false,error:'Telegram secrets are not configured'},500,env,request);
    let form;try{form=await request.formData()}catch(e){return respond({ok:false,error:'Expected multipart/form-data'},400,env,request)}
    const projectName=String(form.get('projectName')||'Cabinet Workshop Project'),projectId=String(form.get('projectId')||'unknown');
    const results=[];
    for(const field of ['project','xlsx','pdf']){
      const file=form.get(field);if(!(file&&typeof file.arrayBuffer==='function'))continue;
      const bytes=await file.arrayBuffer();if(bytes.byteLength>49*1024*1024){results.push({field,name:file.name||field,telegram:false,error:'File exceeds Telegram 50 MB limit'});continue;}
      const name=sanitize(file.name||`${field}.bin`);
      try{const fd=new FormData();fd.append('chat_id',String(env.TELEGRAM_CHAT_ID));if(env.TELEGRAM_THREAD_ID)fd.append('message_thread_id',String(env.TELEGRAM_THREAD_ID));fd.append('document',new File([bytes],name,{type:file.type||'application/octet-stream'}));fd.append('caption',`Cabinet Workshop OS\nProject: ${projectName}\nFile: ${name}\nProject ID: ${projectId}`);const r=await tg(env,'sendDocument',fd);results.push({field,name,telegram:!!r.data.ok,error:r.data.ok?null:(r.data.description||`Telegram ${r.http}`),messageId:r.data.result?.message_id||null});}
      catch(e){results.push({field,name,telegram:false,error:e.message||'Upload failed'})}
    }
    const ok=results.length>0&&results.every(x=>x.telegram);return respond({ok,projectId,projectName,files:results,time:new Date().toISOString()},ok?200:502,env,request);
  }
};
