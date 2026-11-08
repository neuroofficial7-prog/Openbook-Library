"""OpenBook Library API (FastAPI + MongoDB). All routes are under /api."""
import asyncio
import logging
import os
import re
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

import httpx
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import auth  # noqa: E402  (needs env loaded)
import sources as src  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
auth.init(db)
cache = src.Cache(db)
log = logging.getLogger("openbook")

INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "books": [IndexModel([("publication_status", ASCENDING), ("adult_content", ASCENDING), ("created_at", DESCENDING)], name="status_adult_created"),
              IndexModel([("isbn", ASCENDING)], name="isbn"), IndexModel([("category", ASCENDING)], name="category")],
    "source_cache": [IndexModel([("key", ASCENDING)], name="key", unique=True),
                     IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0)],
    "book_texts": [IndexModel([("book_id", ASCENDING)], name="book_id", unique=True)],
    "reading_progress": [IndexModel([("user_id", ASCENDING), ("book_id", ASCENDING)], name="user_book", unique=True),
                         IndexModel([("updated_at", DESCENDING)], name="updated")],
    "bookmarks": [IndexModel([("user_id", ASCENDING), ("book_id", ASCENDING)], name="user_book")],
    "saved_books": [IndexModel([("user_id", ASCENDING), ("book_id", ASCENDING)], name="user_book", unique=True)],
    "user_settings": [IndexModel([("user_id", ASCENDING)], name="user", unique=True)],
    "submissions": [IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created")],
    "audit_logs": [IndexModel([("created_at", DESCENDING)], name="created")],
    "search_log": [IndexModel([("q", ASCENDING)], name="q")],
    "reset_tokens": [IndexModel([("token_hash", ASCENDING)], name="th"),
                     IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                log.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI(title="OpenBook Library API")


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def oid(v: str) -> ObjectId:
    try:
        return ObjectId(v)
    except Exception:
        raise HTTPException(404, "Not found")


def book_out(d: dict) -> dict:
    """Mongo book document -> normalized public dict (no _id)."""
    b = {k: v for k, v in d.items() if k not in ("_id", "content_text")}
    b["id"] = f"local:{d['_id']}"
    b["source_name"] = "OpenBook Library"
    b["source_id"] = str(d["_id"])
    b["availability"] = {"hosted_text": "READ ONLINE", "external_reader": "READ AT SOURCE", "borrow": "BORROW TO READ",
                         "metadata": "METADATA ONLY", "unavailable": "NOT CURRENTLY AVAILABLE"}.get(d.get("access_type"), "METADATA ONLY")
    if d.get("access_type") == "hosted_text" and not d.get("content_text"):
        b["availability"] = "NOT CURRENTLY AVAILABLE"
    b.setdefault("subjects", [])
    return b


async def audit(user: dict, action: str, target: str = "", detail: str = ""):
    await db.audit_logs.insert_one({"user_email": user["email"], "action": action, "target": target, "detail": detail[:300], "created_at": now_iso()})


PUBLIC_FILTER = {"publication_status": "published", "adult_content": False}

# ======================= AUTH =======================
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=60)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    preferred_language: Optional[str] = Field(None, max_length=40)
    favourite_categories: Optional[list[str]] = Field(None, max_length=15)
    adult_confirmed: Optional[bool] = None


@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists")
    u = {"email": email, "password_hash": auth.hash_pw(body.password), "name": body.name.strip(), "roles": ["reader"],
         "disabled": False, "token_version": 0, "created_at": now_iso(), "preferred_language": "English", "favourite_categories": []}
    r = await db.users.insert_one(u)
    u["_id"] = r.inserted_id
    return {"token": auth.make_token(u), "user": auth.public_user(u)}


async def _login(request: Request, body: LoginIn, admin: bool):
    email = body.email.lower()
    key = auth.client_key(request, email)
    auth.throttle_check(key)
    u = await db.users.find_one({"email": email})
    ok = u and auth.verify_pw(body.password, u["password_hash"]) and not u.get("disabled")
    if ok and admin and not set(u.get("roles", [])) & auth.ADMIN_ROLES:
        ok = False
    if not ok:
        auth.throttle_fail(key)
        raise HTTPException(401, "Invalid email or password")
    if admin:
        await audit(u, "admin.login")
    return {"token": auth.make_token(u, hours=12 if admin else 24 * 7), "user": auth.public_user(u)}


@api.post("/auth/login")
async def login(request: Request, body: LoginIn):
    return await _login(request, body, False)


@api.post("/admin/login")
async def admin_login(request: Request, body: LoginIn):
    return await _login(request, body, True)


@api.get("/auth/me")
async def me(u=Depends(auth.current_user)):
    return auth.public_user(u)


@api.patch("/auth/me")
async def update_me(body: ProfileIn, u=Depends(auth.current_user)):
    upd = body.model_dump(exclude_none=True)
    if upd:
        await db.users.update_one({"_id": u["_id"]}, {"$set": upd})
    return auth.public_user(await db.users.find_one({"_id": u["_id"]}))


@api.post("/auth/logout")
async def logout(u=Depends(auth.current_user)):
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"token_version": 1}})  # revokes every issued token
    return {"ok": True}


async def send_reset_email(email: str, token: str) -> bool:
    """Provider boundary. No email provider is configured yet, so nothing is sent.
    Plug the chosen provider here (key from .env) and return True on success."""
    log.info("Password reset requested for %s (email provider not configured)", email)
    return False


@api.post("/auth/forgot-password")
async def forgot(body: ForgotIn):
    u = await db.users.find_one({"email": body.email.lower()})
    sent = False
    if u:
        raw = auth.new_reset_token()
        await db.reset_tokens.insert_one({"user_id": u["_id"], "token_hash": auth.token_hash(raw),
                                          "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30)})
        sent = await send_reset_email(u["email"], raw)
    return {"message": "If that email is registered, a reset code has been sent.", "email_configured": sent or bool(os.environ.get("EMAIL_PROVIDER_KEY"))}


@api.post("/auth/reset-password")
async def reset(body: ResetIn):
    d = await db.reset_tokens.find_one_and_delete({"token_hash": auth.token_hash(body.token), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not d:
        raise HTTPException(400, "Invalid or expired reset code")
    await db.users.update_one({"_id": d["user_id"]}, {"$set": {"password_hash": auth.hash_pw(body.password)}, "$inc": {"token_version": 1}})
    return {"ok": True}

# ======================= PUBLIC CATALOGUE =======================
CATEGORIES = {
    "fiction": ("Fiction", "fiction"), "non-fiction": ("Non-fiction", "essays"), "romance": ("Romance", "love stories"),
    "mystery": ("Mystery", "detective"), "thriller": ("Thriller", "suspense"), "fantasy": ("Fantasy", "fantasy"),
    "science-fiction": ("Science Fiction", "science fiction"), "history": ("History", "history"),
    "biography": ("Biography", "biography"), "philosophy": ("Philosophy", "philosophy"), "poetry": ("Poetry", "poetry"),
    "education": ("Education", "education"), "religion": ("Religion", "religion"), "academic": ("Academic Books", None),
    "children": ("Children's Literature", "children"),
}
INTERNATIONAL = [("fr", "France", "French"), ("de", "Germany", "German"), ("es", "Spain & Latin America", "Spanish"),
                 ("it", "Italy", "Italian"), ("pt", "Portugal & Brazil", "Portuguese"), ("fi", "Finland", "Finnish"), ("nl", "Netherlands", "Dutch")]

MIZO_BASE = "language:(Mizo OR lus OR Lushai) AND mediatype:texts AND NOT collection:gazetteofindia"
MIZO_COLLECTIONS = {
    "literature": ("Mizo Literature", ""), "history": ("Mizo History", "(chanchin OR history)"),
    "folklore": ("Mizo Folklore", "(thawnthu OR folklore OR folk)"), "traditional": ("Mizo Traditional Stories", "(thawnthu OR hmanlai OR tradition)"),
    "poetry": ("Mizo Poetry", "(hla OR poem OR poetry OR poems)"), "short-stories": ("Mizo Short Stories", "(\"short stories\" OR thawnthu)"),
    "novels": ("Mizo Novels", "(novel OR lemchan)"), "religious": ("Mizo Religious Literature", "(Pathian OR Bible OR Kristian OR church OR hymn)"),
    "educational": ("Mizo Educational Books", "(textbook OR zirlai OR education OR lesson)"), "cultural": ("Mizo Cultural Heritage", "(culture OR nunphung OR customs)"),
    "language": ("Mizo Language Learning", "(dictionary OR grammar OR tawng)"), "documents": ("Mizo Historical Documents", "(report OR records OR gazetteer OR document)"),
}


async def local_books(extra: dict | None = None, limit: int = 20, adult: bool = False) -> list[dict]:
    f = {"publication_status": "published", "adult_content": adult, **(extra or {})}
    docs = await db.books.find(f).sort("created_at", -1).limit(limit).to_list(limit)
    return [book_out(d) for d in docs]


@api.get("/home")
async def home():
    hero, featured, recent_gut, mizo = await asyncio.gather(
        src.gutenberg_list(cache), src.gutenberg_list(cache, topic="adventure"),
        src.gutenberg_list(cache, sort="descending"), src.ia_search(cache, MIZO_BASE, rows=14))
    intl = await asyncio.gather(*[src.gutenberg_list(cache, languages=c) for c, _, _ in INTERNATIONAL])
    local_recent = await local_books(limit=10)
    return {
        "hero": hero[:16], "featured": featured[:12],
        "recent": (local_recent + recent_gut)[:14],
        "mizo": mizo[:14],
        "international": [{"code": c, "region": r, "language": l, "books": bs[:10]} for (c, r, l), bs in zip(INTERNATIONAL, intl) if bs],
        "categories": [{"slug": k, "name": v[0]} for k, v in CATEGORIES.items()],
        "mizo_collections": [{"slug": k, "name": v[0]} for k, v in MIZO_COLLECTIONS.items()],
    }


@api.get("/categories/{slug}")
async def category(slug: str):
    if slug not in CATEGORIES:
        raise HTTPException(404, "Unknown category")
    name, topic = CATEGORIES[slug]
    local = await local_books({"category": name}, limit=20)
    if topic:
        ext = await src.gutenberg_list(cache, topic=topic)
    else:
        doab, ol = await asyncio.gather(src.doab_search(cache, "science"), src.openlibrary_search(cache, "subject:textbooks", extra="ebook_access:public"))
        ext = doab + ol
    return {"slug": slug, "name": name, "books": src.dedupe(local + ext)}


@api.get("/mizo")
async def mizo(collection: str = "literature", q: str = Query("", max_length=100), author: str = Query("", max_length=80),
               year_from: Optional[int] = Query(None, ge=1500, le=2100), year_to: Optional[int] = Query(None, ge=1500, le=2100)):
    if collection not in MIZO_COLLECTIONS:
        raise HTTPException(404, "Unknown collection")
    name, kw = MIZO_COLLECTIONS[collection]
    parts = [MIZO_BASE]
    if kw:
        parts.append(kw)
    clean = lambda s: re.sub(r'[():"\[\]\\]', " ", s).strip()  # noqa: E731
    if q.strip():
        parts.append(f"({clean(q)})")
    if author.strip():
        parts.append(f"creator:({clean(author)})")
    if year_from or year_to:
        parts.append(f"year:[{year_from or 1500} TO {year_to or 2100}]")
    tasks = [src.ia_search(cache, " AND ".join(parts), rows=40)]
    if collection == "literature" or q.strip():
        tasks.append(src.openlibrary_search(cache, f"language:lus {clean(q)}".strip(), limit=20))
    res = await asyncio.gather(*tasks)
    loc_f: dict = {"language": "Mizo"}
    if q.strip():
        loc_f["title"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    local = await local_books(loc_f, limit=30)
    books = src.dedupe(local + [b for r in res for b in r])
    if year_from or year_to:
        books = [b for b in books if b.get("publication_year") and (year_from or 0) <= b["publication_year"] <= (year_to or 9999)]
    authors = sorted({b["author"] for b in books if b["author"] != "Unknown author" and b["author"] != "Not Available"})[:30]
    return {"collection": collection, "name": name, "books": books, "authors": authors,
            "sources": ["Internet Archive (Digital Library of India)", "Open Library", "OpenBook submissions"],
            "note": "Collections are matched by Mizo-language keywords in source metadata; availability is reported by each source."}


SOURCE_KEYS = {"gutenberg", "openlibrary", "ia", "doab", "local"}


@api.get("/search")
async def search(q: str = Query("", max_length=120), field: Literal["any", "title", "author", "isbn", "subject", "publisher"] = "any",
                 sources: str = "gutenberg,openlibrary,ia,doab,local", language: str = "", year_from: Optional[int] = None,
                 year_to: Optional[int] = None, availability: str = "", category: str = "", adult: bool = False,
                 x_age_confirmed: Optional[str] = Header(None)):
    q = q.strip()
    if not q and not category:
        return {"results": [], "total": 0, "sources": []}
    chosen = {s for s in sources.split(",") if s in SOURCE_KEYS} or SOURCE_KEYS
    term = re.sub(r'[():"\[\]\\]', " ", q)
    if category in CATEGORIES and CATEGORIES[category][1] and not term:
        term = CATEGORIES[category][1]
    ol_q = {"any": term, "title": f"title:({term})", "author": f"author:({term})", "isbn": f"isbn:{term}", "subject": f"subject:({term})", "publisher": f"publisher:({term})"}[field]
    ia_q = {"any": term, "title": f"title:({term})", "author": f"creator:({term})", "isbn": f"isbn:({term})", "subject": f"subject:({term})", "publisher": f"publisher:({term})"}[field]
    tasks, names = [], []
    if "gutenberg" in chosen and field in ("any", "title", "author"):
        tasks.append(src.gutenberg_list(cache, search=term)); names.append("Project Gutenberg")
    if "gutenberg" in chosen and field == "subject":
        tasks.append(src.gutenberg_list(cache, topic=term)); names.append("Project Gutenberg")
    if "openlibrary" in chosen:
        tasks.append(src.openlibrary_search(cache, ol_q, limit=25)); names.append("Open Library")
    if "ia" in chosen:
        tasks.append(src.ia_search(cache, f"({ia_q}) AND mediatype:texts", rows=25)); names.append("Internet Archive")
    if "doab" in chosen and field in ("any", "title", "author", "subject"):
        tasks.append(src.doab_search(cache, term)); names.append("DOAB")
    res = await asyncio.gather(*tasks) if tasks else []
    local: list[dict] = []
    if "local" in chosen:
        rx = {"$regex": re.escape(q), "$options": "i"}
        fld = {"any": [{"title": rx}, {"author": rx}, {"isbn": rx}, {"publisher": rx}], "title": [{"title": rx}], "author": [{"author": rx}],
               "isbn": [{"isbn": rx}], "subject": [{"genre": rx}, {"category": rx}], "publisher": [{"publisher": rx}]}[field]
        include_adult = adult and (x_age_confirmed or "").lower() == "true"
        f = {"publication_status": "published", "$or": fld}
        if not include_adult:
            f["adult_content"] = False
        if category in CATEGORIES:
            f["category"] = CATEGORIES[category][0]
        local = [book_out(d) for d in await db.books.find(f).limit(30).to_list(30)]
    books = src.dedupe(local + [b for r in res for b in r])
    blocked = re.compile(r"erotic|erotica|sex\b|adult", re.I)
    if not (adult and (x_age_confirmed or "").lower() == "true"):
        books = [b for b in books if not b.get("adult_content") and not any(blocked.search(s) for s in b.get("subjects", []))]
    if language:
        books = [b for b in books if b["language"].lower() == language.lower()]
    if year_from or year_to:
        books = [b for b in books if b.get("publication_year") and (year_from or 0) <= b["publication_year"] <= (year_to or 9999)]
    if availability:
        wanted = {a.strip().upper() for a in availability.split(",")}
        books = [b for b in books if b["availability"] in wanted]
    books.sort(key=lambda b: -src.AVAIL_RANK.get(b["availability"], 0))
    if q:
        await db.search_log.update_one({"q": q.lower()[:60]}, {"$inc": {"count": 1}}, upsert=True)
    status = [src.SOURCE_STATUS.get(n, {"name": n, "ok": True}) for n in dict.fromkeys(names)]
    return {"results": books[:80], "total": len(books), "sources": status}


@api.get("/search/popular")
async def popular():
    rows = await db.search_log.find({}, {"_id": 0}).sort("count", -1).limit(10).to_list(10)
    pop = await src.gutenberg_list(cache)
    authors = list(dict.fromkeys(b["author"] for b in pop))[:10]
    return {"searches": [r["q"] for r in rows], "books": pop[:8], "authors": authors}


async def get_book(book_id: str, allow_adult: bool = False) -> dict:
    prefix, _, ident = book_id.partition(":")
    if prefix == "local":
        d = await db.books.find_one({"_id": oid(ident), "publication_status": "published"})
        if not d or (d.get("adult_content") and not allow_adult):
            raise HTTPException(404, "Book not found")
        return book_out(d)
    hit = await cache.get(f"book:{book_id}")
    if hit:
        return hit
    b = None
    if prefix == "gutenberg" and ident.isdigit():
        data = await src._get_json("Project Gutenberg", f"https://gutendex.com/books/{ident}")
        b = src.norm_gutenberg(data) if data and data.get("id") else None
    elif prefix == "ia":
        b = await src.ia_detail(ident)
    elif prefix == "openlibrary":
        r = await src.openlibrary_search(cache, f"key:/works/{ident}", limit=1)
        b = r[0] if r else None
    if not b:
        raise HTTPException(404, "Book not found at its source")
    await cache.set(f"book:{book_id}", b, hours=24 * 7)
    return b


@api.get("/books/{book_id}")
async def book_detail(book_id: str, x_age_confirmed: Optional[str] = Header(None)):
    b = await get_book(book_id, allow_adult=(x_age_confirmed or "").lower() == "true")
    if b["source_name"] == "Open Library" and not b.get("description"):
        data = await src._get_json("Open Library", f"https://openlibrary.org/works/{b['source_id']}.json")
        desc = (data or {}).get("description")
        b["description"] = (desc.get("value") if isinstance(desc, dict) else desc or "")[:900]
    return b


@api.get("/after-dark")
async def after_dark(x_age_confirmed: Optional[str] = Header(None)):
    if (x_age_confirmed or "").lower() != "true":
        raise HTTPException(403, "Age confirmation required")
    books = await local_books(limit=100, adult=True)
    cats = ["Adult Fiction", "Mature Romance", "Erotic Literature", "Mature Historical Fiction", "Psychological Fiction", "Adult Literary Fiction"]
    return {"categories": [{"name": c, "books": [b for b in books if b.get("category") == c]} for c in cats],
            "uncategorised": [b for b in books if b.get("category") not in cats]}

# ======================= READER =======================
async def load_text(book_id: str, allow_adult: bool) -> dict:
    cached = await db.book_texts.find_one({"book_id": book_id}, {"_id": 0})
    if cached:
        return cached
    prefix, _, ident = book_id.partition(":")
    raw = None
    if prefix == "gutenberg":
        url = await src.gutenberg_text_url(ident)
        if url:
            try:
                async with httpx.AsyncClient(timeout=40, follow_redirects=True, headers=src.UA) as c:
                    r = await c.get(url)
                    r.raise_for_status()
                    raw = r.content.decode("utf-8", errors="replace")
            except Exception as e:
                log.warning("gutenberg text fetch failed %s: %s", book_id, e)
                raise HTTPException(502, "Project Gutenberg is not responding. Try again shortly.")
    elif prefix == "local":
        d = await db.books.find_one({"_id": oid(ident), "publication_status": "published", "access_type": "hosted_text"})
        if d and (not d.get("adult_content") or allow_adult):
            raw = d.get("content_text")
    if not raw:
        raise HTTPException(404, "This book cannot be read inside OpenBook. Open it at its source instead.")
    pages, toc = src.paginate_text(raw)
    doc = {"book_id": book_id, "pages": pages, "toc": toc, "total": len(pages)}
    if prefix == "gutenberg":  # public-domain texts only are cached
        await db.book_texts.update_one({"book_id": book_id}, {"$set": doc}, upsert=True)
    return doc


@api.get("/read/{book_id}/meta")
async def read_meta(book_id: str, x_age_confirmed: Optional[str] = Header(None)):
    ok = (x_age_confirmed or "").lower() == "true"
    book = await get_book(book_id, allow_adult=ok)
    t = await load_text(book_id, ok)
    return {"book": book, "total": t["total"], "toc": t["toc"]}


@api.get("/read/{book_id}/pages")
async def read_pages(book_id: str, start: int = Query(0, ge=0), count: int = Query(5, ge=1, le=20), x_age_confirmed: Optional[str] = Header(None)):
    t = await load_text(book_id, (x_age_confirmed or "").lower() == "true")
    return {"start": start, "pages": t["pages"][start:start + count], "total": t["total"]}

# ======================= READER ACCOUNT DATA =======================
class Snapshot(BaseModel):
    title: str = Field(max_length=300)
    author: str = Field("", max_length=200)
    cover_url: Optional[str] = Field(None, max_length=500)
    availability: str = Field("", max_length=40)


class ProgressIn(Snapshot):
    page: int = Field(ge=0)
    total: int = Field(ge=1)


class BookmarkIn(BaseModel):
    page: int = Field(ge=0)
    note: str = Field("", max_length=200)
    title: str = Field(max_length=300)


class SettingsIn(BaseModel):
    settings: dict

    @field_validator("settings")
    @classmethod
    def small(cls, v):
        if len(str(v)) > 2000:
            raise ValueError("settings too large")
        return v


def uid(u):
    return str(u["_id"])


@api.get("/me/saved")
async def saved(u=Depends(auth.current_user)):
    return await db.saved_books.find({"user_id": uid(u)}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(500)


@api.put("/me/saved/{book_id}")
async def save_book(book_id: str, body: Snapshot, u=Depends(auth.current_user)):
    await db.saved_books.update_one({"user_id": uid(u), "book_id": book_id}, {"$set": {**body.model_dump(), "book_id": book_id, "created_at": now_iso()}}, upsert=True)
    return {"ok": True}


@api.delete("/me/saved/{book_id}")
async def unsave(book_id: str, u=Depends(auth.current_user)):
    await db.saved_books.delete_one({"user_id": uid(u), "book_id": book_id})
    return {"ok": True}


@api.get("/me/progress")
async def progress(u=Depends(auth.current_user)):
    return await db.reading_progress.find({"user_id": uid(u)}, {"_id": 0, "user_id": 0}).sort("updated_at", -1).to_list(200)


@api.put("/me/progress/{book_id}")
async def put_progress(book_id: str, body: ProgressIn, u=Depends(auth.current_user)):
    await db.reading_progress.update_one({"user_id": uid(u), "book_id": book_id},
                                         {"$set": {**body.model_dump(), "book_id": book_id, "updated_at": now_iso()}}, upsert=True)
    return {"ok": True}


@api.get("/me/bookmarks")
async def bookmarks(book_id: str = "", u=Depends(auth.current_user)):
    f = {"user_id": uid(u), **({"book_id": book_id} if book_id else {})}
    rows = await db.bookmarks.find(f).sort("created_at", -1).to_list(500)
    return [{"id": str(r["_id"]), "book_id": r["book_id"], "page": r["page"], "note": r.get("note", ""), "title": r.get("title", ""), "created_at": r["created_at"]} for r in rows]


@api.post("/me/bookmarks/{book_id}")
async def add_bookmark(book_id: str, body: BookmarkIn, u=Depends(auth.current_user)):
    r = await db.bookmarks.insert_one({"user_id": uid(u), "book_id": book_id, **body.model_dump(), "created_at": now_iso()})
    return {"id": str(r.inserted_id)}


@api.delete("/me/bookmarks/item/{bm_id}")
async def del_bookmark(bm_id: str, u=Depends(auth.current_user)):
    await db.bookmarks.delete_one({"_id": oid(bm_id), "user_id": uid(u)})
    return {"ok": True}


@api.get("/me/settings")
async def get_settings(u=Depends(auth.current_user)):
    d = await db.user_settings.find_one({"user_id": uid(u)}, {"_id": 0})
    return (d or {}).get("settings", {})


@api.put("/me/settings")
async def put_settings(body: SettingsIn, u=Depends(auth.current_user)):
    await db.user_settings.update_one({"user_id": uid(u)}, {"$set": {"settings": body.settings, "updated_at": now_iso()}}, upsert=True)
    return {"ok": True}

# ======================= SUBMISSIONS =======================
ACCESS_TYPES = Literal["hosted_text", "external_reader", "borrow", "metadata", "unavailable"]


def _valid_url(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    p = urlparse(v)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise ValueError("must be a valid http(s) URL")
    return v


class SubmissionIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    author: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=3000)
    isbn: str = Field("", max_length=20)
    publication_year: Optional[int] = Field(None, ge=1000, le=2100)
    language: str = Field("Mizo", max_length=40)
    category: str = Field("", max_length=60)
    publisher: str = Field("", max_length=200)
    reading_url: Optional[str] = Field(None, max_length=500)
    licence: str = Field(min_length=2, max_length=200)
    contributor_role: Literal["author", "publisher", "rights_holder", "contributor"]
    permission_declared: bool
    adult_content: bool = False
    content_text: str = Field("", max_length=400_000)

    _u = field_validator("reading_url")(classmethod(lambda cls, v: _valid_url(v)))

    @field_validator("permission_declared")
    @classmethod
    def must_declare(cls, v):
        if not v:
            raise ValueError("You must declare ownership or permission to distribute")
        return v


async def find_duplicate(title: str, author: str, isbn: str) -> Optional[str]:
    ors = [{"title": {"$regex": f"^{re.escape(title.strip())}$", "$options": "i"}, "author": {"$regex": f"^{re.escape(author.strip())}$", "$options": "i"}}]
    if isbn:
        ors.append({"isbn": isbn})
    d = await db.books.find_one({"$or": ors})
    return str(d["_id"]) if d else None


@api.post("/submissions")
async def submit(body: SubmissionIn, u=Depends(auth.current_user)):
    dup = await find_duplicate(body.title, body.author, body.isbn)
    doc = {**body.model_dump(), "status": "pending", "duplicate_of": dup, "submitted_by": u["email"], "created_at": now_iso()}
    r = await db.submissions.insert_one(doc)
    return {"id": str(r.inserted_id), "status": "pending", "duplicate_of": dup}


@api.get("/me/submissions")
async def my_submissions(u=Depends(auth.current_user)):
    rows = await db.submissions.find({"submitted_by": u["email"]}, {"content_text": 0}).sort("created_at", -1).to_list(100)
    return [{**{k: v for k, v in r.items() if k != "_id"}, "id": str(r["_id"])} for r in rows]

# ======================= ADMIN =======================
EDITOR = auth.require_roles("super_admin", "admin", "editor")
ADMIN = auth.require_roles("super_admin", "admin")
SUPER = auth.require_roles("super_admin")


class BookIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    author: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=3000)
    isbn: list[str] = Field(default_factory=list, max_length=5)
    publication_year: Optional[int] = Field(None, ge=1000, le=2100)
    language: str = Field("English", max_length=40)
    country: str = Field("", max_length=60)
    genre: str = Field("", max_length=60)
    category: str = Field("", max_length=60)
    publisher: str = Field("", max_length=200)
    cover_url: Optional[str] = Field(None, max_length=500)
    format: Literal["text", "pdf", "epub", "html", "none"] = "text"
    source_url: Optional[str] = Field(None, max_length=500)
    reader_url: Optional[str] = Field(None, max_length=500)
    licence: str = Field(min_length=2, max_length=200)
    copyright_status: Literal["public_domain", "open_licence", "permission_granted", "copyrighted", "unknown"] = "unknown"
    access_type: ACCESS_TYPES = "metadata"
    adult_content: bool = False
    content_text: str = Field("", max_length=400_000)
    publication_status: Literal["draft", "published", "archived"] = "draft"

    _u = field_validator("cover_url", "source_url", "reader_url")(classmethod(lambda cls, v: _valid_url(v)))

    @field_validator("isbn")
    @classmethod
    def isbns(cls, v):
        out = [re.sub(r"[^0-9Xx]", "", i) for i in v if i.strip()]
        if any(len(i) not in (10, 13) for i in out):
            raise ValueError("ISBN must be 10 or 13 digits")
        return out


def admin_book(d: dict) -> dict:
    b = book_out(d)
    b["has_text"] = bool(d.get("content_text"))
    b["content_text"] = d.get("content_text", "")
    return b


@api.get("/admin/stats")
async def admin_stats(u=Depends(EDITOR)):
    month_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    total, pub, draft, arch, pending, users, active = await asyncio.gather(
        db.books.count_documents({}), db.books.count_documents({"publication_status": "published"}),
        db.books.count_documents({"publication_status": "draft"}), db.books.count_documents({"publication_status": "archived"}),
        db.submissions.count_documents({"status": "pending"}), db.users.count_documents({}),
        db.reading_progress.distinct("user_id", {"updated_at": {"$gte": month_ago}}))
    most = await db.reading_progress.aggregate([{"$group": {"_id": "$book_id", "title": {"$first": "$title"}, "readers": {"$sum": 1}}},
                                                {"$sort": {"readers": -1}}, {"$limit": 6}]).to_list(6)
    recent = await db.books.find({}, {"content_text": 0}).sort("created_at", -1).limit(5).to_list(5)
    mizo = await db.books.count_documents({"language": "Mizo"})
    return {"total_books": total, "published": pub, "drafts": draft, "archived": arch, "pending_submissions": pending,
            "registered_users": users, "active_readers": len(active), "mizo_books": mizo,
            "most_read": [{"book_id": m["_id"], "title": m["title"], "readers": m["readers"]} for m in most],
            "recent": [book_out(d) for d in recent], "sources": list(src.SOURCE_STATUS.values())}


@api.post("/admin/sources/check")
async def check_sources(u=Depends(EDITOR)):
    await asyncio.gather(src._get_json("Project Gutenberg", "https://gutendex.com/books/?ids=1342"),
                         src._get_json("Open Library", "https://openlibrary.org/search.json", {"q": "austen", "limit": 1, "fields": "key"}),
                         src._get_json("Internet Archive", "https://archive.org/advancedsearch.php", {"q": "mizo", "rows": 1, "output": "json", "fl[]": "identifier"}),
                         src._get_json("DOAB", "https://directory.doabooks.org/rest/search", {"query": "history", "limit": 1}))
    return list(src.SOURCE_STATUS.values())


@api.get("/admin/books")
async def admin_books(q: str = "", status: str = "", adult: str = "", language: str = "", u=Depends(EDITOR)):
    f: dict = {}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        f["$or"] = [{"title": rx}, {"author": rx}, {"isbn": rx}]
    if status:
        f["publication_status"] = status
    if adult in ("true", "false"):
        f["adult_content"] = adult == "true"
    if language:
        f["language"] = language
    docs = await db.books.find(f, {"content_text": 0}).sort("updated_at", -1).limit(200).to_list(200)
    return [book_out(d) for d in docs]


@api.get("/admin/books/{book_id}")
async def admin_get_book(book_id: str, u=Depends(EDITOR)):
    d = await db.books.find_one({"_id": oid(book_id)})
    if not d:
        raise HTTPException(404, "Book not found")
    return admin_book(d)


def _check_publish(u: dict, status: str):
    if status == "published" and not set(u.get("roles", [])) & {"super_admin", "admin"}:
        raise HTTPException(403, "Editors can save drafts; an Admin must publish")


@api.post("/admin/books")
async def admin_create_book(body: BookIn, u=Depends(EDITOR)):
    _check_publish(u, body.publication_status)
    dup = await find_duplicate(body.title, body.author, body.isbn[0] if body.isbn else "")
    if dup:
        raise HTTPException(409, f"A book with the same title/author or ISBN already exists ({dup})")
    doc = {**body.model_dump(), "created_at": now_iso(), "updated_at": now_iso(), "created_by": u["email"]}
    r = await db.books.insert_one(doc)
    await audit(u, "book.create", str(r.inserted_id), body.title)
    return {"id": str(r.inserted_id)}


@api.put("/admin/books/{book_id}")
async def admin_update_book(book_id: str, body: BookIn, u=Depends(EDITOR)):
    cur = await db.books.find_one({"_id": oid(book_id)})
    if not cur:
        raise HTTPException(404, "Book not found")
    if body.publication_status != cur.get("publication_status") and not set(u.get("roles", [])) & {"super_admin", "admin"}:
        raise HTTPException(403, "Only an Admin can change a book's publication status")
    await db.books.update_one({"_id": cur["_id"]}, {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    await db.book_texts.delete_one({"book_id": f"local:{book_id}"})
    await audit(u, "book.update", book_id, body.title)
    return {"ok": True}


class StatusIn(BaseModel):
    status: Literal["draft", "published", "archived"]


@api.post("/admin/books/{book_id}/status")
async def admin_book_status(book_id: str, body: StatusIn, u=Depends(ADMIN)):
    r = await db.books.update_one({"_id": oid(book_id)}, {"$set": {"publication_status": body.status, "updated_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Book not found")
    await audit(u, f"book.{body.status}", book_id)
    return {"ok": True}


@api.delete("/admin/books/{book_id}")
async def admin_delete_book(book_id: str, u=Depends(ADMIN)):
    d = await db.books.find_one_and_delete({"_id": oid(book_id)})
    if not d:
        raise HTTPException(404, "Book not found")
    await audit(u, "book.delete", book_id, d.get("title", ""))
    return {"ok": True}


@api.get("/admin/submissions")
async def admin_submissions(status: str = "pending", u=Depends(EDITOR)):
    rows = await db.submissions.find({"status": status} if status else {}).sort("created_at", -1).limit(200).to_list(200)
    return [{**{k: v for k, v in r.items() if k not in ("_id", "content_text")}, "id": str(r["_id"]), "has_text": bool(r.get("content_text")),
             "text_preview": (r.get("content_text") or "")[:600]} for r in rows]


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field("", max_length=500)


@api.post("/admin/submissions/{sub_id}/review")
async def review(sub_id: str, body: ReviewIn, u=Depends(ADMIN)):
    s = await db.submissions.find_one({"_id": oid(sub_id), "status": "pending"})
    if not s:
        raise HTTPException(404, "Pending submission not found")
    book_id = None
    if body.decision == "approve":
        has_text = bool(s.get("content_text"))
        doc = {"title": s["title"], "author": s["author"], "description": s.get("description", ""), "isbn": [s["isbn"]] if s.get("isbn") else [],
               "publication_year": s.get("publication_year"), "language": s.get("language", ""), "country": "", "genre": s.get("category", ""),
               "category": s.get("category", ""), "publisher": s.get("publisher", ""), "cover_url": None, "format": "text" if has_text else "html",
               "source_url": s.get("reading_url"), "reader_url": s.get("reading_url"), "licence": s["licence"], "copyright_status": "permission_granted",
               "access_type": "hosted_text" if has_text else ("external_reader" if s.get("reading_url") else "metadata"),
               "adult_content": s.get("adult_content", False), "content_text": s.get("content_text", ""), "publication_status": "published",
               "submitted_by": s["submitted_by"], "created_at": now_iso(), "updated_at": now_iso()}
        book_id = str((await db.books.insert_one(doc)).inserted_id)
    await db.submissions.update_one({"_id": s["_id"]}, {"$set": {"status": "approved" if body.decision == "approve" else "rejected",
                                                                  "review_note": body.note, "reviewed_by": u["email"], "book_id": book_id, "reviewed_at": now_iso()}})
    await audit(u, f"submission.{body.decision}", sub_id, s["title"])
    return {"ok": True, "book_id": book_id}


@api.get("/admin/users")
async def admin_users(q: str = "", u=Depends(ADMIN)):
    f = {"email": {"$regex": re.escape(q), "$options": "i"}} if q else {}
    rows = await db.users.find(f, {"password_hash": 0}).sort("created_at", -1).limit(300).to_list(300)
    return [{**auth.public_user(r), "disabled": r.get("disabled", False)} for r in rows]


class UserAdminIn(BaseModel):
    roles: Optional[list[Literal["reader", "editor", "admin", "super_admin"]]] = None
    disabled: Optional[bool] = None


@api.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, body: UserAdminIn, u=Depends(ADMIN)):
    target = await db.users.find_one({"_id": oid(user_id)})
    if not target:
        raise HTTPException(404, "User not found")
    if target["_id"] == u["_id"]:
        raise HTTPException(400, "You cannot change your own account here")
    if body.roles is not None and "super_admin" not in u["roles"]:
        raise HTTPException(403, "Only a Super Admin can change roles")
    if "super_admin" in target.get("roles", []) and "super_admin" not in u["roles"]:
        raise HTTPException(403, "Only a Super Admin can modify another Super Admin")
    upd = body.model_dump(exclude_none=True)
    if upd:
        await db.users.update_one({"_id": target["_id"]}, {"$set": upd, "$inc": {"token_version": 1}})
        await audit(u, "user.update", target["email"], str(upd))
    return {"ok": True}


@api.get("/admin/audit")
async def admin_audit(u=Depends(ADMIN)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


async def warm():
    with suppress(Exception):
        await home()


@app.on_event("startup")
async def startup():
    await auth.seed_admin()
    app.state.index_task = asyncio.create_task(ensure_indexes())
    app.state.warm_task = asyncio.create_task(warm())


@app.on_event("shutdown")
async def shutdown():
    for t in (app.state.index_task, app.state.warm_task):
        t.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await t
    client.close()
