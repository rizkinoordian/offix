/**
 * Timestamp Photo Generator — app.js (PRD v1.3)
 * 100% client-side: overlay timestamp, GPS, map, address & identity onto photos
 * + inject EXIF metadata (GPS, DateTimeOriginal, UserComment) via piexifjs
 * + interactive Leaflet.js map picker for manual location correction (FR-04)
 * + auto reverse geocoding on pin change (FR-05)
 */

(function () {
    'use strict';

    // ── DOM Elements ─────────────────────────────────────────────
    const photoInput = document.getElementById('photoInput');
    const uploadArea = document.getElementById('uploadArea');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const photoPreview = document.getElementById('photoPreview');
    const clearPhotoBtn = document.getElementById('clearPhotoBtn');
    const identityInput = document.getElementById('identityInput');
    const datetimeInput = document.getElementById('datetimeInput');
    const getLocationBtn = document.getElementById('getLocationBtn');
    const locationLoader = document.getElementById('locationLoader');
    const locationBtnText = document.getElementById('locationBtnText');
    const locationInfo = document.getElementById('locationInfo');
    const coordsDisplay = document.getElementById('coordsDisplay');
    const addressDisplay = document.getElementById('addressDisplay');
    const mapContainer = document.getElementById('mapContainer');
    const generateBtn = document.getElementById('generateBtn');
    const downloadGroup = document.getElementById('downloadGroup');
    const downloadJpgBtn = document.getElementById('downloadJpgBtn');
    const downloadPngBtn = document.getElementById('downloadPngBtn');
    const resultCanvas = document.getElementById('resultCanvas');
    const canvasPlaceholder = document.getElementById('canvasPlaceholder');

    // Download folder elements
    const downloadFolderGroup = document.getElementById('downloadFolderGroup');
    const setFolderBtn = document.getElementById('setFolderBtn');
    const setFolderBtnText = document.getElementById('setFolderBtnText');
    const folderInfo = document.getElementById('folderInfo');
    const folderName = document.getElementById('folderName');
    const clearFolderBtn = document.getElementById('clearFolderBtn');
    const saveToast = document.getElementById('saveToast');
    const saveToastText = document.getElementById('saveToastText');

    // ── State ────────────────────────────────────────────────────
    let uploadedImage = null;  // HTMLImageElement
    let latitude = null;
    let longitude = null;
    let addressLines = [];     // Array of address strings
    let mapTileImage = null;   // HTMLImageElement of map tile
    let generatedDataUrl = null;

    // Download folder state
    let downloadDirHandle = null;

    // Leaflet map state
    let leafletMap = null;
    let leafletMarker = null;
    let reverseGeocodeTimer = null; // debounce timer

    // ── Initialize ───────────────────────────────────────────────
    function init() {
        // Set datetime to now
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const local = new Date(now.getTime() - offset * 60000);
        datetimeInput.value = local.toISOString().slice(0, 16);

        // Event listeners
        uploadArea.addEventListener('click', () => photoInput.click());
        uploadArea.addEventListener('dragover', onDragOver);
        uploadArea.addEventListener('dragleave', onDragLeave);
        uploadArea.addEventListener('drop', onDrop);
        photoInput.addEventListener('change', onFileSelected);
        clearPhotoBtn.addEventListener('click', clearPhoto);
        getLocationBtn.addEventListener('click', getLocation);
        generateBtn.addEventListener('click', generate);
        downloadJpgBtn.addEventListener('click', () => download('jpg'));
        downloadPngBtn.addEventListener('click', () => download('png'));

        // Download folder feature
        initDownloadFolder();

        // Enable generate button when photo is ready
        updateGenerateButton();
    }

    // ── FR-01: Photo Upload ──────────────────────────────────────
    function onDragOver(e) {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    }

    function onDragLeave(e) {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
    }

    function onDrop(e) {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.match(/^image\/(jpeg|png)$/)) {
            loadImage(file);
        }
    }

    function onFileSelected(e) {
        const file = e.target.files[0];
        if (file) loadImage(file);
    }

    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                uploadedImage = img;
                photoPreview.src = e.target.result;
                photoPreview.classList.remove('hidden');
                uploadPlaceholder.classList.add('hidden');
                clearPhotoBtn.style.display = '';
                updateGenerateButton();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function clearPhoto() {
        uploadedImage = null;
        photoInput.value = '';
        photoPreview.src = '';
        photoPreview.classList.add('hidden');
        uploadPlaceholder.classList.remove('hidden');
        clearPhotoBtn.style.display = 'none';
        updateGenerateButton();
    }

    // ── FR-04: Geolocation & Interactive Map Picker ──────────────
    function getLocation() {
        if (!navigator.geolocation) {
            alert('Geolokasi tidak didukung oleh browser Anda.');
            return;
        }

        // Show loader
        locationLoader.classList.remove('hidden');
        locationBtnText.textContent = 'Mengambil lokasi...';
        getLocationBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;

                // Update location and UI
                updateLocation(lat, lon);

                locationLoader.classList.add('hidden');
                locationBtnText.textContent = 'Perbarui Lokasi GPS';
                getLocationBtn.disabled = false;
            },
            (err) => {
                alert('Gagal mengambil lokasi: ' + err.message);
                locationLoader.classList.add('hidden');
                locationBtnText.textContent = 'Ambil Lokasi Saat Ini';
                getLocationBtn.disabled = false;
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    }

    /**
     * Central function: update lat/lng state, move map marker,
     * trigger reverse geocoding, update map tile, and refresh UI.
     */
    function updateLocation(lat, lon) {
        latitude = lat;
        longitude = lon;

        // Update coordinate display
        coordsDisplay.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        locationInfo.classList.remove('hidden');

        // Initialize or update Leaflet map
        initOrUpdateMap(lat, lon);

        // Reverse geocode (debounced)
        debouncedReverseGeocode(lat, lon);

        // Fetch static map tile for overlay
        loadMapTile(lat, lon);
    }

    // ── Leaflet Map ─────────────────────────────────────────────
    function initOrUpdateMap(lat, lon) {
        // Show map container
        mapContainer.classList.remove('hidden');

        if (!leafletMap) {
            // First-time initialization
            leafletMap = L.map('map').setView([lat, lon], 16);

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }).addTo(leafletMap);

            // Draggable marker
            leafletMarker = L.marker([lat, lon], { draggable: true }).addTo(leafletMap);

            // On marker drag end → update location
            leafletMarker.on('dragend', function (e) {
                const pos = e.target.getLatLng();
                updateLocation(pos.lat, pos.lng);
            });

            // On map click → move marker
            leafletMap.on('click', function (e) {
                updateLocation(e.latlng.lat, e.latlng.lng);
            });

            // Fix Leaflet rendering issue when map is initially hidden
            setTimeout(() => leafletMap.invalidateSize(), 200);
        } else {
            // Update existing map
            leafletMap.setView([lat, lon], leafletMap.getZoom());
            leafletMarker.setLatLng([lat, lon]);
        }
    }

    // ── FR-05: Reverse Geocoding (Auto on pin change) ───────────
    function debouncedReverseGeocode(lat, lon) {
        // Debounce to avoid hammering Nominatim on rapid drags
        if (reverseGeocodeTimer) clearTimeout(reverseGeocodeTimer);
        addressDisplay.textContent = 'Memuat alamat...';

        reverseGeocodeTimer = setTimeout(() => {
            reverseGeocode(lat, lon);
        }, 400);
    }

    async function reverseGeocode(lat, lon) {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
                { headers: { 'Accept-Language': 'id' } }
            );
            const data = await res.json();
            const a = data.address || {};

            // Build address lines per PRD: Jalan, Kelurahan, Kecamatan, Kota
            addressLines = [];
            const road = a.road || a.pedestrian || a.footway || '';
            const village = a.village || a.suburb || a.neighbourhood || '';
            const subdistrict = a.county || a.city_district || a.district || '';
            const city = a.city || a.town || a.municipality || a.state || '';

            if (road) addressLines.push(road);
            if (village) addressLines.push('Kel. ' + village);
            if (subdistrict) addressLines.push('Kec. ' + subdistrict);
            if (city) addressLines.push(city);

            addressDisplay.textContent = addressLines.join(', ') || data.display_name || '—';
        } catch (err) {
            addressDisplay.textContent = 'Gagal mendapatkan alamat';
            addressLines = [];
            console.error('Reverse geocoding error:', err);
        }
    }

    // ── FR-06: Static Map Tile (for photo overlay) ──────────────
    // Loads a 3×3 grid of tiles centered on the pin location,
    // then crops to a square centered exactly on the coordinates.
    // This guarantees the pin is always in the center of the map overlay.
    function loadMapTile(lat, lon) {
        const zoom = 16;
        const TILE_PX = 256; // standard OSM tile size
        const GRID = 3;      // 3×3 grid

        // Exact fractional tile coordinates
        const tileXExact = (lon + 180) / 360 * Math.pow(2, zoom);
        const tileYExact = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);

        // Integer tile indices for the center tile
        const centerTileX = Math.floor(tileXExact);
        const centerTileY = Math.floor(tileYExact);

        // Pixel position of the pin within the 3×3 stitched image
        // The center tile starts at (1*TILE_PX, 1*TILE_PX) in the stitched image
        const pinPixelX = (1 + (tileXExact - centerTileX)) * TILE_PX;
        const pinPixelY = (1 + (tileYExact - centerTileY)) * TILE_PX;

        // Load all 9 tiles
        const totalTiles = GRID * GRID;
        let loadedCount = 0;
        let failedCount = 0;
        const tileImages = new Array(totalTiles);

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const tx = centerTileX + dx;
                const ty = centerTileY + dy;
                const idx = (dy + 1) * GRID + (dx + 1);
                const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;

                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function () {
                    tileImages[idx] = img;
                    loadedCount++;
                    if (loadedCount + failedCount === totalTiles) {
                        stitchTiles(tileImages, pinPixelX, pinPixelY, TILE_PX, GRID);
                    }
                };
                img.onerror = function () {
                    tileImages[idx] = null;
                    failedCount++;
                    if (loadedCount + failedCount === totalTiles) {
                        stitchTiles(tileImages, pinPixelX, pinPixelY, TILE_PX, GRID);
                    }
                };
                img.src = tileUrl;
            }
        }
    }

    /**
     * Stitch loaded tiles into a single image, then crop a square centered
     * on the pin location. The result is stored in mapTileImage.
     */
    function stitchTiles(tileImages, pinPixelX, pinPixelY, tilePx, grid) {
        const fullW = grid * tilePx;
        const fullH = grid * tilePx;

        // Create offscreen canvas for stitching
        const stitchCanvas = document.createElement('canvas');
        stitchCanvas.width = fullW;
        stitchCanvas.height = fullH;
        const sCtx = stitchCanvas.getContext('2d');

        for (let i = 0; i < tileImages.length; i++) {
            if (!tileImages[i]) continue;
            const col = i % grid;
            const row = Math.floor(i / grid);
            sCtx.drawImage(tileImages[i], col * tilePx, row * tilePx, tilePx, tilePx);
        }

        // Crop a square centered on the pin
        const cropSize = tilePx; // output = one tile size (256px), centered on pin
        let cropX = Math.round(pinPixelX - cropSize / 2);
        let cropY = Math.round(pinPixelY - cropSize / 2);
        // Clamp to stitched canvas bounds
        cropX = Math.max(0, Math.min(cropX, fullW - cropSize));
        cropY = Math.max(0, Math.min(cropY, fullH - cropSize));

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropSize;
        cropCanvas.height = cropSize;
        const cCtx = cropCanvas.getContext('2d');
        cCtx.drawImage(stitchCanvas, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);

        // Convert to an Image element
        const finalImg = new Image();
        finalImg.onload = function () {
            mapTileImage = finalImg;
            // Store the crop offset so pin drawing knows the pin is at center
            mapTileImage._pinCentered = true;
        };
        finalImg.src = cropCanvas.toDataURL('image/png');
    }

    function lon2tile(lon, zoom) {
        return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    }

    function lat2tile(lat, zoom) {
        return Math.floor(
            (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
        );
    }

    // ── Canvas Rendering ────────────────────────────────────────
    function generate() {
        if (!uploadedImage) return;

        const canvas = resultCanvas;
        const ctx = canvas.getContext('2d');

        const imgW = uploadedImage.naturalWidth;
        const imgH = uploadedImage.naturalHeight;
        canvas.width = imgW;
        canvas.height = imgH;

        // Draw original photo
        ctx.drawImage(uploadedImage, 0, 0, imgW, imgH);

        // Overlay sizing — scale based on image dimensions
        const scale = Math.max(imgW, imgH) / 1600;
        const fontSize = Math.round(32 * scale);
        const padding = Math.round(28 * scale);
        const lineHeight = Math.round(44 * scale);
        const mapSize = Math.round(360 * scale);

        ctx.font = `600 ${fontSize}px 'Inter', sans-serif`;
        ctx.textBaseline = 'top';

        // Collect overlay text lines
        const lines = [];

        // Line 1: Date & Time
        const dt = datetimeInput.value;
        if (dt) {
            const d = new Date(dt);
            // Add random seconds (0-59) since datetime-local doesn't include seconds
            d.setSeconds(Math.floor(Math.random() * 60));
            const formatted = formatDateTime(d);
            lines.push({ text: '🕒 ' + formatted, type: 'datetime' });
        }

        // Line 2: Coordinates
        if (latitude !== null && longitude !== null) {
            lines.push({ text: `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, type: 'coords' });
        }

        // Lines 3-4: Address
        for (const addr of addressLines) {
            lines.push({ text: '📌 ' + addr, type: 'address' });
        }

        // Identity lines
        const identity = identityInput.value.trim();
        if (identity) {
            const identLines = identity.split('\n').filter(l => l.trim());
            for (const line of identLines) {
                lines.push({ text: '🪪 ' + line, type: 'identity' });
            }
        }

        // Calculate text block dimensions
        const textWidths = lines.map(l => ctx.measureText(l.text).width);
        const maxTextWidth = Math.max(...textWidths, 0);
        const textBlockWidth = maxTextWidth + padding * 2;
        const textBlockHeight = lines.length * lineHeight + padding * 2;

        // ── Draw Map Tile (Top-Left) ──
        if (mapTileImage) {
            const mapX = padding;
            const mapY = padding;

            // Semi-transparent background behind map
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            roundRect(ctx, mapX - 4, mapY - 4, mapSize + 8, mapSize + 8, 8 * scale);
            ctx.fill();

            // Draw map tile with rounded corners
            ctx.save();
            roundRect(ctx, mapX, mapY, mapSize, mapSize, 6 * scale);
            ctx.clip();
            ctx.drawImage(mapTileImage, mapX, mapY, mapSize, mapSize);
            ctx.restore();

            // ── Draw Pin Marker on the map tile ──
            if (latitude !== null && longitude !== null) {
                // The map tile is now pre-cropped and centered on the pin location,
                // so the pin is always at the center of the map overlay.
                const pinX = mapX + mapSize / 2;
                const pinY = mapY + mapSize / 2;
                // Draw teardrop pin marker
                const pinSize = 12 * scale;
                ctx.save();
                // Pin shadow
                ctx.beginPath();
                ctx.ellipse(pinX, pinY + pinSize * 0.1, pinSize * 0.35, pinSize * 0.12, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fill();
                // Teardrop shape
                ctx.beginPath();
                ctx.moveTo(pinX, pinY);
                ctx.bezierCurveTo(pinX - pinSize * 0.6, pinY - pinSize * 0.8, pinX - pinSize * 0.6, pinY - pinSize * 1.6, pinX, pinY - pinSize * 1.8);
                ctx.bezierCurveTo(pinX + pinSize * 0.6, pinY - pinSize * 1.6, pinX + pinSize * 0.6, pinY - pinSize * 0.8, pinX, pinY);
                ctx.closePath();
                ctx.fillStyle = '#e74c3c';
                ctx.fill();
                ctx.strokeStyle = '#c0392b';
                ctx.lineWidth = 1.5 * scale;
                ctx.stroke();
                // White circle inside the pin
                ctx.beginPath();
                ctx.arc(pinX, pinY - pinSize * 1.15, pinSize * 0.28, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.restore();
            }

            // Map border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2 * scale;
            roundRect(ctx, mapX, mapY, mapSize, mapSize, 6 * scale);
            ctx.stroke();
        }

        // ── Draw Text Overlay (Top-Right) ──
        if (lines.length > 0) {
            const blockX = imgW - textBlockWidth - padding;
            const blockY = padding;

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            roundRect(ctx, blockX, blockY, textBlockWidth, textBlockHeight, 8 * scale);
            ctx.fill();

            // Subtle border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1 * scale;
            roundRect(ctx, blockX, blockY, textBlockWidth, textBlockHeight, 8 * scale);
            ctx.stroke();

            // Draw each line
            ctx.fillStyle = '#ffffff';
            ctx.font = `600 ${fontSize}px 'Inter', sans-serif`;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4 * scale;
            ctx.shadowOffsetX = 1 * scale;
            ctx.shadowOffsetY = 1 * scale;

            for (let i = 0; i < lines.length; i++) {
                const textX = blockX + padding;
                const textY = blockY + padding + i * lineHeight;
                ctx.fillText(lines[i].text, textX, textY);
            }

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        // Show canvas, hide placeholder
        canvasPlaceholder.classList.add('hidden');
        resultCanvas.classList.remove('hidden');
        downloadGroup.classList.remove('hidden');

        // Store for download with EXIF
        generatedDataUrl = canvas.toDataURL('image/jpeg', 0.95);

        // FR-03: Auto-save to server output folder
        savePhotoToServer(generatedDataUrl);
    }

    /**
     * FR-03: Save generated photo to server output folder.
     * Silently fails if server is not running (app still works standalone).
     */
    async function savePhotoToServer(dataUrl) {
        try {
            const res = await fetch('/api/save-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataUrl: dataUrl,
                    filename: `timestamp_photo_${Date.now()}.jpg`
                })
            });
            if (res.ok) {
                const data = await res.json();
                console.log('Photo saved to server:', data.filename);
            }
        } catch {
            // Server not running — that's OK, app works standalone
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    function formatDateTime(d) {
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const day = days[d.getDay()];
        const date = d.getDate();
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        return `${day}, ${date} ${month} ${year} ${hours}:${mins}:${secs}`;
    }

    // ── FR-07: Download with EXIF ───────────────────────────────
    const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB

    function dataUrlToBytes(dataUrl) {
        // Base64 data URL → approximate byte size
        const base64 = dataUrl.split(',')[1] || '';
        return Math.ceil(base64.length * 3 / 4);
    }

    function scaleCanvas(srcCanvas, scaleFactor) {
        const c = document.createElement('canvas');
        c.width = Math.round(srcCanvas.width * scaleFactor);
        c.height = Math.round(srcCanvas.height * scaleFactor);
        const ctx = c.getContext('2d');
        ctx.drawImage(srcCanvas, 0, 0, c.width, c.height);
        return c;
    }

    function download(format) {
        let canvas = resultCanvas;

        if (format === 'png') {
            let dataUrl = canvas.toDataURL('image/png');
            // Scale down if over 1 MB
            let scale = 1;
            while (dataUrlToBytes(dataUrl) > MAX_FILE_BYTES && scale > 0.2) {
                scale -= 0.1;
                canvas = scaleCanvas(resultCanvas, scale);
                dataUrl = canvas.toDataURL('image/png');
            }
            triggerDownload(dataUrl, `timestamp_photo_${Date.now()}.png`);
            return;
        }

        // For JPG: compress to fit under 1 MB
        let quality = 0.92;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Step 1: lower quality
        while (dataUrlToBytes(dataUrl) > MAX_FILE_BYTES && quality > 0.1) {
            quality -= 0.05;
            dataUrl = canvas.toDataURL('image/jpeg', Math.max(quality, 0.1));
        }

        // Step 2: if still too big, scale down the canvas
        let scale = 1;
        while (dataUrlToBytes(dataUrl) > MAX_FILE_BYTES && scale > 0.2) {
            scale -= 0.1;
            canvas = scaleCanvas(resultCanvas, scale);
            dataUrl = canvas.toDataURL('image/jpeg', Math.max(quality, 0.1));
        }

        try {
            dataUrl = injectExifMetadata(dataUrl);
        } catch (err) {
            console.warn('EXIF injection failed, downloading without metadata:', err);
        }

        triggerDownload(dataUrl, `timestamp_photo_${Date.now()}.jpg`);
    }

    function injectExifMetadata(jpegDataUrl) {
        if (typeof piexif === 'undefined') {
            console.warn('piexifjs not loaded');
            return jpegDataUrl;
        }

        const exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {} };

        // DateTimeOriginal
        const dt = datetimeInput.value;
        if (dt) {
            const d = new Date(dt);
            const exifDate = formatExifDate(d);
            exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = exifDate;
            exifObj['0th'][piexif.ImageIFD.DateTime] = exifDate;
        }

        // GPS
        if (latitude !== null && longitude !== null) {
            exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? 'N' : 'S';
            exifObj['GPS'][piexif.GPSIFD.GPSLatitude] = degToDmsRational(Math.abs(latitude));
            exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? 'E' : 'W';
            exifObj['GPS'][piexif.GPSIFD.GPSLongitude] = degToDmsRational(Math.abs(longitude));
        }

        // UserComment (identity)
        const identity = identityInput.value.trim();
        if (identity) {
            // piexifjs UserComment needs specific encoding
            exifObj['Exif'][piexif.ExifIFD.UserComment] = 'ASCII\0\0\0' + identity;
        }

        const exifBytes = piexif.dump(exifObj);
        return piexif.insert(exifBytes, jpegDataUrl);
    }

    function formatExifDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `${y}:${m}:${dd} ${h}:${min}:${s}`;
    }

    function degToDmsRational(degFloat) {
        const deg = Math.floor(degFloat);
        const minFloat = (degFloat - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = Math.round((minFloat - min) * 6000);
        return [
            [deg, 1],
            [min, 1],
            [sec, 100]
        ];
    }

    async function triggerDownload(dataUrl, filename) {
        // If we have a folder handle, write directly to it
        if (downloadDirHandle) {
            try {
                // Verify we still have permission
                const perm = await downloadDirHandle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    const req = await downloadDirHandle.requestPermission({ mode: 'readwrite' });
                    if (req !== 'granted') {
                        throw new Error('Permission denied');
                    }
                }

                // Convert data URL to blob
                const blob = dataUrlToBlob(dataUrl);

                // Create / overwrite the file in the chosen folder
                const fileHandle = await downloadDirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();

                showToast(`✅ Tersimpan ke ${downloadDirHandle.name}/${filename}`);
                return;
            } catch (err) {
                console.warn('File System Access write failed, falling back:', err);
                // Fall through to normal download
            }
        }

        // Fallback: normal <a> download
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const bstr = atob(parts[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            u8arr[i] = bstr.charCodeAt(i);
        }
        return new Blob([u8arr], { type: mime });
    }

    // ── Download Folder (File System Access API) ────────────────
    const DB_NAME = 'TimestampPhotoApp';
    const DB_STORE = 'settings';
    const DB_KEY = 'downloadDirHandle';

    function openSettingsDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(DB_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveDirHandleToDB(handle) {
        const db = await openSettingsDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put(handle, DB_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function loadDirHandleFromDB() {
        try {
            const db = await openSettingsDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(DB_STORE, 'readonly');
                const req = tx.objectStore(DB_STORE).get(DB_KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch {
            return null;
        }
    }

    async function removeDirHandleFromDB() {
        try {
            const db = await openSettingsDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).delete(DB_KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch {
            // ignore
        }
    }

    async function initDownloadFolder() {
        // Feature detection: hide UI if not supported
        if (!('showDirectoryPicker' in window)) {
            downloadFolderGroup.classList.add('hidden');
            return;
        }

        // Wire up buttons
        setFolderBtn.addEventListener('click', setDownloadFolder);
        clearFolderBtn.addEventListener('click', clearDownloadFolder);

        // Try to restore saved handle
        try {
            const saved = await loadDirHandleFromDB();
            if (saved) {
                downloadDirHandle = saved;
                updateFolderUI(saved.name);
            }
        } catch (err) {
            console.warn('Could not restore download folder:', err);
        }
    }

    async function setDownloadFolder() {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            downloadDirHandle = handle;
            updateFolderUI(handle.name);
            await saveDirHandleToDB(handle);
        } catch (err) {
            // User cancelled the picker — do nothing
            if (err.name !== 'AbortError') {
                console.error('Folder picker error:', err);
            }
        }
    }

    function clearDownloadFolder() {
        downloadDirHandle = null;
        folderInfo.classList.add('hidden');
        setFolderBtnText.textContent = 'Atur Folder Download';
        removeDirHandleFromDB();
    }

    function updateFolderUI(name) {
        folderName.textContent = name;
        folderInfo.classList.remove('hidden');
        setFolderBtnText.textContent = 'Ganti Folder';
    }

    function showToast(message) {
        saveToastText.textContent = message;
        saveToast.classList.remove('hidden');
        // Force reflow for transition
        saveToast.offsetHeight;
        saveToast.classList.add('show');
        setTimeout(() => {
            saveToast.classList.remove('show');
            setTimeout(() => saveToast.classList.add('hidden'), 300);
        }, 2500);
    }

    // ── Helpers ──────────────────────────────────────────────────
    function updateGenerateButton() {
        generateBtn.disabled = !uploadedImage;
    }

    // ── Start ────────────────────────────────────────────────────
    init();
})();
