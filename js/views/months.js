import * as store from '../store.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../modal.js';
import { monthKey, parseMonthKey } from '../utils.js';
import { exportMonthToExcel } from '../export-excel.js';

function refreshChromeIfPossible() {
  import('../app.js').then((m) => m.refreshChrome && m.refreshChrome());
}

function openNewMonthModal(renderList) {
  const now = new Date();
  openModal(`
    <h2>新規月作成</h2>
    <div class="form-row">
      <label>年</label>
      <input type="number" id="nm-year" value="${now.getFullYear()}">
    </div>
    <div class="form-row">
      <label>月</label>
      <input type="number" id="nm-month" min="1" max="12" value="${now.getMonth() + 1}">
    </div>
    <div class="actions">
      <button id="nm-cancel">キャンセル</button>
      <button class="primary" id="nm-ok">作成</button>
    </div>
  `);
  document.getElementById('nm-cancel').onclick = closeModal;
  document.getElementById('nm-ok').onclick = () => {
    const year = Number(document.getElementById('nm-year').value);
    const month = Number(document.getElementById('nm-month').value);
    if (!year || !month || month < 1 || month > 12) {
      alert('正しい年月を入力してください。');
      return;
    }
    const key = monthKey(year, month);
    if (store.monthExists(key)) {
      if (!confirm(`${year}年${month}月は既に存在します。この月を開きますか？`)) return;
    } else {
      store.createMonth(year, month);
    }
    store.setCurrentMonth(key);
    closeModal();
    refreshChromeIfPossible();
    navigate('/entry');
  };
}

export async function renderMonthsView(container) {
  const keys = store.getMonthKeys().slice().reverse();
  const current = store.getCurrentMonth();

  container.innerHTML = `
    <h1 class="page-title">月管理</h1>
    <div class="panel">
      <div class="toolbar">
        <button class="primary" id="btn-new">＋ 新規月作成</button>
      </div>
      <ul class="month-manager-list" id="month-list">
        ${keys
          .map((k) => {
            const { year, month } = parseMonthKey(k);
            const entryCount = store.getEntries(k).length;
            return `
            <li class="${k === current ? 'current' : ''}" data-key="${k}">
              <span>${year}年${month}月　（${entryCount}件）${k === current ? '　★対象中' : ''}</span>
              <span>
                <button class="small m-select">この月を開く</button>
                <button class="small m-excel">Excelで保存</button>
                <button class="small danger m-del">削除</button>
              </span>
            </li>`;
          })
          .join('')}
        ${keys.length === 0 ? '<li>まだ月データがありません。</li>' : ''}
      </ul>
    </div>

    <div class="panel">
      <h2 style="margin-top:0;">データのバックアップ</h2>
      <div class="hint">このシステムはブラウザ内にのみデータを保存しています。ブラウザのデータを消去すると失われるため、定期的にバックアップ（エクスポート）することをおすすめします。</div>
      <div class="toolbar" style="margin-bottom:0;">
        <button id="btn-export">全データをエクスポート</button>
        <button id="btn-import">バックアップから復元</button>
        <input type="file" id="import-file" accept="application/json" style="display:none;">
      </div>
    </div>
  `;

  container.querySelector('#btn-new').addEventListener('click', () => openNewMonthModal());

  container.querySelectorAll('.m-select').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const key = e.target.closest('li').dataset.key;
      store.setCurrentMonth(key);
      refreshChromeIfPossible();
      navigate('/entry');
    });
  });

  container.querySelectorAll('.m-excel').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const key = e.target.closest('li').dataset.key;
      exportMonthToExcel(key);
    });
  });

  container.querySelectorAll('.m-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const key = e.target.closest('li').dataset.key;
      if (!confirm(`${key} のデータを完全に削除します。よろしいですか？`)) return;
      store.deleteMonth(key);
      refreshChromeIfPossible();
      renderMonthsView(container);
    });
  });

  container.querySelector('#btn-export').addEventListener('click', () => {
    const data = store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `denpyou-backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const fileInput = container.querySelector('#import-file');
  container.querySelector('#btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm('現在のデータはバックアップの内容で上書きされます。よろしいですか？')) {
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        store.importAll(data);
        refreshChromeIfPossible();
        alert('復元が完了しました。');
        renderMonthsView(container);
      } catch (e) {
        alert('復元に失敗しました。ファイルの形式を確認してください。');
        console.error(e);
      }
    };
    reader.readAsText(file);
  });
}
