import * as store from '../store.js';
import { yen, formatDateJP, parseMonthKey, escapeHtml } from '../utils.js';
import { buildSlips } from '../logic.js';

function slipHtml(slip) {
  return `
    <div class="slip">
      <div class="slip__head">
        <h2>振 替 伝 票</h2>
        <div class="slip__meta">
          日付：${formatDateJP(slip.date)}　／　No．${slip.slipNo}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="amount-col">金額</th>
            <th class="account-col">借方科目</th>
            <th>摘要</th>
            <th class="account-col">貸方科目</th>
            <th class="amount-col">金額</th>
            <th class="kahi-col">課/非</th>
          </tr>
        </thead>
        <tbody>
          ${slip.rows
            .map(
              (r) => `
            <tr>
              <td class="num">${r.amount ? yen(r.amount) : ''}</td>
              <td>${escapeHtml(r.debitAccount)}</td>
              <td>${escapeHtml(r.description)}</td>
              <td>${escapeHtml(r.creditAccount)}</td>
              <td class="num">${r.amount2 ? yen(r.amount2) : ''}</td>
              <td class="center">${escapeHtml(r.taxFlag)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr>
            <td class="num">¥${yen(slip.totalAmount)}</td>
            <td>合計</td>
            <td></td>
            <td></td>
            <td class="num">¥${yen(slip.totalAmount2)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

export async function renderSummaryView(container) {
  const key = store.getCurrentMonth();
  const { year, month } = parseMonthKey(key);
  const entries = store.getEntries(key);
  const slips = buildSlips(entries);

  container.innerHTML = `
    <h1 class="page-title no-print">振替伝票まとめ　${year}年${month}月（全${slips.length}件）</h1>
    <div class="toolbar no-print">
      <button class="primary" id="btn-print">印刷する</button>
      <span class="hint" style="margin:0;">日付ごとに1枚の伝票としてまとめています。伝票入力シートの内容を編集すると自動的に反映されます。</span>
    </div>
    ${slips.length === 0 ? '<div class="empty-state">対象データがありません。伝票入力シートでデータを入力してください。</div>' : slips.map(slipHtml).join('')}
  `;

  const btn = container.querySelector('#btn-print');
  if (btn) btn.addEventListener('click', () => window.print());
}
