"""Load leads from the nightly prospector.

Preferred: a structured leads.json the agent emits (list of lead dicts).
Fallback: best-effort parse of the markdown digest's lead lines.
"""
from __future__ import annotations
import json
import re
from .gate import Lead


def load_json(path: str) -> list[Lead]:
    with open(path) as fh:
        raw = json.load(fh)
    rows = raw.get("leads", raw) if isinstance(raw, dict) else raw
    out = []
    for r in rows:
        out.append(Lead(
            company=r.get("company", "").strip(),
            domain=(r.get("domain") or None),
            track=r.get("track", "").strip().lower(),
            pains=_as_pains(r.get("pains", [])),
            country=r.get("country", ""),
            commodity=r.get("commodity", ""),
            signal=r.get("signal", ""),
            source_url=r.get("source_url", ""),
            disqualified=bool(r.get("disqualified", False)),
        ))
    return out


def _as_pains(v):
    if isinstance(v, list):
        return [int(x) for x in v if str(x).strip().isdigit()]
    return [int(x) for x in re.findall(r"\d+", str(v))]


# --- markdown fallback -------------------------------------------------------
_TRACKS = {"operating": "operating", "ramp-up": "operating", "greenfield": "greenfield",
           "channel": "channel", "multiplier": "multiplier"}


def load_markdown(path: str) -> list[Lead]:
    """Lenient: pulls Pain #, Track and a domain/URL from bullet/line items."""
    out = []
    with open(path) as fh:
        for line in fh:
            if "Pain" not in line and "Track" not in line:
                continue
            pains = [int(x) for x in re.findall(r"[Pp]ain\s*#?\s*(\d+)", line)]
            track = ""
            for k, v in _TRACKS.items():
                if k in line.lower():
                    track = v
                    break
            company = re.split(r"[—\-:|]", line.strip("-* \t"))[0].strip()
            url = (re.search(r"https?://\S+", line) or [None])
            url = url.group(0) if hasattr(url, "group") else None
            domain = None
            if url:
                m = re.search(r"https?://([^/]+)", url)
                domain = m.group(1).replace("www.", "") if m else None
            if company:
                out.append(Lead(company=company, domain=domain, track=track,
                                pains=pains, source_url=url or ""))
    return out
