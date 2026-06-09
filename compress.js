/**
 * Compress PDF & Image — compress.js
 * Shrink a PDF or an image below a user-defined maximum file size, entirely in
 * the browser.
 *
 * SCOPE NOTE: This feature is NOT part of the PRD (FR-01..FR-09 cover the
 * timestamp generator only). It is a standalone, user-requested utility page,
 * following the same local-first pattern as the Merge PDF page.
 *
 * PRIVACY: 100% local. pdf.js rasterizes PDF pages and pdf-lib rebuilds the PDF;
 * images are re-encoded on a <canvas>. Nothing is uploaded to any server.
 *
 * STRATEGY (how it hits a target size):
 *   Both file types are compressed by re-encoding pixels as JPEG. Two knobs
 *   control the result size: render SCALE (resolution) and JPEG QUALITY. We walk
 *   a fixed ladder of (scale, quality) presets from best quality downward and
 *   stop at the first result at or below the target.
 *     - PDF   : each page is rasterized (pdf.js), re-encoded as JPEG, and the PDF
 *               is rebuilt (pdf-lib). Canvases are cached per scale.
 *     - Image : the bitmap is drawn to a scaled canvas and re-encoded as JPEG.
 *   If the file is already under the target, it is passed through untouched
 *   (lossless — no re-encode).
 *
 *   TRADE-OFF: re-encoding rasterizes content. For PDFs, selectable text,
 *   bookmarks and vector sharpness are lost. For images, PNG transparency is
 *   flattened onto white and output becomes JPEG. Stated clearly in the UI.
 *
 * Modules:
 *   - State        : mode, current file, last result
 *   - File handling: validate + load (per mode)
 *   - Compression  : compressPdf() / compressImage() dispatched by compress()
 *   - Download     : object URL
 *   - UI helpers   : mode toggle, button state, result card, toast, error
 */

(() => {
    'use strict';

    const { PDFDocument } = window.PDFLib;
    const pdfjsLib = window.pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';

    // ── Config ───────────────────────────────────────────────
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB upload guard
    const MAX_PAGES = 1000;                   // safety cap on rasterization work

    const MODES = {
        pdf: {
            accept: 'application/pdf',
            label: '📄 Unggah PDF',
            text: 'Klik atau seret file PDF ke sini',
            hint: 'PDF · maksimal 100MB',
            isValid: (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
            invalidMsg: 'File harus berupa PDF.',
        },
        image: {
            accept: 'image/jpeg,image/png',
            label: '🖼️ Unggah Gambar',
            text: 'Klik atau seret gambar ke sini',
            hint: 'JPG / PNG · maksimal 100MB',
            isValid: (f) => /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name),
            invalidMsg: 'File harus berupa gambar JPG atau PNG.',
        },
    };

    // Quality ladder, best → worst. Size decreases monotonically down the list,
    // so the first preset at/under the target is the highest quality that fits.
    const LADDER = [
        { scale: 2.0, quality: 0.85 },
        { scale: 1.75, quality: 0.80 },
        { scale: 1.5, quality: 0.75 },
        { scale: 1.5, quality: 0.60 },
        { scale: 1.25, quality: 0.60 },
        { scale: 1.0, quality: 0.60 },
        { scale: 1.0, quality: 0.50 },
        { scale: 0.85, quality: 0.50 },
        { scale: 0.7, quality: 0.45 },
        { scale: 0.6, quality: 0.40 },
        { scale: 0.5, quality: 0.35 },
    ];
    // Images already start at native resolution, so scales >1 only inflate size.
    const imageLadder = () => LADDER.filter((p) => p.scale <= 1.0);

    // ── State ────────────────────────────────────────────────
    let mode = 'pdf';
    let currentFile = null;     // the uploaded File
    let resultUrl = null;       // object URL of the last compressed result
    let resultExt = 'pdf';      // download extension for the last result
    let busy = false;

    // ── DOM refs ─────────────────────────────────────────────
    const modeToggle = document.getElementById('modeToggle');
    const uploadArea = document.getElementById('uploadArea');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const uploadLabel = document.getElementById('uploadLabel');
    const uploadText = document.getElementById('uploadText');
    const uploadHint = document.getElementById('uploadHint');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const clearBtn = document.getElementById('clearBtn');
    const maxSizeInput = document.getElementById('maxSizeInput');
    const maxSizeUnit = document.getElementById('maxSizeUnit');
    const compressBtn = document.getElementById('compressBtn');
    const compressBtnText = document.getElementById('compressBtnText');
    const compressLoader = document.getElementById('compressLoader');
    const downloadGroup = document.getElementById('downloadGroup');
    const downloadBtn = document.getElementById('downloadBtn');
    const compressError = document.getElementById('compressError');
    const resultPlaceholder = document.getElementById('resultPlaceholder');
    const resultCard = document.getElementById('resultCard');
    const resOriginal = document.getElementById('resOriginal');
    const resCompressed = document.getElementById('resCompressed');
    const resSaved = document.getElementById('resSaved');
    const resStatus = document.getElementById('resStatus');
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toastText');

    // ── Small helpers ────────────────────────────────────────

    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    /** Read the max-size field, returning bytes — or null if invalid. */
    function targetBytes() {
        const value = parseFloat(maxSizeInput.value);
        if (!isFinite(value) || value <= 0) return null;
        const unit = maxSizeUnit.value === 'KB' ? 1024 : 1024 * 1024;
        return Math.floor(value * unit);
    }

    /** Encode a canvas to JPEG bytes at a given quality. */
    async function canvasToJpegBytes(canvas, quality) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        return new Uint8Array(await fetch(dataUrl).then((r) => r.arrayBuffer()));
    }

    // ── Mode ─────────────────────────────────────────────────

    function setMode(next) {
        if (next === mode || busy) return;
        mode = next;
        const cfg = MODES[mode];
        fileInput.accept = cfg.accept;
        uploadLabel.textContent = cfg.label;
        uploadText.textContent = cfg.text;
        uploadHint.textContent = cfg.hint;
        modeToggle.querySelectorAll('.mode-btn').forEach((b) =>
            b.classList.toggle('active', b.dataset.mode === mode));
        clearFile(); // a different kind of file is now expected
    }

    // ── File handling ────────────────────────────────────────

    function setFile(file) {
        fileInput.value = ''; // allow re-selecting the same file later
        hideError();
        clearResult();

        // Be forgiving: if the file matches the other mode, switch to it.
        if (!MODES[mode].isValid(file)) {
            const other = mode === 'pdf' ? 'image' : 'pdf';
            if (MODES[other].isValid(file)) {
                setMode(other);
            } else {
                showError(MODES[mode].invalidMsg);
                return;
            }
        }
        if (file.size > MAX_FILE_SIZE) {
            showError('Ukuran file melebihi 100MB.');
            return;
        }

        currentFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = formatSize(file.size);
        uploadPlaceholder.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        clearBtn.style.display = '';
        updateCompressButton();
    }

    function clearFile() {
        currentFile = null;
        hideError();
        clearResult();
        uploadPlaceholder.classList.remove('hidden');
        fileInfo.classList.add('hidden');
        clearBtn.style.display = 'none';
        updateCompressButton();
    }

    // ── Compression: shared entry ────────────────────────────

    async function compress() {
        if (busy || !currentFile) return;

        const target = targetBytes();
        if (target === null) {
            showError('Masukkan ukuran maksimum yang valid (lebih dari 0).');
            return;
        }

        setBusy(true);
        hideError();
        clearResult();
        try {
            // Already small enough → pass through untouched (lossless).
            if (currentFile.size <= target) {
                const bytes = new Uint8Array(await currentFile.arrayBuffer());
                const ext = mode === 'pdf' ? 'pdf' : extOf(currentFile.name);
                finishResult(bytes, target, true, currentFile.type, ext);
                return;
            }
            if (mode === 'pdf') await compressPdf(target);
            else await compressImage(target);
        } catch (err) {
            console.error('Compression failed:', err);
            showError(mode === 'pdf'
                ? 'Gagal mengompres PDF. Pastikan file valid dan tidak terkunci.'
                : 'Gagal mengompres gambar. Pastikan file gambar valid.');
        } finally {
            setBusy(false);
        }
    }

    // ── Compression: PDF ─────────────────────────────────────

    /** Rasterize one pdf.js page to a canvas at the given render scale. */
    async function renderPage(pdfjsDoc, pageNum, scale) {
        const page = await pdfjsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // JPEG has no alpha — flatten to white
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas;
    }

    /** Build a PDF from cached page canvases at a given JPEG quality. */
    async function buildPdf(canvases, pointSizes, quality) {
        const out = await PDFDocument.create();
        for (let i = 0; i < canvases.length; i++) {
            const jpgBytes = await canvasToJpegBytes(canvases[i], quality);
            const img = await out.embedJpg(jpgBytes);
            const { width, height } = pointSizes[i];
            const page = out.addPage([width, height]);
            page.drawImage(img, { x: 0, y: 0, width, height });
        }
        return out.save();
    }

    async function compressPdf(target) {
        const pdfjsDoc = await pdfjsLib.getDocument({ data: await currentFile.arrayBuffer() }).promise;
        try {
            const pageCount = pdfjsDoc.numPages;
            if (pageCount > MAX_PAGES) {
                showError(`PDF memiliki ${pageCount} halaman. Maksimal ${MAX_PAGES} halaman untuk kompresi.`);
                return;
            }

            // Original page sizes in PDF points (= pdf.js viewport at scale 1).
            const pointSizes = [];
            for (let i = 1; i <= pageCount; i++) {
                const vp = (await pdfjsDoc.getPage(i)).getViewport({ scale: 1 });
                pointSizes.push({ width: vp.width, height: vp.height });
            }

            const canvasCache = new Map(); // scale -> canvas[]
            let best = null;

            for (let step = 0; step < LADDER.length; step++) {
                const { scale, quality } = LADDER[step];
                setBusyText(`Mengompres… (percobaan ${step + 1}/${LADDER.length})`);

                if (!canvasCache.has(scale)) {
                    const canvases = [];
                    for (let i = 1; i <= pageCount; i++) {
                        canvases.push(await renderPage(pdfjsDoc, i, scale));
                    }
                    canvasCache.set(scale, canvases);
                }

                const bytes = await buildPdf(canvasCache.get(scale), pointSizes, quality);
                if (!best || bytes.length < best.length) best = bytes;
                if (bytes.length <= target) {
                    finishResult(bytes, target, true, 'application/pdf', 'pdf');
                    return;
                }
            }
            finishResult(best, target, false, 'application/pdf', 'pdf');
        } finally {
            pdfjsDoc.destroy();
        }
    }

    // ── Compression: image ───────────────────────────────────

    async function compressImage(target) {
        const bitmap = await createImageBitmap(currentFile);
        try {
            const baseW = bitmap.width;
            const baseH = bitmap.height;
            const presets = imageLadder();
            let best = null;

            for (let step = 0; step < presets.length; step++) {
                const { scale, quality } = presets[step];
                setBusyText(`Mengompres… (percobaan ${step + 1}/${presets.length})`);

                const w = Math.max(1, Math.round(baseW * scale));
                const h = Math.max(1, Math.round(baseH * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; // flatten PNG transparency to white
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(bitmap, 0, 0, w, h);

                const bytes = await canvasToJpegBytes(canvas, quality);
                if (!best || bytes.length < best.length) best = bytes;
                if (bytes.length <= target) {
                    finishResult(bytes, target, true, 'image/jpeg', 'jpg');
                    return;
                }
            }
            finishResult(best, target, false, 'image/jpeg', 'jpg');
        } finally {
            bitmap.close();
        }
    }

    // ── Result ───────────────────────────────────────────────

    function finishResult(bytes, target, metTarget, mime, ext) {
        const blob = new Blob([bytes], { type: mime });
        resultUrl = URL.createObjectURL(blob);
        resultExt = ext;

        const original = currentFile.size;
        const saved = original - bytes.length;
        const savedPct = original > 0 ? Math.round((saved / original) * 100) : 0;

        resOriginal.textContent = formatSize(original);
        resCompressed.textContent = formatSize(bytes.length);
        resSaved.textContent = saved > 0
            ? `${formatSize(saved)} (${savedPct}% lebih kecil)`
            : 'Tidak ada penghematan (file sudah optimal)';

        if (metTarget) {
            resStatus.textContent = `✅ Di bawah batas ${formatSize(target)}`;
            showToast('File berhasil dikompres di bawah target');
        } else {
            resStatus.textContent = `⚠️ Target ${formatSize(target)} tidak tercapai — hasil terkecil ${formatSize(bytes.length)}`;
            showError(`Tidak bisa mencapai ${formatSize(target)}. Ukuran terkecil yang bisa dicapai adalah ${formatSize(bytes.length)}. Coba naikkan batas ukuran.`);
        }

        resultPlaceholder.classList.add('hidden');
        resultCard.classList.remove('hidden');
        downloadGroup.classList.remove('hidden');
    }

    // ── Download ─────────────────────────────────────────────

    function extOf(name) {
        const m = name.match(/\.([a-z0-9]+)$/i);
        return m ? m[1].toLowerCase() : 'bin';
    }

    function downloadResult() {
        if (!resultUrl) return;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const base = currentFile
            ? currentFile.name.replace(/\.[^.]+$/, '')
            : 'file';
        const a = document.createElement('a');
        a.href = resultUrl;
        a.download = `${base}_compressed_${stamp}.${resultExt}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function clearResult() {
        if (resultUrl) {
            URL.revokeObjectURL(resultUrl);
            resultUrl = null;
        }
        downloadGroup.classList.add('hidden');
        resultCard.classList.add('hidden');
        resultPlaceholder.classList.remove('hidden');
    }

    // ── UI helpers ───────────────────────────────────────────

    function setBusy(value) {
        busy = value;
        compressLoader.classList.toggle('hidden', !busy);
        modeToggle.querySelectorAll('.mode-btn').forEach((b) => (b.disabled = busy));
        updateCompressButton();
    }

    function setBusyText(text) {
        compressBtnText.textContent = text;
    }

    function updateCompressButton() {
        compressBtn.disabled = busy || !currentFile;
        if (busy) return; // text managed by setBusyText during a run
        compressBtnText.textContent = currentFile ? '🗜️ Compress' : '🗜️ Unggah file dulu';
    }

    function showError(msg) {
        compressError.textContent = '⚠️ ' + msg;
        compressError.classList.remove('hidden');
    }

    function hideError() {
        compressError.classList.add('hidden');
        compressError.textContent = '';
    }

    let toastTimer = null;
    function showToast(msg) {
        toastText.textContent = msg;
        toast.classList.remove('hidden');
        void toast.offsetWidth; // restart transition
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 2600);
    }

    // ── Wiring ───────────────────────────────────────────────

    modeToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-btn');
        if (btn) setMode(btn.dataset.mode);
    });

    uploadArea.addEventListener('click', () => { if (!currentFile) fileInput.click(); });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) setFile(e.target.files[0]);
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
    });

    clearBtn.addEventListener('click', clearFile);
    compressBtn.addEventListener('click', compress);
    downloadBtn.addEventListener('click', downloadResult);
    // Changing the target after a run invalidates the previous result.
    maxSizeInput.addEventListener('input', clearResult);
    maxSizeUnit.addEventListener('change', clearResult);

    updateCompressButton();
})();
