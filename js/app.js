import * as store from './store.js';
import { route, startRouter, navigate, render as rerender } from './router.js';
import { renderEntryView } from './views/entry.js';
import { renderSlipsView, renderSummaryView } from './views/slips.js';
import { renderExpenseView } from './views/expense.js';
import { renderSalesView } from './views/sales.js';
import { renderAccountsView, renderDescriptionsView, renderRecurringView } from './views/masters.js';
import { renderMonthsView } from './views/months.js';
import { renderImportView } from './views/import.js';

store.init();

const NAV_ITEMS = [
  { path: '/entry', label: '伝票入力' },
  { path: '/slips', label: '振替伝票' },
  { path: '/summary', label: 'まとめ' },
  { path: '/expense', label: '経費集計' },
  { path: '/sales', label: '売上集計' },
  { path: '/masters/accounts', label: '科目マスタ' },
  { path: '/masters/descriptions', label: '摘要マスタ' },
  { path: '/masters/recurring', label: '定期支払マスタ' },
  { path: '/months', label: '月管理' },
  { path: '/import', label: 'Excel取込' },
];

function buildNav() {
  const nav = document.getElementById('app-nav');
  nav.innerHTML = NAV_ITEMS.map((n) => `<a href="#${n.path}">${n.label}</a>`).join('');
}

function buildMonthSelect() {
  const sel = document.getElementById('month-select');
  const keys = store.getMonthKeys();
  const current = store.getCurrentMonth();
  sel.innerHTML = keys
    .slice()
    .reverse()
    .map((k) => {
      const [y, m] = k.split('-');
      const label = `${y}年${Number(m)}月`;
      return `<option value="${k}" ${k === current ? 'selected' : ''}>${label}</option>`;
    })
    .join('');
  sel.onchange = () => {
    store.setCurrentMonth(sel.value);
    rerender();
  };
}

export function refreshChrome() {
  buildMonthSelect();
}

const main = document.getElementById('app-main');

function guardMonth(fn) {
  return async () => {
    if (!store.getCurrentMonth()) {
      main.innerHTML = `<div class="empty-state">対象月がまだありません。<br><br>
        <button class="primary" id="go-months">月管理へ移動して新規作成</button></div>`;
      document.getElementById('go-months').onclick = () => navigate('/months');
      return;
    }
    await fn(main);
  };
}

route('/entry', guardMonth(renderEntryView));
route('/slips', guardMonth(renderSlipsView));
route('/summary', guardMonth(renderSummaryView));
route('/expense', guardMonth(renderExpenseView));
route('/sales', guardMonth(renderSalesView));
route('/masters/accounts', () => renderAccountsView(main));
route('/masters/descriptions', () => renderDescriptionsView(main));
route('/masters/recurring', () => renderRecurringView(main));
route('/months', () => renderMonthsView(main));
route('/import', () => renderImportView(main));

buildNav();
buildMonthSelect();
startRouter();
