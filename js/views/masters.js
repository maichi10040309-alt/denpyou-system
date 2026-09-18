import * as store from '../store.js';
import { uid, yen, parseYen, escapeHtml } from '../utils.js';

// ============================================================
// 科目マスタ
// ============================================================
export async function renderAccountsView(container) {
  let accounts = store.getAccounts();

  function persist() {
    store.setAccounts(accounts);
  }

  function row(a) {
    return `
      <tr data-id="${a.id}">
        <td><input type="text" class="f-name" value="${escapeHtml(a.name)}"></td>
        <td class="center"><input type="checkbox" class="f-asset" ${a.isAsset ? 'checked' : ''}></td>
        <td class="center"><button class="small danger f-del">削除</button></td>
      </tr>`;
  }

  function renderTable() {
    container.querySelector('#tbody').innerHTML = accounts.map(row).join('');
    bind();
  }

  function bind() {
    container.querySelectorAll('#tbody tr').forEach((tr) => {
      const id = tr.dataset.id;
      const a = accounts.find((x) => x.id === id);
      tr.querySelector('.f-name').addEventListener('change', (e) => {
        a.name = e.target.value.trim();
        persist();
      });
      tr.querySelector('.f-asset').addEventListener('change', (e) => {
        a.isAsset = e.target.checked;
        persist();
      });
      tr.querySelector('.f-del').addEventListener('click', () => {
        if (!confirm(`「${a.name}」を削除しますか？`)) return;
        accounts = accounts.filter((x) => x.id !== id);
        persist();
        renderTable();
      });
    });
  }

  container.innerHTML = `
    <h1 class="page-title">科目マスタ</h1>
    <div class="hint">資産科目（現金・普通預金など）にチェックを入れると、経費集計から自動的に除外されます。</div>
    <div class="panel master-editor">
      <div class="toolbar">
        <button class="primary" id="btn-add">＋ 科目を追加</button>
      </div>
      <table>
        <thead>
          <tr><th>科目名</th><th style="width:120px;">資産科目（除外）</th><th class="actions-col">操作</th></tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  `;

  renderTable();

  container.querySelector('#btn-add').addEventListener('click', () => {
    accounts.push({ id: uid(), name: '新しい科目', isAsset: false });
    persist();
    renderTable();
  });
}

// ============================================================
// 摘要マスタ
// ============================================================
export async function renderDescriptionsView(container) {
  let descriptions = store.getDescriptions();
  let filter = '';

  function persist() {
    store.setDescriptions(descriptions);
  }

  function row(d) {
    return `
      <tr data-id="${d.id}">
        <td><input type="text" class="f-text" value="${escapeHtml(d.text)}"></td>
        <td class="center"><button class="small danger f-del">削除</button></td>
      </tr>`;
  }

  function renderTable() {
    const filtered = filter
      ? descriptions.filter((d) => d.text.includes(filter))
      : descriptions;
    container.querySelector('#tbody').innerHTML = filtered.map(row).join('');
    container.querySelector('#count').textContent = `${filtered.length} / ${descriptions.length} 件`;
    bind();
  }

  function bind() {
    container.querySelectorAll('#tbody tr').forEach((tr) => {
      const id = tr.dataset.id;
      const d = descriptions.find((x) => x.id === id);
      tr.querySelector('.f-text').addEventListener('change', (e) => {
        d.text = e.target.value;
        persist();
      });
      tr.querySelector('.f-del').addEventListener('click', () => {
        if (!confirm('削除しますか？')) return;
        descriptions = descriptions.filter((x) => x.id !== id);
        persist();
        renderTable();
      });
    });
  }

  container.innerHTML = `
    <h1 class="page-title">摘要マスタ</h1>
    <div class="hint">先頭に ⑩（厨房）／ ⑳（介護）／ ㊵（治療院・エステ）を付けると、集計時に自動で部署が判定されます。伝票入力シートの摘要欄で入力候補として表示されます。</div>
    <div class="panel master-editor">
      <div class="toolbar">
        <button class="primary" id="btn-add">＋ 摘要を追加</button>
        <input type="text" id="search" placeholder="検索..." style="padding:8px;border:1px solid var(--color-border);border-radius:6px;flex:1;max-width:260px;">
        <span id="count" class="hint" style="margin:0;"></span>
      </div>
      <table>
        <thead><tr><th>摘要</th><th class="actions-col">操作</th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  `;

  renderTable();

  container.querySelector('#btn-add').addEventListener('click', () => {
    descriptions.unshift({ id: uid(), text: '' });
    persist();
    renderTable();
    container.querySelector('#tbody input').focus();
  });

  container.querySelector('#search').addEventListener('input', (e) => {
    filter = e.target.value;
    renderTable();
  });
}

// ============================================================
// 定期支払マスタ
// ============================================================
const KIND_LABELS = { lease: 'リース', monthly: '月額' };
const TIMING_LABELS = { current: '当月', prepay: '先払い', postpay: '後払い' };

export async function renderRecurringView(container) {
  let recurring = store.getRecurring();
  const accounts = store.getAccounts();

  function persist() {
    store.setRecurring(recurring);
  }

  function accountOptions(selected) {
    return accounts
      .map((a) => `<option value="${escapeHtml(a.name)}" ${a.name === selected ? 'selected' : ''}>${escapeHtml(a.name)}</option>`)
      .join('');
  }

  function row(r) {
    return `
      <tr data-id="${r.id}">
        <td>
          <select class="f-kind">
            <option value="lease" ${r.kind === 'lease' ? 'selected' : ''}>リース</option>
            <option value="monthly" ${r.kind === 'monthly' ? 'selected' : ''}>月額</option>
          </select>
        </td>
        <td><input type="text" class="f-name" value="${escapeHtml(r.name)}"></td>
        <td><select class="f-debit">${accountOptions(r.debitAccount)}</select></td>
        <td><input type="text" inputmode="numeric" class="f-amount num" value="${yen(r.amount)}"></td>
        <td><select class="f-credit">${accountOptions(r.creditAccount)}</select></td>
        <td><input type="text" class="f-descbase" value="${escapeHtml(r.descBase)}"></td>
        <td><input type="month" class="f-startym" value="${r.startYM || ''}" ${r.kind === 'monthly' ? 'disabled' : ''}></td>
        <td><input type="number" class="f-startno num" value="${r.startNo ?? ''}" ${r.kind === 'monthly' ? 'disabled' : ''}></td>
        <td><input type="number" class="f-totalno num" value="${r.totalNo ?? ''}" ${r.kind === 'monthly' ? 'disabled' : ''}></td>
        <td>
          <select class="f-timing">
            <option value="current" ${r.timing === 'current' ? 'selected' : ''}>当月</option>
            <option value="prepay" ${r.timing === 'prepay' ? 'selected' : ''}>先払い</option>
            <option value="postpay" ${r.timing === 'postpay' ? 'selected' : ''}>後払い</option>
          </select>
        </td>
        <td>
          <select class="f-kahi">
            <option value="" ${!r.taxFlag ? 'selected' : ''}></option>
            <option value="課" ${r.taxFlag === '課' ? 'selected' : ''}>課</option>
            <option value="非" ${r.taxFlag === '非' ? 'selected' : ''}>非</option>
          </select>
        </td>
        <td class="center"><input type="checkbox" class="f-active" ${r.active ? 'checked' : ''}></td>
        <td class="center"><button class="small danger f-del">削除</button></td>
      </tr>`;
  }

  function renderTable() {
    container.querySelector('#tbody').innerHTML = recurring.map(row).join('');
    bind();
  }

  function bind() {
    container.querySelectorAll('#tbody tr').forEach((tr) => {
      const id = tr.dataset.id;
      const r = recurring.find((x) => x.id === id);

      tr.querySelector('.f-kind').addEventListener('change', (e) => {
        r.kind = e.target.value;
        persist();
        renderTable();
      });
      tr.querySelector('.f-name').addEventListener('change', (e) => {
        r.name = e.target.value;
        persist();
      });
      tr.querySelector('.f-debit').addEventListener('change', (e) => {
        r.debitAccount = e.target.value;
        persist();
      });
      tr.querySelector('.f-amount').addEventListener('change', (e) => {
        r.amount = parseYen(e.target.value);
        e.target.value = yen(r.amount);
        persist();
      });
      tr.querySelector('.f-credit').addEventListener('change', (e) => {
        r.creditAccount = e.target.value;
        persist();
      });
      tr.querySelector('.f-descbase').addEventListener('change', (e) => {
        r.descBase = e.target.value;
        persist();
      });
      tr.querySelector('.f-startym').addEventListener('change', (e) => {
        r.startYM = e.target.value || null;
        persist();
      });
      tr.querySelector('.f-startno').addEventListener('change', (e) => {
        r.startNo = e.target.value ? Number(e.target.value) : null;
        persist();
      });
      tr.querySelector('.f-totalno').addEventListener('change', (e) => {
        r.totalNo = e.target.value ? Number(e.target.value) : null;
        persist();
      });
      tr.querySelector('.f-timing').addEventListener('change', (e) => {
        r.timing = e.target.value;
        persist();
      });
      tr.querySelector('.f-kahi').addEventListener('change', (e) => {
        r.taxFlag = e.target.value;
        persist();
      });
      tr.querySelector('.f-active').addEventListener('change', (e) => {
        r.active = e.target.checked;
        persist();
      });
      tr.querySelector('.f-del').addEventListener('click', () => {
        if (!confirm(`「${r.name}」を削除しますか？`)) return;
        recurring = recurring.filter((x) => x.id !== id);
        persist();
        renderTable();
      });
    });
  }

  container.innerHTML = `
    <h1 class="page-title">定期支払マスタ</h1>
    <div class="hint">
      種別「リース」は開始年月・開始回数・総支払回数から回数を自動計算します。「月額」はその2項目は不要です。<br>
      支払タイミング：当月／先払い（翌月分を今月計上）／後払い（前月分を今月計上）。伝票入力シートの「定期入力」ボタンから当月分を一括挿入できます。
    </div>
    <div class="panel master-editor">
      <div class="toolbar">
        <button class="primary" id="btn-add">＋ 定期支払を追加</button>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th style="width:80px;">種別</th>
              <th style="width:150px;">取引名</th>
              <th style="width:110px;">借方科目</th>
              <th style="width:100px;">金額</th>
              <th style="width:110px;">貸方科目</th>
              <th style="width:180px;">摘要ベース</th>
              <th style="width:130px;">開始年月</th>
              <th style="width:70px;">開始回</th>
              <th style="width:70px;">総回数</th>
              <th style="width:90px;">タイミング</th>
              <th style="width:60px;">課/非</th>
              <th style="width:50px;">有効</th>
              <th class="actions-col">操作</th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  renderTable();

  container.querySelector('#btn-add').addEventListener('click', () => {
    recurring.push({
      id: uid(),
      kind: 'monthly',
      name: '新しい定期支払',
      debitAccount: accounts[0] ? accounts[0].name : '',
      amount: 0,
      creditAccount: accounts[0] ? accounts[0].name : '',
      descBase: '',
      startYM: null,
      startNo: null,
      totalNo: null,
      payDay: null,
      timing: 'current',
      taxFlag: '',
      active: true,
    });
    persist();
    renderTable();
  });
}
