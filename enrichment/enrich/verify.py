"""Email verification.

Methods, weakest to strongest:
  none  - no check; confidence = pattern prior only
  mx    - domain has MX records (can the domain receive mail at all?)  [stdlib + dnspython]
  smtp  - MX RCPT TO probe (often blocked/greylisted; many servers accept-all)  [unreliable]
  hunter- Hunter.io verifier API (needs HUNTER_API_KEY)  [best free-tier option]

Returns confidence 0..1. We never *assert* an address is valid; we score it.
"""
from __future__ import annotations
import os
import smtplib
import socket

try:
    import dns.resolver  # type: ignore
    _HAVE_DNS = True
except Exception:
    _HAVE_DNS = False

try:
    import requests  # type: ignore
    _HAVE_REQUESTS = True
except Exception:
    _HAVE_REQUESTS = False

_MX_CACHE: dict = {}


def mx_hosts(domain: str):
    if not _HAVE_DNS:
        return []
    if domain in _MX_CACHE:
        return _MX_CACHE[domain]
    try:
        ans = dns.resolver.resolve(domain, "MX", lifetime=5)
        hosts = sorted((r.preference, str(r.exchange).rstrip(".")) for r in ans)
        hosts = [h for _, h in hosts]
    except Exception:
        hosts = []
    _MX_CACHE[domain] = hosts
    return hosts


def _domain(email: str) -> str:
    return email.split("@", 1)[1] if "@" in email else ""


def verify(email: str, method: str, pattern_weight: float = 0.3, cfg: dict | None = None) -> float:
    """Return a confidence score 0..1 for `email` under the chosen method."""
    cfg = cfg or {}
    method = (method or "none").lower()

    if method == "none":
        return round(min(pattern_weight, 0.4), 3)

    if method == "mx":
        return 0.6 if mx_hosts(_domain(email)) else 0.1

    if method == "smtp":
        return _smtp_probe(email)

    if method == "hunter":
        return _hunter_verify(email, cfg)

    return round(pattern_weight, 3)


def _smtp_probe(email: str, timeout: int = 8) -> float:
    hosts = mx_hosts(_domain(email))
    if not hosts:
        return 0.1
    try:
        server = smtplib.SMTP(timeout=timeout)
        server.connect(hosts[0])
        server.helo("example.com")
        server.mail("verify@example.com")
        code, _ = server.rcpt(email)
        server.quit()
        if code in (250, 251):
            return 0.75          # accepted (could still be catch-all)
        if code in (550, 551, 553):
            return 0.05          # rejected
        return 0.4
    except (socket.timeout, smtplib.SMTPException, OSError):
        return 0.4               # inconclusive (port 25 often blocked)


def _hunter_verify(email: str, cfg: dict) -> float:
    key = os.environ.get(cfg.get("discovery", {}).get("hunter_api_key_env", "HUNTER_API_KEY"))
    if not (_HAVE_REQUESTS and key):
        return 0.3
    try:
        r = requests.get(
            "https://api.hunter.io/v2/email-verifier",
            params={"email": email, "api_key": key}, timeout=15,
        )
        data = r.json().get("data", {})
        score = data.get("score")
        if score is not None:
            return round(score / 100.0, 3)
        return {"deliverable": 0.9, "risky": 0.5, "undeliverable": 0.05}.get(
            data.get("status", ""), 0.3)
    except Exception:
        return 0.3
