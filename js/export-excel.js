// 月データをExcelブック（.xlsx）として書き出す
import { parseMonthKey, formatDateJP } from './utils.js';
import { buildSlips, buildExpenseSummary, buildSalesSummary, DEPT_LABELS } from './logic.js';
import * as store from './store.js';

function buildInputSheet(XLSX, year, month, entries) {
  const rows = [
    ['振替え伝票入力シート'],
    ['年', year],
    ['月', month],
    [],
    ['番号', '日付', '金額', '借方科目', '摘要', '貸方科目', '金額2', '課/非'],
  ];
  entries.forEach((e, i) => {
    rows.push([
      i + 1,
      e.date || '',
      e.amount || '',
      e.debitAccount || '',
      e.description || '',
      e.creditAccount || '',
      e.amount2 || '',
      e.taxFlag || '',
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 6 }];
  return ws;
}

function buildSlipSheet(XLSX, slip) {
  const rows = [
    ['振替伝票', '', '', '', `No.${slip.slipNo}`],
    ['日付', formatDateJP(slip.date)],
    [],
    ['金額', '借方科目', '摘要', '貸方科目', '金額', '課/非'],
  ];
  slip.rows.forEach((r) => {
    rows.push([r.amount || '', r.debitAccount || '', r.description || '', r.creditAccount || '', r.amount2 || '', r.taxFlag || '']);
  });
  rows.push([slip.totalAmount, '合計', '', '', slip.totalAmount2, '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 6 }];
  return ws;
}

function buildSummarySheet(XLSX, title, summary) {
  const rows = [
    [title],
    [],
    ['科目', DEPT_LABELS.kitchen, DEPT_LABELS.care, DEPT_LABELS.clinic, '合計'],
  ];
  summary.rows.forEach((r) => {
    rows.push([r.account, r.kitchen || '', r.care || '', r.clinic || '', r.total]);
  });
  rows.push([
    '合計',
    summary.totalByDept.kitchen,
    summary.totalByDept.care,
    summary.totalByDept.clinic,
    summary.grandTotal,
  ]);
  rows.push([]);
  rows.push(['日付', '科目', '金額', '摘要', '部署']);
  summary.details.forEach((d) => {
    rows.push([d.date, d.account, d.amount, d.description, DEPT_LABELS[d.dept]]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 18 }];
  return ws;
}

// シート名に使えない文字（\ / ? * [ ] :）を置換し、31文字以内に収める
function safeSheetName(name) {
  return name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
}

export function exportMonthToExcel(key) {
  const XLSX = window.XLSX;
  if (!XLSX) {
    alert('Excel書き出しライブラリの読み込みに失敗しました。ページを再読み込みしてお試しください。');
    return;
  }

  const { year, month } = parseMonthKey(key);
  const entries = store.getEntries(key);
  const accounts = store.getAccounts();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildInputSheet(XLSX, year, month, entries), '入力シート');

  const slips = buildSlips(entries);
  const usedNames = new Set(['入力シート']);
  slips.forEach((slip) => {
    let name = safeSheetName(slip.date.slice(5).replace('-', '.'));
    let n = 2;
    while (usedNames.has(name)) {
      name = safeSheetName(`${slip.date.slice(5).replace('-', '.')}_${n}`);
      n += 1;
    }
    usedNames.add(name);
    XLSX.utils.book_append_sheet(wb, buildSlipSheet(XLSX, slip), name);
  });

  const purchaseExpenses = store.getPurchaseExpenses(key).map((p) => ({
    date: p.date,
    amount: p.amount,
    debitAccount: p.account,
    description: p.description,
  }));
  const expenseSummary = buildExpenseSummary([...entries, ...purchaseExpenses], accounts);
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(XLSX, `${year}年${month}月　経費集計表`, expenseSummary), '経費集計');

  const salesSummary = buildSalesSummary(entries);
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(XLSX, `${year}年${month}月　売上集計表`, salesSummary), '売上集計');

  const filename = `振替伝票_${year}年${String(month).padStart(2, '0')}月.xlsx`;
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
