// Draft editor for eichenlaubphysics.com. Every text block is editable in
// place, cards/list items and whole sections drag by their ⠿ handle, and the
// page saves itself (through the save_site_draft RPC, keyed by ?k=...) a
// moment after each change. tools/build.py --pull turns the saved draft into
// the live page.
(function () {
  const SB_URL = 'https://nxvtaxbntqhcfqtazbnt.supabase.co'
  const SB_KEY = 'sb_publishable_51M6zUC11pz8fIPkCvi4WQ_owCE99pB'
  const params = new URLSearchParams(location.search)
  const KEY = params.get('k') || localStorage.getItem('ep-draft-key') || ''
  if (params.get('k')) localStorage.setItem('ep-draft-key', KEY)

  const page = document.getElementById('page')
  const ORIGINAL = page.innerHTML
  const LIST_SEL = '.focus, .bio-lines, .hero-cta, .prose, .cards, .principles, .who, .accomplishment-list, .quotes, .faq-list'
  const EDIT_SEL = 'h1, h2, h3, p, li, summary, cite, a.btn'
  const INLINE = new Set(['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'SPAN', 'CODE', 'SUB', 'SUP'])

  let undoStack = []
  let current = ''
  let trash = []
  let sortables = []
  let saveTimer = null
  let inputTimer = null

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // ---- serialize: the page as plain sections, without editor chrome ------
  function serialize(root = page) {
    const c = root.cloneNode(true)
    c.querySelectorAll('.ed-chrome').forEach(e => e.remove())
    c.querySelectorAll('span.ed-text').forEach(s => s.replaceWith(...s.childNodes))
    c.querySelectorAll('*').forEach(el => {
      el.removeAttribute('contenteditable')
      el.removeAttribute('draggable')
      el.removeAttribute('spellcheck')
      ;[...el.classList].forEach(k => { if (k.startsWith('ed-') || k.startsWith('sortable-')) el.classList.remove(k) })
      if (el.getAttribute('class') === '') el.removeAttribute('class')
      if (el.getAttribute('style') === '') el.removeAttribute('style')
    })
    return c.innerHTML.trim()
  }

  function chrome(cls, html) {
    const d = document.createElement('div')
    d.className = 'ed-chrome ' + cls
    d.contentEditable = 'false'
    d.innerHTML = html
    return d
  }

  const realChildren = el => [...el.children].filter(c => !c.classList.contains('ed-chrome'))
  const isLeaf = el => realChildren(el).every(c => INLINE.has(c.tagName))

  // ---- decorate: add handles, buttons and contenteditable ---------------
  function decorate() {
    sortables.forEach(s => s.destroy())
    sortables = []
    page.innerHTML = serialize()

    for (const sec of page.querySelectorAll(':scope > section')) {
      sec.classList.add('ed-section')
      const name = sec.dataset.nav || sec.querySelector('.eyebrow')?.textContent.trim() || (sec.id === 'top' ? 'Top of page' : sec.id)
      const hidden = sec.dataset.hidden === 'true'
      sec.prepend(chrome('ed-secbar',
        `<span class="ed-handle ed-sec-handle" title="Drag to move this section">⠿</span>` +
        `<span class="ed-secname">${esc(name)}</span>` +
        `<button data-act="up" title="Move this section up">↑</button>` +
        `<button data-act="down" title="Move this section down">↓</button>` +
        `<button data-act="hide" title="${hidden ? 'This section is hidden on the live site' : 'Keep this section off the live site'}">${hidden ? 'Show on site' : 'Hide on site'}</button>` +
        `<button data-act="del-sec" title="Delete this section">Delete</button>`))
    }

    for (const list of page.querySelectorAll(LIST_SEL)) {
      for (const item of realChildren(list)) {
        item.classList.add('ed-item')
        item.appendChild(chrome('ed-itembar',
          `<span class="ed-handle ed-item-handle" title="Drag to reorder">⠿</span>` +
          `<button data-act="dup" title="Duplicate">⧉</button>` +
          `<button data-act="del-item" title="Delete">✕</button>`))
      }
      sortables.push(Sortable.create(list, { handle: '.ed-item-handle', draggable: '.ed-item', animation: 150, onEnd: changed }))
    }
    sortables.push(Sortable.create(page, { handle: '.ed-sec-handle', draggable: 'section', animation: 150, onEnd: changed }))

    for (const el of page.querySelectorAll(EDIT_SEL)) {
      if (el.closest('.ed-chrome') || el.closest('#trial-booking') || !isLeaf(el)) continue
      if (el.classList.contains('ed-item')) {
        // keep the item's buttons outside the editable text
        const span = document.createElement('span')
        span.className = 'ed-text'
        for (const n of [...el.childNodes]) if (!(n.classList && n.classList.contains('ed-chrome'))) span.appendChild(n)
        el.prepend(span)
        span.contentEditable = 'true'
      } else {
        el.contentEditable = 'true'
      }
    }
    page.querySelectorAll('details').forEach(d => { d.open = true })
    updateNav()
  }

  function updateNav() {
    const nav = document.querySelector('.site-nav')
    if (!nav) return
    nav.innerHTML = [...page.querySelectorAll(':scope > section[data-nav]')]
      .filter(s => s.dataset.hidden !== 'true')
      .map(s => `<a href="#${esc(s.id)}">${esc(s.dataset.nav)}</a>`).join('')
  }

  // ---- change tracking, undo, save --------------------------------------
  function changed() {
    const now = serialize()
    if (now === current) return
    undoStack.push(current)
    if (undoStack.length > 200) undoStack.shift()
    current = now
    updateNav()
    scheduleSave()
  }

  function undo() {
    if (!undoStack.length) return
    current = undoStack.pop()
    page.innerHTML = current
    decorate()
    scheduleSave()
  }

  function setStatus(text, cls = '') {
    const s = document.getElementById('ed-status')
    s.textContent = text
    s.className = cls
  }

  function scheduleSave() {
    setStatus('Saving…')
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 1200)
  }

  async function save(keepalive = false) {
    clearTimeout(saveTimer)
    const html = serialize()
    localStorage.setItem('ep-draft-html', html)
    localStorage.setItem('ep-draft-at', String(Date.now()))
    if (!KEY) { setStatus('Saved in this browser only', 'warn'); return }
    try {
      const r = await fetch(SB_URL + '/rest/v1/rpc/save_site_draft', {
        method: 'POST', keepalive,
        headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: KEY, p_html: html }),
      })
      if (!r.ok) throw new Error((await r.json()).message || r.status)
      localStorage.setItem('ep-draft-server-at', String(Date.now()))
      setStatus('Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'ok')
    } catch (e) {
      setStatus('Not saved to the server (' + e.message + '). Your edits are kept in this browser.', 'warn')
    }
  }

  async function load() {
    let html = null
    if (KEY) {
      try {
        const r = await fetch(SB_URL + '/rest/v1/rpc/get_site_draft', {
          method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_key: KEY }),
        })
        const rows = await r.json()
        if (Array.isArray(rows) && rows[0] && /<section/.test(rows[0].html)) html = rows[0].html
      } catch (e) { /* fall back to the local copy */ }
    }
    const localAt = +localStorage.getItem('ep-draft-at') || 0
    const serverAt = +localStorage.getItem('ep-draft-server-at') || 0
    const local = localStorage.getItem('ep-draft-html') || ''
    if (/<section/.test(local) && (!html || localAt > serverAt + 2000)) html = local
    if (html) page.innerHTML = html
    decorate()
    current = serialize()
    setStatus(KEY ? 'All changes saved' : 'Saved in this browser only', KEY ? 'ok' : 'warn')
    if (html && localAt > serverAt + 2000) scheduleSave()
  }

  // ---- events ------------------------------------------------------------
  page.addEventListener('input', () => { clearTimeout(inputTimer); inputTimer = setTimeout(changed, 600) })
  page.addEventListener('focusout', () => { clearTimeout(inputTimer); changed() })

  page.addEventListener('click', e => {
    const btn = e.target.closest('.ed-chrome button')
    if (btn) {
      e.preventDefault()
      const act = btn.dataset.act
      const sec = btn.closest('section')
      const item = btn.closest('.ed-item')
      if (act === 'hide') {
        if (sec.dataset.hidden === 'true') delete sec.dataset.hidden
        else sec.dataset.hidden = 'true'
        changed(); decorate()
      } else if (act === 'up' || act === 'down') {
        const other = act === 'up' ? sec.previousElementSibling : sec.nextElementSibling
        if (!other) return
        if (act === 'up') other.before(sec); else other.after(sec)
        changed()
        sec.scrollIntoView({ block: 'start', behavior: 'smooth' })
      } else if (act === 'del-sec') {
        const name = sec.querySelector('.ed-secname')?.textContent || sec.id
        const wrap = document.createElement('div'); wrap.appendChild(sec.cloneNode(true))
        trash.push({ name, html: serialize(wrap) })
        sec.remove(); changed(); renderTrash()
      } else if (act === 'del-item') {
        item.remove(); changed()
      } else if (act === 'dup') {
        const wrap = document.createElement('div'); wrap.appendChild(item.cloneNode(true))
        item.insertAdjacentHTML('afterend', serialize(wrap))
        changed(); decorate()
      }
      return
    }
    // no link-following or FAQ toggling while editing (Ctrl/Cmd+click opens a link)
    const a = e.target.closest('a')
    if (a && !(e.ctrlKey || e.metaKey)) e.preventDefault()
    if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank') }
    if (e.target.closest('summary')) e.preventDefault()
  })

  page.addEventListener('keydown', e => {
    if (!e.target.closest('[contenteditable="true"]')) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) document.execCommand('insertLineBreak')
    } else if (e.key === ' ' && e.target.closest('summary')) {
      e.preventDefault()
      document.execCommand('insertText', false, ' ')
    }
  })

  page.addEventListener('paste', e => {
    if (!e.target.closest('[contenteditable="true"]')) return
    e.preventDefault()
    document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' '))
  })

  document.addEventListener('keydown', e => {
    const inText = e.target.closest && e.target.closest('[contenteditable="true"]')
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !inText) { e.preventDefault(); undo() }
  })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true) })

  // ---- toolbar ------------------------------------------------------------
  function renderTrash() {
    const b = document.getElementById('ed-trash-btn')
    b.textContent = `Deleted sections (${trash.length})`
    b.hidden = !trash.length
    const list = document.getElementById('ed-trash')
    list.innerHTML = trash.map((t, i) => `<div><span>${esc(t.name)}</span><button data-restore="${i}">Restore</button></div>`).join('')
  }

  function makeLink() {
    const sel = getSelection()
    const host = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)
    if (!host || !host.closest('#page [contenteditable="true"]')) { alert('Select some text in the page first.'); return }
    const existing = host.closest('a')
    const url = prompt('Link address (leave empty to remove the link):', existing ? existing.getAttribute('href') : 'https://')
    if (url === null) return
    if (existing && url.trim() === '') { existing.replaceWith(...existing.childNodes) }
    else if (existing) { existing.setAttribute('href', url.trim()) }
    else if (url.trim()) { document.execCommand('createLink', false, url.trim()) }
    changed()
  }

  const bar = document.createElement('div')
  bar.id = 'ed-bar'
  bar.className = 'ed-chrome'
  bar.innerHTML =
    `<span id="ed-status">Loading…</span>` +
    `<button id="ed-undo" title="Undo (Ctrl+Z outside a text box)">Undo</button>` +
    `<button id="ed-link" title="Turn the selected text into a link, or change a link">Link</button>` +
    `<button id="ed-preview" title="See the page without the editing handles">Preview</button>` +
    `<button id="ed-trash-btn" hidden></button>` +
    `<button id="ed-reset" title="Throw away all edits and start from the published draft">Start over</button>` +
    `<div id="ed-trash" hidden></div>`
  document.body.appendChild(bar)

  const banner = document.createElement('div')
  banner.className = 'ed-chrome ed-banner'
  banner.innerHTML = '<strong>Draft editor.</strong> Click any text to change it. Drag ⠿ to move a card, list item or section; ✕ deletes and ⧉ duplicates. Changes save automatically. When you\'re done, press Go on the EigenNode task and say so.'
  document.body.prepend(banner)

  document.getElementById('ed-undo').onclick = undo
  document.getElementById('ed-link').onmousedown = e => e.preventDefault()
  document.getElementById('ed-link').onclick = makeLink
  document.getElementById('ed-preview').onclick = () => {
    document.body.classList.toggle('ed-preview')
    document.getElementById('ed-preview').textContent = document.body.classList.contains('ed-preview') ? 'Back to editing' : 'Preview'
    page.querySelectorAll('[contenteditable]:not(.ed-chrome)').forEach(el => { el.contentEditable = document.body.classList.contains('ed-preview') ? 'false' : 'true' })
  }
  document.getElementById('ed-trash-btn').onclick = () => { const t = document.getElementById('ed-trash'); t.hidden = !t.hidden }
  document.getElementById('ed-trash').onclick = e => {
    const i = e.target.dataset && e.target.dataset.restore
    if (i === undefined) return
    const t = trash.splice(+i, 1)[0]
    const booking = page.querySelector(':scope > section#book')
    if (booking) booking.insertAdjacentHTML('beforebegin', t.html)
    else page.insertAdjacentHTML('beforeend', t.html)
    changed(); decorate(); renderTrash()
  }
  document.getElementById('ed-reset').onclick = () => {
    if (!confirm('Throw away all your edits and go back to the original draft?')) return
    undoStack.push(current)
    page.innerHTML = ORIGINAL
    decorate(); current = serialize(); scheduleSave()
  }

  load()
})()
