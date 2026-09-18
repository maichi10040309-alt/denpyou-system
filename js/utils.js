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

export const DEPT_ORDER = ['kitchen', 'care', 'clinic'];
