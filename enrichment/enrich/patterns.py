"""Email-pattern generation.

Given a person's name and a company domain, produce candidate addresses ranked
by how common each pattern is in B2B. Used to fill gaps when discovery finds a
name but no email. Candidates are UNVERIFIED until verify.py checks them.
"""
from __future__ import annotations
import re
import unicodedata

# (template, prior-probability weight) — weights are rough B2B frequencies
PATTERNS = [
    ("{first}.{last}", 0.34),
    ("{f}{last}", 0.22),
    ("{first}{last}", 0.12),
    ("{first}", 0.08),
    ("{f}.{last}", 0.07),
    ("{first}_{last}", 0.05),
    ("{last}{f}", 0.04),
    ("{last}.{first}", 0.03),
    ("{first}{l}", 0.03),
    ("{f}{l}", 0.02),
]


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


def split_name(full_name: str):
    parts = [p for p in re.split(r"\s+", full_name.strip()) if p]
    if len(parts) < 2:
        return None
    first, last = _norm(parts[0]), _norm(parts[-1])
    if not first or not last:
        return None
    return first, last


def candidates(full_name: str, domain: str):
    """Return list of (email, weight) ranked best-first. Empty if name unusable."""
    sn = split_name(full_name)
    if not sn or not domain:
        return []
    first, last = sn
    sub = {"first": first, "last": last, "f": first[0], "l": last[0]}
    domain = domain.strip().lstrip("@").lower()
    out = []
    for tmpl, w in PATTERNS:
        local = tmpl.format(**sub)
        out.append((f"{local}@{domain}", w))
    # de-dup preserving order/highest weight
    seen, ranked = set(), []
    for email, w in sorted(out, key=lambda x: -x[1]):
        if email not in seen:
            seen.add(email)
            ranked.append((email, w))
    return ranked
