import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'

/** Format large numbers: 12400 → "12.4K", 1200000 → "1.2M" */
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

const CATEGORIES = ['Umum', 'Akademik', 'Produksi Video', 'Bisnis']

/** Base URL for the backend API (hardcoded to Render). */
const API_BASE = 'https://my-fullstack-app-omzn.onrender.com'

function App() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [judulWorkflow, setJudulWorkflow] = useState('')
  const [isiPrompt, setIsiPrompt] = useState('')
  const [category, setCategory] = useState('Umum')
  const [promptsList, setPromptsList] = useState([])
  const [toastMsg, setToastMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('Semua')
  const [editingId, setEditingId] = useState(null)
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const toastTimer = useRef(null)

  function showToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastMsg(msg)
    toastTimer.current = setTimeout(() => setToastMsg(''), 3000)
  }

  function fetchStats() {
    return fetch(`${API_BASE}/api/stats`)
      .then((res) => res.json())
      .then((data) => setStats(data))
  }

  function fetchPrompts() {
    return fetch(`${API_BASE}/api/prompts`)
      .then((res) => res.json())
      .then((data) => setPromptsList(data))
  }

  useEffect(() => {
    Promise.all([fetchStats(), fetchPrompts()])
      .catch((err) => console.error('Failed to fetch initial data:', err))
      .finally(() => setLoading(false))
  }, [])

  /* ── Filtered Prompts (Live Search + Category, memoised) ── */
  const filteredPrompts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return promptsList.filter((p) => {
      const matchCategory =
        activeCategory === 'Semua' || (p.category || 'Umum') === activeCategory
      if (!matchCategory) return false
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
      )
    })
  }, [promptsList, searchQuery, activeCategory])

  /* ── Per-category counts (memoised, drives the chip badges) ── */
  const categoryCounts = useMemo(() => {
    const counts = { Semua: promptsList.length }
    for (const cat of CATEGORIES) counts[cat] = 0
    for (const p of promptsList) {
      const cat = p.category || 'Umum'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [promptsList])

  function handleOpenModal() {
    setEditingId(null)
    setJudulWorkflow('')
    setIsiPrompt('')
    setCategory('Umum')
    setIsModalOpen(true)
  }

  function handleBatal() {
    setIsModalOpen(false)
    setJudulWorkflow('')
    setIsiPrompt('')
    setCategory('Umum')
    setEditingId(null)
  }
  function handleEdit(prompt) {
    setEditingId(prompt.id)
    setJudulWorkflow(prompt.title)
    setIsiPrompt(prompt.content)
    setCategory(prompt.category || 'Umum')
    setIsModalOpen(true)
  }

  async function handleSimpan(e) {
    e.preventDefault()
    if (!judulWorkflow.trim() || !isiPrompt.trim()) return
    setExecuting(true)

    try {
      const isEditing = editingId !== null
      // Guard: if we think we're editing, editingId MUST be defined.
      if (isEditing && (editingId === undefined || editingId === null)) {
        throw new Error('ID prompt tidak ditemukan untuk mode edit.')
      }

      const url = isEditing
        ? `${API_BASE}/api/prompts/${editingId}`
        : `${API_BASE}/api/prompts`
      const method = isEditing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: judulWorkflow, content: isiPrompt, category }),
      })
      if (!res.ok) throw new Error(`Server merespons ${res.status}`)
      const data = await res.json()

      // Update metrics when backend returns fresh stats (POST + DELETE)
      if (data.stats) setStats(data.stats)

      // Local update — no extra GET round-trip.
      // PUT returns the updated row (replace in place);
      // POST returns nothing (refetch to get the new id + order).
      if (isEditing && data.prompt && data.prompt.id !== undefined) {
        setPromptsList((prev) =>
          prev.map((p) => (p.id === data.prompt.id ? data.prompt : p))
        )
      } else {
        await fetchPrompts()
      }

      setIsModalOpen(false)
      setJudulWorkflow('')
      setIsiPrompt('')
      setCategory('Umum')
      setEditingId(null)
      showToast(
        isEditing
          ? 'Prompt berhasil diperbarui! ✏️'
          : 'Prompt berhasil disimpan! 🚀'
      )
    } catch (err) {
      console.error('Simpan gagal:', err)
      window.alert('Error sistem: ' + err.message)
    } finally {
      setExecuting(false)
    }
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Teks disalin ke clipboard! ✅')
    })
  }

  async function handleDelete(id) {
    try {
      // Guard: refuse to call backend with an undefined id.
      if (id === undefined || id === null) {
        throw new Error('ID prompt tidak valid (undefined).')
      }
      if (!window.confirm('Yakin ingin menghapus?')) return

      const res = await fetch(`${API_BASE}/api/prompts/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Server merespons ${res.status}`)
      const data = await res.json()

      if (data.stats) setStats(data.stats)
      // Local update: filter out the deleted prompt so the UI reacts instantly
      // without waiting for a refetch round-trip.
      setPromptsList((prev) => prev.filter((p) => p.id !== id))
      showToast('Prompt berhasil dihapus! 🗑️')
    } catch (err) {
      console.error('Hapus gagal:', err)
      window.alert('Error sistem: ' + err.message)
    }
  }

  function handleClearSearch() {
    setSearchQuery('')
  }

  function handleExport() {
    const json = JSON.stringify(promptsList, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vault-backup.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Backup berhasil didownload! 📦')
  }

  async function handleGenerateAI() {
    setAiLoading(true)
    setAiResponse('')
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${import.meta.env.VITE_AI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Buatkan tagline kreatif untuk bisnis photobooth.',
                  },
                ],
              },
            ],
          }),
        }
      )

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`HTTP ${res.status}: ${errBody}`)
      }

      const data = await res.json()
      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Tidak ada respons dari AI.'
      setAiResponse(text)
      showToast('AI berhasil generate! ✨')
    } catch (err) {
      console.error('AI Generate gagal:', err)
      setAiResponse(`Error: ${err.message}`)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="dashboard-app">
      {/* ── Ambient Background Orbs ── */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="orb orb--violet" />
        <div className="orb orb--blue" />
        <div className="orb orb--rose" />
      </div>

      {/* ── Navbar ── */}
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <a href="#" className="navbar__brand">
          <div className="navbar__logo" aria-hidden="true">V</div>
          <span className="navbar__name">
            Vault<span>.AI</span>
          </span>
        </a>

        <ul className="navbar__nav">
          <li>
            <a href="#" className="navbar__link navbar__link--active" id="nav-dashboard">
              Dashboard
            </a>
          </li>
          <li>
            <a href="#" className="navbar__link" id="nav-projects">
              Prompts
            </a>
          </li>
          <li>
            <a href="#" className="navbar__link" id="nav-analytics">
              Workflows
            </a>
          </li>
          <li>
            <a href="#" className="navbar__link" id="nav-settings">
              Pengaturan
            </a>
          </li>
        </ul>

        <div className="navbar__avatar" title="Profil Pengguna" id="user-avatar">
          FZ
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="main-content">
        {/* ── Hero Section ── */}
        <section className="hero" id="hero-section" aria-labelledby="hero-heading">
          {/* Decorative orbit rings */}
          <div className="hero__orbit hero__orbit--visible" aria-hidden="true">
            <div className="hero__orbit-dot" />
          </div>
          <div className="hero__orbit hero__orbit--lg hero__orbit--visible" aria-hidden="true" />

          {/* Status badge */}
          <div className="hero__badge" id="hero-badge">
            <span className="hero__badge-dot" aria-hidden="true" />
            Vault Aktif — Semua Layanan Tersinkronisasi
          </div>

          {/* Heading */}
          <h1 className="hero__heading" id="hero-heading">
            AI Prompt &
            <br />
            Workflow{' '}
            <span className="hero__heading-gradient">Vault</span>
          </h1>

          {/* Description */}
          <p className="hero__description">
            Kendalikan seluruh aset prompt, sinkronisasi Google Cloud, dan
            alur kerja AI (Gemini, Claude, Notion) Anda dalam satu pusat
            kendali.
          </p>

          {/* CTA Group */}
          <div className="hero__cta-group">
            <button
              type="button"
              className="cta-primary"
              id="btn-mulai-eksekusi"
              onClick={handleOpenModal}
              disabled={executing}
            >
              {executing ? 'Menyimpan…' : 'Simpan Prompt Baru'}
              <span className="cta-primary__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </button>

            <button
              type="button"
              className="cta-secondary"
              id="btn-lihat-demo"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" opacity="0.6" />
              </svg>
              Lihat Demo
            </button>

            <button
              type="button"
              className="cta-ai"
              id="btn-generate-ai"
              onClick={handleGenerateAI}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <>
                  <span className="cta-ai__spinner" aria-hidden="true" />
                  Generating…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.3 5.8 22l2.4-8.1L2 9.4h7.6z" />
                  </svg>
                  Generate dengan AI
                </>
              )}
            </button>
          </div>
        </section>

        {/* ── AI Response Card ── */}
        {aiResponse && (
          <section className="ai-response-section" id="ai-response-section" aria-label="Hasil AI">
            <div className="ai-response-card">
              <div className="ai-response-card__header">
                <div className="ai-response-card__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.3 5.8 22l2.4-8.1L2 9.4h7.6z" />
                  </svg>
                </div>
                <div>
                  <h3 className="ai-response-card__title">Respons AI</h3>
                  <p className="ai-response-card__model">gemini-1.5-flash via Google AI</p>
                </div>
                <button
                  type="button"
                  className="ai-response-card__close"
                  onClick={() => setAiResponse('')}
                  aria-label="Tutup respons AI"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <blockquote className="ai-response-card__text">
                {aiResponse}
              </blockquote>
              <div className="ai-response-card__actions">
                <button
                  type="button"
                  className="vault-card__copy"
                  onClick={() => handleCopy(aiResponse)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </button>
                <button
                  type="button"
                  className="cta-ai cta-ai--small"
                  onClick={handleGenerateAI}
                  disabled={aiLoading}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6" />
                    <path d="M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                  </svg>
                  Generate Ulang
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Shimmer Divider ── */}
        <div className="shimmer-divider" aria-hidden="true" />

        {/* ── Stats Section ── */}
        <section className="stats-section" id="stats-section" aria-label="Statistik Dashboard">
          <div className="stat-card" id="stat-projects">
            <div className="stat-card__value stat-card__value--accent">
              {loading ? '—' : stats ? formatNumber(stats.totalPrompts) : '—'}
            </div>
            <div className="stat-card__label">TOTAL PROMPT</div>
          </div>
          <div className="stat-card" id="stat-uptime">
            <div className="stat-card__value">
              {loading ? '—' : stats ? `${stats.cloudUsage}%` : '—'}
            </div>
            <div className="stat-card__label">CLOUD USAGE (%)</div>
          </div>
          <div className="stat-card" id="stat-users">
            <div className="stat-card__value stat-card__value--accent">
              {loading ? '—' : stats ? formatNumber(stats.activeWorkflows) : '—'}
            </div>
            <div className="stat-card__label">WORKFLOW AKTIF</div>
          </div>
          <div className="stat-card" id="stat-executions">
            <div className="stat-card__value">
              {loading ? '—' : stats ? formatNumber(stats.apiCalls) : '—'}
            </div>
            <div className="stat-card__label">EKSEKUSI API</div>
          </div>
        </section>

        {/* ── Shimmer Divider ── */}
        <div className="shimmer-divider" aria-hidden="true" />

        {/* ── Vault History Section ── */}
        <section className="vault-section" id="vault-section" aria-labelledby="vault-title">
          <div className="vault-section__header">
            <p className="vault-section__label">Koleksi Tersimpan</p>
            <h2 className="vault-section__title" id="vault-title">
              Vault History
            </h2>
          </div>

          {/* ── Search Bar & Export Toolbar ── */}
          <div className="vault-toolbar" id="vault-toolbar">
            <div className="vault-toolbar__search">
              <svg className="vault-toolbar__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="vault-toolbar__input"
                id="input-search"
                placeholder="Cari prompt..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="vault-toolbar__clear"
                  onClick={handleClearSearch}
                  aria-label="Bersihkan pencarian"
                  title="Bersihkan pencarian"
                  id="btn-clear-search"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              className="vault-toolbar__export vault-toolbar__export--glass"
              id="btn-export"
              onClick={handleExport}
              title="Download backup seluruh prompt"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Backup
            </button>
          </div>

          {/* ── Category Filter Chips ── */}
          <div
            className="vault-chips"
            id="vault-chips"
            role="tablist"
            aria-label="Filter kategori"
          >
            {['Semua', ...CATEGORIES].map((cat) => {
              const isActive = activeCategory === cat
              const count = categoryCounts[cat] ?? 0
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`vault-chip${isActive ? ' vault-chip--active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                  id={`chip-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <span className="vault-chip__label">{cat}</span>
                  <span className="vault-chip__count" aria-hidden="true">
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {filteredPrompts.length === 0 ? (
            <div className="vault-empty" id="vault-empty">
              <div className="vault-empty__icon" aria-hidden="true">📂</div>
              <p className="vault-empty__text">
                {searchQuery.trim()
                  ? <>Tidak ada prompt yang cocok dengan "<strong>{searchQuery}</strong>"</>
                  : <>Belum ada prompt tersimpan. Klik <strong>"Simpan Prompt Baru"</strong> untuk mulai.</>
                }
              </p>
            </div>
          ) : (
            <div className="vault-grid">
              {filteredPrompts.map((prompt) => (
                <div className="vault-card" key={prompt.id} id={`vault-card-${prompt.id}`}>
                  {/* Category Badge */}
                  <span className={`vault-card__badge vault-card__badge--${(prompt.category || 'Umum').toLowerCase().replace(/\s+/g, '-')}`}>
                    {prompt.category || 'Umum'}
                  </span>

                  <div className="vault-card__header">
                    <div className="vault-card__icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <h3 className="vault-card__title">{prompt.title}</h3>
                  </div>
                  <p className="vault-card__content">{prompt.content}</p>
                  <div className="vault-card__actions">
                    <button
                      type="button"
                      className="vault-card__copy"
                      onClick={() => handleCopy(prompt.content)}
                      title="Copy prompt ke clipboard"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy Prompt
                    </button>
                    <button
                      type="button"
                      className="vault-card__edit"
                      onClick={() => handleEdit(prompt)}
                      title="Edit prompt"
                      aria-label={`Edit prompt: ${prompt.title}`}
                      id={`btn-edit-${prompt.id}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="vault-card__delete"
                      onClick={() => handleDelete(prompt.id)}
                      title="Hapus prompt dari Vault"
                      id={`btn-delete-${prompt.id}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Shimmer Divider ── */}
        <div className="shimmer-divider" aria-hidden="true" />

        {/* ── Features Section ── */}
        <section className="features-section" id="features-section" aria-labelledby="features-title">
          <div className="features-section__header">
            <p className="features-section__label">Fitur Unggulan</p>
            <h2 className="features-section__title" id="features-title">
              Dibangun untuk Performa
            </h2>
          </div>

          <div className="features-grid">
            <div className="feature-card" id="feature-realtime">
              <div className="feature-card__icon" aria-hidden="true">⚡</div>
              <h3 className="feature-card__title">Real-time Monitoring</h3>
              <p className="feature-card__desc">
                Pantau seluruh proses secara real-time dengan latensi di bawah 50ms. 
                Dashboard yang selalu update tanpa perlu refresh manual.
              </p>
            </div>

            <div className="feature-card" id="feature-automation">
              <div className="feature-card__icon" aria-hidden="true">🔄</div>
              <h3 className="feature-card__title">Auto-Eksekusi Cerdas</h3>
              <p className="feature-card__desc">
                Atur workflow otomatis berbasis trigger dan jadwal. 
                Sistem AI membantu mengoptimalkan urutan eksekusi.
              </p>
            </div>

            <div className="feature-card" id="feature-security">
              <div className="feature-card__icon" aria-hidden="true">🛡️</div>
              <h3 className="feature-card__title">Keamanan Berlapis</h3>
              <p className="feature-card__desc">
                Enkripsi end-to-end dengan autentikasi multi-faktor. 
                Audit trail lengkap untuk setiap aktivitas di platform.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="dashboard-footer" id="dashboard-footer">
        <p className="dashboard-footer__text">
          © 2026 <span>Vault.AI</span> — AI Prompt & Workflow Vault
        </p>
        <ul className="dashboard-footer__links">
          <li><a href="#" className="dashboard-footer__link">Dokumentasi</a></li>
          <li><a href="#" className="dashboard-footer__link">API</a></li>
          <li><a href="#" className="dashboard-footer__link">Status</a></li>
          <li><a href="#" className="dashboard-footer__link">Bantuan</a></li>
        </ul>
      </footer>

      {/* ── Prompt Modal (Create / Edit) ── */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          id="modal-overlay"
          onClick={handleBatal}
        >
          <div
            className="modal-container"
            id="modal-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal decorative glow */}
            <div className="modal-glow" aria-hidden="true" />

            {/* Modal header */}
            <div className="modal-header">
              <div className="modal-header__icon" aria-hidden="true">
                {editingId ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                )}
              </div>
              <div>
                <h2 className="modal-header__title" id="modal-title">
                  {editingId ? 'Edit Prompt' : 'Simpan Prompt Baru'}
                </h2>
                <p className="modal-header__subtitle">
                  {editingId
                    ? 'Perbarui detail prompt di vault Anda'
                    : 'Tambahkan workflow baru ke dalam vault Anda'}
                </p>
              </div>
            </div>

            {/* Modal form */}
            <form className="modal-form" onSubmit={handleSimpan}>
              <div className="modal-field">
                <label className="modal-field__label" htmlFor="input-judul">
                  Judul Workflow
                </label>
                <input
                  type="text"
                  id="input-judul"
                  className="modal-field__input"
                  placeholder="Misal: Script Video AI"
                  value={judulWorkflow}
                  onChange={(e) => setJudulWorkflow(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-field">
                <label className="modal-field__label" htmlFor="input-category">
                  Kategori
                </label>
                <select
                  id="input-category"
                  className="modal-field__select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="modal-field">
                <label className="modal-field__label" htmlFor="input-prompt">
                  Isi Prompt Utama
                </label>
                <textarea
                  id="input-prompt"
                  className="modal-field__textarea"
                  placeholder="Tulis prompt lengkap untuk workflow ini…"
                  rows={5}
                  value={isiPrompt}
                  onChange={(e) => setIsiPrompt(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn modal-btn--cancel"
                  id="btn-modal-batal"
                  onClick={handleBatal}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="modal-btn modal-btn--save"
                  id="btn-modal-simpan"
                  disabled={executing}
                >
                  {executing ? (
                    <>
                      <span className="modal-btn__spinner" aria-hidden="true" />
                      {editingId ? 'Menyimpan…' : 'Menyimpan…'}
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      {editingId ? 'Simpan Perubahan' : 'Simpan ke Vault'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toastMsg && (
        <div className="toast" id="toast-notification" role="status" aria-live="polite">
          <span className="toast__text">{toastMsg}</span>
        </div>
      )}
    </div>
  )
}

export default App
