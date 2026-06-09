/**
 * Merge PDF — merge.js
 * Organize-style PDF merging: each uploaded PDF is broken into pages, pages can
 * be reordered individually or moved as a whole file, then merged & downloaded.
 *
 * SCOPE NOTE: This feature is NOT part of the PRD (FR-01..FR-09 cover the
 * timestamp generator only). It is a standalone, user-requested utility page.
 *
 * PRIVACY: 100% local. pdf.js renders page thumbnails in the browser and pdf-lib
 * merges pages in the browser. No PDF bytes are uploaded to any server.
 *
 * Single source of truth: `pages` (the flat, ordered list of page items).
 * The file list on the right is DERIVED from `pages`, so per-page and per-file
 * reordering never desync.
 *
 * Modules:
 *   - State          : pages[], filesById, snapshot, merged result
 *   - File handling  : validate, load (pdf-lib), render thumbs (pdf.js)
 *   - Rendering      : page grid + file list
 *   - Drag & drop    : page reorder + whole-file (block) move
 *   - Merge/Download  : pdf-lib copyPages in display order
 *   - UI helpers     : button state, busy, toast, error
 */

(() => {
    'use strict';

    const { PDFDocument } = window.PDFLib;
    const pdfjsLib = window.pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';

    // ── Config ───────────────────────────────────────────────
    const ACCEPTED_TYPE = 'application/pdf';
    const ACCEPTED_EXT = '.pdf';
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file
    const MAX_FILES = 20;
    const THUMB_WIDTH = 170; // px, rendered once per page
    const FILE_COLORS = [
        '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
        '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
    ];

    // ── State ────────────────────────────────────────────────
    // page item: { id, fileId, srcIndex, srcPageNum, thumb (dataURL) }
    let pages = [];
    // fileId -> { id, name, size, doc (pdf-lib PDFDocument), label, color, pageCount }
    const filesById = new Map();
    let fileCounter = 0;            // monotonic — drives stable label (A, B, …) + color
    let naturalSnapshot = [];       // page-id order right after the last add/remove
    let mergedUrl = null;           // object URL of the last merged result

    // ── DOM refs ─────────────────────────────────────────────
    const uploadArea = document.getElementById('uploadArea');
    const pdfInput = document.getElementById('pdfInput');
    const pageGrid = document.getElementById('pageGrid');
    const pagesBusy = document.getElementById('pagesBusy');
    const fileList = document.getElementById('fileList');
    const filesEmpty = document.getElementById('filesEmpty');
    const addMoreBtn = document.getElementById('addMoreBtn');
    const resetAllBtn = document.getElementById('resetAllBtn');
    const mergeBtn = document.getElementById('mergeBtn');
    const mergeBtnText = document.getElementById('mergeBtnText');
    const mergeLoader = document.getElementById('mergeLoader');
    const downloadGroup = document.getElementById('downloadGroup');
    const downloadBtn = document.getElementById('downloadBtn');
    const mergeError = document.getElementById('mergeError');
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toastText');

    // ── Small helpers ────────────────────────────────────────

    const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    function isPdf(file) {
        return file.type === ACCEPTED_TYPE || file.name.toLowerCase().endsWith(ACCEPTED_EXT);
    }

    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /** A, B, … Z, then A1, B1, … so labels stay short and unique. */
    function labelFor(n) {
        const letter = String.fromCharCode(65 + (n % 26));
        const cycle = Math.floor(n / 26);
        return cycle === 0 ? letter : `${letter}${cycle}`;
    }

    function hexToRgba(hex, a) {
        const v = parseInt(hex.slice(1), 16);
        return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
    }

    const sameOrder = (a, b) =>
        a.length === b.length && a.every((id, i) => id === b[i]);

    /** Files in display order = order of their first appearance in `pages`. */
    function filesInOrder() {
        const seen = new Set();
        const ordered = [];
        for (const p of pages) {
            if (!seen.has(p.fileId)) {
                seen.add(p.fileId);
                ordered.push(filesById.get(p.fileId));
            }
        }
        return ordered;
    }

    // ── File handling ────────────────────────────────────────

    /** Render one page to a JPEG data URL via pdf.js (done once per page). */
    async function renderThumb(pdfjsDoc, pageNum) {
        const page = await pdfjsDoc.getPage(pageNum);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.72);
    }

    async function addFiles(fileList) {
        const incoming = Array.from(fileList);
        pdfInput.value = ''; // allow re-selecting the same file later
        if (!incoming.length) return;

        setBusy(true);
        const skipped = [];

        for (const file of incoming) {
            if (filesById.size >= MAX_FILES) {
                skipped.push(`${file.name} (maksimal ${MAX_FILES} file)`);
                continue;
            }
            if (!isPdf(file)) {
                skipped.push(`${file.name} (bukan PDF)`);
                continue;
            }
            if (file.size > MAX_FILE_SIZE) {
                skipped.push(`${file.name} (lebih dari 100MB)`);
                continue;
            }

            try {
                // Read twice: pdf.js detaches the buffer it receives, pdf-lib needs its own.
                const libDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
                const pageCount = libDoc.getPageCount();

                const fileId = uid('file');
                const idx = fileCounter++;
                filesById.set(fileId, {
                    id: fileId,
                    name: file.name,
                    size: file.size,
                    doc: libDoc,
                    label: labelFor(idx),
                    color: FILE_COLORS[idx % FILE_COLORS.length],
                    pageCount,
                });

                const jsDoc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
                for (let i = 0; i < pageCount; i++) {
                    const thumb = await renderThumb(jsDoc, i + 1);
                    pages.push({ id: uid('pg'), fileId, srcIndex: i, srcPageNum: i + 1, thumb });
                }
                jsDoc.destroy();
            } catch (err) {
                console.error('Failed to load PDF:', file.name, err);
                skipped.push(`${file.name} (file PDF rusak / terkunci)`);
            }
        }

        // Uploading is a structural change → new "natural" baseline, fresh result.
        naturalSnapshot = pages.map((p) => p.id);
        clearMergedResult();
        setBusy(false);
        render();

        if (skipped.length) showError('Beberapa file dilewati: ' + skipped.join(', '));
        else hideError();
    }

    function removeFile(fileId) {
        pages = pages.filter((p) => p.fileId !== fileId);
        filesById.delete(fileId);
        naturalSnapshot = pages.map((p) => p.id); // removal resets baseline
        clearMergedResult();
        hideError();
        render();
    }

    function clearAll() {
        pages = [];
        filesById.clear();
        naturalSnapshot = [];
        clearMergedResult();
        hideError();
        render();
    }

    // ── Rendering ────────────────────────────────────────────

    function render() {
        const hasPages = pages.length > 0;

        uploadArea.classList.toggle('hidden', hasPages);
        pageGrid.classList.toggle('hidden', !hasPages);
        filesEmpty.classList.toggle('hidden', hasPages);
        addMoreBtn.classList.toggle('hidden', !hasPages);
        resetAllBtn.classList.toggle('hidden', !hasPages);

        renderPageGrid();
        renderFileList();
        updateMergeButton();
    }

    function renderPageGrid() {
        pageGrid.innerHTML = '';
        pages.forEach((page, index) => pageGrid.appendChild(buildPageCard(page, index)));
    }

    function buildPageCard(page, index) {
        const file = filesById.get(page.fileId);
        const card = document.createElement('div');
        card.className = 'page-card';
        card.draggable = true;
        card.dataset.pageId = page.id;
        card.style.setProperty('--fc', file.color);
        card.title = `${file.label}: ${file.name} — hlm. ${page.srcPageNum}`;

        card.innerHTML = `
            <span class="page-pos">${index + 1}</span>
            <div class="page-thumb"><img src="${page.thumb}" alt="Halaman ${page.srcPageNum}"></div>
            <span class="page-tag">${file.label} · hlm ${page.srcPageNum}</span>
        `;
        attachPageDrag(card);
        return card;
    }

    function renderFileList() {
        fileList.innerHTML = '';
        filesInOrder().forEach((file) => fileList.appendChild(buildFileItem(file)));
    }

    function buildFileItem(file) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.draggable = true;
        item.dataset.fileId = file.id;
        item.style.setProperty('--fc', file.color);
        item.style.setProperty('--fc-soft', hexToRgba(file.color, 0.14));

        item.innerHTML = `
            <span class="file-handle">⇅</span>
            <span class="file-label">${file.label}</span>
            <span class="file-name" title="${file.name}">${file.name}</span>
            <span class="file-meta">${file.pageCount} hlm</span>
            <button class="file-remove" title="Hapus file" aria-label="Hapus ${file.name}">✕</button>
        `;
        item.querySelector('.file-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(file.id);
        });
        attachFileDrag(item);
        return item;
    }

    // ── Drag & drop: page reorder ────────────────────────────

    let dragPageId = null;

    function attachPageDrag(card) {
        card.addEventListener('dragstart', (e) => {
            dragPageId = card.dataset.pageId;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            dragPageId = null;
            card.classList.remove('dragging');
            clearDropMarkers(pageGrid);
        });
        card.addEventListener('dragover', (e) => {
            if (!dragPageId) return;
            e.preventDefault();
            if (card.dataset.pageId === dragPageId) return;
            markDrop(card, isBefore(e, card));
        });
        card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
        card.addEventListener('drop', (e) => {
            if (!dragPageId) return;
            e.preventDefault();
            card.classList.remove('drop-before', 'drop-after');
            if (card.dataset.pageId !== dragPageId) {
                movePage(dragPageId, card.dataset.pageId, isBefore(e, card));
            }
        });
    }

    function movePage(sourceId, targetId, before) {
        const from = pages.findIndex((p) => p.id === sourceId);
        if (from === -1) return;
        const [moved] = pages.splice(from, 1);
        const target = pages.findIndex((p) => p.id === targetId);
        if (target === -1) { pages.splice(from, 0, moved); return; }
        pages.splice(before ? target : target + 1, 0, moved);
        afterReorder();
    }

    // ── Drag & drop: whole-file (block) move ─────────────────

    let dragFileId = null;

    function attachFileDrag(item) {
        item.addEventListener('dragstart', (e) => {
            dragFileId = item.dataset.fileId;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            dragFileId = null;
            item.classList.remove('dragging');
            clearDropMarkers(fileList);
        });
        item.addEventListener('dragover', (e) => {
            if (!dragFileId) return;
            e.preventDefault();
            if (item.dataset.fileId === dragFileId) return;
            markDrop(item, isBefore(e, item));
        });
        item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
        item.addEventListener('drop', (e) => {
            if (!dragFileId) return;
            e.preventDefault();
            item.classList.remove('drop-before', 'drop-after');
            if (item.dataset.fileId !== dragFileId) {
                moveFileBlock(dragFileId, item.dataset.fileId, isBefore(e, item));
            }
        });
    }

    /** Move every page of `sourceFileId` (kept in order) to sit before/after the
     *  target file's pages. Re-groups the file as a contiguous block. */
    function moveFileBlock(sourceFileId, targetFileId, before) {
        const block = pages.filter((p) => p.fileId === sourceFileId);
        if (!block.length) return;
        const rest = pages.filter((p) => p.fileId !== sourceFileId);

        const firstTarget = rest.findIndex((p) => p.fileId === targetFileId);
        let lastTarget = -1;
        rest.forEach((p, i) => { if (p.fileId === targetFileId) lastTarget = i; });
        if (firstTarget === -1) { pages = rest.concat(block); afterReorder(); return; }

        const at = before ? firstTarget : lastTarget + 1;
        pages = rest.slice(0, at).concat(block, rest.slice(at));
        afterReorder();
    }

    // ── Shared drag helpers ──────────────────────────────────

    /** True if the cursor is on the leading half of the element (axis-aware). */
    function isBefore(e, el) {
        const r = el.getBoundingClientRect();
        return r.width >= r.height
            ? e.clientX < r.left + r.width / 2
            : e.clientY < r.top + r.height / 2;
    }

    function markDrop(el, before) {
        clearDropMarkers(el.parentElement);
        el.classList.toggle('drop-before', before);
        el.classList.toggle('drop-after', !before);
    }

    function clearDropMarkers(container) {
        container?.querySelectorAll('.drop-before, .drop-after')
            .forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    }

    function afterReorder() {
        clearMergedResult(); // reordering invalidates a previous result
        render();
    }

    // ── Merge ────────────────────────────────────────────────

    async function mergePages() {
        if (!canMerge()) return;

        setMergeBusy(true);
        hideError();
        try {
            const out = await PDFDocument.create();
            for (const page of pages) {
                const src = filesById.get(page.fileId).doc;
                const [copied] = await out.copyPages(src, [page.srcIndex]);
                out.addPage(copied);
            }
            const bytes = await out.save();
            const blob = new Blob([bytes], { type: 'application/pdf' });

            clearMergedResult();
            mergedUrl = URL.createObjectURL(blob);
            downloadGroup.classList.remove('hidden');
            showToast(`${pages.length} halaman berhasil digabungkan`);
        } catch (err) {
            console.error('Merge failed:', err);
            showError('Gagal menggabungkan PDF. Pastikan semua file valid dan tidak terkunci.');
        } finally {
            setMergeBusy(false);
        }
    }

    // ── Download ─────────────────────────────────────────────

    function downloadMerged() {
        if (!mergedUrl) return;
        const a = document.createElement('a');
        a.href = mergedUrl;
        a.download = `merged_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function clearMergedResult() {
        if (mergedUrl) {
            URL.revokeObjectURL(mergedUrl);
            mergedUrl = null;
        }
        downloadGroup.classList.add('hidden');
    }

    // ── Merge button state ───────────────────────────────────
    // Enabled when there are pages AND (multiple files OR the order was changed),
    // and not already merged / not busy. Matches the requested rule:
    // single file → only after reordering; multiple files → as soon as uploaded.

    const isReordered = () => !sameOrder(pages.map((p) => p.id), naturalSnapshot);

    function canMerge() {
        return pages.length >= 1 && (filesById.size >= 2 || isReordered());
    }

    let mergeBusy = false;

    function updateMergeButton() {
        const ready = canMerge();
        const alreadyMerged = mergedUrl !== null;
        mergeBtn.disabled = mergeBusy || !ready || alreadyMerged;
        mergeLoader.classList.toggle('hidden', !mergeBusy);

        if (mergeBusy) {
            mergeBtnText.textContent = 'Menggabungkan…';
        } else if (pages.length === 0) {
            mergeBtnText.textContent = '🔗 Unggah PDF dulu';
        } else if (alreadyMerged) {
            mergeBtnText.textContent = '✓ Sudah digabungkan';
        } else if (!ready) {
            mergeBtnText.textContent = '🔁 Ubah urutan untuk menggabungkan';
        } else {
            mergeBtnText.textContent = `🔗 Gabungkan ${pages.length} halaman`;
        }
    }

    // ── UI helpers ───────────────────────────────────────────

    function setBusy(busy) {
        pagesBusy.classList.toggle('hidden', !busy);
        addMoreBtn.disabled = busy;
    }

    function setMergeBusy(busy) {
        mergeBusy = busy;
        updateMergeButton();
    }

    function showError(msg) {
        mergeError.textContent = '⚠️ ' + msg;
        mergeError.classList.remove('hidden');
    }

    function hideError() {
        mergeError.classList.add('hidden');
        mergeError.textContent = '';
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

    uploadArea.addEventListener('click', () => pdfInput.click());
    addMoreBtn.addEventListener('click', () => pdfInput.click());
    pdfInput.addEventListener('change', (e) => addFiles(e.target.files));

    [uploadArea, pageGrid].forEach((zone) => {
        zone.addEventListener('dragover', (e) => {
            if (dragPageId) return; // internal page reorder, not a file drop
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
        zone.addEventListener('drop', (e) => {
            if (dragPageId) return;
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        });
    });

    resetAllBtn.addEventListener('click', clearAll);
    mergeBtn.addEventListener('click', mergePages);
    downloadBtn.addEventListener('click', downloadMerged);

    render();
})();
