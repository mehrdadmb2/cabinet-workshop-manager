/* Cabinet Workshop OS 2.0 — static, GitHub Pages compatible.
 * No GitHub Actions required. All user data stays in-browser unless backup is requested.
 */
(() => {
  'use strict';
  const C = window.CW_CONFIG;
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const uid = (p='id') => `${p}_${crypto.randomUUID ? crypto.randomUUID().slice(0,8) : Date.now().toString(36)}`;
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const nowISO = () => new Date().toISOString();
  const stamp = () => new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const safeName = s => String(s||'project').trim().replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,100) || 'project';
  const mmTo = (mm, unit) => unit==='mm'?mm:unit==='cm'?mm/10:unit==='m'?mm/1000:unit==='in'?mm/25.4:unit==='ft'?mm/304.8:mm;
  const unitLabel = u => ({mm:'mm',cm:'cm',m:'m',in:'in',ft:'ft'}[u]||'mm');
  const fmt = (n, unit=state.drawing.unit) => {
    const v = mmTo(Number(n)||0, unit); const abs=Math.abs(v);
    const d = unit==='m' ? (abs<1?3:2) : unit==='mm' ? (abs<100?1:0) : 2;
    return `${v.toLocaleString('fa-IR',{maximumFractionDigits:d,minimumFractionDigits:d})} ${unitLabel(unit)}`;
  };

  const blankCell = () => ({v:'', f:'', t:'s'});
  const emptySheet = (name='شروع کار') => ({id:uid('sheet'), name, rows:18, cols:10, data:Array.from({length:18},()=>Array.from({length:10},blankCell)), merges:[], colWidths:{}, rowHeights:{}});
  function freshProject(name='پروژه جدید') {
    const p = {schemaVersion:2,id:uid('prj'),name,customer:'',phone:'',address:'',status:'در حال طراحی',createdAt:nowISO(),updatedAt:nowISO(),
      workbook:{sourceFile:'',sourceImportedAt:null, sheets:[emptySheet()]}, drawings:[], parts:[], payments:[], snapshots:[]};
    return p;
  }
  const state = {
    view:'dashboard', project:null, sheetIndex:0, sheetSearch:'', cellSearch:'', selectedCell:null,
    dirty:false, saveTimer:null, toastTimer:null,
    drawing:{tool:'select',unit:C.drawing.units,zoom:0.42,panX:70,panY:60,showDims:true,snap:true,grid:true,selectedId:null,drag:null, draft:null, viewW:C.drawing.defaultCanvasWidthMm,viewH:C.drawing.defaultCanvasHeightMm},
    worker:{status:'unknown',message:'هنوز بررسی نشده'},
    ui:{mobileNav:false}
  };

  /* ---------- IndexedDB ---------- */
  const DB = {
    db:null,
    async open(){
      if(this.db) return this.db;
      this.db = await new Promise((resolve,reject)=>{
        const r=indexedDB.open('cabinet-workshop-os',1);
        r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains('projects')) db.createObjectStore('projects',{keyPath:'id'}); if(!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots',{keyPath:'id'}); };
        r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
      });
      return this.db;
    },
    async put(store,obj){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(obj);tx.oncomplete=()=>res(true);tx.onerror=()=>rej(tx.error);});},
    async get(store,key){const db=await this.open();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},
    async all(store){const db=await this.open();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});},
    async del(store,key){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=()=>res(true);tx.onerror=()=>rej(tx.error);});}
  };

  function showToast(message,type='info'){
    const el=document.createElement('div'); el.className=`toast ${type}`; el.innerHTML=`<strong>${type==='success'?'✓':type==='danger'?'!':'i'}</strong><span>${esc(message)}</span>`;
    $('#toastRegion').appendChild(el); requestAnimationFrame(()=>el.classList.add('show')); setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250);},3200);
  }
  function setDirty(){ if(!state.project)return; state.dirty=true; state.project.updatedAt=nowISO(); $('#saveState')?.classList.add('dirty'); clearTimeout(state.saveTimer); state.saveTimer=setTimeout(()=>saveProject(false),C.autosaveMs); refreshHeaderState(); }
  async function saveProject(show=true){
    if(!state.project)return;
    syncPartsSheet();
    await DB.put('projects',structuredClone(state.project));
    state.dirty=false; state.project.updatedAt=nowISO();
    $('#saveState')?.classList.remove('dirty'); refreshHeaderState();
    if(show) showToast('پروژه ذخیره شد','success');
  }
  function refreshHeaderState(){ const el=$('#saveState'); if(!el)return; el.innerHTML=state.dirty?'<span class="dot amber"></span> تغییرات ذخیره‌نشده':'<span class="dot green"></span> ذخیره شد'; }

  /* ---------- Workbook normalization ---------- */
  function colName(n){let s='';n++;while(n){let m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;}
  function cellRef(r,c){return `${colName(c)}${r+1}`;}
  function parseA1(ref){const m=/^([A-Z]+)(\d+)$/.exec(ref);if(!m)return null;let c=0;for(const ch of m[1]) c=c*26+(ch.charCodeAt(0)-64);return {r:Number(m[2])-1,c:c-1};}
  function normalizeXlsx(wb,fileName){
    const sheets=[];
    wb.SheetNames.forEach(name=>{
      const ws=wb.Sheets[name]; const range=XLSX.utils.decode_range(ws['!ref']||'A1:A1');
      const rows=range.e.r+1, cols=range.e.c+1; const data=Array.from({length:Math.max(rows,1)},()=>Array.from({length:Math.max(cols,1)},blankCell));
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
        const addr=XLSX.utils.encode_cell({r,c}); const x=ws[addr]; if(x) data[r][c]={v:x.v??'',f:x.f?String(x.f):'',t:x.t||typeof x.v};
      }
      sheets.push({id:uid('sheet'),name,rows,cols,data,merges:(ws['!merges']||[]).map(m=>({s:m.s,e:m.e})),colWidths:(ws['!cols']||[]).reduce((o,x,i)=>(o[i]=x?.wch||12,o),{}),rowHeights:{}});
    });
    return {sourceFile:fileName,sourceImportedAt:nowISO(),sheets};
  }
  async function importExcel(file){
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellFormula:true,cellStyles:true,cellNF:true,cellDates:true});
      const normalized=normalizeXlsx(wb,file.name);
      const p=freshProject(file.name.replace(/\.(xlsx|xlsm|xltx|xltm|xls)$/i,'')); p.workbook=normalized; p.importNote='این پروژه از Excel وارد شده و از اینجا به بعد داده‌ها در مدل داخلی سایت نگهداری می‌شوند.';
      state.project=p; state.sheetIndex=0; state.view='workbook'; state.drawing.selectedId=null; state.dirty=true;
      await saveProject(false); render(); showToast(`${normalized.sheets.length} شیت وارد شد`,'success');
    }catch(e){console.error(e);showToast(`خطا در Import Excel: ${e.message||e}`,'danger');}
  }
  function activeSheet(){return state.project?.workbook?.sheets?.[state.sheetIndex]||null;}
  function ensureSheet(name){
    let s=state.project.workbook.sheets.find(x=>x.name===name); if(!s){s=emptySheet(name);state.project.workbook.sheets.push(s);} return s;
  }
  function syncPartsSheet(){
    if(!state.project)return; const s=ensureSheet('نقشه-قطعات');
    const headers=['ردیف','شناسه','نام قطعه','نوع','X (mm)','Y (mm)','عرض','ارتفاع','طول','واحد','زاویه','متریال','یادداشت'];
    const rows=Math.max(1,state.project.drawings.filter(o=>['rect','line','polyline'].includes(o.type)).length);
    s.rows=Math.max(headers.length?2:1,rows+1); s.cols=headers.length;
    s.data=Array.from({length:s.rows},()=>Array.from({length:s.cols},blankCell));
    headers.forEach((h,c)=>s.data[0][c]={v:h,f:'',t:'s'});
    let i=1;
    state.project.drawings.filter(o=>['rect','line','polyline'].includes(o.type)).forEach(o=>{
      const p = objectBounds(o); const length=o.type==='line'?dist(o.x1,o.y1,o.x2,o.y2):Math.max(p.w,p.h);
      const vals=[i,o.id,o.label||'قطعه',o.type,round(p.x),round(p.y),round(p.w),round(p.h),round(length),'mm',round(o.angle||0),o.material||'MDF',o.note||''];
      vals.forEach((v,c)=>s.data[i][c]={v,f:'',t:typeof v==='number'?'n':'s'}); i++;
    });
    s.meta='سیستم به صورت زنده از Drawing Studio ساخته و به‌روزرسانی می‌شود.';
  }
  function round(n){return Math.round((Number(n)||0)*100)/100;}
  function dist(x1,y1,x2,y2){return Math.hypot(x2-x1,y2-y1);}
  function objectBounds(o){
    if(o.type==='rect')return {x:o.x,y:o.y,w:Math.abs(o.w),h:Math.abs(o.h)};
    if(o.type==='circle')return {x:o.cx-o.r,y:o.cy-o.r,w:o.r*2,h:o.r*2};
    if(o.type==='line'||o.type==='dimension')return {x:Math.min(o.x1,o.x2),y:Math.min(o.y1,o.y2),w:Math.abs(o.x2-o.x1),h:Math.abs(o.y2-o.y1)};
    if(o.type==='polyline'){const xs=o.points.map(p=>p.x),ys=o.points.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys);return{x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};}
    return {x:o.x||0,y:o.y||0,w:0,h:0};
  }

  /* ---------- XLSX export ---------- */
  function sheetToAOA(s){return s.data.map(row=>row.map(c=>c?.f?`=${c.f.replace(/^=/,'')}: ${c.v??''}`:(c?.v??'')));}
  function exportXlsxBlob(){
    syncPartsSheet(); const out=XLSX.utils.book_new();
    state.project.workbook.sheets.forEach(s=>{
      const aoa=s.data.map(row=>row.map(c=>c?.f?`=${c.f.replace(/^=/,'')}`:(c?.v??'')));
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      if(s.merges?.length) ws['!merges']=s.merges;
      ws['!cols']=Array.from({length:s.cols},(_,i)=>({wch:Number(s.colWidths?.[i]||12)}));
      XLSX.utils.book_append_sheet(out,ws,(s.name||'Sheet').slice(0,31));
    });
    return XLSX.write(out,{bookType:'xlsx',type:'array',compression:true});
  }

  /* ---------- Project JSON ---------- */
  function projectBlob(){ return new Blob([JSON.stringify(state.project,null,2)],{type:'application/json;charset=utf-8'}); }
  function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
  async function importProject(file){try{const text=await file.text();const p=JSON.parse(text);if(!p?.workbook?.sheets)throw new Error('ساختار فایل پروژه معتبر نیست');state.project=p;state.sheetIndex=0;state.drawing.selectedId=null;state.view='dashboard';await saveProject(false);render();showToast('پروژه بازیابی شد','success');}catch(e){showToast(`خطا در بازیابی پروژه: ${e.message}`,'danger');}}

  /* ---------- PDF ---------- */
  async function buildPrintPdf(kind='project'){
    const host=document.createElement('div'); host.className='print-host'; host.dir='rtl';
    host.innerHTML = kind==='drawing' ? drawingPrintHTML() : projectPrintHTML();
    document.body.appendChild(host);
    try{
      const canvas=await html2canvas(host,{scale:2,backgroundColor:'#fff',useCORS:true,windowWidth:host.scrollWidth});
      const {jsPDF}=window.jspdf; const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
      const pageW=297,pageH=210, margin=8; const imgW=pageW-margin*2; const pagePxH=Math.floor(canvas.width*(pageH-margin*2)/imgW); let y=0; let page=0;
      while(y<canvas.height){const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=Math.min(pagePxH,canvas.height-y);slice.getContext('2d').drawImage(canvas,0,y,canvas.width,slice.height,0,0,slice.width,slice.height); if(page)pdf.addPage(); pdf.addImage(slice.toDataURL('image/png'),'PNG',margin,margin,imgW,slice.height*(imgW/slice.width)); y+=slice.height;page++;}
      return pdf.output('blob');
    }finally{host.remove();}
  }
  function projectPrintHTML(){
    syncPartsSheet(); const parts=state.project.drawings.filter(o=>['rect','line','polyline'].includes(o.type));
    return `<div class="print-page"><h1>Cabinet Workshop OS — ${esc(state.project.name)}</h1><p>مشتری: ${esc(state.project.customer||'—')} | وضعیت: ${esc(state.project.status||'—')} | تاریخ: ${esc(new Date().toLocaleDateString('fa-IR'))}</p>
      <div class="print-kpis"><div>قطعات<strong>${parts.length}</strong></div><div>شیت‌ها<strong>${state.project.workbook.sheets.length}</strong></div><div>پرداخت‌ها<strong>${state.project.payments?.length||0}</strong></div></div>
      <h2>لیست قطعات</h2><table><thead><tr><th>نام</th><th>نوع</th><th>عرض</th><th>ارتفاع</th><th>طول</th><th>متریال</th></tr></thead><tbody>${parts.map(o=>{const b=objectBounds(o);return `<tr><td>${esc(o.label||'قطعه')}</td><td>${esc(o.type)}</td><td>${round(b.w)} mm</td><td>${round(b.h)} mm</td><td>${round(o.type==='line'?dist(o.x1,o.y1,o.x2,o.y2):Math.max(b.w,b.h))} mm</td><td>${esc(o.material||'MDF')}</td></tr>`}).join('')}</tbody></table>
      <h2>پرداخت‌ها</h2><table><thead><tr><th>تاریخ</th><th>عنوان</th><th>مبلغ</th><th>توضیح</th></tr></thead><tbody>${(state.project.payments||[]).map(p=>`<tr><td>${esc(p.date||'')}</td><td>${esc(p.title||'')}</td><td>${Number(p.amount||0).toLocaleString('fa-IR')}</td><td>${esc(p.note||'')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function drawingPrintHTML(){
    const svg=document.createElement('svg'); svg.setAttribute('viewBox',`0 0 ${state.drawing.viewW} ${state.drawing.viewH}`); svg.setAttribute('width','1100');svg.setAttribute('height','620');svg.style.background='#fff';svg.innerHTML=renderDrawingSvg(true); return `<div class="print-page"><h1>${esc(state.project.name)} — نقشه فنی</h1><p>واحد: ${unitLabel(state.drawing.unit)} | صفحه: Drawing Studio</p><div class="print-drawing">${svg.outerHTML}</div><h2>لیست قطعات</h2>${projectPrintHTML().match(/<table[\s\S]*?<\/table>/)?.[0]||''}</div>`;
  }

  /* ---------- Drawing engine ---------- */
  function snap(v){return state.drawing.snap?Math.round(v/C.drawing.snapMm)*C.drawing.snapMm:v;}
  function screenToWorld(e){const svg=$('#cadSvg'); if(!svg)return{x:0,y:0}; const r=svg.getBoundingClientRect(); const sx=(e.clientX-r.left), sy=(e.clientY-r.top); return {x:(sx/state.drawing.zoom)-state.drawing.panX,y:(sy/state.drawing.zoom)-state.drawing.panY};}
  function worldToScreen(x,y){return {x:(x+state.drawing.panX)*state.drawing.zoom,y:(y+state.drawing.panY)*state.drawing.zoom};}
  function pointerWorld(e){const p=screenToWorld(e);p.x=snap(p.x);p.y=snap(p.y);return p;}
  function renderDrawingSvg(print=false){
    const W=state.drawing.viewW,H=state.drawing.viewH; let out=`<g transform="translate(${state.drawing.panX} ${state.drawing.panY}) scale(${state.drawing.zoom})">`;
    if(state.drawing.grid&&!print){out+=`<defs><pattern id="minor" width="${C.drawing.minorGridMm}" height="${C.drawing.minorGridMm}" patternUnits="userSpaceOnUse"><path d="M ${C.drawing.minorGridMm} 0L0 0 0 ${C.drawing.minorGridMm}" fill="none" stroke="#223050" stroke-width="0.8"/></pattern><pattern id="major" width="${C.drawing.majorGridMm}" height="${C.drawing.majorGridMm}" patternUnits="userSpaceOnUse"><rect width="${C.drawing.majorGridMm}" height="${C.drawing.majorGridMm}" fill="url(#minor)"/><path d="M ${C.drawing.majorGridMm} 0L0 0 0 ${C.drawing.majorGridMm}" fill="none" stroke="#3b4b6e" stroke-width="1.4"/></pattern></defs><rect x="0" y="0" width="${W}" height="${H}" fill="url(#major)"/>`}
    else out+=`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`;
    out+=`<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${print?'#444':'#6576a5'}" stroke-width="2"/>`;
    for(const o of state.project.drawings){
      const selected=o.id===state.drawing.selectedId; out+=drawingObjectSvg(o,selected,print);
    }
    if(state.drawing.showDims&&state.drawing.selectedId&&!print){const o=state.project.drawings.find(x=>x.id===state.drawing.selectedId);if(o)out+=selectionDims(o);}
    if(state.drawing.draft) out+=draftSvg(state.drawing.draft);
    out+=`</g>`; return out;
  }
  function drawingObjectSvg(o,selected,print){
    const stroke=print?'#111':(selected?'#22d3ee':'#9aa8c8'); const fill=print?'none':(selected?'rgba(34,211,238,.11)':'rgba(124,58,237,.08)'); const sw=selected?5:3; const lbl=o.label?`<text x="${o.x??o.cx??o.x1??0}" y="${(o.y??o.cy??o.y1??0)-12}" fill="${print?'#111':'#dbeafe'}" font-size="22" class="cad-label">${esc(o.label)}</text>`:'';
    if(o.type==='rect')return `<g data-cad-id="${o.id}"><rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>${lbl}</g>`;
    if(o.type==='circle')return `<g data-cad-id="${o.id}"><circle cx="${o.cx}" cy="${o.cy}" r="${o.r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>${lbl}</g>`;
    if(o.type==='line')return `<g data-cad-id="${o.id}"><line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>${lbl}</g>`;
    if(o.type==='polyline')return `<g data-cad-id="${o.id}"><polyline points="${o.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>${lbl}</g>`;
    if(o.type==='text')return `<g data-cad-id="${o.id}"><text x="${o.x}" y="${o.y}" fill="${print?'#111':'#dbeafe'}" font-size="${o.size||30}" font-weight="600">${esc(o.label||'متن')}</text></g>`;
    if(o.type==='dimension')return dimensionSvg(o,print);
    return '';
  }
  function dimensionSvg(o,print=false){
    const col=print?'#222':'#67e8f9'; const dx=o.x2-o.x1,dy=o.y2-o.y1,len=Math.hypot(dx,dy); if(!len)return '';
    const nx=-dy/len*24,ny=dx/len*24; const ax=o.x1+nx,ay=o.y1+ny,bx=o.x2+nx,by=o.y2+ny; const tx=(ax+bx)/2,ty=(ay+by)/2-8;
    const text=o.label||fmt(len,state.drawing.unit); return `<g data-cad-id="${o.id}" class="dimension"><line x1="${o.x1}" y1="${o.y1}" x2="${ax}" y2="${ay}" stroke="${col}" stroke-width="2"/><line x1="${o.x2}" y1="${o.y2}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="2"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${col}" stroke-width="2" marker-start="url(#arr)" marker-end="url(#arr)"/><text x="${tx}" y="${ty}" text-anchor="middle" fill="${col}" font-size="24" font-weight="700">${esc(text)}</text></g>`;
  }
  function selectionDims(o){
    const b=objectBounds(o), gap=70; const h=new Object({x1:b.x,y1:b.y-gap,x2:b.x+b.w,y2:b.y-gap,label:fmt(b.w)}); const v=new Object({x1:b.x-gap,y1:b.y,x2:b.x-gap,y2:b.y+b.h,label:fmt(b.h)}); return `${dimensionSvg(h)}${dimensionSvg(v)}`;
  }
  function draftSvg(d){if(d.type==='rect')return `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="rgba(34,211,238,.08)" stroke="#22d3ee" stroke-width="3" stroke-dasharray="10 8"/>`; if(d.type==='line')return `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="#22d3ee" stroke-width="3" stroke-dasharray="10 8"/>`; if(d.type==='polyline')return `<polyline points="${d.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#22d3ee" stroke-width="3" stroke-dasharray="10 8"/>`; return '';}
  function renderCad(){const svg=$('#cadSvg');if(!svg)return;svg.innerHTML=`<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>${renderDrawingSvg(false)}`;updateCadHud();}
  function updateCadHud(){const z=$('#zoomReadout');if(z)z.textContent=`${Math.round(state.drawing.zoom*100)}%`; const unit=$('#unitSelect');if(unit)unit.value=state.drawing.unit;}
  function selectCad(id){state.drawing.selectedId=id; render();}
  function selectedObj(){return state.project?.drawings.find(o=>o.id===state.drawing.selectedId)||null;}
  function startCadPointer(e){
    if(e.button===1 || e.shiftKey || state.drawing.tool==='pan'){state.drawing.drag={kind:'pan',x:e.clientX,y:e.clientY,px:state.drawing.panX,py:state.drawing.panY};return;}
    const p=pointerWorld(e); const tool=state.drawing.tool;
    if(tool==='select'){
      const target=e.target.closest?.('[data-cad-id]'); if(target){const id=target.getAttribute('data-cad-id');state.drawing.selectedId=id; const o=selectedObj();state.drawing.drag={kind:'move',id,ox:p.x,oy:p.y,start:structuredClone(o)};render();}
      else {state.drawing.selectedId=null;render();} return;
    }
    if(tool==='rect'||tool==='line'||tool==='dimension') state.drawing.draft={type:tool,x:p.x,y:p.y,x1:p.x,y1:p.y,x2:p.x,y2:p.y,w:0,h:0};
    else if(tool==='polyline') state.drawing.draft={type:'polyline',points:[p]};
    else if(tool==='text') addText(p);
  }
  function moveCadPointer(e){const d=state.drawing.drag; if(d?.kind==='pan'){const svg=$('#cadSvg'),r=svg.getBoundingClientRect();state.drawing.panX=d.px+(e.clientX-d.x)/state.drawing.zoom;state.drawing.panY=d.py+(e.clientY-d.y)/state.drawing.zoom;renderCad();return;} if(d?.kind==='move'){const p=pointerWorld(e),o=state.project.drawings.find(x=>x.id===d.id); if(o){const dx=p.x-d.ox,dy=p.y-d.oy;applyMove(o,d.start,dx,dy);setDirty();renderCad();updateProperties();return;}}
    const draft=state.drawing.draft;if(!draft)return;const p=pointerWorld(e); if(draft.type==='rect'){draft.w=p.x-draft.x;draft.h=p.y-draft.y;} else {draft.x2=p.x;draft.y2=p.y;} renderCad();
  }
  function endCadPointer(e){const d=state.drawing.drag;if(d){if(d.kind==='move')saveProject(false);state.drawing.drag=null;return;} const draft=state.drawing.draft;if(!draft)return; const p=pointerWorld(e);
    if(draft.type==='rect'){const x=draft.w<0?p.x:draft.x,y=draft.h<0?p.y:draft.y,w=Math.abs(draft.w),h=Math.abs(draft.h);if(w>1&&h>1){state.project.drawings.push({id:uid('obj'),type:'rect',x,y,w,h,label:`قطعه ${state.project.drawings.length+1}`,material:'MDF',angle:0});state.drawing.selectedId=state.project.drawings.at(-1).id;setDirty();syncPartsSheet();}}
    else if(draft.type==='line'||draft.type==='dimension'){const len=dist(draft.x1,draft.y1,p.x,p.y);if(len>1){state.project.drawings.push({id:uid('obj'),type:draft.type,x1:draft.x1,y1:draft.y1,x2:p.x,y2:p.y,label:draft.type==='dimension'?fmt(len):'',material:'MDF'});state.drawing.selectedId=state.project.drawings.at(-1).id;setDirty();syncPartsSheet();}}
    state.drawing.draft=null; render();
  }
  function doubleCad(e){const d=state.drawing.draft;if(d?.type==='polyline'){const p=pointerWorld(e);d.points.push(p);if(d.points.length>=2){state.project.drawings.push({id:uid('obj'),type:'polyline',points:d.points,label:`خط ${state.project.drawings.length+1}`});state.drawing.selectedId=state.project.drawings.at(-1).id;setDirty();syncPartsSheet();}state.drawing.draft=null;render();}}
  function addText(p){openModal('افزودن متن','عنوانی که روی نقشه دیده شود',`<label>متن<input id="txtVal" value="قطعه"></label><label>اندازه نوشته<input id="txtSize" type="number" value="30"></label>`,`<button class="btn secondary" data-close>انصراف</button><button class="btn primary" id="txtOk">افزودن</button>`);$('#txtOk').onclick=()=>{state.project.drawings.push({id:uid('obj'),type:'text',x:p.x,y:p.y,label:$('#txtVal').value||'متن',size:Number($('#txtSize').value)||30});setDirty();closeModal();render();};}
  function applyMove(o,start,dx,dy){Object.assign(o,start);if(o.type==='rect'||o.type==='text'){o.x+=dx;o.y+=dy;}else if(o.type==='circle'){o.cx+=dx;o.cy+=dy;}else if(o.type==='line'||o.type==='dimension'){o.x1+=dx;o.y1+=dy;o.x2+=dx;o.y2+=dy;}else if(o.type==='polyline'){o.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));}}
  function updateProperties(){const box=$('#propBox'),o=selectedObj();if(!box)return;box.innerHTML=o?propertyHTML(o):'<div class="empty-box">یک شیء را انتخاب کنید تا مشخصات آن اینجا نمایش داده شود.</div>';bindPropertyInputs();}
  function propertyHTML(o){const b=objectBounds(o);return `<div class="prop-head"><span class="badge">${esc(o.type)}</span><span class="muted">${esc(o.id)}</span></div><label>نام / عنوان<input data-prop="label" value="${esc(o.label||'')}"></label>${o.type==='rect'?`<div class="prop-grid"><label>X<input data-prop="x" type="number" value="${round(o.x)}"></label><label>Y<input data-prop="y" type="number" value="${round(o.y)}"></label><label>عرض<input data-prop="w" type="number" value="${round(o.w)}"></label><label>ارتفاع<input data-prop="h" type="number" value="${round(o.h)}"></label></div>`:''}${o.type==='circle'?`<div class="prop-grid"><label>CX<input data-prop="cx" type="number" value="${round(o.cx)}"></label><label>CY<input data-prop="cy" type="number" value="${round(o.cy)}"></label><label>شعاع<input data-prop="r" type="number" value="${round(o.r)}"></label></div>`:''}${o.type==='line'||o.type==='dimension'?`<div class="prop-grid"><label>X1<input data-prop="x1" type="number" value="${round(o.x1)}"></label><label>Y1<input data-prop="y1" type="number" value="${round(o.y1)}"></label><label>X2<input data-prop="x2" type="number" value="${round(o.x2)}"></label><label>Y2<input data-prop="y2" type="number" value="${round(o.y2)}"></label></div>`:''}<label>متریال<input data-prop="material" value="${esc(o.material||'MDF')}"></label><label>یادداشت<textarea data-prop="note">${esc(o.note||'')}</textarea></label><div class="prop-actions"><button class="btn" data-object="duplicate">تکثیر</button><button class="btn danger" data-object="delete">حذف</button></div><div class="help-tip">ابعاد این شیء در شیت «نقشه-قطعات» همگام می‌شود.</div>`;}
  function bindPropertyInputs(){ $$('#propBox [data-prop]').forEach(inp=>inp.addEventListener('change',()=>{const o=selectedObj();if(!o)return;const k=inp.dataset.prop;const v=inp.tagName==='TEXTAREA'?inp.value:(inp.type==='number'?Number(inp.value):inp.value);o[k]=v;setDirty();syncPartsSheet();renderCad();updateProperties();})); }
  function deleteSelected(){if(!state.drawing.selectedId)return;state.project.drawings=state.project.drawings.filter(o=>o.id!==state.drawing.selectedId);state.drawing.selectedId=null;setDirty();syncPartsSheet();render();}
  function duplicateSelected(){const o=selectedObj();if(!o)return;const c=structuredClone(o);c.id=uid('obj');if(c.type==='rect'||c.type==='text')c.x+=40,c.y+=40;else if(c.type==='circle')c.cx+=40,c.cy+=40;else if(['line','dimension'].includes(c.type))c.x1+=40,c.x2+=40,c.y1+=40,c.y2+=40;else if(c.type==='polyline')c.points=c.points.map(p=>({x:p.x+40,y:p.y+40}));c.label=`${c.label||'قطعه'} (کپی)`;state.project.drawings.push(c);state.drawing.selectedId=c.id;setDirty();syncPartsSheet();render();}
  function wheelCad(e){e.preventDefault();const before=pointerWorld(e);const factor=e.deltaY<0?1.12:0.89;const z2=clamp(state.drawing.zoom*factor,C.drawing.zoomMin,C.drawing.zoomMax);state.drawing.zoom=z2;const after=screenToWorld(e);state.drawing.panX += before.x-after.x;state.drawing.panY += before.y-after.y;renderCad();}

  /* ---------- UI rendering ---------- */
  const viewTitles={dashboard:'داشبورد',projects:'پروژه‌ها',workbook:'Workbook / شیت‌ها',drawing:'Drawing Studio',parts:'قطعات و برش',payments:'پرداخت‌ها',exports:'خروجی‌ها',backups:'ذخیره و بازیابی',settings:'تنظیمات'};
  function layout(){return `<div class="shell"><aside class="sidebar" id="sidebar"><div class="brand"><img src="assets/icon.svg"><div><b>Cabinet Workshop</b><span>Workshop OS 2.0</span></div></div><button class="mobile-close" id="navClose">×</button><nav>${Object.entries(viewTitles).map(([k,t])=>`<button class="nav ${state.view===k?'active':''}" data-view="${k}"><span>${navIcon(k)}</span><b>${t}</b></button>`).join('')}</nav><div class="side-bottom"><div class="status-mini" id="workerPill">اتصال Worker: ${state.worker.status==='ok'?'✓':'—'}</div><button class="btn full" data-action="save">ذخیره فوری <kbd>Ctrl+S</kbd></button></div></aside><main class="main"><header class="topbar"><div class="top-left"><button class="icon-btn mobile-only" id="navToggle">☰</button><div><div class="crumb">${viewTitles[state.view]}</div><div class="project-title">${esc(state.project?.name||'هیچ پروژه‌ای باز نیست')}</div></div></div><div class="top-right"><div id="saveState" class="save-state"></div><button class="icon-btn" data-action="help" title="راهنما">?</button><button class="btn primary" data-action="new">+ پروژه جدید</button></div></header><section class="page" id="pageRoot"></section></main></div>`;}
  function navIcon(v){return {dashboard:'⌂',projects:'▦',workbook:'▤',drawing:'⌁',parts:'◫',payments:'◈',exports:'⇩',backups:'◌',settings:'⚙'}[v]||'•';}
  function render(){
    $('#app').innerHTML=layout();
    const page=$('#pageRoot'); if(state.view==='dashboard')page.innerHTML=renderDashboard(); else if(state.view==='projects')page.innerHTML=renderProjects(); else if(state.view==='workbook')page.innerHTML=renderWorkbook(); else if(state.view==='drawing')page.innerHTML=renderDrawing(); else if(state.view==='parts')page.innerHTML=renderParts(); else if(state.view==='payments')page.innerHTML=renderPayments(); else if(state.view==='exports')page.innerHTML=renderExports(); else if(state.view==='backups')page.innerHTML=renderBackups(); else page.innerHTML=renderSettings();
    bind(); refreshHeaderState(); if(state.view==='drawing'){renderCad();updateProperties();}
  }
  function renderDashboard(){const p=state.project;return `<div class="hero"><div><span class="eyebrow">CABINET WORKSHOP OS</span><h1>کارگاهت را از Excel جدا کن.<br><em>ساده‌تر طراحی کن، سریع‌تر تحویل بده.</em></h1><p>پروژه را از صفر بساز یا فایل قدیمی Excel را وارد کن. بعد تمام کارها را داخل همین محیط ادامه بده.</p><div class="hero-actions"><button class="btn primary xl" data-action="new">＋ پروژه جدید</button><button class="btn glass xl" data-action="import">⇧ ورود Excel</button><button class="btn glass xl" data-action="open-project">↥ باز کردن KWM</button></div></div><div class="hero-card"><div class="hero-card-top"><span class="badge cyan">LIVE WORKSPACE</span><span class="muted">${p?'پروژه فعال':'آماده شروع'}</span></div><div class="metric"><strong>${p?.workbook?.sheets?.length||0}</strong><span>شیت</span></div><div class="metric"><strong>${p?.drawings?.length||0}</strong><span>آبجکت نقشه</span></div><div class="metric"><strong>${p?.parts?.length||0}</strong><span>قطعه ثبت‌شده</span></div><div class="metric"><strong>${p?.payments?.length||0}</strong><span>پرداخت</span></div></div></div>${p?`<div class="section-grid"><article class="panel"><div class="panel-head"><div><span class="eyebrow">CURRENT PROJECT</span><h2>${esc(p.name)}</h2></div><span class="badge green">${esc(p.status)}</span></div><div class="progress-row"><span>آخرین ذخیره</span><strong>${new Date(p.updatedAt||Date.now()).toLocaleString('fa-IR')}</strong></div><div class="quick-actions"><button class="action-card" data-action="continue"><b>▤</b><span>ادامه Workbook</span><small>ویرایش تمام شیت‌ها</small></button><button class="action-card" data-action="drawing"><b>⌁</b><span>نقشه‌کشی</span><small>محیط CAD دوبعدی</small></button><button class="action-card" data-action="parts"><b>◫</b><span>قطعات</span><small>لیست برش و کنترل</small></button><button class="action-card" data-action="backup"><b>☁</b><span>بکاپ</span><small>Telegram / Worker</small></button></div></article><article class="panel"><div class="panel-head"><h2>راهنمای پدر</h2><span class="badge purple">ساده</span></div><div class="steps"><div><i>1</i><span>برای کار جدید «پروژه جدید» را بزن.</span></div><div><i>2</i><span>برای فایل قدیمی «ورود Excel» را انتخاب کن.</span></div><div><i>3</i><span>در نقشه‌کش با ابزار مستطیل و خط کار کن.</span></div><div><i>4</i><span>ابعاد واقعی روی نقشه نمایش داده می‌شود.</span></div><div><i>5</i><span>در پایان KWM، Excel، PDF یا Telegram Backup بگیر.</span></div></div></article></div>`:'<div class="empty-start panel"><div class="empty-icon">✦</div><h2>اولین پروژه را شروع کن</h2><p>می‌توانی از صفر شروع کنی یا یکی از فایل‌های Excel قدیمی را به پروژه تبدیل کنی.</p><div><button class="btn primary xl" data-action="new">پروژه جدید</button><button class="btn" data-action="import">ورود Excel</button></div></div>'}`;}
  function renderProjects(){return `<div class="page-head"><div><span class="eyebrow">PROJECTS</span><h1>پروژه‌ها</h1><p>پروژه‌های ذخیره‌شده روی همین دستگاه.</p></div><div class="head-actions"><button class="btn" data-action="import">ورود Excel</button><button class="btn primary" data-action="new">+ پروژه جدید</button></div></div><div id="projectsGrid" class="cards-grid"><div class="panel loading">در حال خواندن پروژه‌ها…</div></div>`;}
  async function paintProjects(){const arr=await DB.all('projects');const box=$('#projectsGrid');if(!box)return;box.innerHTML=arr.length?arr.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).map(p=>`<article class="project-card"><div class="card-top"><span class="badge ${p.id===state.project?.id?'green':'cyan'}">${p.id===state.project?.id?'فعال':'ذخیره‌شده'}</span><button class="icon-btn" data-del-project="${p.id}">⋮</button></div><h3>${esc(p.name)}</h3><p>${esc(p.customer||'بدون نام مشتری')}</p><div class="card-meta"><span>${p.workbook.sheets.length} شیت</span><span>${p.drawings.length} نقشه</span><span>${new Date(p.updatedAt).toLocaleDateString('fa-IR')}</span></div><div class="card-actions"><button class="btn primary" data-open-project="${p.id}">باز کردن</button><button class="btn" data-clone-project="${p.id}">کپی</button></div></article>`).join(''):'<div class="panel empty-start"><h2>هنوز پروژه‌ای ذخیره نشده.</h2><p>یک پروژه جدید بساز یا Excel را وارد کن.</p></div>';
    $$('#projectsGrid [data-open-project]').forEach(b=>b.onclick=async()=>{const p=await DB.get('projects',b.dataset.openProject);state.project=p;state.view='dashboard';render();});
    $$('#projectsGrid [data-clone-project]').forEach(b=>b.onclick=async()=>{const p=await DB.get('projects',b.dataset.cloneProject);p.id=uid('prj');p.name=`${p.name} — کپی`;p.createdAt=nowISO();p.updatedAt=nowISO();await DB.put('projects',p);paintProjects();});
    $$('#projectsGrid [data-del-project]').forEach(b=>b.onclick=async()=>{const id=b.dataset.delProject;if(confirm('این پروژه از حافظه همین دستگاه حذف شود؟')){await DB.del('projects',id);if(state.project?.id===id)state.project=null;paintProjects();render();}});
  }
  function renderWorkbook(){if(!state.project)return '<div class="empty-start panel"><h2>پروژه‌ای باز نیست.</h2><button class="btn primary" data-action="new">پروژه جدید</button></div>';const s=activeSheet();return `<div class="page-head"><div><span class="eyebrow">WORKBOOK</span><h1>جدول‌های پروژه</h1><p>تمام شیت‌ها را داخل خود سایت ویرایش کن.</p></div><div class="head-actions"><button class="btn" data-action="add-sheet">+ شیت</button><button class="btn" data-action="import">ورود Excel</button><button class="btn primary" data-action="xlsx">خروجی Excel</button></div></div><div class="workbook-shell panel"><div class="sheet-list"><div class="sheet-search"><input id="sheetSearch" placeholder="جستجوی شیت…" value="${esc(state.sheetSearch)}"></div>${state.project.workbook.sheets.map((x,i)=>`<button class="sheet-tab ${i===state.sheetIndex?'active':''}" data-sheet-index="${i}"><span>${i+1}</span>${esc(x.name)}<small>${x.rows}×${x.cols}</small></button>`).join('')}</div><div class="sheet-work"><div class="sheet-toolbar"><div class="sheet-title"><b>${esc(s.name)}</b><span class="badge">${s.rows} ردیف · ${s.cols} ستون</span></div><div class="toolbar-actions"><input id="cellSearch" placeholder="جستجو در شیت…" value="${esc(state.cellSearch)}"><button class="icon-btn" data-action="add-row">+R</button><button class="icon-btn" data-action="add-col">+C</button><button class="icon-btn" data-action="delete-row">−R</button><button class="icon-btn" data-action="delete-col">−C</button><button class="btn" data-action="sheet-export-csv">CSV</button></div></div><div class="sheet-wrap"><table class="grid-table"><tbody>${renderSheetGrid(s)}</tbody></table></div><div class="sheet-footer"><span>سلول انتخابی: ${state.selectedCell?esc(state.selectedCell):'—'}</span><span>فرمول با = شروع می‌شود</span><span>برای ذخیره Ctrl+S</span></div></div></div>`;}
  function renderSheetGrid(s){const maxR=Math.min(s.rows,120),maxC=Math.min(s.cols,32);let out='<tr><th class="corner">#</th>'+Array.from({length:maxC},(_,c)=>`<th>${colName(c)}</th>`).join('')+'</tr>';for(let r=0;r<maxR;r++){out+=`<tr><th class="rowhead">${r+1}</th>`;for(let c=0;c<maxC;c++){const cell=s.data[r]?.[c]||blankCell();const ref=cellRef(r,c),selected=state.selectedCell===ref;out+=`<td class="${selected?'selected':''}"><input data-cell="${ref}" value="${esc(cell.v??'')}" title="${esc(cell.f?'فرمول: '+cell.f:'')}"></td>`;}out+='</tr>';}return out;}
  function renderDrawing(){if(!state.project)return '<div class="empty-start panel"><h2>پروژه‌ای باز نیست.</h2><button class="btn primary" data-action="new">پروژه جدید</button></div>';return `<div class="page-head"><div><span class="eyebrow">DRAWING STUDIO 2D</span><h1>محیط نقشه‌کشی فنی</h1><p>واحد واقعی، Grid/Snap، اندازه‌گذاری زنده و همگام‌سازی مستقیم با شیت قطعات.</p></div><div class="head-actions"><button class="btn" data-action="fit-drawing">Fit</button><button class="btn" data-action="drawing-pdf">PDF نقشه</button><button class="btn primary" data-action="save">ذخیره</button></div></div><div class="cad-layout"><aside class="cad-left panel"><div class="tool-title">ابزارها</div><div class="tool-grid">${[['select','انتخاب','V'],['line','خط','L'],['polyline','چندخطی','P'],['rect','مستطیل','R'],['circle','دایره','C'],['dimension','اندازه','D'],['text','متن','T'],['pan','جابجایی','H']].map(x=>`<button class="cad-tool ${state.drawing.tool===x[0]?'active':''}" data-tool="${x[0]}"><strong>${x[2]}</strong><span>${x[1]}</span></button>`).join('')}</div><div class="tool-section"><label>واحد اندازه‌گیری<select id="unitSelect"><option value="mm">میلی‌متر (mm)</option><option value="cm">سانتی‌متر (cm)</option><option value="m">متر (m)</option><option value="in">اینچ (in)</option><option value="ft">فوت (ft)</option></select></label><label class="check"><input id="showDims" type="checkbox" ${state.drawing.showDims?'checked':''}> نمایش اندازه شیء انتخابی</label><label class="check"><input id="snapCheck" type="checkbox" ${state.drawing.snap?'checked':''}> Snap روی ${C.drawing.snapMm} mm</label><label class="check"><input id="gridCheck" type="checkbox" ${state.drawing.grid?'checked':''}> نمایش Grid</label></div><div class="tool-section"><button class="btn full" data-action="duplicate">تکثیر انتخاب</button><button class="btn danger full" data-action="delete">حذف انتخاب</button></div><div class="selection-card"><span>زوم</span><b id="zoomReadout">—</b><div class="zoom-buttons"><button class="icon-btn" data-action="zoom-out">−</button><button class="icon-btn" data-action="zoom-reset">100%</button><button class="icon-btn" data-action="zoom-in">+</button></div></div></aside><section class="cad-main panel"><div class="cad-topbar"><div class="legend"><span class="dot cyan"></span>نقشه زنده</div><div class="cad-hint">Wheel: Zoom · Shift/Mouse middle: Pan · Esc: لغو</div></div><div class="cad-viewport" id="cadViewport"><svg id="cadSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${state.drawing.viewW} ${state.drawing.viewH}"></svg></div><div class="cad-status"><span>${state.project.drawings.length} آبجکت</span><span>Canvas: ${state.drawing.viewW} × ${state.drawing.viewH} mm</span><span>شبکه: ${C.drawing.majorGridMm} / ${C.drawing.minorGridMm} mm</span></div></section><aside class="cad-right panel"><div class="panel-head"><h3>مشخصات</h3><span class="badge cyan">LIVE</span></div><div id="propBox"></div><div class="live-sync"><b>شیت زنده</b><p>هر قطعه‌ای که روی نقشه می‌گذاری به شیت «نقشه-قطعات» اضافه و با تغییراتت به‌روزرسانی می‌شود.</p><button class="btn" data-action="open-parts-sheet">باز کردن شیت</button></div></aside></div>`;}
  function renderParts(){if(!state.project)return emptyProject();const parts=state.project.drawings.filter(o=>['rect','line','polyline'].includes(o.type));return `<div class="page-head"><div><span class="eyebrow">PARTS & CUTTING</span><h1>قطعات و برش</h1><p>این لیست مستقیماً از نقشه ساخته می‌شود.</p></div><div class="head-actions"><button class="btn" data-action="drawing">بازگشت به نقشه</button><button class="btn primary" data-action="xlsx">Excel قطعات</button></div></div><div class="panel table-panel"><div class="table-tools"><span>${parts.length} قطعه</span><button class="btn" data-action="add-part">+ قطعه دستی</button></div><table class="data-table"><thead><tr><th>#</th><th>نام</th><th>نوع</th><th>X</th><th>Y</th><th>عرض</th><th>ارتفاع</th><th>طول</th><th>متریال</th></tr></thead><tbody>${parts.map((o,i)=>{const b=objectBounds(o);const l=o.type==='line'?dist(o.x1,o.y1,o.x2,o.y2):Math.max(b.w,b.h);return `<tr><td>${i+1}</td><td>${esc(o.label||'قطعه')}</td><td>${esc(o.type)}</td><td>${round(b.x)}</td><td>${round(b.y)}</td><td>${round(b.w)}</td><td>${round(b.h)}</td><td>${round(l)}</td><td>${esc(o.material||'MDF')}</td></tr>`}).join('')}</tbody></table></div>`;}
  function renderPayments(){if(!state.project)return emptyProject();const total=(state.project.payments||[]).reduce((a,b)=>a+Number(b.amount||0),0);return `<div class="page-head"><div><span class="eyebrow">PAYMENTS</span><h1>پرداخت‌ها</h1><p>دریافتی‌ها و مانده پروژه را ساده نگه دار.</p></div><button class="btn primary" data-action="add-payment">+ ثبت پرداخت</button></div><div class="stats-grid"><div class="stat-card"><span>جمع دریافتی</span><b>${total.toLocaleString('fa-IR')}</b><small>تومان / واحد پول پروژه</small></div><div class="stat-card"><span>تعداد پرداخت</span><b>${state.project.payments?.length||0}</b><small>ثبت‌شده</small></div></div><div class="panel table-panel"><table class="data-table"><thead><tr><th>تاریخ</th><th>عنوان</th><th>مبلغ</th><th>توضیح</th><th></th></tr></thead><tbody>${(state.project.payments||[]).map(p=>`<tr><td>${esc(p.date||'')}</td><td>${esc(p.title||'')}</td><td>${Number(p.amount||0).toLocaleString('fa-IR')}</td><td>${esc(p.note||'')}</td><td><button class="icon-btn" data-del-payment="${p.id}">حذف</button></td></tr>`).join('')}</tbody></table></div>`;}
  function renderExports(){if(!state.project)return emptyProject();return `<div class="page-head"><div><span class="eyebrow">EXPORT CENTER</span><h1>خروجی‌ها</h1><p>هر خروجی برای یک سناریو؛ بدون دردسر.</p></div></div><div class="export-grid"><article class="export-card"><span class="export-icon">▤</span><h3>Excel</h3><p>تمام شیت‌ها به‌همراه شیت زنده نقشه-قطعات.</p><button class="btn primary" data-action="xlsx">دانلود .xlsx</button></article><article class="export-card"><span class="export-icon">⌁</span><h3>PDF پروژه</h3><p>گزارش چاپی پروژه، قطعات و پرداخت‌ها.</p><button class="btn primary" data-action="pdf">ساخت PDF</button></article><article class="export-card"><span class="export-icon">▱</span><h3>PDF نقشه</h3><p>نقشه فنی با اندازه‌های واقعی و قابل چاپ.</p><button class="btn primary" data-action="drawing-pdf">ساخت PDF</button></article><article class="export-card"><span class="export-icon">◇</span><h3>Project KWM</h3><p>برای ادامه کار روی دستگاه دیگر.</p><button class="btn primary" data-action="kwm">دانلود .kwm</button></article><article class="export-card"><span class="export-icon">☁</span><h3>Telegram Backup</h3><p>ارسال KWM + Excel + PDF به Worker.</p><button class="btn primary" data-action="backup">پشتیبان‌گیری</button></article></div>`;}
  function renderBackups(){if(!state.project)return emptyProject();return `<div class="page-head"><div><span class="eyebrow">RECOVERY</span><h1>ذخیره و بازیابی</h1><p>از دست رفتن کار نباید یعنی شروع دوباره.</p></div><div class="head-actions"><button class="btn" data-action="snapshot">+ Snapshot</button><button class="btn primary" data-action="backup">Telegram Backup</button></div></div><div class="recovery-grid"><div class="panel"><div class="panel-head"><h3>ذخیره خودکار</h3><span class="badge green">فعال</span></div><p>تغییرات پروژه در IndexedDB همین دستگاه با فاصله کوتاه ذخیره می‌شوند.</p><div class="recovery-callout">آخرین ذخیره: ${new Date(state.project.updatedAt||Date.now()).toLocaleString('fa-IR')}</div><button class="btn full" data-action="kwm">خروجی اضطراری KWM</button></div><div class="panel"><div class="panel-head"><h3>Snapshots</h3><span class="badge purple">${state.project.snapshots?.length||0}</span></div><div class="snapshot-list">${(state.project.snapshots||[]).slice().reverse().map(s=>`<div class="snapshot"><div><b>${esc(s.label)}</b><small>${new Date(s.at).toLocaleString('fa-IR')}</small></div><button class="btn" data-restore-snap="${s.id}">بازگردانی</button></div>`).join('')||'<div class="empty-box">Snapshot نداریم.</div>'}</div></div></div>`;}
  function renderSettings(){if(!state.project)return emptyProject();return `<div class="page-head"><div><span class="eyebrow">SETTINGS</span><h1>تنظیمات</h1><p>پروژه و اتصال Cloudflare Worker را کنترل کن.</p></div></div><div class="settings-grid"><div class="panel"><div class="panel-head"><h3>اطلاعات پروژه</h3><span class="badge">پروژه</span></div><div class="form-grid"><label>نام پروژه<input data-project="name" value="${esc(state.project.name)}"></label><label>نام مشتری<input data-project="customer" value="${esc(state.project.customer||'')}"></label><label>تلفن<input data-project="phone" value="${esc(state.project.phone||'')}"></label><label>وضعیت<select data-project="status"><option>در حال طراحی</option><option>در تولید</option><option>تکمیل شده</option><option>متوقف</option></select></label><label class="span-2">آدرس<textarea data-project="address">${esc(state.project.address||'')}</textarea></label><label class="span-2">یادداشت<textarea data-project="notes">${esc(state.project.notes||'')}</textarea></label></div></div><div class="panel"><div class="panel-head"><h3>Cloudflare Worker / Telegram</h3><span class="badge ${state.worker.status==='ok'?'green':'amber'}">${esc(state.worker.status)}</span></div><div class="connection-card"><div><b>Worker URL</b><code>${esc(C.workerUrl)}</code></div><div><b>Health</b><span>${esc(state.worker.message)}</span></div></div><p class="muted">توکن Telegram در Frontend وجود ندارد. Worker باید Secretهای Telegram را داشته باشد.</p><div class="settings-actions"><button class="btn" data-action="worker-health">بررسی Health</button><button class="btn primary" data-action="telegram-test">تست واقعی Telegram</button></div></div><div class="panel"><div class="panel-head"><h3>مدیریت داده</h3></div><div class="settings-actions"><button class="btn" data-action="snapshot">ساخت Snapshot</button><button class="btn" data-action="kwm">دانلود پروژه</button><button class="btn danger" data-action="clear-cache">پاک کردن داده‌های محلی</button></div><div class="warning">قبل از پاک کردن، حتماً KWM یا Telegram Backup بگیر.</div></div></div>`;}
  function emptyProject(){return '<div class="empty-start panel"><div class="empty-icon">◉</div><h2>پروژه‌ای باز نیست</h2><p>برای شروع یک پروژه بساز یا Excel را وارد کن.</p><button class="btn primary xl" data-action="new">شروع</button></div>';}

  /* ---------- Bindings ---------- */
  function bind(){
    $$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.ui.mobileNav=false;render();if(state.view==='projects')paintProjects();});
    $('#navToggle')?.addEventListener('click',()=>$('#sidebar')?.classList.add('open')); $('#navClose')?.addEventListener('click',()=>$('#sidebar')?.classList.remove('open'));
    $$('[data-action]').forEach(b=>b.onclick=()=>handleAction(b.dataset.action));
    $$('[data-tool]').forEach(b=>b.onclick=()=>{state.drawing.tool=b.dataset.tool;render();});
    $$('[data-sheet-index]').forEach(b=>b.onclick=()=>{state.sheetIndex=Number(b.dataset.sheetIndex);state.selectedCell=null;render();});
    $('#sheetSearch')?.addEventListener('input',e=>{state.sheetSearch=e.target.value;});
    $('#cellSearch')?.addEventListener('input',e=>{state.cellSearch=e.target.value;});
    $$('#pageRoot [data-cell]').forEach(inp=>inp.addEventListener('focus',()=>{state.selectedCell=inp.dataset.cell;}));
    $$('#pageRoot [data-cell]').forEach(inp=>inp.addEventListener('change',()=>{const p=parseA1(inp.dataset.cell),s=activeSheet();if(!p)return;const v=inp.value;let f='';if(v.startsWith('='))f=v.slice(1);s.data[p.r][p.c]={v:f?'':v,f,t:f?'f':(typeof v==='number'?'n':'s')};setDirty();syncPartsSheet();}));
    $('#cadSvg')?.addEventListener('pointerdown',startCadPointer);$('#cadSvg')?.addEventListener('pointermove',moveCadPointer);$('#cadSvg')?.addEventListener('pointerup',endCadPointer);$('#cadSvg')?.addEventListener('pointerleave',endCadPointer);$('#cadSvg')?.addEventListener('dblclick',doubleCad);$('#cadSvg')?.addEventListener('wheel',wheelCad,{passive:false});
    $('#unitSelect')?.addEventListener('change',e=>{state.drawing.unit=e.target.value;renderCad();updateProperties();}); $('#showDims')?.addEventListener('change',e=>{state.drawing.showDims=e.target.checked;renderCad();});$('#snapCheck')?.addEventListener('change',e=>{state.drawing.snap=e.target.checked;});$('#gridCheck')?.addEventListener('change',e=>{state.drawing.grid=e.target.checked;renderCad();});
    $$('[data-restore-snap]').forEach(b=>b.onclick=async()=>{const s=(state.project.snapshots||[]).find(x=>x.id===b.dataset.restoreSnap);if(s){state.project=structuredClone(s.project);await saveProject(false);render();showToast('Snapshot بازگردانی شد','success');}});
    $$('[data-del-payment]').forEach(b=>b.onclick=()=>{state.project.payments=state.project.payments.filter(x=>x.id!==b.dataset.delPayment);setDirty();render();});
    $$('[data-project]').forEach(inp=>inp.addEventListener('change',()=>{state.project[inp.dataset.project]=inp.value;setDirty();}));
    if(state.view==='projects')paintProjects();
  }
  async function handleAction(a){
    try{
      if(a==='new')return newProject(); if(a==='import')return $('#fileExcel').click(); if(a==='open-project')return $('#fileProject').click();
      if(a==='save')return saveProject(true); if(a==='continue')return setView('workbook');if(a==='drawing')return setView('drawing');if(a==='parts')return setView('parts');
      if(a==='xlsx'){const b=exportXlsxBlob();download(new Blob([b],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${safeName(state.project.name)}_WebApp.xlsx`);return showToast('Excel آماده شد','success');}
      if(a==='kwm'){download(projectBlob(),`${safeName(state.project.name)}_${stamp()}.kwm`);return showToast('فایل KWM ساخته شد','success');}
      if(a==='pdf'){const b=await buildPrintPdf('project');download(b,`${safeName(state.project.name)}_report.pdf`);return showToast('PDF پروژه آماده شد','success');}
      if(a==='drawing-pdf'){const b=await buildPrintPdf('drawing');download(b,`${safeName(state.project.name)}_drawing.pdf`);return showToast('PDF نقشه آماده شد','success');}
      if(a==='backup')return telegramBackup(); if(a==='worker-health')return workerHealth();if(a==='telegram-test')return telegramTest();
      if(a==='snapshot')return makeSnapshot();if(a==='clear-cache')return clearCache();if(a==='help')return helpModal();
      if(a==='add-sheet'){state.project.workbook.sheets.push(emptySheet('شیت جدید'));state.sheetIndex=state.project.workbook.sheets.length-1;setDirty();render();}
      if(a==='add-row'){const s=activeSheet();s.data.push(Array.from({length:s.cols},blankCell));s.rows++;setDirty();render();}
      if(a==='add-col'){const s=activeSheet();s.data.forEach(r=>r.push(blankCell()));s.cols++;setDirty();render();}
      if(a==='delete-row'){const s=activeSheet();if(s.rows>1){s.data.pop();s.rows--;setDirty();render();}}
      if(a==='delete-col'){const s=activeSheet();if(s.cols>1){s.data.forEach(r=>r.pop());s.cols--;setDirty();render();}}
      if(a==='zoom-out'){state.drawing.zoom=clamp(state.drawing.zoom*0.82,C.drawing.zoomMin,C.drawing.zoomMax);renderCad();updateCadHud();}
      if(a==='zoom-in'){state.drawing.zoom=clamp(state.drawing.zoom*1.22,C.drawing.zoomMin,C.drawing.zoomMax);renderCad();updateCadHud();}
      if(a==='zoom-reset'){state.drawing.zoom=.42;state.drawing.panX=70;state.drawing.panY=60;renderCad();updateCadHud();}
      if(a==='fit-drawing')return fitDrawing();if(a==='duplicate')return duplicateSelected();if(a==='delete')return deleteSelected();
      if(a==='open-parts-sheet'){const i=state.project.workbook.sheets.findIndex(s=>s.name==='نقشه-قطعات');if(i>=0){state.sheetIndex=i;setView('workbook');}return;}
      if(a==='add-payment')return addPayment();if(a==='add-part')return addManualPart();if(a==='sheet-export-csv')return exportCsv();
    }catch(e){console.error(e);showToast(e.message||String(e),'danger');}
  }
  function setView(v){state.view=v;render();}
  function newProject(){openModal('پروژه جدید','یک نام ساده انتخاب کن؛ بعداً همه چیز قابل ویرایش است.',`<label>نام پروژه<input id="newPName" value="پروژه ${new Date().toLocaleDateString('fa-IR')}"></label><label>نام مشتری<input id="newPCustomer" value=""></label>`,`<button class="btn" data-close>انصراف</button><button class="btn primary" id="createP">ساخت پروژه</button>`);$('#createP').onclick=async()=>{state.project=freshProject($('#newPName').value||'پروژه جدید');state.project.customer=$('#newPCustomer').value||'';state.sheetIndex=0;state.view='dashboard';await saveProject(false);closeModal();render();showToast('پروژه ساخته شد','success');};}
  function addPayment(){openModal('ثبت پرداخت','مبلغ و توضیح را وارد کن.',`<div class="form-grid"><label>تاریخ<input id="payDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>عنوان<input id="payTitle" value="دریافت بیعانه"></label><label>مبلغ<input id="payAmount" type="number" value="0"></label><label class="span-2">توضیح<textarea id="payNote"></textarea></label></div>`,`<button class="btn" data-close>انصراف</button><button class="btn primary" id="payOk">ثبت</button>`);$('#payOk').onclick=()=>{state.project.payments.push({id:uid('pay'),date:$('#payDate').value,title:$('#payTitle').value,amount:Number($('#payAmount').value)||0,note:$('#payNote').value});setDirty();closeModal();render();};}
  function addManualPart(){state.project.drawings.push({id:uid('obj'),type:'rect',x:100,y:100,w:600,h:300,label:'قطعه دستی',material:'MDF'});state.drawing.selectedId=state.project.drawings.at(-1).id;setDirty();syncPartsSheet();setView('drawing');}
  function exportCsv(){const s=activeSheet();const rows=s.data.map(r=>r.map(c=>String(c?.f?`=${c.f}`:c?.v??'').replaceAll('"','""')).map(v=>`"${v}"`).join(','));download(new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'}),`${safeName(s.name)}.csv`);}
  function fitDrawing(){const objs=state.project.drawings;if(!objs.length){state.drawing.zoom=.42;state.drawing.panX=70;state.drawing.panY=60;renderCad();return;}let x=Infinity,y=Infinity,X=-Infinity,Y=-Infinity;objs.forEach(o=>{const b=objectBounds(o);x=Math.min(x,b.x);y=Math.min(y,b.y);X=Math.max(X,b.x+b.w);Y=Math.max(Y,b.y+b.h);});const vw=$('#cadViewport')?.clientWidth||1000,vh=$('#cadViewport')?.clientHeight||650;state.drawing.zoom=clamp(Math.min(vw/(X-x+300),vh/(Y-y+300)),C.drawing.zoomMin,1.3);state.drawing.panX=(vw/state.drawing.zoom-(X+x))/2;state.drawing.panY=(vh/state.drawing.zoom-(Y+y))/2;renderCad();}
  async function makeSnapshot(){if(!state.project)return;const snap={id:uid('snap'),at:nowISO(),label:`نسخه ${((state.project.snapshots||[]).length||0)+1}`,project:structuredClone(state.project)};state.project.snapshots=[...(state.project.snapshots||[]),snap].slice(-C.snapshotLimit);setDirty();await saveProject(true);render();}
  async function telegramBackup(){
    if(!state.project)return; const base=C.workerUrl.replace(/\/$/,''); const [xlsx,pdf]=await Promise.all([exportXlsxBlob(),buildPrintPdf('project')]); const fd=new FormData();
    fd.append('project',projectBlob(),`${safeName(state.project.name)}_${stamp()}.kwm`); fd.append('xlsx',new Blob([xlsx],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${safeName(state.project.name)}_${stamp()}.xlsx`); fd.append('pdf',pdf,`${safeName(state.project.name)}_${stamp()}_report.pdf`); fd.append('projectName',state.project.name); fd.append('projectId',state.project.id); fd.append('clientTime',nowISO());
    const r=await fetch(base+C.workerBackupPath,{method:'POST',body:fd}); const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||`Worker پاسخ ${r.status}`);state.worker.status='ok';state.worker.message=`بکاپ با موفقیت ارسال شد (${d.files?.filter(x=>x.telegram).length||0} فایل)`;render();showToast('Backup به Telegram ارسال شد','success');
  }
  async function workerHealth(){const r=await fetch(C.workerUrl+C.workerHealthPath);const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||`Health ${r.status}`);state.worker.status='ok';state.worker.message=`Worker ${d.version||''} فعال است`;showToast('Worker در دسترس است','success');render();}
  async function telegramTest(){const r=await fetch(C.workerUrl+C.workerTestPath,{method:'POST'});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||`Telegram ${r.status}`);state.worker.status='ok';state.worker.message=`Bot OK: @${d.bot?.username||'configured'}`;showToast('اتصال Telegram موفق است','success');render();}
  async function clearCache(){if(!confirm('تمام پروژه‌های ذخیره‌شده روی این دستگاه حذف شوند؟'))return;const all=await DB.all('projects');for(const p of all)await DB.del('projects',p.id);state.project=null;state.view='dashboard';render();showToast('داده‌های محلی پاک شدند','success');}
  function helpModal(){openModal('راهنمای کاربر مبتدی','هر کاری یک مسیر ساده دارد.',`<div class="help-grid"><div><b>۱. پروژه</b><p>پروژه جدید بساز یا Excel را وارد کن.</p></div><div><b>۲. Workbook</b><p>هر سلول، ردیف و ستون را داخل سایت ویرایش کن.</p></div><div><b>۳. نقشه</b><p>با R/L/P/D رسم کن. اندازه واقعی بر اساس mm ذخیره می‌شود.</p></div><div><b>۴. اندازه‌گذاری</b><p>شیء را انتخاب کن؛ اگر «نمایش اندازه» روشن باشد ابعاد روی نقشه نشان داده می‌شوند.</p></div><div><b>۵. شیت زنده</b><p>هر قطعهٔ نقشه به «نقشه-قطعات» می‌رود.</p></div><div><b>۶. امنیت</b><p>توکن Telegram فقط روی Cloudflare Worker نگهداری می‌شود.</p></div></div>`,`<button class="btn primary" data-close>متوجه شدم</button>`);}
  function openModal(title,subtitle,body,foot){$('#modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="eyebrow">${esc(C.appName)}</span><h2>${esc(title)}</h2><p>${esc(subtitle||'')}</p></div><button class="icon-btn" data-close>×</button></div><div class="modal-body">${body}</div><div class="modal-foot">${foot}</div></div></div>`;$$('[data-close]').forEach(b=>b.onclick=closeModal);}
  function closeModal(){$('#modalRoot').innerHTML='';}

  $('#fileExcel').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importExcel(f);e.target.value='';});
  $('#fileProject').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importProject(f);e.target.value='';});
  window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject(true);}if(e.key==='Escape'){state.drawing.draft=null;state.drawing.drag=null;closeModal();render();}if((e.key==='Delete'||e.key==='Backspace')&&state.view==='drawing'&&!e.target.matches('input,textarea'))deleteSelected();if(state.view==='drawing'&&!e.target.matches('input,textarea')){const k=e.key.toLowerCase(),map={v:'select',l:'line',p:'polyline',r:'rect',c:'circle',d:'dimension',t:'text',h:'pan'};if(map[k]){state.drawing.tool=map[k];render();}}});
  window.addEventListener('beforeunload',()=>{if(state.project&&state.dirty)DB.put('projects',structuredClone(state.project));});
  async function boot(){try{await DB.open();const arr=await DB.all('projects');if(arr.length){state.project=arr.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))[0];state.view='dashboard';}render();if(state.project)syncPartsSheet();}catch(e){render();showToast(`Storage error: ${e.message}`,'danger');}}
  boot();
})();
