import * as store from '../store.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../modal.js';
import { uid, yen, parseYen, parseMonthKey, escapeHtml, formatDateShort } from '../utils.js';
import { findMissingDateRows, resolveRecurring } from '../logic.js';
import { exportMonthToExcel } from '../export-excel.js';

export async function renderEntryView(container) {
  const key = store.getCurrentMonth();
  const { year, month } = parseMonthKey(key);
  let entries = store.getEntries(key);

  function persist() {
    store.setEntries(key, entries);
  }

  function computeTotals() {
    const totalC = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalG = entries.reduce((s, e) => s + (Number(e.amount2) || 0), 0);
    return { totalC, totalG, diff: totalC - totalG };
  }

  function updateTotalsBar() {
    const { totalC, totalG, diff } = computeTotals();
    const bar = container.querySelector('#totals-bar');
    if (!bar) return;
    bar.innerHTML = `
      <div class="item">借方合計額 <b>¥${yen(totalC)}</b></div>
      <div class="item">貸方合計額 <b>¥${yen(totalG)}</b></div>
      <div class="item ${diff === 0 ? 'diff-ok' : 'diff-bad'}">差額 <b>¥${yen(diff)}</b>${diff === 0 ? '（一致）' : '（不一致）'}</div>
    `;
  }

  const accounts = store.getAccounts();
  const descriptions = store.getDescriptions();

  function accountOptions() {
    return accounts.map((a) => `<option value="${escapeHtml(a.name)}"></option>`).join('');
  }
  function descOptions() {
    return descriptions.map((d) => `<option value="${escapeHtml(d.text)}"></option>`).join('');
  }

  // ---- 絞り込み・並べ替え ----
  const filterState = { date: '', amount: '', account: '', desc: '' };
  const sortState = { field: null, dir: 'asc' };
  const SORT_FIELDS = ['date'];

  function hasActiveFilter() {
    return Boolean(filterState.date || filterState.amount || filterState.account || filterState.desc);
  }

  function resetFilterAndSort() {
    filterState.date = '';
    filterState.amount = '';
    filterState.account = '';
    filterState.desc = '';
    sortState.field = null;
    sortState.dir = 'asc';
    ['f-date', 'f-amount', 'f-account', 'f-desc'].forEach((id) => {
      const el = container.querySelector(`#${id}`);
      if (el) el.value = '';
    });
  }

  function matchesFilter(e) {
    if (filterState.date) {
      const shortDate = e.date ? formatDateShort(e.date) : '';
      if (!(e.date || '').includes(filterState.date) && !shortDate.includes(filterState.date)) return false;
    }
    if (filterState.amount) {
      const a1 = e.amount ? String(e.amount) : '';
      const a2 = e.amount2 ? String(e.amount2) : '';
      if (!a1.includes(filterState.amount) && !a2.includes(filterState.amount)) return false;
    }
    if (filterState.account) {
      const hay = `${e.debitAccount || ''} ${e.creditAccount || ''}`;
      if (!hay.includes(filterState.account)) return false;
    }
    if (filterState.desc) {
      if (!(e.description || '').includes(filterState.desc)) return false;
    }
    return true;
  }

  function compareEntries(a, b) {
    const f = sortState.field;
    let va = a[f];
    let vb = b[f];
    if (f === 'amount' || f === 'amount2') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else {
      va = String(va || '');
      vb = String(vb || '');
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortState.dir === 'desc' ? -cmp : cmp;
  }

  function getVisibleEntries() {
    const filtered = entries.filter(matchesFilter);
    if (!sortState.field) return filtered;
    return [...filtered].sort(compareEntries);
  }

  function updateSortIndicators() {
    SORT_FIELDS.forEach((f) => {
      const arrow = container.querySelector(`.sort-arrow[data-field="${f}"]`);
      if (!arrow) return;
      arrow.textContent = sortState.field === f ? (sortState.dir === 'asc' ? '▲' : '▼') : '';
    });
  }

  function rowHtml(e, num) {
    return `
    <tr data-id="${e.id}">
      <td class="center">${num}</td>
      <td><input type="date" class="f-date" value="${e.date || ''}"></td>
      <td><input type="text" inputmode="numeric" class="f-amount num" value="${e.amount ? yen(e.amount) : ''}" placeholder="0"></td>
      <td><input type="text" list="account-list" class="f-debit" value="${escapeHtml(e.debitAccount)}"></td>
      <td><input type="text" list="desc-list" class="f-desc" value="${escapeHtml(e.description)}"></td>
      <td><input type="text" list="account-list" class="f-credit" value="${escapeHtml(e.creditAccount)}"></td>
      <td><input type="text" inputmode="numeric" class="f-amount2 num" value="${e.amount2 ? yen(e.amount2) : ''}" placeholder="0"></td>
      <td>
        <select class="f-kahi">
          <option value="" ${!e.taxFlag ? 'selected' : ''}></option>
          <option value="課" ${e.taxFlag === '課' ? 'selected' : ''}>課</option>
          <option value="非" ${e.taxFlag === '非' ? 'selected' : ''}>非</option>
        </select>
      </td>
      <td class="center"><button class="small danger f-del" title="削除">×</button></td>
    </tr>`;
  }

  function renderTable() {
    const tbody = container.querySelector('#entry-tbody');
    const originalIndex = new Map(entries.map((e, i) => [e.id, i + 1]));
    const visible = getVisibleEntries();
    tbody.innerHTML = visible.map((e) => rowHtml(e, originalIndex.get(e.id))).join('') || '';
    bindRowEvents();
    updateTotalsBar();
    updateSortIndicators();

    const info = container.querySelector('#filter-info');
    if (info) {
      info.textContent = hasActiveFilter() || sortState.field
        ? `${visible.length}件を表示中（全${entries.length}件）`
        : '';
    }
    const emptyEl = container.querySelector('#filter-empty');
    if (emptyEl) emptyEl.style.display = visible.length === 0 && entries.length > 0 ? '' : 'none';
  }

  function isLastRow(tr) {
    return tr === tr.parentElement.lastElementChild;
  }

  function bindRowEvents() {
    container.querySelectorAll('#entry-tbody tr').forEach((tr) => {
      const id = tr.dataset.id;
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;

      const dateEl = tr.querySelector('.f-date');
      dateEl.addEventListener('change', () => {
        entry.date = dateEl.value;
        persist();
      });

      const amountEl = tr.querySelector('.f-amount');
      amountEl.addEventListener('input', () => {
        entry.amount = parseYen(amountEl.value);
        persist();
        updateTotalsBar();
      });
      amountEl.addEventListener('blur', () => {
        amountEl.value = entry.amount ? yen(entry.amount) : '';
      });

      const amount2El = tr.querySelector('.f-amount2');
      amount2El.addEventListener('input', () => {
        entry.amount2 = parseYen(amount2El.value);
        persist();
        updateTotalsBar();
      });
      amount2El.addEventListener('blur', () => {
        amount2El.value = entry.amount2 ? yen(entry.amount2) : '';
      });

      const debitEl = tr.querySelector('.f-debit');
      debitEl.addEventListener('change', () => {
        entry.debitAccount = debitEl.value;
        persist();
      });

      const creditEl = tr.querySelector('.f-credit');
      creditEl.addEventListener('change', () => {
        entry.creditAccount = creditEl.value;
        persist();
      });

      const descEl = tr.querySelector('.f-desc');
      descEl.addEventListener('change', () => {
        entry.description = descEl.value;
        persist();
      });

      const kahiEl = tr.querySelector('.f-kahi');
      kahiEl.addEventListener('change', () => {
        entry.taxFlag = kahiEl.value;
        persist();
      });

      if (isLastRow(tr)) {
        kahiEl.addEventListener('keydown', (ev) => {
          if (ev.key === 'Tab' && !ev.shiftKey) {
            ev.preventDefault();
            addRow();
          }
        });
      }

      tr.querySelector('.f-del').addEventListener('click', () => {
        if (!confirm('この行を削除しますか？')) return;
        entries = entries.filter((e) => e.id !== id);
        persist();
        renderTable();
      });
    });
  }

  function addRow() {
    resetFilterAndSort();
    entries.push(store.newEmptyEntry());
    persist();
    renderTable();
    const rows = container.querySelectorAll('#entry-tbody tr');
    const last = rows[rows.length - 1];
    if (last) last.querySelector('.f-date').focus();
  }

  function handleCreateSlips() {
    if (entries.filter((e) => e.date || e.amount || e.debitAccount || e.description || e.creditAccount || e.amount2).length === 0) {
      alert('データが1つも入力されていません。\nデータ入力後に振替伝票処理を行ってください。');
      return;
    }
    const missing = findMissingDateRows(entries);
    if (missing.length > 0) {
      alert('日付が入っていない行があります。\n該当行に日付を入力してください。');
      return;
    }
    navigate('/summary');
  }

  function handleClear() {
    if (!confirm('入力中のデータをすべて削除します。よろしいですか？')) return;
    entries = [];
    persist();
    resetFilterAndSort();
    renderTable();
  }

  function openRecurringModal() {
    const recurring = store.getRecurring().filter((r) => r.active);
    if (recurring.length === 0) {
      alert('有効な定期支払データがありません。\n「定期支払マスタ」で登録してください。');
      return;
    }
    const items = recurring.map((r) => {
      const { tgtMonth, description } = resolveRecurring(r, year, month);
      return { r, tgtMonth, description };
    });

    openModal(`
      <h2>${year}年${month}月分　定期支払い一覧</h2>
      <div class="hint">挿入したい項目にチェックを入れて「挿入」を押してください。日付は空欄で入るので、あとで入力してください。</div>
      <div id="recur-list">
        ${items
          .map(
            (it, i) => `
          <div class="recur-item">
            <input type="checkbox" id="recur-${i}" checked>
            <label for="recur-${i}">[${it.r.kind === 'lease' ? 'リース' : '月額'}] ${escapeHtml(it.r.name)}　¥${yen(it.r.amount)}　→ ${escapeHtml(it.description)}</label>
          </div>`
          )
          .join('')}
      </div>
      <div class="actions">
        <button id="recur-cancel">キャンセル</button>
        <button class="primary" id="recur-insert">挿入</button>
      </div>
    `);

    document.getElementById('recur-cancel').onclick = closeModal;
    document.getElementById('recur-insert').onclick = () => {
      let count = 0;
      items.forEach((it, i) => {
        const checked = document.getElementById(`recur-${i}`).checked;
        if (!checked) return;
        entries.push({
          id: uid(),
          date: '',
          amount: it.r.amount,
          debitAccount: it.r.debitAccount,
          description: it.description,
          creditAccount: it.r.creditAccount,
          amount2: it.r.amount,
          taxFlag: it.r.taxFlag || '',
        });
        count += 1;
      });
      persist();
      closeModal();
      resetFilterAndSort();
      renderTable();
      alert(`${count}件を入力しました。\n日付（日付欄）が空欄になっています。各行の日付を入力してください。`);
    };
  }

  container.innerHTML = `
    <h1 class="page-title">伝票入力シート　${year}年${month}月</h1>
    <div class="panel">
      <div class="toolbar toolbar-sticky no-print">
        <button class="primary" id="btn-create-slips">振替伝票作成</button>
        <button id="btn-add-row">＋ 行を追加</button>
        <button id="btn-recurring">定期入力</button>
        <button id="btn-export-excel">Excelで保存</button>
        <button class="danger" id="btn-clear">データクリア</button>
      </div>
      <div class="totals-bar" id="totals-bar"></div>
      <div class="toolbar filter-toolbar no-print">
        <input type="text" id="f-date" placeholder="日付で絞り込み（例: 8/10）">
        <input type="text" id="f-amount" placeholder="金額で絞り込み">
        <input type="text" id="f-account" placeholder="科目で絞り込み">
        <input type="text" id="f-desc" placeholder="摘要で絞り込み">
        <button class="small" id="btn-clear-filter">絞り込みを解除</button>
        <span class="hint" id="filter-info" style="margin:0;"></span>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th style="width:40px;">番号</th>
              <th style="width:130px;" class="sortable" data-field="date">日付<span class="sort-arrow" data-field="date"></span></th>
              <th style="width:110px;">金額</th>
              <th style="width:120px;">借方科目</th>
              <th>摘要</th>
              <th style="width:120px;">貸方科目</th>
              <th style="width:110px;">金額2</th>
              <th style="width:60px;">課/非</th>
              <th style="width:40px;"></th>
            </tr>
          </thead>
          <tbody id="entry-tbody"></tbody>
        </table>
        <div id="filter-empty" class="empty-state" style="display:none;">条件に一致する行がありません。</div>
      </div>
      <div class="toolbar toolbar-bottom no-print">
        <button id="btn-add-row-bottom">＋ 行を追加</button>
        <button id="btn-recurring-bottom">定期入力</button>
        <span class="hint" style="margin:0;">最終行で Tab キーを押しても新しい行が追加されます。</span>
      </div>
      <datalist id="account-list">${accountOptions()}</datalist>
      <datalist id="desc-list">${descOptions()}</datalist>
    </div>
  `;

  renderTable();

  container.querySelector('#btn-create-slips').addEventListener('click', handleCreateSlips);
  container.querySelector('#btn-add-row').addEventListener('click', addRow);
  container.querySelector('#btn-add-row-bottom').addEventListener('click', addRow);
  container.querySelector('#btn-recurring').addEventListener('click', openRecurringModal);
  container.querySelector('#btn-recurring-bottom').addEventListener('click', openRecurringModal);
  container.querySelector('#btn-export-excel').addEventListener('click', () => exportMonthToExcel(key));
  container.querySelector('#btn-clear').addEventListener('click', handleClear);

  container.querySelector('#f-date').addEventListener('input', (e) => {
    filterState.date = e.target.value;
    renderTable();
  });
  container.querySelector('#f-amount').addEventListener('input', (e) => {
    filterState.amount = e.target.value;
    renderTable();
  });
  container.querySelector('#f-account').addEventListener('input', (e) => {
    filterState.account = e.target.value;
    renderTable();
  });
  container.querySelector('#f-desc').addEventListener('input', (e) => {
    filterState.desc = e.target.value;
    renderTable();
  });
  container.querySelector('#btn-clear-filter').addEventListener('click', () => {
    resetFilterAndSort();
    renderTable();
  });

  container.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.field;
      if (sortState.field === field) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.field = field;
        sortState.dir = 'asc';
      }
      renderTable();
    });
  });
}
