# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start    # Start Express server on localhost:3000
```

No test or lint scripts are defined.

## Architecture

Single-page local web app (no framework, no database) for generating timestamped photos.

The user uploads a photo, sets identity/datetime/location, and generates a timestamped image with GPS overlay drawn on HTML5 Canvas. The output is downloaded directly and optionally saved to `/output/` on the server.

### Key files
| File | Role |
|---|---|
| `server.js` | Express backend — static file serving, `/api/save-photo` endpoint |
| `app.js` | Client-side photo generation — Canvas drawing, Leaflet map, geocoding |
| `index.html` / `style.css` | Single HTML page and styles |
| `output/` | Generated timestamped photos saved by the server |
| `docs/PRD_*.md` | Product Requirements Document — primary source of truth (behavior) |
| `docs/UI_STYLE_GUIDE.md` | UI/visual style guide — color tokens & component patterns; **read before building any new page** |

### API surface (`server.js`)
- `POST /api/save-photo` — save generated photo (base64) from canvas to `/output/`
- Static files served from root; photos served from `/output/`

## PRD-driven development

The PRD at `docs/PRD_Timestamp_Photo_Google_Form_Automation_Option_A.md` is the **source of truth** for the Generator feature (FR-01 to FR-09). Before any change:
1. Read and understand the relevant PRD section.
2. Map every implementation to a PRD feature ID in comments or commit notes.
3. If a request conflicts with the PRD, explain the conflict before changing code.
4. Do not add features not covered by the PRD.

## Key constraints

- **Local-first**: Core features work fully on localhost. No external services required except map tiles (Leaflet CDN) and reverse geocoding — label these as internet-dependent.
- **Sensitive data**: NIK, name, GPS coordinates, and photo EXIF are personal data. Do not send them to external services.
- **No new dependencies** unless strictly necessary and PRD-backed.
- **File validation**: Validate file type and size before processing. Never trust uploaded files.
- **Modular separation**: Keep UI logic, Canvas processing, file handling, and location logic in separate functions.

## After making changes

Follow this response format:
1. **Summary** – what changed
2. **PRD Mapping** – which FR-xx requirement it supports
3. **Files Changed** – list of modified files
4. **Important Implementation Notes** – key logic, assumptions, trade-offs
5. **Risks or Limitations** – internet dependencies, browser permissions, library limits
6. **Test Checklist** – normal cases, edge cases, failure cases to verify
