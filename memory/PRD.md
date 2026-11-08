# OpenBook Library — PRD

## Original problem statement
"Build a mobile app: MASTER DEVELOPMENT PROMPT — OPENBOOK LIBRARY" — a global digital library with an immersive 3D bookshelf, Mizo Heritage Library, unified legal open-access discovery, a customizable reader, accounts, a separate age-gated 18+ section and an admin dashboard (/admin). Palette #F3F0E9 / #202020 / #77736D / #A58A58 / #E8E4DC / #171717 / #D8D2C8, editorial serif + sans fonts.

User choices: open via Link (Expo) + "make it like apk sideloading"; Email/Password login; sources Open Library, Project Gutenberg, Internet Archive, open-access academic (DOAB); email provider = "other" (not configured yet).

## Architecture
- Expo (expo-router) app: tabs Library / Search / Mizo / My Shelf; stack routes book/[id], read/[id], category/[slug], after-dark, auth, submit, info/[page], admin/* (index, books, edit, submissions, users, audit).
- FastAPI (`/app/backend/server.py`, `auth.py`, `sources.py`), MongoDB collections: users, books, submissions, saved_books, reading_progress, bookmarks, user_settings, audit_logs, search_log, source_cache (TTL), book_texts, reset_tokens.
- Fonts: Playfair Display, DM Sans, OpenDyslexic (bundled TTF/OTF).

## Implemented (2026-11-08)
- 3D bookshelf (spines → cover on select, neighbours tilt/shift, swipe, prev/next, hover, keyboard on web, reduced motion) with dynamic details.
- Home: hero shelf, Continue Reading, featured, 15 category rooms, Mizo Heritage section (puan band), international collections (7 languages), recently added, After Dark entry, footer + info pages.
- Mizo Heritage Library: 12 keyword-matched collections from Internet Archive (DLI) + Open Library (lus) + OpenBook submissions; Mizo search, author browsing, year filters. No invented records.
- Unified search: Gutenberg, Open Library, IA, DOAB (403 from preview IP — shown as unreachable), local; fields, filters, normalized metadata, duplicate detection, availability labels, grid/list/shelf views, recent/popular searches & authors.
- Reader (Gutenberg public-domain text + admin-hosted text): 6 themes, 3 fonts incl. dyslexia, 14–32px, spacing/width/margins, paginated/continuous, focus & full screen, TOC, bookmarks, progress; local for guests, synced for accounts.
- Accounts: register/login/logout (token revoke), profile (name, language, favourite categories), saved, history, bookmarks; throttled login.
- After Dark 18+: age gate with checkbox, server header check, adult content excluded from general shelves/search/detail.
- Submissions with permission declaration + duplicate check → pending queue.
- Admin: separate login, roles super_admin/admin/editor, stats + charts, source status, book CRUD/publish/unpublish/archive/delete, Mizo & 18+ filtered management, submission approve/reject, user roles/disable, audit logs.

## Placeholders / not yet built
- Password-reset email sending (provider not chosen; flow + tokens exist, UI explains).
- PDF/EPUB file upload & reading (needs object storage), profile picture upload.
- Admin modules: Categories, Authors, Publishers, Licences, Reports, Site settings.
- Bloom Library / Bharatavani / NDLI connectors; PWA/SEO (web) items.

## Backlog
- P0: choose email provider for reset emails
- P1: PDF/EPUB upload + reader, profile photos, Bloom Library source
- P2: remaining admin modules, reports export, Android APK build via Publish
