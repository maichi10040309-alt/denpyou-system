// 汎用モーダルヘルパー
const root = () => document.getElementById('modal-root');

export function openModal(innerHtml) {
  root().innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${innerHtml}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

export function closeModal() {
  root().innerHTML = '';
}
