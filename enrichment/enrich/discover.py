"""Contact discovery for a domain.

Order of preference:
  1. Hunter.io domain-search  (if HUNTER_API_KEY set) -> name + position + email  [best]
  2. theHarvester CLI         (if installed)          -> emails (+names derived)  [free]
  3. pattern-only             (always)                -> needs names from above

Everything degrades gracefully: missing tools just return fewer contacts, never crash.
Returns list of dicts: {name, title, email, source, confidence?}
"""
from __future__ import annotations
import json
import os
import re
import shutil
import subprocess
import tempfile

try:
    import requests  # type: ignore
    _HAVE_REQUESTS = True
except Exception:
    _HAVE_REQUESTS = False


def discover(domain: str, cfg: dict) -> list[dict]:
    domain = (domain or "").strip().lstrip("@").lower()
    if not domain:
        return []
    contacts = []
    dcfg = cfg.get("discovery", {})

    if dcfg.get("hunter_api_key_env") and os.environ.get(dcfg["hunter_api_key_env"]):
        contacts += _hunter_domain_search(domain, dcfg)

    if not contacts and dcfg.get("use_theharvester", True):
        contacts += _theharvester(domain, dcfg)

    # de-dup by email/name
    seen, out = set(), []
    for c in contacts:
        k = (c.get("email") or c.get("name") or "").lower()
        if k and k not in seen:
            seen.add(k)
            out.append(c)
    return out


def _hunter_domain_search(domain: str, dcfg: dict) -> list[dict]:
    key = os.environ.get(dcfg.get("hunter_api_key_env", "HUNTER_API_KEY"))
    if not (_HAVE_REQUESTS and key):
        return []
    try:
        r = requests.get(
            "https://api.hunter.io/v2/domain-search",
            params={"domain": domain, "api_key": key, "limit": 25}, timeout=20,
        )
        emails = r.json().get("data", {}).get("emails", [])
    except Exception:
        return []
    out = []
    for e in emails:
        name = " ".join(x for x in [e.get("first_name"), e.get("last_name")] if x)
        out.append({
            "name": name or None,
            "title": e.get("position") or "",
            "email": e.get("value"),
            "source": "hunter",
            "confidence": (e.get("confidence") or 0) / 100.0,
        })
    return out


def _theharvester(domain: str, dcfg: dict) -> list[dict]:
    exe = shutil.which("theHarvester") or shutil.which("theharvester")
    if not exe:
        return []   # not installed; skip silently
    sources = dcfg.get("theharvester_sources", "bing,duckduckgo,crtsh")
    with tempfile.TemporaryDirectory() as td:
        out_base = os.path.join(td, "th")
        try:
            subprocess.run(
                [exe, "-d", domain, "-b", sources, "-f", out_base],
                capture_output=True, timeout=180, check=False,
            )
        except Exception:
            return []
        emails = []
        for ext in (".json",):
            p = out_base + ext
            if os.path.exists(p):
                try:
                    with open(p) as fh:
                        data = json.load(fh)
                    emails = data.get("emails", []) or []
                except Exception:
                    emails = []
    out = []
    for em in emails:
        out.append({
            "name": _name_from_email(em),
            "title": "",
            "email": em,
            "source": "theHarvester",
        })
    return out


def _name_from_email(email: str):
    """Best-effort name from a first.last@ local part."""
    local = email.split("@", 1)[0]
    parts = re.split(r"[._-]", local)
    parts = [p for p in parts if p.isalpha() and len(p) > 1]
    if len(parts) >= 2:
        return f"{parts[0].title()} {parts[1].title()}"
    return None
