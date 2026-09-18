// 別管理の「仕入れ管理」Excel（業者名／科目／請求額 形式）を解析する
import { DEPT_PREFIX_CHAR } from './utils.js';

// 科目マスタの表記と仕入れ管理表の表記が異なるものの対応表
const ACCOUNT_ALIASES = {
  賃借料: '貸借料',
  光熱水費: '水道光熱費',
};

// 給食シートなどで科目名の先頭に付く拠点名（科目そのものではないので取り除く）
const BRANCH_PREFIXES = ['紀三井寺苑', 'ほほえみ', '下津', '第二'];

const HEADER_KEYS = {
  vendor: '業者名',
  account: '科目',
  amount: '請求額',
};

function normalizeHeaderText(v) {
  return v === null || v === undefined ? '' : String(v).replace(/[\s　\n]/g, '');
}

// 科目欄の生テキストから「⑩⑳㊵」の部署コード・税率・課税表記を取り除いて素の科目名にする
export function cleanAccountLabel(raw) {
  let s = String(raw).trim();
  s = s.replace(/[⑩⑳㊵](-?\d+)?\s*$/u, '').trim();
  s = s.replace(/\d+[%％]/g, '');
  s = s.replace(/[（(]\s*非課税\s*[）)]/g, '');
  s = s.replace(/[（(]\s*課税\s*[）)]/g, '');
  s = s.replace(/[（(]\s*非\s*[）)]/g, '');
  s = s.replace(/[（(]\s*課\s*[）)]/g, '');
  return s.trim();
}

export function stripBranchPrefix(cleaned) {
  for (const p of BRANCH_PREFIXES) {
    if (cleaned.startsWith(p)) return { branch: p, rest: cleaned.slice(p.length).trim() };
  }
  return { branch: '', rest: cleaned };
}

export function detectTaxFlag(raw) {
  const s = String(raw);
  if (/非課税|[（(]非[）)]/.test(s)) return '非';
  if (/\d+[%％]|課税|[（(]課[）)]/.test(s)) return '課';
  return '';
}

// 科目マスタに対する候補を返す（見つからなければ accountName は空文字）
export function suggestAccount(rawLabel, accounts) {
  const cleaned = cleanAccountLabel(rawLabel);
  const { branch, rest } = stripBranchPrefix(cleaned);
  const candidate = rest || cleaned;
  const aliased = ACCOUNT_ALIASES[candidate] || candidate;
  const match = accounts.find((a) => a.name === aliased);
  return { branch, candidate, accountName: match ? match.name : '' };
}

// シート名から年月を推測する（例: "2026.8(販売ﾚﾝﾀﾙ) " → {year:2026, month:8}）
export function guessYearMonth(sheetName) {
  const m = sheetName.match(/(\d{4})[.。](\d{1,2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

// シート名から部署を推測する
export function guessDept(sheetName) {
  if (sheetName.includes('給食')) return 'kitchen';
  if (sheetName.includes('販売') || sheetName.includes('ﾚﾝﾀﾙ') || sheetName.includes('レンタル')) return 'care';
  if (sheetName.includes('治療')) return 'clinic';
  return null;
}

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 8); r += 1) {
    const row = rows[r] || [];
    const vendorCol = row.findIndex((c) => normalizeHeaderText(c) === HEADER_KEYS.vendor);
    if (vendorCol === -1) continue;
    const accountCol = row.findIndex((c) => normalizeHeaderText(c).includes(HEADER_KEYS.account));
    const amountCol = row.findIndex((c) => normalizeHeaderText(c).includes(HEADER_KEYS.amount));
    if (accountCol === -1 || amountCol === -1) continue;
    return { headerRow: r, vendorCol, accountCol, amountCol };
  }
  return null;
}

// 1シート分を解析する。対応できない形式なら null を返す
export function parseShiireSheet(XLSX, ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const header = findHeader(rows);
  if (!header) return null;

  const items = [];
  let currentVendor = '';
  for (let r = header.headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const vendorRaw = row[header.vendorCol];
    if (vendorRaw) currentVendor = String(vendorRaw).trim();
    const accountRaw = row[header.accountCol];
    const amountRaw = row[header.amountCol];
    if (!accountRaw) continue;
    const amount = Number(amountRaw);
    if (!amount) continue;
    items.push({ vendor: currentVendor, rawLabel: String(accountRaw).trim(), amount });
  }

  return {
    sheetName,
    items,
    yearMonth: guessYearMonth(sheetName),
    dept: guessDept(sheetName),
  };
}

export function buildPurchaseDescription(dept, branch, vendor, rawLabel) {
  const prefix = DEPT_PREFIX_CHAR[dept] || '';
  const branchPart = branch ? `${branch}　` : '';
  return `${prefix}${branchPart}${vendor}　${rawLabel}`;
}
