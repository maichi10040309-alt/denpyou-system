// localStorage を使ったデータ永続化レイヤー
import { SEED_ACCOUNTS, SEED_DESCRIPTIONS, SEED_RECURRING } from './seed-data.js';
import { uid, monthKey } from './utils.js';

const NS = 'denpyou';
const KEYS = {
  accounts: `${NS}:accounts`,
  descriptions: `${NS}:descriptions`,
  recurring: `${NS}:recurring`,
  months: `${NS}:months`,
  currentMonth: `${NS}:currentMonth`,
  initialized: `${NS}:initialized`,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('読み込みエラー', key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('保存エラー', key, e);
    alert('データの保存に失敗しました。ブラウザのストレージ容量を確認してください。');
  }
}

function emptyEntryRow() {
  return {
    id: uid(),
    date: '',
    amount: 0,
    debitAccount: '',
    description: '',
    creditAccount: '',
    amount2: 0,
    taxFlag: '',
  };
}

export function init() {
  if (!read(KEYS.initialized, false)) {
    write(KEYS.accounts, SEED_ACCOUNTS.map((a) => ({ id: uid(), ...a })));
    write(KEYS.descriptions, SEED_DESCRIPTIONS.map((text) => ({ id: uid(), text })));
    write(KEYS.recurring, SEED_RECURRING.map((r) => ({ id: uid(), ...r })));

    const now = new Date();
    const key = monthKey(now.getFullYear(), now.getMonth() + 1);
    write(KEYS.months, { [key]: { entries: [] } });
    write(KEYS.currentMonth, key);
    write(KEYS.initialized, true);
  }
}

// ---- 科目マスタ ----
export function getAccounts() {
  return read(KEYS.accounts, []);
}
export function setAccounts(list) {
  write(KEYS.accounts, list);
}

// ---- 摘要マスタ ----
export function getDescriptions() {
  return read(KEYS.descriptions, []);
}
export function setDescriptions(list) {
  write(KEYS.descriptions, list);
}

// ---- 定期支払マスタ ----
export function getRecurring() {
  return read(KEYS.recurring, []);
}
export function setRecurring(list) {
  write(KEYS.recurring, list);
}

// ---- 月データ ----
export function getMonths() {
  return read(KEYS.months, {});
}
export function setMonths(obj) {
  write(KEYS.months, obj);
}

export function getMonthKeys() {
  return Object.keys(getMonths()).sort();
}

export function monthExists(key) {
  return Object.prototype.hasOwnProperty.call(getMonths(), key);
}

export function createMonth(year, month) {
  const key = monthKey(year, month);
  const months = getMonths();
  if (!months[key]) {
    months[key] = { entries: [] };
    setMonths(months);
  }
  return key;
}

export function deleteMonth(key) {
  const months = getMonths();
  delete months[key];
  setMonths(months);
}

export function getCurrentMonth() {
  let key = read(KEYS.currentMonth, null);
  const months = getMonths();
  if (!key || !months[key]) {
    const keys = Object.keys(months).sort();
    key = keys.length ? keys[keys.length - 1] : null;
    if (key) setCurrentMonth(key);
  }
  return key;
}

export function setCurrentMonth(key) {
  write(KEYS.currentMonth, key);
}

export function getEntries(key) {
  const months = getMonths();
  return (months[key] && months[key].entries) || [];
}

export function setEntries(key, entries) {
  const months = getMonths();
  if (!months[key]) months[key] = { entries: [] };
  months[key].entries = entries;
  setMonths(months);
}

// ---- 仕入れ経費（振替伝票を作らない経費専用データ） ----
export function getPurchaseExpenses(key) {
  const months = getMonths();
  return (months[key] && months[key].purchaseExpenses) || [];
}

export function setPurchaseExpenses(key, list) {
  const months = getMonths();
  if (!months[key]) months[key] = { entries: [] };
  months[key].purchaseExpenses = list;
  setMonths(months);
}

export function addPurchaseExpenses(key, newItems) {
  const months = getMonths();
  if (!months[key]) months[key] = { entries: [] };
  const existing = months[key].purchaseExpenses || [];
  months[key].purchaseExpenses = [...existing, ...newItems];
  setMonths(months);
}

// ---- 人件費（部署ごとの手入力額） ----
export function getLaborCosts(key) {
  const months = getMonths();
  const l = (months[key] && months[key].laborCosts) || {};
  return { kitchen: Number(l.kitchen) || 0, care: Number(l.care) || 0, clinic: Number(l.clinic) || 0 };
}

export function setLaborCosts(key, laborCosts) {
  const months = getMonths();
  if (!months[key]) months[key] = { entries: [] };
  months[key].laborCosts = laborCosts;
  setMonths(months);
}

export function addEmptyRow(key) {
  const entries = getEntries(key);
  entries.push(emptyEntryRow());
  setEntries(key, entries);
  return entries;
}

export function newEmptyEntry() {
  return emptyEntryRow();
}

// ---- エクスポート / インポート ----
export function exportAll() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: getAccounts(),
    descriptions: getDescriptions(),
    recurring: getRecurring(),
    months: getMonths(),
    currentMonth: getCurrentMonth(),
  };
}

export function importAll(data) {
  if (!data || typeof data !== 'object') throw new Error('不正なデータ形式です');
  if (data.accounts) write(KEYS.accounts, data.accounts);
  if (data.descriptions) write(KEYS.descriptions, data.descriptions);
  if (data.recurring) write(KEYS.recurring, data.recurring);
  if (data.months) write(KEYS.months, data.months);
  if (data.currentMonth) write(KEYS.currentMonth, data.currentMonth);
  write(KEYS.initialized, true);
}
