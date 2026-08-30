const root = document.querySelector('.workspace');
let articleId = root?.dataset.articleId || '';
const $ = (id) => document.getElementById(id);

function payload() {
  return {
    title: $('title').value,
    author: $('author').value,
    digest: $('digest').value,
    markdown_content: $('markdown').value,
    cover_path: $('cover-path').value || null,
  };
}

async function save() {
  const method = articleId ? 'PUT' : 'POST';
  const url = articleId ? `/api/articles/${articleId}` : '/api/articles';
  const response = await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload()),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  articleId = data.id;
  root.dataset.articleId = data.id;
  history.replaceState({}, '', `/articles/${data.id}/edit`);
  showToast('稿件已保存');
  return data;
}

async function preview() {
  await save();
  const response = await fetch(`/api/articles/${articleId}/preview`, {method: 'POST'});
  if (!response.ok) throw new Error(await response.text());
  $('preview').innerHTML = await response.text();
}

function renderChecks(data) {
  const box = $('checks');
  box.innerHTML = data.checks.map((c) => `
    <div class="check-row ${c.status}">
      <b>${c.status === 'passed' ? '✓' : c.status === 'warning' ? '!' : '×'}</b>
      <div><strong>${c.label}</strong><br><span>${c.message}</span></div>
    </div>`).join('');
  box.classList.remove('hidden');
}

async function validate() {
  await save();
  const response = await fetch(`/api/articles/${articleId}/validate`, {method: 'POST'});
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  renderChecks(data);
  showToast(data.ready ? '发布检查通过' : '仍有阻塞项需要处理');
}

async function publish(dryRun) {
  await save();
  const response = await fetch(`/api/articles/${articleId}/publish`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({dry_run: dryRun}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  window.location.href = `/jobs/${data.id}`;
}

async function uploadCover(file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/assets/upload', {method: 'POST', body: form});
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  $('cover-path').value = data.path;
  $('cover-status').textContent = data.path;
  showToast('封面上传完成');
}

$('save-btn').onclick = () => save().catch((e) => showToast(e.message));
$('preview-btn').onclick = () => preview().catch((e) => showToast(e.message));
$('validate-btn').onclick = () => validate().catch((e) => showToast(e.message));
$('dryrun-btn').onclick = () => publish(true).catch((e) => showToast(e.message));
$('publish-btn').onclick = () => publish(false).catch((e) => showToast(e.message));

$('md-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  $('markdown').value = await file.text();
  showToast(`已导入 ${file.name}`);
});

$('cover-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  uploadCover(file).catch((e) => showToast(e.message));
});

if (articleId) preview().catch(() => {});
