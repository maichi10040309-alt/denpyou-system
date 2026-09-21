// 汎用ユーティリティ関数

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function yen(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('ja-JP');
}

export function parseYen(str) {
  if (str === null || str === undefined) return 0;
  const cleaned = String(str).replace(/[,\s円]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function formatDateJP(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}月${d}日`;
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function toISODate(y, m, d) {
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 「2026-08-10」「2026/8/10」「8/10」「8月10日」「10」のような自由な入力を
// ISO形式（YYYY-MM-DD）に変換する。年・日が省略された場合は対象月を補う。
// 解析できない場合は null、空欄の場合は '' を返す。
export function parseFlexibleDate(input, defaultYear, defaultMonth) {
  if (input === null || input === undefined) return '';
  const s = String(input).trim().normalize('NFKC');
  if (!s) return '';

  let m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (m) return toISODate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})[-/月](\d{1,2})日?$/);
  if (m) return toISODate(defaultYear, Number(m[1]), Number(m[2]));

  m = s.match(/^(\d{1,2})日?$/);
  if (m) return toISODate(defaultYear, defaultMonth, Number(m[1]));

  return null;
}

// 全角/半角（カナ・数字など）の表記ゆれを吸収して比較できるようにする
export function normalizeSearch(str) {
  return (str || '').normalize('NFKC');
}

// 摘要の先頭文字から部署を判定する
// ⑩ = 厨房 / ⑳ = 介護 / ㊵ = 治療院・エステ
export function classifyDept(description) {
  if (!description) return null;
  const c = description.trim()[0];
  if (c === '⑩') return 'kitchen'; // ⑩
  if (c === '⑳') return 'care'; // ⑳
  if (c === '㊵') return 'clinic'; // ㊵
  return null;
}

export const DEPT_LABELS = {
  kitchen: '厨房（⑩）',
  care: '介護（⑳）',
  clinic: '治療院・エステ（㊵）',
};

export const DEPT_PREFIX_CHAR = {
  kitchen: '⑩',
  care: '⑳',
  clinic: '㊵',
};

export const DEPT_ORDER = ['kitchen', 'care', 'clinic'];
