// 業務ロジック（振替伝票の元 VBA マクロを踏襲）
import { classifyDept, DEPT_LABELS, DEPT_ORDER } from './utils.js';

// 入力行に日付以外の値があるのに日付が空の行を検出する
export function findMissingDateRows(entries) {
  return entries.filter((e) => {
    if (e.date) return false;
    return (
      Number(e.amount) ||
      e.debitAccount ||
      e.description ||
      e.creditAccount ||
      Number(e.amount2) ||
      e.taxFlag
    );
  });
}

function hasAnyValue(e) {
  return (
    e.date ||
    Number(e.amount) ||
    e.debitAccount ||
    e.description ||
    e.creditAccount ||
    Number(e.amount2) ||
    e.taxFlag
  );
}

// 日付ごとに振替伝票（グループ）を作成する
// 戻り値: [{ no, date, rows, totalAmount, totalAmount2 }]
export function buildSlips(entries) {
  const filled = entries.filter(hasAnyValue).filter((e) => e.date);
  const sorted = [...filled].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const slips = [];
  let current = null;
  for (const row of sorted) {
    if (!current || current.date !== row.date) {
      current = { no: slips.length + 1, date: row.date, rows: [] };
      slips.push(current);
    }
    current.rows.push(row);
  }

  for (const slip of slips) {
    slip.totalAmount = slip.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    slip.totalAmount2 = slip.rows.reduce((s, r) => s + (Number(r.amount2) || 0), 0);
    const [, m] = slip.date.split('-');
    slip.slipNo = `${Number(m)}-${slip.no}`;
  }

  return slips;
}

// 経費集計: 借方科目(資産科目を除く) × 部署 で集計
export function buildExpenseSummary(entries, accounts) {
  const assetNames = new Set(accounts.filter((a) => a.isAsset).map((a) => a.name));
  const accountOrder = accounts.map((a) => a.name);

  const totals = {}; // totals[account][dept] = amount
  const details = [];

  for (const e of entries) {
    const dept = classifyDept(e.description);
    if (!dept) continue;
    const account = (e.debitAccount || '').trim();
    if (!account || assetNames.has(account)) continue;
    const amount = Number(e.amount) || 0;
    if (!amount) continue;
    if (!accountOrder.includes(account)) continue;

    totals[account] = totals[account] || { kitchen: 0, care: 0, clinic: 0 };
    totals[account][dept] += amount;

    details.push({
      date: e.date,
      account,
      amount,
      description: e.description,
      dept,
    });
  }

  const rows = accountOrder
    .filter((name) => totals[name])
    .map((name) => {
      const t = totals[name];
      return {
        account: name,
        kitchen: t.kitchen,
        care: t.care,
        clinic: t.clinic,
        total: t.kitchen + t.care + t.clinic,
      };
    });

  const totalByDept = { kitchen: 0, care: 0, clinic: 0 };
  for (const r of rows) {
    totalByDept.kitchen += r.kitchen;
    totalByDept.care += r.care;
    totalByDept.clinic += r.clinic;
  }
  const grandTotal = totalByDept.kitchen + totalByDept.care + totalByDept.clinic;

  details.sort((a, b) => {
    const ka = DEPT_ORDER.indexOf(a.dept) + a.account + a.date;
    const kb = DEPT_ORDER.indexOf(b.dept) + b.account + b.date;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return { rows, totalByDept, grandTotal, details };
}

// 経費集計に、部署ごとに手入力した人件費を合算する
// （人件費は伝票入力とは別に、部署ごとの金額を直接入力する運用のため）
export function combineExpenseWithLabor(summary, laborCosts) {
  const l = {
    kitchen: Number(laborCosts && laborCosts.kitchen) || 0,
    care: Number(laborCosts && laborCosts.care) || 0,
    clinic: Number(laborCosts && laborCosts.clinic) || 0,
  };
  const laborTotal = l.kitchen + l.care + l.clinic;

  const rows = [...summary.rows];
  if (laborTotal > 0) {
    rows.push({ account: '人件費', kitchen: l.kitchen, care: l.care, clinic: l.clinic, total: laborTotal, isLabor: true });
  }

  const totalByDept = {
    kitchen: summary.totalByDept.kitchen + l.kitchen,
    care: summary.totalByDept.care + l.care,
    clinic: summary.totalByDept.clinic + l.clinic,
  };
  const grandTotal = summary.grandTotal + laborTotal;

  return { ...summary, rows, totalByDept, grandTotal, laborCosts: l };
}

// 売上集計: 貸方科目が 売上/家賃収入/雑収入 のもの × 部署 で集計
// ※「雑収入」は科目マスタの表記ゆれ（雜収入）とは別物として扱う（元Excelマクロの挙動に合わせる）
const SALES_ACCOUNTS = ['売上', '家賃収入', '雑収入'];

export function buildSalesSummary(entries) {
  const totals = {};
  const details = [];

  for (const e of entries) {
    const dept = classifyDept(e.description);
    if (!dept) continue;
    const account = (e.creditAccount || '').trim();
    if (!SALES_ACCOUNTS.includes(account)) continue;
    const amount = Number(e.amount2) || 0;
    if (!amount) continue;

    totals[account] = totals[account] || { kitchen: 0, care: 0, clinic: 0 };
    totals[account][dept] += amount;

    details.push({ date: e.date, account, amount, description: e.description, dept });
  }

  const accountOrder = [...new Set(details.map((d) => d.account))];
  const rows = accountOrder.map((name) => {
    const t = totals[name];
    return {
      account: name,
      kitchen: t.kitchen,
      care: t.care,
      clinic: t.clinic,
      total: t.kitchen + t.care + t.clinic,
    };
  });

  const totalByDept = { kitchen: 0, care: 0, clinic: 0 };
  for (const r of rows) {
    totalByDept.kitchen += r.kitchen;
    totalByDept.care += r.care;
    totalByDept.clinic += r.clinic;
  }
  const grandTotal = totalByDept.kitchen + totalByDept.care + totalByDept.clinic;

  details.sort((a, b) => {
    const ka = DEPT_ORDER.indexOf(a.dept) + a.account + a.date;
    const kb = DEPT_ORDER.indexOf(b.dept) + b.account + b.date;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return { rows, totalByDept, grandTotal, details };
}

// 定期支払マスタから当月分の摘要・対象年月・回数表示を計算する
export function resolveRecurring(item, year, month) {
  let tgtYear = year;
  let tgtMonth = month;
  if (item.timing === 'prepay') {
    tgtMonth += 1;
    if (tgtMonth > 12) {
      tgtMonth = 1;
      tgtYear += 1;
    }
  } else if (item.timing === 'postpay') {
    tgtMonth -= 1;
    if (tgtMonth < 1) {
      tgtMonth = 12;
      tgtYear -= 1;
    }
  }

  let description;
  let curNo = null;
  if (item.kind === 'monthly') {
    description = `${item.descBase} ${tgtMonth}月分`;
  } else {
    if (item.startYM) {
      const [sy, sm] = item.startYM.split('-').map(Number);
      curNo = (item.startNo || 1) + (year - sy) * 12 + (month - sm);
    } else {
      curNo = item.startNo || 1;
    }
    const noStr = item.totalNo ? `${curNo}/${item.totalNo}回目` : `第${curNo}回`;
    description = `${item.descBase} ${tgtMonth}月分（${noStr}）`;
  }

  return { tgtYear, tgtMonth, description, curNo };
}

export { DEPT_LABELS, DEPT_ORDER };
