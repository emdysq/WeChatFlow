const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || `HTTP ${response.status}`)
    error.code = data?.error?.code
    error.details = data?.error?.details
    error.status = response.status
    throw error
  }
  return data
}

function escapeHtml(value = '') {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}

function formatTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function syncBadge(state) {
  if (state === 'SYNCED') return '<span class="badge ok">● 已同步</span>'
  if (state === 'OUTDATED') return '<span class="badge warn">● 待同步</span>'
  return '<span class="badge">○ 未同步</span>'
}

function toast(message, kind = '') {
  $('.toast')?.remove()
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  el.textContent = message
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3400)
}

function shell(content, actions = '') {
  return `<div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">W</div><span>WeChatFlow V1</span></div>
      <div class="top-actions">${actions}</div>
    </header>
    ${content}
  </div>`
}

async function renderDashboard() {
  document.title = '稿件中心 · WeChatFlow'
  $('#app').innerHTML = shell(`<main class="container">
    <section class="hero">
      <div><h1>稿件中心</h1><p>本地稿件始终可编辑；微信草稿只是某个不可变版本的远程副本。</p></div>
    </section>
    <section class="card toolbar-card">
      <form id="createForm" class="create-row">
        <input id="newTitle" class="input" placeholder="输入文章标题，创建一篇新稿" maxlength="120" />
        <button class="btn primary" type="submit">新建稿件</button>
      </form>
    </section>
    <section id="docs" class="doc-grid"></section>
  </main>`)

  $('#createForm').addEventListener('submit', async (event) => {
    event.preventDefault()
    const title = $('#newTitle').value.trim()
    if (!title) return
    try {
      const created = await api('/api/v1/documents', { method: 'POST', body: JSON.stringify({ title }) })
      location.href = `/editor/${created.document.id}`
    } catch (error) { toast(error.message, 'error') }
  })

  const { items } = await api('/api/v1/documents')
  const root = $('#docs')
  if (!items.length) {
    root.innerHTML = '<div class="card empty" style="grid-column:1/-1">还没有稿件。先创建第一篇文章。</div>'
    return
  }
  root.innerHTML = items.map(item => `<article class="card doc-card" data-id="${item.documentId}">
    <div class="doc-title">${escapeHtml(item.title)}</div>
    <div class="meta-row">${syncBadge(item.syncState)} ${item.workingCopyDirty ? '<span class="badge blue">Working Copy 未提交</span>' : '<span class="badge">已 checkpoint</span>'}</div>
    <div class="meta-row"><span>本地 v${item.currentRevisionSequence}</span><span>·</span><span>微信 ${item.remoteRevisionSequence ? `v${item.remoteRevisionSequence}` : '—'}</span></div>
    <div class="meta-row"><span>最近修改 ${formatTime(item.updatedAt)}</span></div>
    <button class="btn" style="margin-top:10px">打开编辑</button>
  </article>`).join('')
  $$('.doc-card').forEach(card => card.addEventListener('click', () => { location.href = `/editor/${card.dataset.id}` }))
}

function fallbackMarkdown(markdown) {
  const lines = markdown.split('\n')
  let inCode = false
  return lines.map((line) => {
    if (line.startsWith('```')) {
      inCode = !inCode
      return inCode ? '<pre><code>' : '</code></pre>'
    }
    if (inCode) return `${escapeHtml(line)}\n`
    if (/^###\s+/.test(line)) return `<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`
    if (/^##\s+/.test(line)) return `<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`
    if (/^#\s+/.test(line)) return `<h1>${escapeHtml(line.replace(/^#\s+/, ''))}</h1>`
    if (/^>\s?/.test(line)) return `<blockquote>${escapeHtml(line.replace(/^>\s?/, ''))}</blockquote>`
    if (!line.trim()) return '<div style="height:9px"></div>'
    return `<p>${escapeHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`
  }).join('')
}

async function renderEditor(documentId) {
  let view = await api(`/api/v1/documents/${documentId}`)
  let revisions = (await api(`/api/v1/documents/${documentId}/revisions`)).items
  let rendererStatus = await api('/api/v1/renderer')
  let saveTimer = null
  let checkpointTimer = null
  let previewTimer = null
  let saving = false
  let conflict = false
  let previewHtml = ''
  let previewVersion = null
  let previewIsDoocs = false

  document.title = `${view.workingCopy.title} · WeChatFlow`
  $('#app').innerHTML = shell(`<div class="editor-layout">
    <aside class="sidebar">
      <a class="btn ghost" href="/" style="display:inline-block;text-decoration:none">← 稿件中心</a>
      <div class="side-title">版本历史</div>
      <div id="history"></div>
    </aside>
    <main class="editor-pane">
      <div class="status-strip" id="statusStrip"></div>
      <div class="editor-head">
        <input id="title" class="title-input" maxlength="120" />
        <span id="saveState" class="save-state">已载入</span>
        <button id="checkpoint" class="btn">保存版本</button>
      </div>
      <textarea id="markdown" class="markdown-editor" spellcheck="false"></textarea>
      <footer class="editor-footer"><span id="counts"></span><span>Working Copy v<span id="wcVersion"></span></span></footer>
    </main>
    <section class="preview-pane">
      <div class="preview-toolbar">
        <select id="theme" class="select"><option value="default">经典</option><option value="grace">优雅</option><option value="simple">简洁</option></select>
        <input id="primaryColor" class="input" type="color" value="#0F4C81" title="主题色" />
        <select id="fontSize" class="select"><option>15px</option><option selected>16px</option><option>17px</option><option>18px</option></select>
        <button id="refreshPreview" class="btn">刷新预览</button>
        <button id="copyRich" class="btn">复制富文本</button>
        <button id="snapshot" class="btn primary">创建快照</button>
      </div>
      <div id="rendererBanner"></div>
      <div class="phone-wrap"><div class="phone"><div class="phone-top">微信公众号预览</div><article id="preview" class="preview-content"></article></div></div>
    </section>
  </div>`, `<span class="badge">Phase 1 Workspace</span>`)

  const title = $('#title')
  const markdown = $('#markdown')
  title.value = view.workingCopy.title
  markdown.value = view.workingCopy.markdown

  function updateChrome() {
    $('#wcVersion').textContent = view.workingCopy.version
    $('#counts').textContent = `${markdown.value.length} 字符 · ${markdown.value.split(/\s+/).filter(Boolean).length} 词/段单元`
    $('#statusStrip').innerHTML = `${syncBadge(view.syncState)}<span class="badge blue">本地 v${view.currentRevision.sequence}</span>${view.latestRemoteDraft ? `<span class="badge">微信 v${revisions.find(r => r.id === view.latestRemoteDraft.revisionId)?.sequence ?? '?'}</span>` : ''}${view.workingCopyDirty ? '<span class="badge warn">Working Copy 未 checkpoint</span>' : '<span class="badge ok">Checkpoint 已保存</span>'}`
    document.title = `${title.value || '未命名'} · WeChatFlow`
  }

  function renderHistory() {
    $('#history').innerHTML = revisions.map(rev => `<div class="history-item ${rev.id === view.currentRevision.id ? 'current' : ''}">
      <div class="history-head"><span>v${rev.sequence}</span><span>${formatTime(rev.createdAt)}</span></div>
      <div class="history-reason">${escapeHtml(rev.reason)} · ${escapeHtml(rev.authorLabel)}</div>
      <div class="history-actions"><button class="btn diff-btn" data-id="${rev.id}">与当前比较</button><button class="btn restore-btn" data-id="${rev.id}" ${rev.id === view.currentRevision.id && !view.workingCopyDirty ? 'disabled' : ''}>恢复</button></div>
    </div>`).join('')
    $$('.diff-btn').forEach(btn => btn.addEventListener('click', () => showDiff(btn.dataset.id)))
    $$('.restore-btn').forEach(btn => btn.addEventListener('click', () => restore(btn.dataset.id)))
  }

  async function saveWorkingCopy() {
    if (saving || conflict) return
    saving = true
    $('#saveState').textContent = '保存中…'
    try {
      view = await api(`/api/v1/documents/${documentId}/working-copy`, {
        method: 'PATCH',
        body: JSON.stringify({ title: title.value, markdown: markdown.value, expectedVersion: view.workingCopy.version }),
      })
      $('#saveState').textContent = `已自动保存 ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`
      updateChrome()
      scheduleCheckpoint()
      schedulePreview()
    }
    catch (error) {
      if (error.code === 'WORKING_COPY_CONFLICT') {
        conflict = true
        $('#saveState').textContent = '检测到并发修改'
        toast('另一客户端或 Agent 已修改此稿。为避免覆盖，自动保存已暂停，请刷新页面检查最新版本。', 'error')
      } else {
        $('#saveState').textContent = '保存失败'
        toast(error.message, 'error')
      }
    }
    finally { saving = false }
  }

  function scheduleSave() {
    $('#saveState').textContent = '等待自动保存…'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveWorkingCopy, 600)
  }

  function scheduleCheckpoint() {
    clearTimeout(checkpointTimer)
    checkpointTimer = setTimeout(() => checkpoint('idle checkpoint'), 30_000)
  }

  function schedulePreview() {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(preview, 350)
  }

  async function checkpoint(reason = 'manual checkpoint') {
    clearTimeout(checkpointTimer)
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
      await saveWorkingCopy()
    }
    try {
      view = await api(`/api/v1/documents/${documentId}/commit`, { method: 'POST', body: JSON.stringify({ reason, authorType: 'USER', authorLabel: 'web' }) })
      revisions = (await api(`/api/v1/documents/${documentId}/revisions`)).items
      updateChrome(); renderHistory()
      toast(`已保存版本 v${view.currentRevision.sequence}`)
    } catch (error) { toast(error.message, 'error') }
  }

  function currentProfile() {
    return { theme: $('#theme').value, primaryColor: $('#primaryColor').value, fontSize: $('#fontSize').value, codeBlockTheme: '' }
  }

  function showRendererBanner() {
    const root = $('#rendererBanner')
    if (rendererStatus.available) {
      root.innerHTML = `<div class="preview-banner" style="background:#ecfdf3;color:#166534;border-color:#bbf7d0">doocs/md 已连接 · ${rendererStatus.upstreamCommit?.slice(0, 8) || ''} · Preview/Copy/Snapshot 使用同一渲染器</div>`
    } else {
      root.innerHTML = `<div class="preview-banner">当前显示基础 Markdown 回退预览，不可作为微信最终效果。要启用真实 doocs/md 渲染：运行 bootstrap 脚本并在 upstream/doocs-md 执行 pnpm install。阻断：${rendererStatus.blockers.join(', ')}</div>`
    }
  }

  async function preview() {
    if (!rendererStatus.available) {
      previewIsDoocs = false
      previewVersion = view.workingCopy.version
      previewHtml = fallbackMarkdown(markdown.value)
      $('#preview').innerHTML = previewHtml
      return
    }
    try {
      const result = await api(`/api/v1/documents/${documentId}/preview`, { method:'POST', body: JSON.stringify({ profile: currentProfile() }) })
      previewHtml = result.html
      previewVersion = result.workingCopyVersion
      previewIsDoocs = true
      $('#preview').innerHTML = result.html
    } catch (error) {
      previewIsDoocs = false
      toast(`预览失败：${error.message}`, 'error')
    }
  }

  async function showDiff(revisionId) {
    try {
      const result = await api(`/api/v1/documents/${documentId}/diff?from=${encodeURIComponent(revisionId)}&to=working`)
      const overlay = document.createElement('div')
      overlay.className = 'modal-backdrop'
      overlay.innerHTML = `<div class="modal"><div class="modal-head"><strong>v${result.from.sequence} → Working Copy</strong><button class="btn close">关闭</button></div><div class="diff">${result.lines.map(line => `<div class="diff-line ${line.type}"><span class="diff-no">${line.oldLine ?? ''}</span><span class="diff-no">${line.newLine ?? ''}</span><span>${line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</span><span>${escapeHtml(line.text || ' ')}</span></div>`).join('')}</div></div>`
      document.body.appendChild(overlay)
      $('.close', overlay).addEventListener('click', () => overlay.remove())
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    } catch (error) { toast(error.message, 'error') }
  }

  async function restore(revisionId) {
    const rev = revisions.find(r => r.id === revisionId)
    if (!rev || !confirm(`恢复 v${rev.sequence}？系统不会删除后续历史，而是创建一个新的恢复版本。`)) return
    try {
      view = await api(`/api/v1/documents/${documentId}/restore`, { method:'POST', body: JSON.stringify({ revisionId, authorLabel:'web' }) })
      revisions = (await api(`/api/v1/documents/${documentId}/revisions`)).items
      title.value = view.workingCopy.title
      markdown.value = view.workingCopy.markdown
      updateChrome(); renderHistory(); await preview()
      toast(`已从 v${rev.sequence} 恢复为新的 v${view.currentRevision.sequence}`)
    } catch (error) { toast(error.message, 'error') }
  }

  async function copyRich() {
    if (!previewIsDoocs || previewVersion !== view.workingCopy.version) {
      toast('请先完成自动保存并生成真实 doocs 预览，再复制富文本。', 'error'); return
    }
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          'text/html': new Blob([previewHtml], { type:'text/html' }),
          'text/plain': new Blob([markdown.value], { type:'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else {
        await navigator.clipboard.writeText(markdown.value)
      }
      toast('已复制当前 doocs 渲染结果。')
    } catch (error) { toast(`复制失败：${error.message}`, 'error') }
  }

  async function createSnapshot() {
    if (!rendererStatus.available) { toast('doocs/md 未连接，不能创建正式 RenderSnapshot。', 'error'); return }
    try {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await saveWorkingCopy() }
      const result = await api(`/api/v1/documents/${documentId}/snapshots`, { method:'POST', body:JSON.stringify({ profile: currentProfile() }) })
      view = await api(`/api/v1/documents/${documentId}`)
      revisions = (await api(`/api/v1/documents/${documentId}/revisions`)).items
      updateChrome(); renderHistory()
      toast(`RenderSnapshot 已创建 · v${result.revisionSequence} · ${result.snapshot.htmlHash.slice(0, 10)}`)
    } catch (error) { toast(error.message, 'error') }
  }

  title.addEventListener('input', scheduleSave)
  markdown.addEventListener('input', () => { scheduleSave(); updateChrome() })
  $('#checkpoint').addEventListener('click', () => checkpoint())
  $('#refreshPreview').addEventListener('click', preview)
  $('#copyRich').addEventListener('click', copyRich)
  $('#snapshot').addEventListener('click', createSnapshot)
  ;['theme','primaryColor','fontSize'].forEach(id => $(`#${id}`).addEventListener('input', preview))
  window.addEventListener('beforeunload', () => { if (saveTimer) navigator.sendBeacon?.(`/api/v1/documents/${documentId}/working-copy-beacon`, JSON.stringify({ title:title.value, markdown:markdown.value, expectedVersion:view.workingCopy.version })) })

  updateChrome(); renderHistory(); showRendererBanner(); await preview()
}

const editorMatch = location.pathname.match(/^\/editor\/([^/]+)$/)
try {
  if (editorMatch) await renderEditor(editorMatch[1])
  else await renderDashboard()
} catch (error) {
  $('#app').innerHTML = shell(`<main class="container"><div class="card empty"><h2>页面加载失败</h2><p>${escapeHtml(error.message)}</p><a href="/" class="btn">返回稿件中心</a></div></main>`)
}
