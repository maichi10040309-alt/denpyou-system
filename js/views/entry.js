import * as store from '../store.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../modal.js';
import { uid, yen, parseYen, parseMonthKey, escapeHtml } from '../utils.js';
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

  function rowHtml(e, idx) {
    return `
    <tr data-id="${e.id}">
      <td class="center">${idx + 1}</td>
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
    tbody.innerHTML = entries.map(rowHtml).join('') || '';
    bindRowEvents();
    updateTotalsBar();
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
    navigate('/slips');
  }

  function handleClear() {
    if (!confirm('入力中のデータをすべて削除します。よろしいですか？')) return;
    entries = [];
    persist();
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
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th style="width:40px;">番号</th>
              <th style="width:130px;">日付</th>
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
}
