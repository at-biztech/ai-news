import { useState, useEffect, useCallback, useMemo } from 'react'

function getSaved() { try { return JSON.parse(localStorage.getItem('digest-saved') || '[]') } catch { return [] } }
function toggleSave(dateKey, item) {
  const s = getSaved(), idx = s.findIndex(x => x.dateKey === dateKey && x.headline === item.headline)
  if (idx >= 0) s.splice(idx, 1); else s.push({ dateKey, ...item })
  localStorage.setItem('digest-saved', JSON.stringify(s)); return s
}

function cleanSource(name) {
  if (!name) return 'Source'
  const low = ['blog', 'ceo', 'digest', 'tracker', 'content', 'insider', 'stats', 'aggregat']
  if (low.some(l => name.toLowerCase().includes(l))) return 'Source'
  return name
}
function getSources(item) {
  if (item.sources?.length) {
    return item.sources.map(s => {
      if (typeof s === 'string') { try { const u = new URL(s); return { url: s, name: u.hostname.replace('www.','') } } catch { return null } }
      return s
    }).filter(Boolean)
  }
  if (item.sourceUrl) return [{ url: item.sourceUrl, name: item.sourceName || '' }]
  return []
}

function Copy({ text }) {
  const [done, set] = useState(false)
  return <button className="copy" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => { set(true); setTimeout(() => set(false), 1500) }) }}>{done ? 'Copied' : 'Copy'}</button>
}

function Star({ dateKey, item, onToggle }) {
  const [on, set] = useState(getSaved().some(x => x.dateKey === dateKey && x.headline === item.headline))
  return <button className={`star ${on ? 'on' : ''}`} onClick={e => { e.stopPropagation(); toggleSave(dateKey, item); set(!on); onToggle?.() }}>{on ? '\u2605' : '\u2606'}</button>
}

function Item({ item, dateKey, onSave, autoOpen, onAutoOpened }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (autoOpen) { setOpen(true); onAutoOpened?.() }
  }, [autoOpen])
  const isCrit = item.score >= 8
  const insight = item.useCase || item.action || item.clientPitch || ''
  const srcs = getSources(item)

  return (
    <>
      <div className={`item ${open ? 'item-expanded' : ''}`} onClick={() => setOpen(!open)}>
        <div className="item-top">
          <div className="item-content">
            <h3 className="item-hl">{item.headline}</h3>
            {!open && <p className="item-sub">{item.description}</p>}
          </div>
          <Star dateKey={dateKey} item={item} onToggle={onSave} />
        </div>
      </div>
      {open && <div className="item-overlay" onClick={() => setOpen(false)} />}
      {open && (
        <div className="item-card" onClick={e => e.stopPropagation()}>
          <div className="card-head">
            <span className="card-cat">{item.category}</span>
            <button className="card-close" onClick={() => setOpen(false)}>&times;</button>
          </div>
          <h3 className="card-hl">{item.headline}</h3>
          <p className="card-desc">{item.description}</p>
          {insight && <p className={`card-insight ${isCrit ? 'insight-crit' : 'insight-watch'}`}>{insight}</p>}
          {item.tools?.length > 0 && <div className="card-tools">{item.tools.map((t, i) => <span key={i} className="card-tool">{t}</span>)}</div>}
          <div className="card-sources">
            {srcs.filter(s => s.url).map((s, i) => <a key={i} className="card-src" href={s.url} target="_blank" rel="noopener noreferrer">{cleanSource(s.name)}</a>)}
          </div>
        </div>
      )}
    </>
  )
}

function WeeklySummary({ digests, dates, currentDate, onNavigate }) {
  const idx = dates.indexOf(currentDate)
  const wd = dates.slice(idx, Math.min(idx + 7, dates.length))
  if (wd.length < 2) return null
  const wi = []
  for (const d of wd) { (digests[d]?.items || []).forEach(item => { wi.push({ ...item, dateKey: d }) }) }
  const topItems = wi.filter(i => i.score >= 7 && !i.headline?.toLowerCase().includes('consciousness') && !i.sourceUrl?.includes('aprilfoolsday')).sort((a, b) => b.score - a.score).slice(0, 7)
  if (topItems.length === 0) return null

  return (
    <div className="weekly">
      <div className="wk-label">Biggest stories from the last 7 days</div>
      {topItems.map((item, i) => <div key={i} className="wk-item wk-link" onClick={() => onNavigate(item.dateKey, item.headline)}>{item.headline}</div>)}
    </div>
  )
}

function Search({ digests, dates, onSelect, onClose }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    if (!q || q.length < 2) return []
    const ql = q.toLowerCase(), out = []
    for (const d of dates) { const dig = digests[d]; if (!dig?.items) continue
      for (const item of dig.items) { if (item.headline?.toLowerCase().includes(ql) || item.description?.toLowerCase().includes(ql) || (item.tools || []).some(t => t.toLowerCase().includes(ql))) { out.push({ ...item, dateKey: d }); if (out.length >= 25) return out } } }
    return out
  }, [digests, dates, q])
  return (
    <div className="search">
      <input autoFocus placeholder="Search all digests..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Escape' && onClose()} />
      {q.length >= 2 && (
        <div className="sr-list">
          {results.length === 0 ? <p className="sr-empty">Nothing found</p> :
            results.map((r, i) => <div key={i} className="sr-row" onClick={() => onSelect(r.dateKey)}><span className="sr-hl">{r.headline}</span><span className="sr-dt">{r.dateKey}</span></div>)}
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
  const [autoExpand, setAutoExpand] = useState(null)
  const [, refresh] = useState(0)

  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); localStorage.setItem('digest-dark', dark) }, [dark])

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'digests.json')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then(data => { setDigests(data.digests || {}); const d = data.dates || []; setDates(d); setCur(d[0] || null); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const ci = dates.indexOf(cur)
  const prev = useCallback(() => { if (ci < dates.length - 1) setCur(dates[ci + 1]) }, [ci, dates])
  const next = useCallback(() => { if (ci > 0) setCur(dates[ci - 1]) }, [ci, dates])

  useEffect(() => {
    let sx = 0, sy = 0
    const ts = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }
    const te = e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx > 0) prev(); else next() } }
    window.addEventListener('touchstart', ts, { passive: true }); window.addEventListener('touchend', te, { passive: true })
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te) }
  }, [prev, next])

  useEffect(() => {
    const h = e => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next()
      if (e.key === '/' && view === 'read') { e.preventDefault(); setView('search') }
      if (e.key === 'Escape') { setView('read'); setSidebar(false) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [prev, next, view])

  const d = digests && cur ? digests[cur] : null
  if (loading) return <div className="empty">Loading...</div>
  if (error) return <div className="empty"><p>{error}</p></div>
  if (!d) return <div className="empty">No digests yet.</div>

  const fmt = k => { const [y, m, day] = k.split('-'); return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
  const all = d.items || []
  const crit = all.filter(i => i.score >= 8)
  const notable = all.filter(i => i.score < 8)

  return (
    <>
      {sidebar && <div className="overlay" onClick={() => setSidebar(false)} />}
      <div className={`sidebar ${sidebar ? 'open' : ''}`}>
        <div className="sb-top"><span>Archive</span><button className="sb-close" onClick={() => setSidebar(false)}>&times;</button></div>
        <div className="sb-list">{dates.map((k, i) => (
          <button key={k} className={`sb-item ${k === cur ? 'sb-active' : ''}`} onClick={() => { setCur(k); setSidebar(false); setView('read') }}>
            <span>{k}</span>{i === 0 && <span className="sb-new">new</span>}
          </button>
        ))}</div>
      </div>

      <div className="page">
        <div className="topline" onClick={() => { setCur(dates[0]); setView('read') }} style={{cursor:'pointer'}}><div className="topline-title">DAILY AI NEWS</div><div className="topline-desc">News that affects how we build. Updated every morning and evening.</div></div>
        <nav className="toolbar">
          <button className="icon" onClick={() => setSidebar(true)}>
            <svg width="18" height="18" viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <div className="nav-arrows">
            <button className="icon" onClick={prev} disabled={ci >= dates.length - 1}><svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            <button className="icon" onClick={next} disabled={ci <= 0}><svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          </div>
          <div className="nav-right">
            <button className={`icon ${view === 'saved' ? 'icon-on' : ''}`} onClick={() => setView(view === 'saved' ? 'read' : 'saved')}>
              <svg width="16" height="16" viewBox="0 0 20 20"><path d="M10 2l2.4 4.8 5.3.8-3.85 3.7.9 5.2L10 14l-4.75 2.5.9-5.2L2.3 7.6l5.3-.8z" stroke="currentColor" strokeWidth="1.3" fill={view === 'saved' ? 'currentColor' : 'none'} strokeLinejoin="round"/></svg>
            </button>
            <button className={`icon ${view === 'search' ? 'icon-on' : ''}`} onClick={() => { setView(view === 'search' ? 'read' : 'search'); }}>
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
              <div className="sr-list">{getSaved().map((r, i) => <div key={i} className="sr-row" onClick={() => { setCur(r.dateKey); setView('read') }}><span className="sr-hl">{r.headline}</span><span className="sr-dt">{r.dateKey}</span></div>)}</div>}
          </div>
        )}

        {view === 'read' && (
          <article key={cur} className="digest">
            <header>
              <h1 className="date">{fmt(cur)}</h1>
              {d.summary && <p className="deck"><strong>{d.summary}</strong></p>}
            </header>

            {all.length === 0 && <p className="nothing">Nothing new today. Good day to build.</p>}

            {crit.length > 0 && (
              <section>
                <div className="section-line line-crit"><span>Critical</span></div>
                {crit.map((item, i) => <Item key={`c${i}`} item={item} dateKey={cur} onSave={() => refresh(n => n + 1)} autoOpen={autoExpand === item.headline} onAutoOpened={() => setAutoExpand(null)} />)}
              </section>
            )}

            {notable.length > 0 && (
              <section>
                <div className="section-line line-note"><span>Notable</span></div>
                {notable.map((item, i) => <Item key={`n${i}`} item={item} dateKey={cur} onSave={() => refresh(n => n + 1)} autoOpen={autoExpand === item.headline} onAutoOpened={() => setAutoExpand(null)} />)}
              </section>
            )}

            <WeeklySummary digests={digests} dates={dates} currentDate={cur} onNavigate={(dateKey, headline) => { setCur(dateKey); setAutoExpand(headline) }} />

            <footer>
              <p className="ft-about">Daily AI industry updates that matter. New tools, model releases, pricing changes, and major events. No hype, no noise. Just what changed and why it matters.</p>
            </footer>
          </article>
        )}
      </div>
    </>
  )
}
