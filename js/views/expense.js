import * as store from '../store.js';
import { yen, parseYen, formatDateShort, parseMonthKey, escapeHtml, DEPT_LABELS } from '../utils.js';
import { buildExpenseSummary } from '../logic.js';

export async function renderExpenseView(container) {
  const key = store.getCurrentMonth();
  const { year, month } = parseMonthKey(key);
  const entries = store.getEntries(key);
  const purchaseExpenses = store.getPurchaseExpenses(key).map((p) => ({
    date: p.date,
    amount: p.amount,
    debitAccount: p.account,
    description: p.description,
  }));
  const accounts = store.getAccounts();
  const summary = buildExpenseSummary([...entries, ...purchaseExpenses], accounts);
  const laborCosts = store.getLaborCosts(key);

  function laborTotal() {
    return laborCosts.kitchen + laborCosts.care + laborCosts.clinic;
  }

  function combinedTotals() {
    return {
      kitchen: summary.totalByDept.kitchen + laborCosts.kitchen,
      care: summary.totalByDept.care + laborCosts.care,
      clinic: summary.totalByDept.clinic + laborCosts.clinic,
      grand: summary.grandTotal + laborTotal(),
    };
  }

  function updateTotalsDisplay() {
    const t = combinedTotals();
    container.querySelector('#card-total .value').textContent = `¥${yen(t.grand)}`;
    container.querySelector('#card-kitchen .value').textContent = `¥${yen(t.kitchen)}`;
    container.querySelector('#card-care .value').textContent = `¥${yen(t.care)}`;
    container.querySelector('#card-clinic .value').textContent = `¥${yen(t.clinic)}`;
    container.querySelector('#labor-total').textContent = yen(laborTotal());
    container.querySelector('#foot-kitchen').textContent = `¥${yen(t.kitchen)}`;
    container.querySelector('#foot-care').textContent = `¥${yen(t.care)}`;
    container.querySelector('#foot-clinic').textContent = `¥${yen(t.clinic)}`;
    container.querySelector('#foot-grand').textContent = `¥${yen(t.grand)}`;
  }

  container.innerHTML = `
    <h1 class="page-title">${year}年${month}月　経費集計表</h1>
    <div class="toolbar no-print">
      <button class="primary" id="btn-print">印刷する</button>
    </div>
    <div class="panel">
      <div class="summary-cards">
        <div class="card total" id="card-total"><div class="label">総合計</div><div class="value">¥${yen(summary.grandTotal + laborTotal())}</div></div>
        <div class="card kitchen" id="card-kitchen"><div class="label">${DEPT_LABELS.kitchen}</div><div class="value">¥${yen(summary.totalByDept.kitchen + laborCosts.kitchen)}</div></div>
        <div class="card care" id="card-care"><div class="label">${DEPT_LABELS.care}</div><div class="value">¥${yen(summary.totalByDept.care + laborCosts.care)}</div></div>
        <div class="card clinic" id="card-clinic"><div class="label">${DEPT_LABELS.clinic}</div><div class="value">¥${yen(summary.totalByDept.clinic + laborCosts.clinic)}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>科目</th>
            <th class="num">${DEPT_LABELS.kitchen}</th>
            <th class="num">${DEPT_LABELS.care}</th>
            <th class="num">${DEPT_LABELS.clinic}</th>
            <th class="num">合計</th>
          </tr>
        </thead>
        <tbody>
          ${summary.rows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.account)}</td>
              <td class="num">${r.kitchen ? yen(r.kitchen) : ''}</td>
              <td class="num">${r.care ? yen(r.care) : ''}</td>
              <td class="num">${r.clinic ? yen(r.clinic) : ''}</td>
              <td class="num"><b>${yen(r.total)}</b></td>
            </tr>`
            )
            .join('')}
          ${summary.rows.length === 0 ? '<tr><td colspan="5" class="empty-state">対象データがありません。</td></tr>' : ''}
          <tr class="labor-row">
            <td>人件費<span class="hint" style="margin:0 0 0 6px;">（部署ごとに入力）</span></td>
            <td class="num"><input type="text" inputmode="numeric" class="labor-input num" data-dept="kitchen" value="${laborCosts.kitchen ? yen(laborCosts.kitchen) : ''}" placeholder="0"></td>
            <td class="num"><input type="text" inputmode="numeric" class="labor-input num" data-dept="care" value="${laborCosts.care ? yen(laborCosts.care) : ''}" placeholder="0"></td>
            <td class="num"><input type="text" inputmode="numeric" class="labor-input num" data-dept="clinic" value="${laborCosts.clinic ? yen(laborCosts.clinic) : ''}" placeholder="0"></td>
            <td class="num"><b id="labor-total">${yen(laborTotal())}</b></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td><b>合　計</b></td>
            <td class="num"><b id="foot-kitchen">¥${yen(summary.totalByDept.kitchen + laborCosts.kitchen)}</b></td>
            <td class="num"><b id="foot-care">¥${yen(summary.totalByDept.care + laborCosts.care)}</b></td>
            <td class="num"><b id="foot-clinic">¥${yen(summary.totalByDept.clinic + laborCosts.clinic)}</b></td>
            <td class="num"><b id="foot-grand">¥${yen(summary.grandTotal + laborTotal())}</b></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="panel">
      <h2 style="margin-top:0;">明細一覧（摘要を確認して内容を仕分けしてください）</h2>
      <table>
        <thead>
          <tr>
            <th style="width:90px;">日付</th>
            <th style="width:130px;">科目</th>
            <th class="num" style="width:120px;">金額</th>
            <th>摘要</th>
            <th style="width:170px;">部署</th>
          </tr>
        </thead>
        <tbody>
          ${summary.details
            .map(
              (d) => `
            <tr class="dept-${d.dept}">
              <td class="center">${formatDateShort(d.date)}</td>
              <td>${escapeHtml(d.account)}</td>
              <td class="num">${yen(d.amount)}</td>
              <td>${escapeHtml(d.description)}</td>
              <td class="center"><span class="badge ${d.dept}">${DEPT_LABELS[d.dept]}</span></td>
            </tr>`
            )
            .join('')}
          ${summary.details.length === 0 ? '<tr><td colspan="5" class="empty-state">対象データがありません。</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#btn-print').addEventListener('click', () => window.print());

  container.querySelectorAll('.labor-input').forEach((el) => {
    const dept = el.dataset.dept;
    el.addEventListener('input', () => {
      laborCosts[dept] = parseYen(el.value);
      store.setLaborCosts(key, laborCosts);
      updateTotalsDisplay();
    });
    el.addEventListener('blur', () => {
      el.value = laborCosts[dept] ? yen(laborCosts[dept]) : '';
    });
  });
}
