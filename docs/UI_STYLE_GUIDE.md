# UI Style Guide — Timestamp Photo Generator

> **Read this before building any new page or component.**
> Every new screen must reuse these tokens and patterns so the app stays visually consistent.
> Source of truth for **look & feel**; the PRD remains the source of truth for **behavior**.

The single implementation of these tokens lives in [`style.css`](../style.css) under `:root`.
Never hardcode a hex value in a component — always use a `var(--token)`. If a value is
missing, add a token here and in `:root` rather than inlining it.

---

## 1. Design language

A **flat, near-black, minimal dark UI**. Neutral surfaces (no purple/indigo tint),
a single **blue** accent for interactive/secondary elements, and a single **green**
for the primary action. Headings are solid white — no gradient text. Backgrounds are
essentially flat; any glow is barely perceptible.

Principles:
- **Calm & flat** — minimal glow, low-contrast borders, generous spacing.
- **One accent, one primary** — blue = "you can interact with this", green = "the main action".
- **Neutral grays** — surfaces and text are neutral (zinc-like), not blue-tinted.
- **Content first** — chrome stays quiet so the photo/preview is the focus.

---

## 2. Color tokens

### Surfaces
| Token | Value | Use |
|---|---|---|
| `--bg-primary` | `#0a0a0b` | Page background (near-black) |
| `--bg-secondary` | `#131316` | `<select>` option lists, raised fills |
| `--bg-card` | `rgba(20, 20, 23, 0.85)` | Panels / cards (with `backdrop-filter: blur`) |
| `--bg-glass` | `rgba(255, 255, 255, 0.03)` | Inputs, info boxes, subtle insets |

### Borders
| Token | Value | Use |
|---|---|---|
| `--border-color` | `rgba(255, 255, 255, 0.07)` | Default 1px borders & dividers |
| `--border-focus` | `rgba(59, 130, 246, 0.5)` | Focused input border |

### Text
| Token | Value | Use |
|---|---|---|
| `--text-primary` | `#f4f4f5` | Headings, primary text, values |
| `--text-secondary` | `#a1a1aa` | Labels, body, descriptions |
| `--text-muted` | `#71717a` | Hints, placeholders, footer |

### Accent — blue (interactive / secondary)
| Token | Value | Use |
|---|---|---|
| `--accent` | `#3b82f6` | Links, focus borders, secondary button text |
| `--accent-hover` | `#60a5fa` | Hover state for accent text |
| `--accent-glow` | `rgba(59, 130, 246, 0.18)` | Focus ring, subtle blue glow |

### Success — green (primary action)
| Token | Value | Use |
|---|---|---|
| `--success` | `#22c55e` | Primary button, success states, toast |
| `--success-hover` | `#16a34a` | Hover / darker stop |

### Status
| Token | Value | Use |
|---|---|---|
| `--danger` | `#ef4444` | Destructive actions, errors |
| `--warning` | `#f59e0b` | Warnings |

### Gradients
| Token | Value | Use |
|---|---|---|
| `--gradient-primary` | green `#22c55e → #16a34a` | **Primary** `.btn-primary` (Generate) |
| `--gradient-success` | green `#22c55e → #16a34a` | Download / success buttons |
| `--gradient-header` | blue `#3b82f6 → #2563eb` | Reserved blue accent gradient |
| `--gradient-danger` | red `#ef4444 → #dc2626` | Destructive buttons |

> **Rule:** the main action of a page is **green** (`.btn-primary`). Supporting actions
> (pick location, choose folder, etc.) are **blue-text on dark** (`.btn-accent`).

---

## 3. Shape, depth & motion

| Token | Value |
|---|---|
| `--radius-sm` | `8px` (inputs, buttons) |
| `--radius-md` | `12px` (upload area, canvas, map) |
| `--radius-lg` | `16px` |
| `--radius-xl` | `20px` (panels) |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.4)` |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.5)` (panel default) |
| `--shadow-lg` | `0 8px 32px rgba(0,0,0,0.6)` (panel hover) |
| `--transition` | `0.25s cubic-bezier(0.4, 0, 0.2, 1)` |

- Buttons lift `translateY(-1px)` on hover, `scale(0.98)` on active.
- Keep glows subtle — shadows are near-black, not colored, except focus rings.

---

## 4. Typography

- **Font:** `Inter` (Google Fonts), fallback to system sans-serif.
- **H1 (page title):** `2rem`, weight `700`, solid `--text-primary`, `letter-spacing: -0.02em`. **No gradient fill.**
- **Panel title:** `1.1rem`, weight `600`, `--text-primary`, mixed case (e.g. "Pengaturan").
- **Field label:** `0.78rem`, weight `600`, `--text-secondary`, **UPPERCASE**, `letter-spacing: 0.06em`.
- **Body / values:** `0.85–0.9rem`, `--text-secondary`.
- **Hints / footer:** `0.72–0.8rem`, `--text-muted`, often italic for hints.

---

## 5. Component patterns (reuse, don't reinvent)

- **Panel/card:** `.panel` — `--bg-card`, 1px `--border-color`, `--radius-xl`, `--shadow-md`, blur backdrop.
- **Primary action:** `.btn .btn-primary` — full-width green, the page's main verb.
- **Secondary action:** `.btn .btn-accent` — dark fill, blue text, 1px border (e.g. location/folder).
- **Download/confirm:** `.btn .btn-success` (filled) / `.btn-success.btn-outline` (outline).
- **Destructive:** `.btn .btn-secondary` or `.btn-danger` — turns red on hover.
- **Icon button:** `.btn-icon` — 42×42 square.
- **Inputs:** share one rule (`textarea, input, select`) — `--bg-glass` fill, focus shows blue border + `--accent-glow` ring.
- **Info box:** `.location-info` / `.folder-info` — `--bg-glass`, uppercase `--text-muted` label over a `--text-secondary` value.
- **Toast:** `.toast` bottom-center, green background, slides up on `.show`.
- **Loading:** `.btn-loader` spinner; always show progress and disable buttons during processing.

---

## 6. Layout

- App max width `1280px`, centered, `24px` padding.
- Main content: two-column grid `400px 1fr` (controls | preview).
- Collapses to a single column at `≤ 900px`; tighter padding at `≤ 480px`.
- Vertical rhythm: `.form-group` blocks separated by `~20px`.

---

## 7. Checklist for a new page/component

1. Use only `var(--token)` colors from this guide — no raw hex in components.
2. Wrap content in `.panel`; use existing `.btn-*`, input, and `.form-group` patterns.
3. Exactly one green `.btn-primary` per page for the main action; supporting actions use `.btn-accent`.
4. Labels are UPPERCASE `--text-secondary`; headings are solid white.
5. Honor radius/shadow/transition tokens; keep glows subtle.
6. Verify responsive behavior at 900px and 480px breakpoints.
7. If you need a value that isn't tokenized, add the token to `:root` **and** this doc.
