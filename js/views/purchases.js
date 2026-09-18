import * as store from '../store.js';
import { uid, yen, parseYen, monthKey, parseMonthKey, escapeHtml, DEPT_LABELS } from '../utils.js';
import { parseShiireSheet, suggestAccount, detectTaxFlag, buildPurchaseDescription } from '../purchase-parse.js';

function refreshChromeIfPossible() {
  import('../app.js').then((m) => m.refreshChrome && m.refreshChrome());
}

const DEPT_OPTIONS = [
  { value: '', label: '（選択してください）' },
  { value: 'kitchen', label: DEPT_LABELS.kitchen },
  { value: 'care', label: DEPT_LABELS.care },
  { value: 'clinic', label: DEPT_LABELS.clinic },
];

export async function renderPurchasesView(container) {
  const key = store.getCurrentMonth();
  const { year, month } = parseMonthKey(key);
  const accounts = store.getAccounts();

  function accountSelectOptions(selected) {
    const opts = ['<option value="">（取り込まない）</option>']
      .concat(accounts.map((a) => `<option value="${escapeHtml(a.name)}" ${a.name === selected ? 'selected' : ''}>${escapeHtml(a.name)}</option>`));
    return opts.join('');
  }

  // ---------- 取込済み一覧（当月分） ----------
  let purchaseList = store.getPurchaseExpenses(key);

  function persistList() {
    store.setPurchaseExpenses(key, purchaseList);
  }

  function renderList() {
    const tbody = container.querySelector('#purchase-tbody');
    if (!tbody) return;
    tbody.innerHTML = purchaseList
      .map(
        (p) => `
      <tr data-id="${p.id}">
        <td><input type="date" class="p-date" value="${p.date || ''}"></td>
        <td><select class="p-account">${accountSelectOptions(p.account)}</select></td>
        <td><input type="text" inputmode="numeric" class="p-amount num" value="${yen(p.amount)}"></td>
        <td><input type="text" class="p-desc" value="${escapeHtml(p.description)}"></td>
        <td>
          <select class="p-kahi">
            <option value="" ${!p.taxFlag ? 'selected' : ''}></option>
            <option value="課" ${p.taxFlag === '課' ? 'selected' : ''}>課</option>
            <option value="非" ${p.taxFlag === '非' ? 'selected' : ''}>非</option>
          </select>
        </td>
        <td class="center"><button class="small danger p-del">削除</button></td>
      </tr>`
      )
      .join('');
    bindListEvents();
    const totalEl = container.querySelector('#purchase-total');
    if (totalEl) totalEl.textContent = `¥${yen(purchaseList.reduce((s, p) => s + (Number(p.amount) || 0), 0))}`;
  }

  function bindListEvents() {
    container.querySelectorAll('#purchase-tbody tr').forEach((tr) => {
      const id = tr.dataset.id;
      const p = purchaseList.find((x) => x.id === id);
      tr.querySelector('.p-date').addEventListener('change', (e) => {
        p.date = e.target.value;
        persistList();
      });
      tr.querySelector('.p-account').addEventListener('change', (e) => {
        p.account = e.target.value;
        persistList();
      });
      const amountEl = tr.querySelector('.p-amount');
      amountEl.addEventListener('input', () => {
        p.amount = parseYen(amountEl.value);
        persistList();
        const totalEl = container.querySelector('#purchase-total');
        if (totalEl) totalEl.textContent = `¥${yen(purchaseList.reduce((s, x) => s + (Number(x.amount) || 0), 0))}`;
      });
      amountEl.addEventListener('blur', () => {
        amountEl.value = yen(p.amount);
      });
      tr.querySelector('.p-desc').addEventListener('change', (e) => {
        p.description = e.target.value;
        persistList();
      });
      tr.querySelector('.p-kahi').addEventListener('change', (e) => {
        p.taxFlag = e.target.value;
        persistList();
      });
      tr.querySelector('.p-del').addEventListener('click', () => {
        if (!confirm('この行を削除しますか？')) return;
        purchaseList = purchaseList.filter((x) => x.id !== id);
        persistList();
        renderList();
      });
    });
  }

  // ---------- Excel取込 ----------
  let parsedSheets = []; // { sheetName, items, yearMonth, dept, include }
  let labelMap = {}; // rawLabel -> confirmed account name

  function renderImportSection() {
    const box = container.querySelector('#import-box');
    if (parsedSheets.length === 0) {
      box.innerHTML = '<div class="hint">上のファイル選択から仕入れ管理Excelを選んでください。</div>';
      return;
    }

    const allLabels = [...new Set(parsedSheets.filter((s) => s.include).flatMap((s) => s.items.map((i) => i.rawLabel)))];

    box.innerHTML = `
      <h3>読み込んだシート</h3>
      <table>
        <thead>
          <tr><th></th><th>シート名</th><th>対象年月</th><th>部署</th><th class="num">件数</th><th class="num">合計額</th></tr>
        </thead>
        <tbody>
          ${parsedSheets
            .map((s, i) => {
              const total = s.items.reduce((sum, it) => sum + it.amount, 0);
              return `
              <tr data-si="${i}">
                <td class="center"><input type="checkbox" class="s-include" ${s.include ? 'checked' : ''}></td>
                <td>${escapeHtml(s.sheetName)}</td>
                <td>
                  <input type="number" class="s-year" style="width:70px;" value="${s.yearMonth ? s.yearMonth.year : ''}">年
                  <input type="number" class="s-month" style="width:50px;" min="1" max="12" value="${s.yearMonth ? s.yearMonth.month : ''}">月
                </td>
                <td>
                  <select class="s-dept">
                    ${DEPT_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === (s.dept || '') ? 'selected' : ''}>${o.label}</option>`).join('')}
                  </select>
                </td>
                <td class="num">${s.items.length}件</td>
                <td class="num">¥${yen(total)}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>

      <h3>科目の対応付け（${allLabels.length}件）</h3>
      <div class="hint">仕入れ管理表の科目表記と、このシステムの科目マスタとの対応を確認してください。「（取り込まない）」を選ぶとその科目は取り込みません。</div>
      <table>
        <thead><tr><th>元の科目表記</th><th>取り込む科目</th></tr></thead>
        <tbody id="label-map-tbody">
          ${allLabels
            .map((label) => {
              const suggestion = suggestAccount(label, accounts);
              if (!(label in labelMap)) labelMap[label] = suggestion.accountName;
              const unmatched = !labelMap[label];
              return `
              <tr class="${unmatched ? 'row-warn' : ''}" data-label="${escapeHtml(label)}">
                <td>${escapeHtml(label)}${unmatched ? ' <span class="tag-asset">要確認</span>' : ''}</td>
                <td><select class="label-account">${accountSelectOptions(labelMap[label])}</select></td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>

      <div class="toolbar">
        <button class="primary" id="btn-do-import">選択したシートを取り込む</button>
      </div>
    `;

    container.querySelectorAll('.s-include').forEach((el, i) => {
      el.addEventListener('change', () => {
        parsedSheets[i].include = el.checked;
        renderImportSection();
      });
    });
    container.querySelectorAll('.s-year').forEach((el, i) => {
      el.addEventListener('change', () => {
        parsedSheets[i].yearMonth = parsedSheets[i].yearMonth || {};
        parsedSheets[i].yearMonth.year = Number(el.value);
      });
    });
    container.querySelectorAll('.s-month').forEach((el, i) => {
      el.addEventListener('change', () => {
        parsedSheets[i].yearMonth = parsedSheets[i].yearMonth || {};
        parsedSheets[i].yearMonth.month = Number(el.value);
      });
    });
    container.querySelectorAll('.s-dept').forEach((el, i) => {
      el.addEventListener('change', () => {
        parsedSheets[i].dept = el.value || null;
      });
    });
    container.querySelectorAll('#label-map-tbody tr').forEach((tr) => {
      const label = tr.dataset.label;
      tr.querySelector('.label-account').addEventListener('change', (e) => {
        labelMap[label] = e.target.value;
      });
    });

    container.querySelector('#btn-do-import').addEventListener('click', doImport);
  }

  function doImport() {
    const targets = parsedSheets.filter((s) => s.include);
    if (targets.length === 0) {
      alert('取り込むシートを選択してください。');
      return;
    }
    for (const s of targets) {
      if (!s.yearMonth || !s.yearMonth.year || !s.yearMonth.month) {
        alert(`「${s.sheetName}」の対象年月を入力してください。`);
        return;
      }
      if (!s.dept) {
        alert(`「${s.sheetName}」の部署を選択してください。`);
        return;
      }
    }

    const byMonth = {};
    let skippedCount = 0;
    for (const s of targets) {
      const mKey = monthKey(s.yearMonth.year, s.yearMonth.month);
      byMonth[mKey] = byMonth[mKey] || [];
      for (const item of s.items) {
        const accountName = labelMap[item.rawLabel];
        if (!accountName) {
          skippedCount += 1;
          continue;
        }
        const suggestion = suggestAccount(item.rawLabel, accounts);
        byMonth[mKey].push({
          id: uid(),
          date: `${s.yearMonth.year}-${String(s.yearMonth.month).padStart(2, '0')}-01`,
          amount: item.amount,
          account: accountName,
          description: buildPurchaseDescription(s.dept, suggestion.branch, item.vendor, item.rawLabel),
          taxFlag: detectTaxFlag(item.rawLabel),
          vendor: item.vendor,
          source: 'shiire-import',
        });
      }
    }

    let totalImported = 0;
    Object.entries(byMonth).forEach(([mKey, items]) => {
      store.createMonth(...parseMonthKeyToArgs(mKey));
      store.addPurchaseExpenses(mKey, items);
      totalImported += items.length;
    });

    refreshChromeIfPossible();
    parsedSheets = [];
    labelMap = {};
    renderImportSection();
    purchaseList = store.getPurchaseExpenses(key);
    renderList();

    const monthLabels = Object.keys(byMonth)
      .map((k) => {
        const { year: y, month: m } = parseMonthKey(k);
        return `${y}年${m}月`;
      })
      .join('、');
    alert(
      `${totalImported}件を取り込みました（対象月：${monthLabels}）。${skippedCount > 0 ? `\n（対応する科目が未選択のため ${skippedCount}件はスキップしました）` : ''}\n\n「経費集計」画面で確認できます。`
    );
  }

  function parseMonthKeyToArgs(k) {
    const { year: y, month: m } = parseMonthKey(k);
    return [y, m];
  }

  container.innerHTML = `
    <h1 class="page-title">仕入れ経費　${year}年${month}月</h1>
    <div class="hint">
      振替伝票を作らずに、経費集計にのみ反映される仕入れデータを管理します。別で管理している仕入れExcelを取り込むか、下の一覧に直接追加できます。
    </div>

    <div class="panel">
      <h2 style="margin-top:0;">Excelから取り込む</h2>
      <div class="toolbar">
        <input type="file" id="purchase-file-input" accept=".xlsx,.xlsm,.xls" multiple>
      </div>
      <div id="import-box"></div>
    </div>

    <div class="panel">
      <h2 style="margin-top:0;">${year}年${month}月の仕入れ経費一覧</h2>
      <div class="toolbar">
        <button id="btn-add-purchase-row">＋ 行を追加</button>
        <span class="hint" style="margin:0;">合計額 <b id="purchase-total"></b></span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:130px;">日付</th>
            <th style="width:140px;">科目</th>
            <th style="width:120px;">金額</th>
            <th>摘要</th>
            <th style="width:60px;">課/非</th>
            <th style="width:60px;"></th>
          </tr>
        </thead>
        <tbody id="purchase-tbody"></tbody>
      </table>
      ${purchaseList.length === 0 ? '<div class="empty-state">まだデータがありません。</div>' : ''}
    </div>
  `;

  renderList();
  renderImportSection();

  container.querySelector('#btn-add-purchase-row').addEventListener('click', () => {
    purchaseList.push({
      id: uid(),
      date: `${year}-${String(month).padStart(2, '0')}-01`,
      amount: 0,
      account: '',
      description: '',
      taxFlag: '',
      vendor: '',
      source: 'manual',
    });
    persistList();
    renderList();
  });

  container.querySelector('#purchase-file-input').addEventListener('change', async () => {
    const files = Array.from(container.querySelector('#purchase-file-input').files || []);
    if (files.length === 0) return;
    const XLSX = window.XLSX;
    if (!XLSX) {
      alert('Excel読み込みライブラリの読み込みに失敗しました。ページを再読み込みしてお試しください。');
      return;
    }
    const newSheets = [];
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      for (const sheetName of wb.SheetNames) {
        const parsed = parseShiireSheet(XLSX, wb.Sheets[sheetName], sheetName);
        if (parsed && parsed.items.length > 0) {
          newSheets.push({ ...parsed, include: true });
        }
      }
    }
    if (newSheets.length === 0) {
      alert('取り込める形式のシートが見つかりませんでした。「業者名」「科目」「請求額」の列があるシートに対応しています。');
      return;
    }
    parsedSheets = newSheets;
    labelMap = {};
    renderImportSection();
  });
}
