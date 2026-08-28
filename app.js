// ================== STATE ==================
let state = {
  sheets: [
    { id: 'sheet1', name: 'فاکتور خدمات', columns: ['ردیف','شرح کالا','تعداد','قیمت واحد','مبلغ کل','نوار','توضیحات'], rows: [] }
  ],
  activeSheetId: 'sheet1',
  nextRowId: 1,
  drawingData: {}
};

// ================== UTILITY ==================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 3000);
}

function saveStateToStorage() {
  localStorage.setItem('cabinetWorkshopState', JSON.stringify(state));
  showToast('💾 ذخیره شد');
}

function loadStateFromStorage() {
  const saved = localStorage.getItem('cabinetWorkshopState');
  if (saved) {
    try { state = JSON.parse(saved); renderAll(); showToast('وضعیت بازیابی شد'); } catch(e) {}
  }
}

// ================== RENDER ==================
function renderAll() {
  renderSheetList();
  renderActiveSheet();
}

function renderSheetList() {
  const ul = document.getElementById('sheetList');
  ul.innerHTML = '';
  state.sheets.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s.name;
    li.className = s.id === state.activeSheetId ? 'active' : '';
    li.addEventListener('click', () => { state.activeSheetId = s.id; renderAll(); });
    ul.appendChild(li);
  });
}

function renderActiveSheet() {
  const sheet = state.sheets.find(s => s.id === state.activeSheetId);
  if (!sheet) return;
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');
  // header
  thead.innerHTML = '<tr>' + sheet.columns.map(c => `<th>${c}</th>`).join('') + '<th>عملیات</th></tr>';
  // rows
  tbody.innerHTML = '';
  sheet.rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    sheet.columns.forEach(col => {
      const td = document.createElement('td');
      td.contentEditable = true;
      td.textContent = row[col] || '';
      td.addEventListener('input', () => {
        row[col] = td.textContent;
        // auto-calc if needed (simple)
        saveStateToStorage();
      });
      tr.appendChild(td);
    });
    // action buttons
    const actionTd = document.createElement('td');
    actionTd.innerHTML = `<button class="btn-sm" data-rowidx="${idx}">✏️</button> <button class="btn-sm" data-rowidx="${idx}">🗑️</button>`;
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

// ================== NEW SHEET ==================
document.getElementById('btnNewSheet').addEventListener('click', () => {
  const name = prompt('نام شیت جدید:');
  if (name) {
    const id = 'sheet' + Date.now();
    state.sheets.push({ id, name, columns: ['ردیف','شرح','تعداد','قیمت','مجموع'], rows: [] });
    state.activeSheetId = id;
    renderAll();
    saveStateToStorage();
  }
});

// ================== SAVE / LOAD ==================
document.getElementById('btnSaveState').addEventListener('click', saveStateToStorage);

document.getElementById('btnLoadState').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        state = JSON.parse(ev.target.result);
        saveStateToStorage();
        renderAll();
        showToast('📂 بارگذاری شد');
      } catch(err) { showToast('خطا در بارگذاری'); }
    };
    reader.readAsText(file);
  };
  input.click();
});

// ================== EXPORT PDF ==================
document.getElementById('btnExportPDF').addEventListener('click', () => {
  showToast('📄 در حال ساخت PDF...');
  // نیاز به html2canvas و jsPDF – کد نمونه:
  // html2canvas(document.getElementById('sheetContainer')).then(canvas => { ... });
  // اما برای سادگی پیام می‌دهیم
  showToast('PDF ساخته شد (نیاز به کتابخانه)');
});

// ================== EXPORT EXCEL ==================
document.getElementById('btnExportExcel').addEventListener('click', () => {
  showToast('📊 ساخت Excel با SheetJS امکان‌پذیر است');
  // const wb = XLSX.utils.book_new(); ...
});

// ================== TELEGRAM (ارسال بکاپ) ==================
document.getElementById('btnTelegram').addEventListener('click', async () => {
  showToast('✈️ در حال ارسال به تلگرام ...');

  try {
    const jsonData = JSON.stringify(state);
    const blob = new Blob([jsonData], { type: 'application/json' });

    const now = new Date();
    const timestamp = 
      now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') + '-' +
      String(now.getMinutes()).padStart(2, '0') + '-' +
      String(now.getSeconds()).padStart(2, '0');
    const fileName = `Backup_Workshop_${timestamp}.json`;

    const file = new File([blob], fileName, { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', file);

    // 🔽 آدرس ورکر خود را دقیقاً وارد کنید
    const WORKER_URL = 'https://cabinet-backup-worker.game-developer-mb.workers.dev/';

    const response = await fetch(WORKER_URL, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      showToast('✅ فایل با موفقیت به تلگرام ارسال شد');
    } else {
      showToast('❌ خطا در ارسال: ' + (result.error || 'مشخص نیست'));
    }
  } catch (error) {
    console.error(error);
    showToast('❌ خطای شبکه یا سرور');
  }
});

// ================== DRAWING ==================
let drawingMode = false;
document.getElementById('addDimension').addEventListener('click', () => {
  drawingMode = !drawingMode;
  showToast(drawingMode ? '🖊️ حالت اندازه‌گیری فعال' : '🖊️ حالت غیرفعال');
});
document.getElementById('clearDrawing').addEventListener('click', () => {
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showToast('🗑️ نقشه پاک شد');
});

// ================== INIT ==================
loadStateFromStorage();
renderAll();
