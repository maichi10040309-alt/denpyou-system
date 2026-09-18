import * as store from '../store.js';
import { navigate } from '../router.js';
import { uid, monthKey, escapeHtml } from '../utils.js';

// Excelのシリアル値/Dateオブジェクト/文字列いずれの日付表現からも 'YYYY-MM-DD' を作る
function toISODate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number') {
    // Excelのシリアル値（1900年1月1日起点）
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(epoch.getTime() + value * 86400000);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const m1 = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  return '';
}

function findInputSheet(workbook) {
  const candidates = ['入力シート', 'Input', 'input'];
  for (const name of candidates) {
    if (workbook.SheetNames.includes(name)) return name;
  }
  return null;
}

// 入力シートのシート1枚分をパースする
function parseInputSheet(sheet, XLSX) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  // B2=年 B3=月 （行番号は0始まり: 1行目=index0）
  const year = Number(rows[1] && rows[1][1]);
  const month = Number(rows[2] && rows[2][1]);

  const entries = [];
  for (let r = 6; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const [, dateRaw, amountRaw, debit, desc, credit, amount2Raw, kahi] = row;
    const hasValue = dateRaw || amountRaw || debit || desc || credit || amount2Raw || kahi;
    if (!hasValue) continue;
    entries.push({
      id: uid(),
      date: toISODate(dateRaw),
      amount: Number(amountRaw) || 0,
      debitAccount: debit ? String(debit).trim() : '',
      description: desc ? String(desc).trim() : '',
      creditAccount: credit ? String(credit).trim() : '',
      amount2: Number(amount2Raw) || 0,
      taxFlag: kahi ? String(kahi).trim() : '',
    });
  }

  return { year, month, entries };
}

export async function renderImportView(container) {
  container.innerHTML = `
    <h1 class="page-title">Excelデータの取り込み</h1>
    <div class="hint">
      今お使いのExcel振替伝票ファイル（.xlsx / .xlsm）を選択すると、「入力シート」の年月・取引データを読み込みます。<br>
      ファイルの中身はこの画面上で処理されるだけで、どこにも送信されません。月ごとに分かれた過去のファイルがあれば、複数選択でまとめて取り込めます。
    </div>
    <div class="panel">
      <div class="toolbar">
        <input type="file" id="file-input" accept=".xlsx,.xlsm,.xls" multiple>
      </div>
      <div id="results"></div>
    </div>
  `;

  const fileInput = container.querySelector('#file-input');
  const results = container.querySelector('#results');

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) return;
    results.innerHTML = '<div class="hint">読み込み中...</div>';

    const XLSX = window.XLSX;
    if (!XLSX) {
      results.innerHTML = '<div class="empty-state">Excel読み込みライブラリの読み込みに失敗しました。ページを再読み込みしてお試しください。</div>';
      return;
    }

    const parsedFiles = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const sheetName = findInputSheet(wb);
        if (!sheetName) {
          parsedFiles.push({ file, error: '「入力シート」が見つかりませんでした。' });
          continue;
        }
        const parsed = parseInputSheet(wb.Sheets[sheetName], XLSX);
        if (!parsed.year || !parsed.month) {
          parsedFiles.push({ file, error: '年・月（B2・B3セル）が読み取れませんでした。' });
          continue;
        }
        parsedFiles.push({ file, ...parsed });
      } catch (e) {
        console.error(e);
        parsedFiles.push({ file, error: 'ファイルの読み込みに失敗しました。' });
      }
    }

    renderPreview(parsedFiles);
  });

  function renderPreview(parsedFiles) {
    results.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ファイル</th>
            <th>対象月</th>
            <th class="num">件数</th>
            <th>状態</th>
            <th>取り込み方法</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          ${parsedFiles
            .map((p, i) => {
              if (p.error) {
                return `<tr><td>${escapeHtml(p.file.name)}</td><td colspan="4">${escapeHtml(p.error)}</td><td></td></tr>`;
              }
              const key = monthKey(p.year, p.month);
              const exists = store.monthExists(key);
              return `
              <tr data-idx="${i}">
                <td>${escapeHtml(p.file.name)}</td>
                <td>${p.year}年${p.month}月</td>
                <td class="num">${p.entries.length}件</td>
                <td>${exists ? '既存の月データがあります' : '新規月として作成します'}</td>
                <td>
                  ${
                    exists
                      ? `<select class="mode-select">
                          <option value="append">既存データに追加</option>
                          <option value="replace">既存データを置き換え</option>
                        </select>`
                      : '（新規作成）'
                  }
                </td>
                <td class="center"><button class="small primary btn-import">取り込む</button></td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `;

    results.querySelectorAll('tr[data-idx]').forEach((tr) => {
      const idx = Number(tr.dataset.idx);
      const p = parsedFiles[idx];
      const btn = tr.querySelector('.btn-import');
      btn.addEventListener('click', () => {
        const key = monthKey(p.year, p.month);
        const mode = tr.querySelector('.mode-select')?.value || 'append';
        store.createMonth(p.year, p.month);
        const existing = mode === 'replace' ? [] : store.getEntries(key);
        store.setEntries(key, [...existing, ...p.entries]);
        store.setCurrentMonth(key);
        btn.textContent = '取り込み完了';
        btn.disabled = true;
        import('../app.js').then((m) => m.refreshChrome && m.refreshChrome());
      });
    });

    if (parsedFiles.some((p) => !p.error)) {
      const goBtn = document.createElement('div');
      goBtn.className = 'toolbar';
      goBtn.style.marginTop = '14px';
      goBtn.innerHTML = '<button class="primary" id="go-entry">伝票入力シートで確認する</button>';
      results.appendChild(goBtn);
      document.getElementById('go-entry').addEventListener('click', () => navigate('/entry'));
    }
  }
}
