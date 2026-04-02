import { useState, useEffect, useCallback, useMemo } from 'react'

const CL = ['#378ADD','#5DCAA5','#D85A30','#7F77DD','#D4537E','#639922','#BA7517','#888780','#E24B4A']
const CD = ['#85B7EB','#5DCAA5','#F0997B','#AFA9EC','#ED93B1','#97C459','#FAC775','#B4B2A9','#F09595']

// Saved items (localStorage)
function getSaved() { try { return JSON.parse(localStorage.getItem('ai-digest-saved') || '[]') } catch { return [] } }
function setSaved(items) { localStorage.setItem('ai-digest-saved', JSON.stringify(items)) }
function isItemSaved(dateKey, headline) { return getSaved().some(s => s.dateKey === dateKey && s.headline === headline) }
function toggleSave(dateKey, item) {
  const saved = getSaved()
  const idx = saved.findIndex(s => s.dateKey === dateKey && s.headline === item.headline)
  if (idx >= 0) { saved.splice(idx, 1) } else { saved.push({ dateKey, ...item }) }
  setSaved(saved)
  return saved
}

function DonutChart({ items, dark }) {
  const colors = dark ? CD : CL
  const cats = {}
  items.forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1 })
  const entries = Object.entries(cats).sort((a, b) => b[1] - a[1])
  const total = items.length; const r = 60, cx = 80, cy = 80, stroke = 24; let cum = 0; const circ = 2 * Math.PI * r
  return (
    <div className="chart-container">
      <svg viewBox="0 0 160 160" width="120" height="120">
        {entries.map(([cat, count], idx) => { const frac = count / total; const off = circ * (1 - cum); cum += frac
          return <circle key={cat} cx={cx} cy={cy} r={r} fill="none" stroke={colors[idx % colors.length]} strokeWidth={stroke}
            strokeDasharray={`${circ * frac} ${circ * (1 - frac)}`} strokeDashoffset={off} transform={`rotate(-90 ${cx} ${cy})`} /> })}
      </svg>
      <div className="chart-legend">
        {entries.map(([cat, count], idx) => (
          <div key={cat} className="legend-item"><span className="legend-dot" style={{ background: colors[idx % colors.length] }} /><span className="legend-label">{cat}</span><span className="legend-count">{count}</span></div>
        ))}
      </div>
    </div>
  )
}

function ToolBadges({ tools }) { if (!tools?.length) return null; return <div className="tool-badges">{tools.map((t, i) => <span key={i} className="tool-badge">{t}</span>)}</div> }
function Timeline({ tl }) { if (!tl) return null; return <span className={`tl-badge ${tl.toLowerCase().includes('available now') ? 'tl-now' : ''}`}>{tl}</span> }
function Confidence({ c }) { if (!c) return null; return <span className={`conf-badge conf-${c}`}>{c}</span> }
function StarBtn({ dateKey, item, onToggle }) {
  const [saved, setSt] = useState(isItemSaved(dateKey, item.headline))
  return <button className={`star-btn ${saved ? 'starred' : ''}`} onClick={() => { toggleSave(dateKey, item); setSt(!saved); onToggle?.() }}>{saved ? '\u2605' : '\u2606'}</button>
}
function CopyBtn({ text, label }) {
  const [c, setC] = useState(false)
  return <button className="btn copy-btn" onClick={() => { navigator.clipboard.writeText(text).then(() => { setC(true); setTimeout(() => setC(false), 2000) }) }}>{c ? 'Copied' : (label || 'Copy')}</button>
}

function CriticalCard({ item, dateKey, onSaveToggle }) {
  const act = item.action || item.useCase || ''
  return (
    <div className="card card-critical">
      <div className="card-top">
        <div className="card-score score-critical">{item.score}</div>
        <div className="card-meta">
          <div className="card-badges"><span className="tag-badge tag-critical">CRITICAL</span><span className="cat-badge">{item.category}</span><Timeline tl={item.timeline} /><Confidence c={item.confidence} /></div>
          <div className="card-headline">{item.headline}</div>
        </div>
        <StarBtn dateKey={dateKey} item={item} onToggle={onSaveToggle} />
      </div>
      <div className="card-desc">{item.description}</div>
      <ToolBadges tools={item.tools} />
      {act && <div className="action-block"><span className="blk-label">Action:</span> {act}</div>}
      <div className="card-footer">
        {item.sourceUrl && <a className="card-source" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceName || 'Source'}</a>}
        <CopyBtn text={`${item.headline}: ${act}`} label="Share" />
      </div>
    </div>
  )
}

function WatchCard({ item, dateKey, onSaveToggle }) {
  const [open, setOpen] = useState(false)
  const pitch = item.clientPitch || ''
  const use = item.useCase || ''
  return (
    <div className="card card-watch card-compact" onClick={() => setOpen(!open)}>
      <div className="card-top">
        <div className="card-score">{item.score}</div>
        <div className="card-meta">
          <div className="card-badges"><span className="tag-badge tag-watch">WATCH</span><span className="cat-badge">{item.category}</span><Timeline tl={item.timeline} /><Confidence c={item.confidence} /></div>
          <div className="card-headline">{item.headline}</div>
          {!open && <div className="card-desc-inline">{item.description}</div>}
        </div>
        <StarBtn dateKey={dateKey} item={item} onToggle={onSaveToggle} />
      </div>
      {open && (
        <>
          <div className="card-desc">{item.description}</div>
          <ToolBadges tools={item.tools} />
          {pitch && <div className="pitch-block"><div className="pitch-row"><div><span className="blk-label">Client pitch:</span> {pitch}</div><CopyBtn text={pitch} label="Forward" /></div></div>}
          {use && !pitch && <div className="pitch-block"><span className="blk-label">Why it matters:</span> {use}</div>}
          <div className="card-footer">
            {item.sourceUrl && <a className="card-source" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceName || 'Source'}</a>}
          </div>
        </>
      )}
    </div>
  )
}

function ContextRow({ item }) {
  return (
    <div className="ctx-row">
      <span className="ctx-score">{item.score}</span>
      <span className="cat-badge cat-sm">{item.category}</span>
      <div className="ctx-body"><span className="ctx-headline">{item.headline}</span><span className="ctx-desc">{item.description}</span></div>
      {item.sourceUrl && <a className="card-source" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceName}</a>}
    </div>
  )
}

function WeeklySummary({ digests, dates, currentDate }) {
  const idx = dates.indexOf(currentDate)
  const wd = dates.slice(idx, idx + 7).filter(Boolean)
  if (wd.length < 3) return null
  const wi = wd.flatMap(d => digests[d]?.items || [])
  const cc = wi.filter(i => i.score >= 8).length
  const cats = {}; wi.filter(i => i.score >= 6).forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1 })
  const topC = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const tf = {}; wi.flatMap(i => i.tools || []).forEach(t => { tf[t] = (tf[t] || 0) + 1 })
  const topT = Object.entries(tf).sort((a, b) => b[1] - a[1]).slice(0, 5)
  return (
    <div className="weekly">
      <div className="weekly-title">Last {wd.length} days</div>
      <div className="weekly-stats"><span>{cc} critical</span><span>{wi.length} total items</span></div>
      {topC.length > 0 && <div className="weekly-det">Top: {topC.map(([c, n]) => `${c} (${n})`).join(', ')}</div>}
      {topT.length > 0 && <div className="weekly-det">Trending: {topT.map(([t, n]) => `${t} (${n}x)`).join(', ')}</div>}
    </div>
  )
}

function SearchResults({ digests, dates, query, onSelect }) {
  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase(); const out = []
    for (const d of dates) { const dig = digests[d]; if (!dig?.items) continue
      for (const item of dig.items) { if (item.headline.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || (item.tools || []).some(t => t.toLowerCase().includes(q)) || (item.category || '').toLowerCase().includes(q)) { out.push({ ...item, dateKey: d }); if (out.length >= 20) return out } } }
    return out
  }, [digests, dates, query])
  if (!query || query.length < 2) return null
  return (
    <div className="search-results">
      {results.length === 0 ? <div className="search-empty">No results for "{query}"</div> :
        results.map((item, i) => (
          <div key={i} className="search-item" onClick={() => onSelect(item.dateKey)}>
            <span className={`search-tag ${item.tag === 'CRITICAL' ? 'tag-critical' : item.tag === 'WATCH' ? 'tag-watch' : 'tag-low'}`}>{item.score}</span>
            <div className="search-body"><span className="search-headline">{item.headline}</span><span className="search-date">{item.dateKey}</span></div>
          </div>
        ))}
    </div>
  )
}

function SavedView({ onSelect }) {
  const saved = getSaved()
  if (saved.length === 0) return <div className="center-msg" style={{ minHeight: '30vh' }}>No saved items yet. Star items to save them.</div>
  return (
    <div className="saved-list">
      {saved.map((item, i) => (
        <div key={i} className="search-item" onClick={() => onSelect(item.dateKey)}>
          <span className={`search-tag ${item.tag === 'CRITICAL' ? 'tag-critical' : item.tag === 'WATCH' ? 'tag-watch' : 'tag-low'}`}>{item.score}</span>
          <div className="search-body"><span className="search-headline">{item.headline}</span><span className="search-date">{item.dateKey}</span></div>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [digests, setDigests] = useState(null)
  const [dates, setDates] = useState([])
  const [currentDate, setCurrentDate] = useState(null)
  const [sidebar, setSidebar] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('ai-digest-dark') === 'true')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ctxOpen, setCtxOpen] = useState(false)
  const [filterCat, setFilterCat] = useState(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('digest') // digest | search | saved
  const [, forceUpdate] = useState(0)

  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); localStorage.setItem('ai-digest-dark', dark) }, [dark])

  const fetchData = () => {
    setLoading(true); setError(null)
    fetch(import.meta.env.BASE_URL + 'digests.json')
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json() })
      .then(data => { setDigests(data.digests || {}); const d = data.dates || []; setDates(d); setCurrentDate(d[0] || null); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }
  useEffect(fetchData, [])

  const currentIdx = dates.indexOf(currentDate)
  const hasPrev = currentIdx < dates.length - 1
  const hasNext = currentIdx > 0
  const goPrev = useCallback(() => { if (hasPrev) { setCurrentDate(dates[currentIdx + 1]); setFilterCat(null) } }, [hasPrev, dates, currentIdx])
  const goNext = useCallback(() => { if (hasNext) { setCurrentDate(dates[currentIdx - 1]); setFilterCat(null) } }, [hasNext, dates, currentIdx])

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === '/' && view !== 'search') { e.preventDefault(); setView('search') }
      if (e.key === 'Escape') { setView('digest'); setSearch('') ; setSidebar(false) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [goPrev, goNext, view])

  const digest = digests && currentDate ? digests[currentDate] : null

  if (loading) return <div className="center-msg">Loading...</div>
  if (error) return <div className="center-msg"><p>{error}</p><button className="btn" onClick={fetchData}>Retry</button></div>
  if (!digest) return <div className="center-msg">No digests yet.</div>

  const fmt = (d) => { const [y, m, day] = d.split('-'); return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
  const allItems = digest.items || []
  const filtered = filterCat ? allItems.filter(i => i.category === filterCat) : allItems
  const critical = filtered.filter(i => i.score >= 8)
  const watch = filtered.filter(i => i.score >= 6 && i.score <= 7)
  const context = filtered.filter(i => i.score < 6)
  const categories = [...new Set(allItems.map(i => i.category))].sort()
  const readMin = Math.max(1, Math.ceil(allItems.length * 0.15))

  return (
    <>
      {sidebar && <div className="overlay" onClick={() => setSidebar(false)} />}
      <div className={`sidebar ${sidebar ? 'open' : ''}`}>
        <div className="sidebar-hdr"><span>All Digests</span><button className="btn" onClick={() => setSidebar(false)}>&#x2715;</button></div>
        <div className="sidebar-list">
          {dates.map((d, i) => (
            <button key={d} className={`sidebar-item ${d === currentDate ? 'active' : ''}`}
              onClick={() => { setCurrentDate(d); setSidebar(false); setFilterCat(null); setView('digest') }}>
              {d}{i === 0 && <span className="latest-lbl">latest</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="app">
        <header>
          <div className="hdr-top">
            <button className="btn" onClick={() => setSidebar(true)}>
              <svg width="18" height="18" viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <div className="hdr-center">
              <div className="hdr-label">AI ECOSYSTEM DIGEST</div>
              <div className="hdr-date">
                <button className="btn nav-btn" onClick={goPrev} disabled={!hasPrev}><svg width="14" height="14" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
                <span>{fmt(currentDate)}</span>
                <button className="btn nav-btn" onClick={goNext} disabled={!hasNext}><svg width="14" height="14" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
              </div>
            </div>
            <div className="hdr-actions">
              <button className={`btn ${view === 'saved' ? 'btn-active' : ''}`} onClick={() => setView(view === 'saved' ? 'digest' : 'saved')}>
                <svg width="18" height="18" viewBox="0 0 20 20"><path d="M10 2l2.4 4.8 5.3.8-3.85 3.7.9 5.2L10 14l-4.75 2.5.9-5.2L2.3 7.6l5.3-.8z" stroke="currentColor" strokeWidth="1.3" fill={view === 'saved' ? 'currentColor' : 'none'} strokeLinejoin="round"/></svg>
              </button>
              <button className={`btn ${view === 'search' ? 'btn-active' : ''}`} onClick={() => { setView(view === 'search' ? 'digest' : 'search'); setSearch('') }}>
                <svg width="18" height="18" viewBox="0 0 20 20"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <button className="btn" onClick={() => setDark(!dark)}>
                {dark ? <svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.003 8.003 0 1010.586 10.586z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>}
              </button>
            </div>
          </div>
        </header>

        {view === 'search' && (
          <div className="search-view">
            <div className="search-bar">
              <input autoFocus type="text" placeholder="Search all digests... (Esc to close)" value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setView('digest'); setSearch('') } }} />
            </div>
            <SearchResults digests={digests} dates={dates} query={search} onSelect={(d) => { setCurrentDate(d); setView('digest'); setFilterCat(null) }} />
          </div>
        )}

        {view === 'saved' && (
          <div className="saved-view">
            <h2 className="view-title">Saved items</h2>
            <SavedView onSelect={(d) => { setCurrentDate(d); setView('digest'); setFilterCat(null) }} />
          </div>
        )}

        {view === 'digest' && (
          <>
            {/* Number cards */}
            <div className="num-cards">
              <div className="num-card num-critical"><div className="num-val">{critical.length}</div><div className="num-lbl">Act on this</div></div>
              <div className="num-card num-watch"><div className="num-val">{watch.length}</div><div className="num-lbl">Capabilities</div></div>
              <div className="num-card num-ctx"><div className="num-val">{context.length}</div><div className="num-lbl">Context</div></div>
              <div className="num-card num-total"><div className="num-val">{readMin}m</div><div className="num-lbl">Read time</div></div>
            </div>

            <div className="briefing">
              <div className="briefing-text">{digest.summary}</div>
              <CopyBtn text={digest.summary} label="Copy" />
            </div>

            {categories.length > 1 && (
              <div className="filters">
                <button className={`fbtn ${!filterCat ? 'factive' : ''}`} onClick={() => setFilterCat(null)}>All</button>
                {categories.map(c => <button key={c} className={`fbtn ${filterCat === c ? 'factive' : ''}`} onClick={() => setFilterCat(filterCat === c ? null : c)}>{c}</button>)}
              </div>
            )}
            <div className="divider" />

            <main>
              {allItems.length === 0 ? <div className="center-msg">Nothing today.</div> : (
                <>
                  {critical.length > 0 && (
                    <section className="sec">
                      <div className="sec-hdr"><h2 className="sec-title sec-critical">Act on this</h2><span className="sec-count">{critical.length}</span></div>
                      <div className="cards">{critical.map((item, i) => <CriticalCard key={i} item={item} dateKey={currentDate} onSaveToggle={() => forceUpdate(n => n + 1)} />)}</div>
                    </section>
                  )}
                  {watch.length > 0 && (
                    <section className="sec">
                      <div className="sec-hdr"><h2 className="sec-title sec-watch">New capabilities</h2><span className="sec-count">{watch.length}</span><span className="sec-hint">click to expand</span></div>
                      <div className="cards">{watch.map((item, i) => <WatchCard key={i} item={item} dateKey={currentDate} onSaveToggle={() => forceUpdate(n => n + 1)} />)}</div>
                    </section>
                  )}
                  {context.length > 0 && (
                    <section className="sec">
                      <div className="sec-hdr sec-toggle" onClick={() => setCtxOpen(!ctxOpen)}>
                        <h2 className="sec-title sec-ctx">Market context</h2><span className="sec-count">{context.length}</span>
                        <span className="toggle-arr">{ctxOpen ? '\u25B2' : '\u25BC'}</span>
                      </div>
                      {ctxOpen && <div className="ctx-list">{context.map((item, i) => <ContextRow key={i} item={item} />)}</div>}
                    </section>
                  )}
                  {allItems.length >= 5 && <div className="charts"><DonutChart items={allItems} dark={dark} /></div>}
                  <WeeklySummary digests={digests} dates={dates} currentDate={currentDate} />
                </>
              )}
            </main>

            <footer>
              {digest.footerNote && <div className="ftr-note">{digest.footerNote}</div>}
              <div className="ftr-count">{dates.length} digest{dates.length !== 1 ? 's' : ''}</div>
              <div className="ftr-keys">Left/Right = dates | / = search | Esc = close</div>
            </footer>
          </>
        )}
      </div>
    </>
  )
}
