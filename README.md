# Offix

> The one that works offline.

Offix is a local-first toolkit of everyday document and photo utilities that run **entirely in your browser**. No accounts, no uploads, no cloud — your files (and the personal data in them) never leave your machine. A tiny Express server only serves the static pages and, optionally, saves generated photos to a local `output/` folder.

## Tools

| Tool | Page | What it does |
|---|---|---|
| 📸 **Timestamp Photo Generator** | [`index.html`](index.html) | Add a time, location, mini-map, and identity overlay onto a photo using HTML5 Canvas. Optionally reverse-geocode coordinates to an address. |
| 🗜️ **Compress PDF & Image** | [`compress.html`](compress.html) | Shrink a PDF or image below a target maximum size — 100% in-browser. |
| 📚 **Merge PDF** | [`merge.html`](merge.html) | Split PDFs into pages, reorder per-page or per-file with drag & drop, then merge into one document. |

## Tech stack

- **Backend:** Node.js + [Express](https://expressjs.com/) — static file serving + a single `POST /api/save-photo` endpoint.
- **Frontend:** Vanilla JavaScript (no framework), HTML5 Canvas, and plain CSS.
- **Bundled libraries** (served locally from [`libs/`](libs/)):
  - [pdf-lib](https://pdf-lib.js.org/) — PDF creation/merging
  - [pdf.js](https://mozilla.github.io/pdf.js/) — PDF rendering & page extraction
  - [Inter](https://rsms.me/inter/) — UI font
- **Map & geocoding** (the only internet-dependent parts): [Leaflet](https://leafletjs.com/) tiles via CDN and reverse geocoding for the timestamp overlay.

## Getting started

Requires [Node.js](https://nodejs.org/).

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open the app
#    http://localhost:3000
```

The server listens on port `3000` by default (override with the `PORT` environment variable).

## Project structure

```
.
├── server.js          # Express backend (static serving + /api/save-photo)
├── index.html         # Timestamp Photo Generator page
├── app.js             # Timestamp generator logic (Canvas, Leaflet, geocoding)
├── compress.html      # Compress PDF & Image page
├── compress.js        # Compression logic
├── merge.html         # Merge PDF page
├── merge.js           # Merge / split logic
├── style.css          # Shared styles
├── libs/              # Locally bundled JS libraries + fonts
├── docs/              # PRD + UI style guide
└── output/            # Generated photos (git-ignored)
```

## Privacy & local-first design

Offix is built so the core features work **fully offline on localhost**. Sensitive data — NIK, names, GPS coordinates, and photo EXIF — is processed in your browser and is **never sent to external services**. The only features that touch the internet are the map tiles and reverse geocoding used by the timestamp overlay; these are clearly optional.

## License

[MIT](LICENSE) © 2025 rizkinoordian
