import { useState, useEffect, useCallback, useMemo } from 'react'

function cleanSource(name) {
  if (!name) return 'Source'
  const low = ['blog', 'ceo', 'digest', 'tracker', 'content', 'insider', 'stats', 'aggregat']
  if (low.some(l => name.toLowerCase().includes(l))) return 'Source'
  return name
}

// Normalize sources: support both old format (sourceUrl/sourceName) and new format (sources array)
function getSources(item) {
  if (item.sources?.length) return item.sources
  if (item.sourceUrl) return [{ url: item.sourceUrl, name: item.sourceName || '' }]
  return []
}

function Sources({ item }) {
  const srcs = getSources(item)
  if (srcs.length === 0) return null
  return (
    <div className="item-sources">
      {srcs.filter(s => s.url).map((s, i) => (
        <a key={i} className="item-src" href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{cleanSource(s.name)}</a>
      ))}
    </div>
  )
}

function getSaved() { try { return JSON.parse(localStorage.getItem('digest-saved') || '[]') } catch { return [] } }
function toggleSave(dateKey, item) {
  const s = getSaved(), idx = s.findIndex(x => x.dateKey === dateKey && x.headline === item.headline)
  if (idx >= 0) s.splice(idx, 1); else s.push({ dateKey, ...item })
  localStorage.setItem('digest-saved', JSON.stringify(s)); return s
}

function Copy({ text }) {
  const [done, set] = useState(false)
  return <button className="copy" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => { set(true); setTimeout(() => set(false), 1500) }) }}>{done ? 'Copied' : 'Copy'}</button>
}

function Star({ dateKey, item, onToggle }) {
  const [on, set] = useState(getSaved().some(x => x.dateKey === dateKey && x.headline === item.headline))
  return <button className={`star ${on ? 'on' : ''}`} onClick={e => { e.stopPropagation(); toggleSave(dateKey, item); set(!on); onToggle?.() }}>{on ? '\u2605' : '\u2606'}</button>
}

function Item({ item, dateKey, onSave }) {
  const [open, setOpen] = useState(false)
  const isCrit = item.score >= 8
  const isWatch = item.score >= 6 && item.score < 8
  const actionText = isCrit ? (item.action || item.useCase || '') : ''
  const pitchText = isWatch ? (item.clientPitch || item.useCase || '') : ''
  const lowText = item.score < 6 ? (item.useCase || '') : ''

  return (
    <div className={`item ${isCrit ? 'item-crit' : isWatch ? 'item-watch' : 'item-low'} ${open ? 'item-open' : ''}`} onClick={() => setOpen(!open)}>
      <div className="item-main">
        <div className="item-head">
          <span className="item-cat">{item.category}</span>
          {item.timeline && <span className={`item-tl ${item.timeline.toLowerCase().includes('available now') ? 'tl-now' : ''}`}>{item.timeline}</span>}
          <Star dateKey={dateKey} item={item} onToggle={onSave} />
        </div>
        <h3 className="item-hl">{item.headline}</h3>
        <p className="item-desc">{item.description}</p>
        {isCrit && actionText && <div className="item-action"><b>Action:</b> {actionText}</div>}
        {isWatch && !open && pitchText && <div className="item-pitch">{pitchText}</div>}
      </div>
      {open && (
        <div className="item-detail">
          {isWatch && pitchText && (
            <div className="item-pitch-full">
              <span>{pitchText}</span>
              {item.clientPitch && <Copy text={item.clientPitch} />}
            </div>
          )}
          {lowText && <div className="item-low-note">{lowText}</div>}
          {item.tools?.length > 0 && <div className="item-tools">{item.tools.map((t, i) => <span key={i} className="item-tool">{t}</span>)}</div>}
          {item.confidence && <span className="item-conf">{item.confidence} confidence</span>}
          <Sources item={item} />
        </div>
      )}
      {!open && <Sources item={item} />}
    </div>
  )
}

function Search({ digests, dates, onSelect, onClose }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    if (!q || q.length < 2) return []
    const ql = q.toLowerCase(), out = []
    for (const d of dates) { const dig = digests[d]; if (!dig?.items) continue
      for (const item of dig.items) { if (item.headline?.toLowerCase().includes(ql) || item.description?.toLowerCase().includes(ql) || (item.tools || []).some(t => t.toLowerCase().includes(ql))) { out.push({ ...item, dateKey: d }); if (out.length >= 20) return out } } }
    return out
  }, [digests, dates, q])
  return (
    <div className="search">
      <input autoFocus placeholder="Search all digests..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Escape' && onClose()} />
      {q.length >= 2 && (
        <div className="search-list">
          {results.length === 0 ? <p className="search-empty">Nothing found</p> :
            results.map((r, i) => <div key={i} className="search-row" onClick={() => onSelect(r.dateKey)}><span className="search-cat">{r.category}</span><span className="search-hl">{r.headline}</span><span className="search-dt">{r.dateKey}</span></div>)}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [digests, setDigests] = useState(null)
  const [dates, setDates] = useState([])
  const [cur, setCur] = useState(null)
  const [sidebar, setSidebar] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('digest-dark') !== 'false')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('read')
  const [showMoreWatch, setShowMoreWatch] = useState(false)
  const [, refresh] = useState(0)

  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); localStorage.setItem('digest-dark', dark) }, [dark])

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'digests.json')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then(data => { setDigests(data.digests || {}); const d = data.dates || []; setDates(d); setCur(d[0] || null); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const ci = dates.indexOf(cur)
  const prev = useCallback(() => { if (ci < dates.length - 1) { setCur(dates[ci + 1]); setShowMoreWatch(false) } }, [ci, dates])
  const next = useCallback(() => { if (ci > 0) { setCur(dates[ci - 1]); setShowMoreWatch(false) } }, [ci, dates])

  // Swipe detection for mobile date navigation
  useEffect(() => {
    let startX = 0, startY = 0
    const onStart = e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY }
    const onEnd = e => {
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) prev(); else next()
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd) }
  }, [prev, next])

  useEffect(() => {
    const h = e => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === '/' && view === 'read') { e.preventDefault(); setView('search') }
      if (e.key === 'Escape') { setView('read'); setSidebar(false) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [prev, next, view])

  const d = digests && cur ? digests[cur] : null
  if (loading) return <div className="empty">Loading...</div>
  if (error) return <div className="empty"><p>{error}</p><button className="copy" onClick={() => location.reload()}>Retry</button></div>
  if (!d) return <div className="empty">No digests yet.</div>

  const fmt = k => { const [y, m, day] = k.split('-'); return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
  const all = d.items || []
  const crit = all.filter(i => i.score >= 8)
  const watch = all.filter(i => i.score >= 6 && i.score < 8)
  const low = all.filter(i => i.score < 6)

  return (
    <>
      {sidebar && <div className="overlay" onClick={() => setSidebar(false)} />}
      <div className={`sidebar ${sidebar ? 'open' : ''}`}>
        <div className="sb-top"><span>Archive</span><button className="close" onClick={() => setSidebar(false)}>&times;</button></div>
        <div className="sb-list">{dates.map((k, i) => (
          <button key={k} className={`sb-item ${k === cur ? 'sb-active' : ''}`} onClick={() => { setCur(k); setSidebar(false); setView('read') }}>
            <span>{k}</span>{i === 0 && <span className="sb-new">new</span>}
          </button>
        ))}</div>
      </div>

      <div className="page">
        {/* Toolbar */}
        <nav className="toolbar">
          <button className="icon" onClick={() => setSidebar(true)}>
            <svg width="18" height="18" viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <div className="nav">
            <button className="icon" onClick={prev} disabled={ci >= dates.length - 1}><svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            <button className="icon" onClick={next} disabled={ci <= 0}><svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          </div>
          <div className="toolbar-right">
            <button className={`icon ${view === 'saved' ? 'icon-on' : ''}`} onClick={() => setView(view === 'saved' ? 'read' : 'saved')}>
              <svg width="16" height="16" viewBox="0 0 20 20"><path d="M10 2l2.4 4.8 5.3.8-3.85 3.7.9 5.2L10 14l-4.75 2.5.9-5.2L2.3 7.6l5.3-.8z" stroke="currentColor" strokeWidth="1.3" fill={view === 'saved' ? 'currentColor' : 'none'} strokeLinejoin="round"/></svg>
            </button>
            <button className={`icon ${view === 'search' ? 'icon-on' : ''}`} onClick={() => setView(view === 'search' ? 'read' : 'search')}>
              <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <button className="icon" onClick={() => setDark(!dark)}>
              {dark ? <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                : <svg width="16" height="16" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.003 8.003 0 1010.586 10.586z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>}
            </button>
          </div>
        </nav>

        {view === 'search' && <Search digests={digests} dates={dates} onSelect={k => { setCur(k); setView('read') }} onClose={() => setView('read')} />}

        {view === 'saved' && (
          <div className="saved">
            <h2 className="saved-title">Saved</h2>
            {getSaved().length === 0 ? <p className="saved-empty">Star items to save them here.</p> :
              <div className="search-list">{getSaved().map((r, i) => <div key={i} className="search-row" onClick={() => { setCur(r.dateKey); setView('read') }}><span className="search-cat">{r.category}</span><span className="search-hl">{r.headline}</span><span className="search-dt">{r.dateKey}</span></div>)}</div>}
          </div>
        )}

        {view === 'read' && (
          <article key={cur}>
            {/* Date and briefing */}
            <header className="digest-header">
              <h1 className="date">{fmt(cur)}</h1>
              <div className="briefing">
                <p>{d.summary}</p>
                <Copy text={d.summary} />
              </div>
              <div className="counts">
                {crit.length > 0 && <span className="count count-c">{crit.length} to act on</span>}
                {watch.length > 0 && <span className="count count-w">{watch.length} worth knowing</span>}
                {low.length > 0 && <span className="count count-l">{low.length} background</span>}
              </div>
            </header>

            {all.length === 0 && <p className="empty">Nothing today.</p>}

            {crit.length > 0 && (
              <section>
                <h2 className="section-label label-c">Act on this</h2>
                {crit.map((item, i) => <Item key={i} item={item} dateKey={cur} onSave={() => refresh(n => n + 1)} />)}
              </section>
            )}

            {watch.length > 0 && (
              <section>
                <h2 className="section-label label-w">Worth knowing</h2>
                {watch.slice(0, 5).map((item, i) => <Item key={i} item={item} dateKey={cur} onSave={() => refresh(n => n + 1)} />)}
                {watch.length > 5 && !showMoreWatch && <button className="show-more" onClick={() => setShowMoreWatch(true)}>{watch.length - 5} more</button>}
                {showMoreWatch && watch.slice(5).map((item, i) => <Item key={i + 5} item={item} dateKey={cur} onSave={() => refresh(n => n + 1)} />)}
              </section>
            )}

            {low.length > 0 && (
              <section>
                <h2 className="section-label label-l">Background</h2>
                {low.map((item, i) => <Item key={i} item={item} dateKey={cur} onSave={() => refresh(n => n + 1)} />)}
              </section>
            )}

            {d.footerNote && <p className="footer-note">{d.footerNote}</p>}
            <p className="footer-meta">{dates.length} digests in archive</p>
          </article>
        )}
      </div>
    </>
  )
}
