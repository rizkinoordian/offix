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

// ── Serve output directory ───────────────────────────────────
app.use('/output', express.static(OUTPUT_DIR));

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\nTimestamp Photo Generator`);
    console.log(`  Server berjalan di http://localhost:${PORT}`);
    console.log(`  Output folder: ${OUTPUT_DIR}\n`);
});
