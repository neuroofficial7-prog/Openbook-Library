"""External catalogue adapters for OpenBook Library.

Every adapter returns *normalized* book dicts (see `normalized`) built only from
what the provider actually reports. Availability is derived from provider data,
never assumed. Results are cached in MongoDB (`source_cache`) to respect rate limits.
"""
import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

UA = {"User-Agent": "OpenBookLibrary/1.0 (open-access discovery; contact: admin@openbook.local)"}
TIMEOUT = httpx.Timeout(45.0, connect=10.0)  # Gutendex topic queries can take ~30s uncached
_sem = asyncio.Semaphore(6)  # cap concurrent outbound calls (polite rate limiting)

AVAIL_RANK = {"READ ONLINE": 5, "READ AT SOURCE": 4, "BORROW TO READ": 3, "METADATA ONLY": 2, "NOT CURRENTLY AVAILABLE": 1}

SOURCE_STATUS: dict[str, dict] = {}

LANG_NAMES = {
    "en": "English", "eng": "English", "fr": "French", "fre": "French", "de": "German", "ger": "German",
    "es": "Spanish", "spa": "Spanish", "it": "Italian", "ita": "Italian", "pt": "Portuguese", "por": "Portuguese",
    "ru": "Russian", "rus": "Russian", "zh": "Chinese", "chi": "Chinese", "ja": "Japanese", "jpn": "Japanese",
    "hi": "Hindi", "hin": "Hindi", "lus": "Mizo", "fi": "Finnish", "fin": "Finnish", "nl": "Dutch", "dut": "Dutch",
    "sv": "Swedish", "swe": "Swedish", "la": "Latin", "lat": "Latin", "el": "Greek", "grc": "Ancient Greek",
    "bn": "Bengali", "ben": "Bengali", "ta": "Tamil", "tam": "Tamil", "ar": "Arabic", "ara": "Arabic",
}


def lang_name(code: Optional[str]) -> str:
    if not code:
        return "Unknown"
    return LANG_NAMES.get(code.lower(), code.upper() if len(code) <= 3 else code)


def normalized(**kw) -> dict:
    base = {
        "id": "", "source_name": "", "source_id": "", "title": "Untitled", "author": "Unknown author",
        "description": "", "isbn": [], "publication_year": None, "language": "Unknown", "country": None,
        "subjects": [], "genre": None, "category": None, "publisher": None, "cover_url": None,
        "source_url": None, "reader_url": None, "format": None, "licence": None, "copyright_status": None,
        "access_type": "metadata", "availability": "METADATA ONLY", "adult_content": False,
    }
    base.update({k: v for k, v in kw.items() if v is not None})
    return base


def _status(name: str, ok: bool, err: str = "") -> None:
    SOURCE_STATUS[name] = {"name": name, "ok": ok, "error": err[:160], "checked_at": datetime.now(timezone.utc).isoformat()}


async def _get_json(name: str, url: str, params: Optional[dict] = None) -> Any:
    async with _sem:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, headers=UA, follow_redirects=True) as c:
                r = await c.get(url, params=params)
                r.raise_for_status()
                _status(name, True)
                return r.json()
        except Exception as e:  # provider down / blocked: report, never crash the search
            _status(name, False, str(e) or e.__class__.__name__)
            return None


# ---------------- cache ----------------
class Cache:
    def __init__(self, db):
        self.col = db.source_cache

    async def get(self, key: str):
        d = await self.col.find_one({"key": key}, {"_id": 0, "data": 1, "expires_at": 1})
        if d and d["expires_at"] > datetime.now(timezone.utc).replace(tzinfo=None):
            return d["data"]
        return None

    async def set(self, key: str, data, hours: float = 6):
        exp = (datetime.now(timezone.utc) + timedelta(hours=hours)).replace(tzinfo=None)
        await self.col.update_one({"key": key}, {"$set": {"data": data, "expires_at": exp}}, upsert=True)

    async def remember_books(self, books: list[dict]):
        for b in books:
            await self.set(f"book:{b['id']}", b, hours=24 * 7)


# ---------------- Project Gutenberg (via Gutendex) ----------------
def _gut_author(name: str) -> str:
    if "," in name:
        last, first = name.split(",", 1)
        return f"{first.strip()} {last.strip()}"
    return name


def norm_gutenberg(b: dict) -> dict:
    fm = b.get("formats", {})
    has_text = any(k.startswith("text/plain") for k in fm)
    authors = b.get("authors") or []
    life = authors[0] if authors else {}
    summary = (b.get("summaries") or [""])[0].replace("(This is an automatically generated summary.)", "").strip()
    subjects = [s.split(" -- ")[0] for s in b.get("subjects", [])][:6]
    return normalized(
        id=f"gutenberg:{b['id']}", source_name="Project Gutenberg", source_id=str(b["id"]),
        title=b.get("title", "Untitled"), author=_gut_author(life.get("name", "Unknown author")),
        description=summary, language=lang_name((b.get("languages") or ["en"])[0]),
        publication_year=life.get("death_year") and None,  # Gutendex has no publication year; do not invent one
        subjects=subjects, genre=subjects[0] if subjects else None,
        cover_url=fm.get("image/jpeg"), source_url=f"https://www.gutenberg.org/ebooks/{b['id']}",
        reader_url=f"https://www.gutenberg.org/ebooks/{b['id']}.html.images", format="text" if has_text else "html",
        licence="Public domain in the USA (Project Gutenberg License)",
        copyright_status="public_domain" if not b.get("copyright") else "copyrighted",
        access_type="hosted_text" if has_text and not b.get("copyright") else "external_reader",
        availability="READ ONLINE" if has_text and not b.get("copyright") else "READ AT SOURCE",
        author_years=f"{life.get('birth_year') or '?'}–{life.get('death_year') or '?'}" if life else None,
        downloads=b.get("download_count"),
    )


async def gutenberg_list(cache: Cache, **params) -> list[dict]:
    key = "gut:" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    hit = await cache.get(key)
    if hit is not None:
        return hit
    data = await _get_json("Project Gutenberg", "https://gutendex.com/books/", params)
    books = [norm_gutenberg(b) for b in (data or {}).get("results", [])]
    if data is not None:
        await cache.set(key, books, hours=12)
        await cache.remember_books(books)
    return books


async def gutenberg_text_url(book_num: str) -> Optional[str]:
    data = await _get_json("Project Gutenberg", f"https://gutendex.com/books/{book_num}")
    if not data or data.get("copyright"):
        return None
    fm = data.get("formats", {})
    for k in ("text/plain; charset=utf-8", "text/plain; charset=us-ascii", "text/plain"):
        if k in fm:
            return fm[k]
    return next((v for k, v in fm.items() if k.startswith("text/plain")), None)


# ---------------- Open Library ----------------
OL_FIELDS = "key,title,author_name,first_publish_year,language,cover_i,ebook_access,ia,isbn,subject,publisher,lending_identifier_s"


def norm_openlibrary(d: dict) -> dict:
    access = d.get("ebook_access") or "no_ebook"
    ia = (d.get("ia") or [None])[0]
    work = d["key"].split("/")[-1]
    avail = {"public": "READ AT SOURCE", "borrowable": "BORROW TO READ", "printdisabled": "NOT CURRENTLY AVAILABLE"}.get(access, "METADATA ONLY")
    at = {"public": "external_reader", "borrowable": "borrow", "printdisabled": "unavailable"}.get(access, "metadata")
    langs = d.get("language") or []
    subjects = (d.get("subject") or [])[:6]
    return normalized(
        id=f"openlibrary:{work}", source_name="Open Library", source_id=work, title=d.get("title", "Untitled"),
        author=", ".join((d.get("author_name") or ["Unknown author"])[:2]), isbn=(d.get("isbn") or [])[:3],
        publication_year=d.get("first_publish_year"), language=("English" if "eng" in langs else lang_name(langs[0])) if langs else "Unknown",
        subjects=subjects, genre=subjects[0] if subjects else None, publisher=(d.get("publisher") or [None])[0],
        cover_url=f"https://covers.openlibrary.org/b/id/{d['cover_i']}-M.jpg" if d.get("cover_i") else None,
        source_url=f"https://openlibrary.org/works/{work}",
        reader_url=f"https://archive.org/details/{ia}" if ia and access in ("public", "borrowable") else None,
        licence="Varies by edition — see source", copyright_status="public_domain" if access == "public" else "unknown",
        access_type=at, availability=avail,
    )


async def openlibrary_search(cache: Cache, q: str, limit: int = 20, extra: str = "") -> list[dict]:
    query = (q + " " + extra).strip()
    key = f"ol:{query}:{limit}"
    hit = await cache.get(key)
    if hit is not None:
        return hit
    data = await _get_json("Open Library", "https://openlibrary.org/search.json", {"q": query, "limit": limit, "fields": OL_FIELDS})
    books = [norm_openlibrary(d) for d in (data or {}).get("docs", [])]
    if data is not None:
        await cache.set(key, books, hours=6)
        await cache.remember_books(books)
    return books


# ---------------- Internet Archive ----------------
IA_FL = ["identifier", "title", "creator", "year", "language", "collection", "licenseurl", "subject", "description", "publisher"]


def _first(v):
    return v[0] if isinstance(v, list) and v else v


def norm_ia(d: dict) -> dict:
    cols = d.get("collection") or []
    cols = cols if isinstance(cols, list) else [cols]
    ident = d["identifier"]
    if "inlibrary" in cols or "lendinglibrary" in cols:
        avail, at = "BORROW TO READ", "borrow"
    elif "printdisabled" in cols:
        avail, at = "NOT CURRENTLY AVAILABLE", "unavailable"
    else:
        avail, at = "READ AT SOURCE", "external_reader"
    langs = d.get("language") or []
    langs = langs if isinstance(langs, list) else [langs]
    lang = "Mizo" if any(str(x).lower() in ("lus", "mizo", "lushai") for x in langs) else lang_name(_first(langs))
    subj = d.get("subject") or []
    subj = subj if isinstance(subj, list) else [subj]
    desc = _first(d.get("description")) or ""
    if str(desc).startswith("Book Source:"):  # DLI scan metadata, not a real description
        desc = ""
    year = d.get("year")
    try:
        year = int(str(_first(year))[:4]) if year else None
    except ValueError:
        year = None
    return normalized(
        id=f"ia:{ident}", source_name="Internet Archive", source_id=ident, title=str(_first(d.get("title")) or ident),
        author=str(_first(d.get("creator")) or "Unknown author"), description=re.sub("<[^>]+>", "", str(desc))[:600],
        publication_year=year, language=lang, subjects=[str(s) for s in subj][:6], publisher=_first(d.get("publisher")),
        cover_url=f"https://archive.org/services/img/{ident}", source_url=f"https://archive.org/details/{ident}",
        reader_url=f"https://archive.org/details/{ident}" if at in ("external_reader", "borrow") else None,
        licence=d.get("licenseurl") or "Rights as stated by Internet Archive contributor",
        copyright_status="unknown", access_type=at, availability=avail,
        collections=[c for c in cols if not c.startswith("fav-")][:3],
    )


async def ia_search(cache: Cache, query: str, rows: int = 20, sort: str = "downloads desc") -> list[dict]:
    key = f"ia:{query}:{rows}:{sort}"
    hit = await cache.get(key)
    if hit is not None:
        return hit
    params = [("q", query), ("rows", rows), ("output", "json"), ("sort[]", sort)] + [("fl[]", f) for f in IA_FL]
    data = await _get_json("Internet Archive", "https://archive.org/advancedsearch.php", params)
    books = [norm_ia(d) for d in ((data or {}).get("response") or {}).get("docs", [])]
    if data is not None:
        await cache.set(key, books, hours=6)
        await cache.remember_books(books)
    return books


async def ia_detail(ident: str) -> Optional[dict]:
    data = await _get_json("Internet Archive", f"https://archive.org/metadata/{ident}")
    md = (data or {}).get("metadata")
    return norm_ia(md) if md else None


# ---------------- Directory of Open Access Books ----------------
def norm_doab(item: dict) -> Optional[dict]:
    md = {}
    for m in item.get("metadata", []):
        md.setdefault(m.get("key"), []).append(m.get("value"))
    handle = item.get("handle")
    if not handle:
        return None
    year = (md.get("dc.date.issued") or [None])[0]
    return normalized(
        id=f"doab:{handle.replace('/', '_')}", source_name="DOAB", source_id=handle,
        title=(md.get("dc.title") or ["Untitled"])[0], author=", ".join((md.get("dc.contributor.author") or md.get("dc.contributor.editor") or ["Unknown author"])[:2]),
        description=((md.get("dc.description.abstract") or [""])[0] or "")[:600], isbn=(md.get("oapen.identifier.isbn") or [])[:2],
        publication_year=int(year[:4]) if year and year[:4].isdigit() else None, language=lang_name((md.get("dc.language") or ["Unknown"])[0]),
        subjects=(md.get("dc.subject.other") or [])[:6], publisher=(md.get("publisher.name") or [None])[0],
        source_url=f"https://directory.doabooks.org/handle/{handle}", reader_url=f"https://directory.doabooks.org/handle/{handle}",
        licence=(md.get("dc.rights.uri") or md.get("dc.rights") or ["Open access"])[0], copyright_status="open_licence",
        access_type="external_reader", availability="READ AT SOURCE", category="Academic Books",
    )


async def doab_search(cache: Cache, q: str, limit: int = 15) -> list[dict]:
    key = f"doab:{q}:{limit}"
    hit = await cache.get(key)
    if hit is not None:
        return hit
    data = await _get_json("DOAB", "https://directory.doabooks.org/rest/search", {"query": q, "expand": "metadata", "limit": limit})
    books = [b for b in (norm_doab(i) for i in (data or []) if isinstance(data, list)) if b]
    if data is not None:
        await cache.set(key, books, hours=12)
        await cache.remember_books(books)
    return books


# ---------------- duplicate detection ----------------
def _norm_text(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def dedupe(books: list[dict]) -> list[dict]:
    """Merge records that share an ISBN, a source id, or the same title+author surname.
    The record with the best reading availability wins; other sources are kept as `also_at`."""
    out: list[dict] = []
    index: dict[str, int] = {}
    for b in books:
        surname = _norm_text((b.get("author") or "").split(",")[0].split()[-1] if b.get("author") else "")
        keys = [f"isbn:{i}" for i in b.get("isbn") or []] + [f"id:{b['id']}", f"ta:{_norm_text(b['title'])[:40]}:{surname}"]
        hit = next((index[k] for k in keys if k in index), None)
        if hit is None:
            b = {**b, "also_at": []}
            out.append(b)
            idx = len(out) - 1
        else:
            cur = out[hit]
            if AVAIL_RANK.get(b["availability"], 0) > AVAIL_RANK.get(cur["availability"], 0):
                b = {**b, "also_at": cur["also_at"] + [cur["source_name"]]}
                out[hit] = b
            elif b["source_name"] not in cur["also_at"] and b["source_name"] != cur["source_name"]:
                cur["also_at"].append(b["source_name"])
            idx = hit
        for k in keys:
            index[k] = idx
    return out


# ---------------- Gutenberg text → pages ----------------
def paginate_text(raw: str, page_chars: int = 2200) -> tuple[list[str], list[dict]]:
    start = re.search(r"\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n", raw, re.I)
    end = re.search(r"\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG", raw, re.I)
    body = raw[start.end() if start else 0: end.start() if end else len(raw)].replace("\r\n", "\n")
    paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n", body)]
    paras = [p for p in paras if p]
    pages, toc, cur = [], [], ""
    heading = re.compile(r"^(CHAPTER|BOOK|PART|ACT|CANTO|STAVE|LETTER|Chapter)\b[\w .:—-]{0,60}$")
    for p in paras:
        if heading.match(p) and len(p) < 80:
            if cur:
                pages.append(cur.strip())
                cur = ""
            words = p.split(" ", 1)
            label = (words[0].capitalize() + (" " + words[1] if len(words) > 1 else "")) if p.isupper() else p
            toc.append({"title": label, "page": len(pages)})
        if len(cur) + len(p) > page_chars and cur:
            pages.append(cur.strip())
            cur = ""
        cur += p + "\n\n"
    if cur.strip():
        pages.append(cur.strip())
    return pages or ["This text could not be prepared for reading."], toc[:200]
