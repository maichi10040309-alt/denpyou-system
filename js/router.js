// 簡易ハッシュルーター
const routes = [];

export function route(pattern, handler) {
  routes.push({ pattern, handler });
}

function match(hash) {
  for (const r of routes) {
    if (r.pattern === hash) return { handler: r.handler, params: {} };
  }
  return null;
}

export function currentPath() {
  return location.hash.slice(1) || '/entry';
}

export function navigate(path) {
  if (location.hash.slice(1) === path) {
    render();
  } else {
    location.hash = path;
  }
}

let rendering = false;
export async function render() {
  if (rendering) return;
  rendering = true;
  try {
    const path = currentPath();
    const found = match(path);
    if (found) {
      await found.handler();
    } else {
      document.getElementById('app-main').innerHTML = '<div class="empty-state">ページが見つかりません。</div>';
    }
    document.querySelectorAll('.app-nav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === `#${path}`);
    });
  } finally {
    rendering = false;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/entry';
  render();
}
