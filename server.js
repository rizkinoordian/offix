/**
 * Timestamp Photo Generator — server.js
 * Express backend for:
 *   - Serving the static frontend
 *   - Saving generated photos to the output folder
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Directories ─────────────────────────────────────────────
const OUTPUT_DIR = path.join(__dirname, 'output');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

// ── API: Save photo from base64 canvas data ─────────────────
app.post('/api/save-photo', (req, res) => {
    try {
        const { dataUrl, filename } = req.body;
        if (!dataUrl) {
            return res.status(400).json({ error: 'Tidak ada data foto.' });
        }

        const matches = dataUrl.match(/^data:image\/(jpeg|png|jpg);base64,(.+)$/);
        if (!matches) {
            return res.status(400).json({ error: 'Format data foto tidak valid.' });
        }

        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');

        if (buffer.length > 10 * 1024 * 1024) {
            return res.status(400).json({ error: 'Ukuran foto melebihi 10MB.' });
        }

        const finalName = filename || `timestamp_photo_${Date.now()}.${ext}`;
        const filePath = path.join(OUTPUT_DIR, finalName);
        fs.writeFileSync(filePath, buffer);

        res.json({ success: true, filename: finalName, size: buffer.length });
    } catch (err) {
        console.error('Error saving photo:', err);
        res.status(500).json({ error: 'Gagal menyimpan foto.' });
    }
});

// ── API: Map tile proxy (FR-04, FR-06) ──────────────────────
// OSM's tile policy rejects requests without an identifying User-Agent/Referer
// (403 "Access blocked"). Proxying through the server lets us send a proper
// User-Agent and cache tiles as the policy requires. Internet-dependent.
const OSM_USER_AGENT = 'TimestampPhotoGenerator/1.4 (local personal tool)';
const TILE_CACHE_MAX = 500;
const tileCache = new Map(); // key "z/x/y" -> Buffer (insertion order = LRU)

app.get('/api/tile/:z/:x/:y.png', async (req, res) => {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    const max = 2 ** z;
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > 19 ||
        x < 0 || x >= max || y < 0 || y >= max) {
        return res.status(400).end();
    }

    const key = `${z}/${x}/${y}`;
    res.set('Cache-Control', 'public, max-age=604800');
    res.type('png');

    if (tileCache.has(key)) {
        const buf = tileCache.get(key);
        tileCache.delete(key);
        tileCache.set(key, buf);
        return res.send(buf);
    }

    try {
        const upstream = await fetch(`https://tile.openstreetmap.org/${key}.png`, {
            headers: { 'User-Agent': OSM_USER_AGENT }
        });
        if (!upstream.ok) {
            return res.status(upstream.status).end();
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        tileCache.set(key, buf);
        if (tileCache.size > TILE_CACHE_MAX) {
            tileCache.delete(tileCache.keys().next().value);
        }
        res.send(buf);
    } catch (err) {
        console.error('Tile fetch failed:', key, err.message);
        res.status(502).end();
    }
});

// ── Serve output directory ───────────────────────────────────
app.use('/output', express.static(OUTPUT_DIR));

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\nTimestamp Photo Generator`);
    console.log(`  Server berjalan di http://localhost:${PORT}`);
    console.log(`  Output folder: ${OUTPUT_DIR}\n`);
});
