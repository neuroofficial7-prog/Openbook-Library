"""Email/password auth: bcrypt hashes, HS256 bearer JWTs, roles, reset tokens, login throttling."""
import hashlib
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.environ["JWT_SECRET"]
ALGO = "HS256"
ADMIN_ROLES = {"super_admin", "admin", "editor"}
bearer = HTTPBearer(auto_error=False)
_db = None
_fails: dict[str, list[float]] = {}


def init(db):
    global _db
    _db = db


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except ValueError:
        return False


def token_hash(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def make_token(user: dict, hours: int = 24 * 7) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user["_id"]), "roles": user.get("roles", []), "tv": user.get("token_version", 0),
                       "iat": now, "exp": now + timedelta(hours=hours)}, JWT_SECRET, algorithm=ALGO)


def public_user(u: dict) -> dict:
    return {"id": str(u["_id"]), "email": u["email"], "name": u.get("name", ""), "roles": u.get("roles", ["reader"]),
            "preferred_language": u.get("preferred_language", "English"), "favourite_categories": u.get("favourite_categories", []),
            "adult_confirmed": u.get("adult_confirmed", False), "created_at": u.get("created_at")}


def throttle_check(key: str):
    now = time.time()
    _fails[key] = [t for t in _fails.get(key, []) if now - t < 900]
    if len(_fails[key]) >= 5:
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")


def throttle_fail(key: str):
    _fails.setdefault(key, []).append(time.time())


async def _user_from(creds) -> dict | None:
    if not creds:
        return None
    try:
        p = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGO])
        u = await _db.users.find_one({"_id": ObjectId(p["sub"])})
    except Exception:
        raise HTTPException(401, "Invalid or expired session")
    if not u or u.get("disabled") or u.get("token_version", 0) != p.get("tv", 0):
        raise HTTPException(401, "Invalid or expired session")
    return u


async def optional_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    try:
        return await _user_from(creds)
    except HTTPException:
        return None


async def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    u = await _user_from(creds)
    if not u:
        raise HTTPException(401, "Sign in required")
    return u


def require_roles(*allowed):
    async def dep(u=Depends(current_user)):
        if not set(u.get("roles", [])) & set(allowed):
            raise HTTPException(403, "You do not have permission for this action")
        return u
    return dep


def client_key(request: Request, email: str) -> str:
    # Keyed on the account email: behind the ingress the client IP is the proxy's and changes.
    return f"login:{email}"


async def seed_admin():
    email, pw = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    existing = await _db.users.find_one({"email": email})
    if not existing:
        await _db.users.insert_one({"email": email, "password_hash": hash_pw(pw), "name": "Super Admin",
                                    "roles": ["super_admin"], "disabled": False, "token_version": 0,
                                    "created_at": datetime.now(timezone.utc).isoformat()})
    elif not verify_pw(pw, existing["password_hash"]):
        await _db.users.update_one({"_id": existing["_id"]}, {"$set": {"password_hash": hash_pw(pw)}})


def new_reset_token() -> str:
    return secrets.token_urlsafe(24)
