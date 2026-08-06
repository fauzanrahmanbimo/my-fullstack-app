const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── CORS — izinkan akses dari frontend (Vite dev server) ───
app.use(
    cors({
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    })
);

app.use(express.json());

// ─── SQLite Database Initialisation ───
let db;

async function initDatabase() {
    db = await open({
        filename: path.join(__dirname, '..', 'database.sqlite'),
        driver: sqlite3.Database,
    });

    // Buat tabel ai_metrics jika belum ada
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            totalPrompts INTEGER NOT NULL DEFAULT 0,
            cloudUsage REAL NOT NULL DEFAULT 0,
            activeWorkflows INTEGER NOT NULL DEFAULT 0,
            apiCalls INTEGER NOT NULL DEFAULT 0
        )
    `);

    // Buat tabel prompts jika belum ada
    await db.exec(`
        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL
        )
    `);

    // Tambahkan kolom category jika belum ada (migrasi)
    try {
        await db.exec(`ALTER TABLE prompts ADD COLUMN category TEXT DEFAULT 'Umum'`);
        console.log('✓ Kolom category berhasil ditambahkan');
    } catch (_err) {
        // Kolom sudah ada — abaikan error
    }

    // Jika tabel ai_metrics kosong, masukkan baris awal
    const row = await db.get('SELECT COUNT(*) AS count FROM ai_metrics');
    if (row.count === 0) {
        await db.run(
            `INSERT INTO ai_metrics (totalPrompts, cloudUsage, activeWorkflows, apiCalls)
             VALUES (?, ?, ?, ?)`,
            [142, 68.5, 8, 2840]
        );
    }

    console.log('✓ SQLite database ready (database.sqlite)');
}

// ─── GET /api/stats ───
app.get('/api/stats', async (_req, res) => {
    try {
        const row = await db.get(
            'SELECT totalPrompts, cloudUsage, activeWorkflows, apiCalls FROM ai_metrics WHERE id = 1'
        );
        res.json(row);
    } catch (err) {
        console.error('GET /api/stats error:', err);
        res.status(500).json({ error: 'Gagal mengambil data' });
    }
});

// ─── POST /api/stats/eksekusi ───
app.post('/api/stats/eksekusi', async (_req, res) => {
    try {
        await db.run(
            `UPDATE ai_metrics
             SET totalPrompts = totalPrompts + 1,
                 apiCalls     = apiCalls + 3
             WHERE id = 1`
        );
        const row = await db.get(
            'SELECT totalPrompts, cloudUsage, activeWorkflows, apiCalls FROM ai_metrics WHERE id = 1'
        );
        res.json(row);
    } catch (err) {
        console.error('POST /api/stats/eksekusi error:', err);
        res.status(500).json({ error: 'Gagal mengeksekusi' });
    }
});

// ─── GET /api/prompts ───
app.get('/api/prompts', async (_req, res) => {
    try {
        const rows = await db.all('SELECT * FROM prompts ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        console.error('GET /api/prompts error:', err);
        res.status(500).json({ error: 'Gagal mengambil daftar prompts' });
    }
});

// ─── POST /api/prompts ───
app.post('/api/prompts', async (req, res) => {
    try {
        const { title, content, category } = req.body;

        if (!title || !title.trim() || !content || !content.trim()) {
            return res.status(400).json({ error: 'Title dan content wajib diisi' });
        }

        const cat = (category && category.trim()) || 'Umum';

        // Simpan prompt ke tabel prompts
        await db.run(
            'INSERT INTO prompts (title, content, category) VALUES (?, ?, ?)',
            [title.trim(), content.trim(), cat]
        );

        // Update metrik: totalPrompts +1, apiCalls +1
        await db.run(
            `UPDATE ai_metrics
             SET totalPrompts = totalPrompts + 1,
                 apiCalls     = apiCalls + 1
             WHERE id = 1`
        );

        // Ambil metrik terbaru untuk dikembalikan
        const stats = await db.get(
            'SELECT totalPrompts, cloudUsage, activeWorkflows, apiCalls FROM ai_metrics WHERE id = 1'
        );

        res.json({ success: true, stats });
    } catch (err) {
        console.error('POST /api/prompts error:', err);
        res.status(500).json({ error: 'Gagal menyimpan prompt' });
    }
});

// ─── PUT /api/prompts/:id ───
app.put('/api/prompts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, category } = req.body;

        if (!title || !title.trim() || !content || !content.trim()) {
            return res.status(400).json({ error: 'Title dan content wajib diisi' });
        }

        const existing = await db.get('SELECT id FROM prompts WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Prompt tidak ditemukan' });
        }

        const cat = (category && category.trim()) || 'Umum';

        await db.run(
            'UPDATE prompts SET title = ?, content = ?, category = ? WHERE id = ?',
            [title.trim(), content.trim(), cat, id]
        );

        const updated = await db.get('SELECT * FROM prompts WHERE id = ?', [id]);
        res.json({ success: true, prompt: updated });
    } catch (err) {
        console.error('PUT /api/prompts/:id error:', err);
        res.status(500).json({ error: 'Gagal mengupdate prompt' });
    }
});

// ─── DELETE /api/prompts/:id ───
app.delete('/api/prompts/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Pastikan prompt ada sebelum dihapus
        const existing = await db.get('SELECT id FROM prompts WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Prompt tidak ditemukan' });
        }

        // Hapus prompt dari tabel
        await db.run('DELETE FROM prompts WHERE id = ?', [id]);

        // Kurangi totalPrompts di ai_metrics agar statistik tetap akurat
        await db.run(
            `UPDATE ai_metrics
             SET totalPrompts = MAX(totalPrompts - 1, 0)
             WHERE id = 1`
        );

        // Ambil metrik terbaru
        const stats = await db.get(
            'SELECT totalPrompts, cloudUsage, activeWorkflows, apiCalls FROM ai_metrics WHERE id = 1'
        );

        res.json({ success: true, stats });
    } catch (err) {
        console.error('DELETE /api/prompts/:id error:', err);
        res.status(500).json({ error: 'Gagal menghapus prompt' });
    }
});

// ─── Start server after DB is ready ───
initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`✓ AI Prompt & Workflow Vault API running → http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Database initialisation failed:', err);
        process.exit(1);
    });
