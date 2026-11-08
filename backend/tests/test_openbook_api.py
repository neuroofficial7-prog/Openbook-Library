# OpenBook Library backend regression tests (auth, catalogue, reader, me-data, submissions, adult separation, admin)
import os
import uuid
import time
import pytest
import requests
from urllib.parse import quote

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@openbook.library"
ADMIN_PW = "OpenBook@Admin2026"
T = 90
STATE = {}


def h(tok, adult=False):
    d = {"Authorization": f"Bearer {tok}"}
    if adult:
        d["X-Age-Confirmed"] = "true"
    return d


def register(prefix="reader"):
    email = f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Reader@12345", "name": f"TEST_{prefix}"}, timeout=T)
    assert r.status_code == 200, r.text
    return email, r.json()["token"], r.json()["user"]


@pytest.fixture(scope="session")
def admin_tok():
    r = requests.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=T)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def reader():
    return register()


# --- Auth ---
class TestAuth:
    def test_register_me_patch(self, reader):
        email, tok, user = reader
        assert user["email"] == email and "password_hash" not in user
        r = requests.get(f"{API}/auth/me", headers=h(tok), timeout=T)
        assert r.status_code == 200 and r.json()["email"] == email
        r = requests.patch(f"{API}/auth/me", headers=h(tok), json={"name": "TEST_Renamed", "preferred_language": "French"}, timeout=T)
        assert r.status_code == 200 and r.json()["name"] == "TEST_Renamed"
        assert requests.get(f"{API}/auth/me", headers=h(tok), timeout=T).json()["name"] == "TEST_Renamed"

    def test_duplicate_register(self, reader):
        r = requests.post(f"{API}/auth/register", json={"email": reader[0], "password": "Reader@12345", "name": "x"}, timeout=T)
        assert r.status_code == 409

    def test_login_and_logout_revokes(self):
        email, _, _ = register("logout")
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Reader@12345"}, timeout=T)
        assert r.status_code == 200
        tok = r.json()["token"]
        assert requests.post(f"{API}/auth/logout", headers=h(tok), timeout=T).status_code == 200
        assert requests.get(f"{API}/auth/me", headers=h(tok), timeout=T).status_code == 401

    def test_forgot_reset(self, reader):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": reader[0]}, timeout=T)
        assert r.status_code == 200 and r.json()["email_configured"] is False
        r = requests.post(f"{API}/auth/reset-password", json={"token": "invalidtoken123", "password": "NewPass@1234"}, timeout=T)
        assert r.status_code == 400

    def test_throttle(self):
        email, _, _ = register("throttle")
        codes = [requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"}, timeout=T).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5 and codes[5] == 429, codes

    def test_admin_login_rejects_reader(self, reader):
        r = requests.post(f"{API}/admin/login", json={"email": reader[0], "password": "Reader@12345"}, timeout=T)
        assert r.status_code == 401

    def test_reader_forbidden_admin(self, reader):
        for p in ["/admin/stats", "/admin/books", "/admin/users", "/admin/audit"]:
            assert requests.get(f"{API}{p}", headers=h(reader[1]), timeout=T).status_code == 403, p


# --- Catalogue ---
class TestCatalogue:
    def test_home(self):
        d = requests.get(f"{API}/home", timeout=T).json()
        for k in ["hero", "featured", "recent", "mizo", "international", "categories"]:
            assert d[k], k

    def test_category(self):
        r = requests.get(f"{API}/categories/fantasy", timeout=T)
        assert r.status_code == 200, r.text
        assert requests.get(f"{API}/categories/nope-xyz", timeout=T).status_code == 404

    def test_mizo(self):
        r = requests.get(f"{API}/mizo", params={"collection": "poetry", "q": "hla"}, timeout=T)
        assert r.status_code == 200, r.text
        STATE["mizo"] = r.json()

    def test_search_and_filters(self):
        d = requests.get(f"{API}/search", params={"q": "austen"}, timeout=T).json()
        assert d["total"] > 0
        assert any(s["name"] == "DOAB" and not s["ok"] for s in d["sources"])
        ol = [x for x in d["results"] if x["id"].startswith("openlibrary:")]
        STATE["ol_id"] = ol[0]["id"] if ol else None
        r = requests.get(f"{API}/search", params={"q": "austen", "field": "author", "sources": "gutenberg", "language": "en",
                                                   "year_from": 1700, "year_to": 1900, "availability": "READ ONLINE"}, timeout=T)
        assert r.status_code == 200, r.text
        rs = r.json()["results"]
        assert all(x["source_name"] == "Project Gutenberg" for x in rs), [x["source_name"] for x in rs]
        assert all(x["availability"] == "READ ONLINE" for x in rs)

    def test_search_openlibrary_only(self):
        r = requests.get(f"{API}/search", params={"q": "austen", "sources": "openlibrary"}, timeout=T)
        rs = r.json()["results"]
        assert rs and all(x["id"].startswith("openlibrary:") for x in rs)
        STATE["ol_id"] = STATE.get("ol_id") or rs[0]["id"]

    def test_popular(self):
        assert requests.get(f"{API}/search/popular", timeout=T).status_code == 200

    @pytest.mark.parametrize("bid", ["gutenberg:1342", "ia:in.ernet.dli.2015.467514"])
    def test_book_detail(self, bid):
        r = requests.get(f"{API}/books/{quote(bid, safe='')}", timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == bid and r.json()["title"]

    def test_book_detail_openlibrary(self):
        rs = requests.get(f"{API}/search", params={"q": "austen", "sources": "openlibrary"}, timeout=T).json()["results"]
        if not rs:
            pytest.skip("no openlibrary id")
        bid = rs[0]["id"]
        r = requests.get(f"{API}/books/{quote(bid, safe='')}", timeout=T)
        assert r.status_code == 200, r.text
        assert r.json()["availability"] != "READ ONLINE"


# --- Reader ---
class TestReader:
    def test_meta_pages(self):
        r = requests.get(f"{API}/read/gutenberg%3A1342/meta", timeout=120)
        assert r.status_code == 200, r.text
        assert r.json()["total"] > 10
        r = requests.get(f"{API}/read/gutenberg%3A1342/pages", params={"start": 0, "count": 5}, timeout=T)
        assert r.status_code == 200 and len(r.json()["pages"]) == 5

    def test_openlibrary_not_readable(self):
        bid = "openlibrary:OL66554W"
        r = requests.get(f"{API}/read/{quote(bid, safe='')}/meta", timeout=T)
        assert r.status_code == 404, r.text


# --- Me data ---
class TestMeData:
    def test_saved_progress_bookmarks_settings(self, reader):
        tok = reader[1]
        bid = quote("gutenberg:1342", safe="")
        snap = {"title": "Pride and Prejudice", "author": "Austen", "availability": "READ ONLINE"}
        assert requests.put(f"{API}/me/saved/{bid}", headers=h(tok), json=snap, timeout=T).status_code == 200
        assert any(s["book_id"] == "gutenberg:1342" for s in requests.get(f"{API}/me/saved", headers=h(tok), timeout=T).json())
        assert requests.delete(f"{API}/me/saved/{bid}", headers=h(tok), timeout=T).status_code == 200
        assert not requests.get(f"{API}/me/saved", headers=h(tok), timeout=T).json()
        assert requests.put(f"{API}/me/progress/{bid}", headers=h(tok), json={**snap, "page": 3, "total": 100}, timeout=T).status_code == 200
        p = requests.get(f"{API}/me/progress", headers=h(tok), timeout=T).json()
        assert p[0]["page"] == 3
        bm = requests.post(f"{API}/me/bookmarks/{bid}", headers=h(tok), json={"page": 4, "title": "P&P"}, timeout=T).json()["id"]
        rows = requests.get(f"{API}/me/bookmarks", params={"book_id": "gutenberg:1342"}, headers=h(tok), timeout=T).json()
        assert rows[0]["id"] == bm and rows[0]["page"] == 4
        requests.delete(f"{API}/me/bookmarks/item/{bm}", headers=h(tok), timeout=T)
        assert requests.get(f"{API}/me/bookmarks", headers=h(tok), timeout=T).json() == []
        assert requests.put(f"{API}/me/settings", headers=h(tok), json={"settings": {"theme": "sepia", "size": 20}}, timeout=T).status_code == 200
        assert requests.get(f"{API}/me/settings", headers=h(tok), timeout=T).json()["theme"] == "sepia"

    def test_unauth(self):
        assert requests.get(f"{API}/me/saved", timeout=T).status_code == 401


# --- Submissions + admin review ---
class TestSubmissions:
    def payload(self, title, **kw):
        return {"title": title, "author": "TEST_Author", "licence": "CC BY 4.0", "contributor_role": "author",
                "permission_declared": True, "language": "Mizo", "content_text": "Chapter 1\n\n" + "Hello world text. " * 200, **kw}

    def test_requires_permission(self, reader):
        r = requests.post(f"{API}/submissions", headers=h(reader[1]), json=self.payload("TEST_x", permission_declared=False), timeout=T)
        assert r.status_code == 422

    def test_approve_flow_and_duplicate(self, reader, admin_tok):
        title = f"TEST_Sub_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/submissions", headers=h(reader[1]), json=self.payload(title), timeout=T)
        assert r.status_code == 200 and r.json()["duplicate_of"] is None
        sid = r.json()["id"]
        r = requests.post(f"{API}/admin/submissions/{sid}/review", headers=h(reader[1]), json={"decision": "approve"}, timeout=T)
        assert r.status_code == 403
        r = requests.post(f"{API}/admin/submissions/{sid}/review", headers=h(admin_tok), json={"decision": "approve"}, timeout=T)
        assert r.status_code == 200 and r.json()["book_id"]
        book_id = r.json()["book_id"]
        STATE.setdefault("cleanup", []).append(book_id)
        b = requests.get(f"{API}/books/local%3A{book_id}", timeout=T)
        assert b.status_code == 200 and b.json()["availability"] == "READ ONLINE"
        s = requests.get(f"{API}/search", params={"q": title}, timeout=T).json()
        assert any(x["id"] == f"local:{book_id}" for x in s["results"])
        assert requests.get(f"{API}/read/local%3A{book_id}/meta", timeout=T).status_code == 200
        # duplicate
        r2 = requests.post(f"{API}/submissions", headers=h(reader[1]), json=self.payload(title), timeout=T)
        assert r2.json()["duplicate_of"] == book_id
        rj = requests.post(f"{API}/admin/submissions/{r2.json()['id']}/review", headers=h(admin_tok), json={"decision": "reject", "note": "dup"}, timeout=T)
        assert rj.status_code == 200 and rj.json()["book_id"] is None
        mine = requests.get(f"{API}/me/submissions", headers=h(reader[1]), timeout=T).json()
        assert {m["status"] for m in mine if m["title"] == title} == {"approved", "rejected"}
        assert requests.delete(f"{API}/admin/books/{book_id}", headers=h(admin_tok), timeout=T).status_code == 200


# --- Adult separation ---
class TestAdult:
    def test_adult_hidden(self, admin_tok):
        title = f"TEST_Adult_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/books", headers=h(admin_tok), json={"title": title, "author": "TEST_A", "licence": "CC BY",
                          "adult_content": True, "publication_status": "published", "category": "Adult Fiction",
                          "access_type": "hosted_text", "content_text": "Adult text " * 300}, timeout=T)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        STATE.setdefault("cleanup", []).append(bid)
        s = requests.get(f"{API}/search", params={"q": title}, timeout=T).json()
        assert not any(x["id"] == f"local:{bid}" for x in s["results"])
        s = requests.get(f"{API}/search", params={"q": title, "adult": "true"}, timeout=T).json()
        assert not any(x["id"] == f"local:{bid}" for x in s["results"]), "adult shown without header"
        s = requests.get(f"{API}/search", params={"q": title, "adult": "true"}, headers={"X-Age-Confirmed": "true"}, timeout=T).json()
        assert any(x["id"] == f"local:{bid}" for x in s["results"]), "adult not shown with header+adult=true"
        assert requests.get(f"{API}/books/local%3A{bid}", timeout=T).status_code == 404
        assert requests.get(f"{API}/books/local%3A{bid}", headers={"X-Age-Confirmed": "true"}, timeout=T).status_code == 200
        assert requests.get(f"{API}/read/local%3A{bid}/meta", timeout=T).status_code == 404
        assert requests.get(f"{API}/after-dark", timeout=T).status_code == 403
        ad = requests.get(f"{API}/after-dark", headers={"X-Age-Confirmed": "true"}, timeout=T).json()
        cat = [c for c in ad["categories"] if c["name"] == "Adult Fiction"][0]
        assert any(b["id"] == f"local:{bid}" for b in cat["books"])
        home = requests.get(f"{API}/home", timeout=T).json()
        assert f"local:{bid}" not in str(home)
        assert requests.delete(f"{API}/admin/books/{bid}", headers=h(admin_tok), timeout=T).status_code == 200
        assert requests.get(f"{API}/admin/books/{bid}", headers=h(admin_tok), timeout=T).status_code == 404


# --- Admin ---
class TestAdmin:
    def test_editor_role_and_users(self, admin_tok):
        email, tok, user = register("editor")
        users = requests.get(f"{API}/admin/users", params={"q": email}, headers=h(admin_tok), timeout=T).json()
        uid_ = users[0]["id"]
        r = requests.patch(f"{API}/admin/users/{uid_}", headers=h(admin_tok), json={"roles": ["reader", "editor"]}, timeout=T)
        assert r.status_code == 200
        assert requests.get(f"{API}/auth/me", headers=h(tok), timeout=T).status_code == 401  # role change revokes token
        tok = requests.post(f"{API}/admin/login", json={"email": email, "password": "Reader@12345"}, timeout=T).json()["token"]
        base = {"title": f"TEST_Ed_{uuid.uuid4().hex[:6]}", "author": "TEST_E", "licence": "CC BY"}
        assert requests.post(f"{API}/admin/books", headers=h(tok), json={**base, "publication_status": "published"}, timeout=T).status_code == 403
        r = requests.post(f"{API}/admin/books", headers=h(tok), json=base, timeout=T)
        assert r.status_code == 200
        bid = r.json()["id"]
        STATE.setdefault("cleanup", []).append(bid)
        assert requests.post(f"{API}/admin/books/{bid}/status", headers=h(tok), json={"status": "published"}, timeout=T).status_code == 403
        assert requests.get(f"{API}/admin/users", headers=h(tok), timeout=T).status_code == 403
        # admin status changes
        for st in ["published", "archived", "draft"]:
            assert requests.post(f"{API}/admin/books/{bid}/status", headers=h(admin_tok), json={"status": st}, timeout=T).status_code == 200
            assert requests.get(f"{API}/admin/books/{bid}", headers=h(admin_tok), timeout=T).json()["publication_status"] == st
        lst = requests.get(f"{API}/admin/books", params={"q": base["title"], "status": "draft"}, headers=h(admin_tok), timeout=T).json()
        assert len(lst) == 1
        # disable user
        assert requests.patch(f"{API}/admin/users/{uid_}", headers=h(admin_tok), json={"disabled": True}, timeout=T).status_code == 200
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "Reader@12345"}, timeout=T).status_code == 401
        assert requests.delete(f"{API}/admin/books/{bid}", headers=h(admin_tok), timeout=T).status_code == 200

    def test_stats_audit(self, admin_tok):
        s = requests.get(f"{API}/admin/stats", headers=h(admin_tok), timeout=T).json()
        assert isinstance(s["total_books"], int) and "sources" in s
        a = requests.get(f"{API}/admin/audit", headers=h(admin_tok), timeout=T)
        assert a.status_code == 200 and "book.create" in a.text
