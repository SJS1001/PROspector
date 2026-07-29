"""Orchestrator: leads -> gate -> (cap, dedup) -> discover -> patterns -> verify -> output."""
from __future__ import annotations
import csv
import json
import os
import time
from datetime import datetime, timezone

from . import gate as gatemod
from . import discover as discovermod
from . import patterns as patternmod
from . import verify as verifymod


def _load_state(path: str) -> dict:
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return {}


def _save_state(path: str, state: dict):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as fh:
        json.dump(state, fh, indent=2)


def _title_rank(title: str, targets: list[str]) -> int:
    t = (title or "").lower()
    for i, tt in enumerate(targets):
        if tt.lower() in t:
            return i
    return len(targets) + 1


def run(leads, cfg, now=None):
    now = now or time.time()
    gate_cfg = cfg.get("gate", {})
    targets = cfg.get("target_titles", [])
    vmethod = cfg.get("verify", {}).get("method", "mx")
    vthresh = cfg.get("verify", {}).get("accept_threshold", 0.6)
    state = _load_state(cfg.get("state", {}).get("db", "./state/enriched.json"))
    dedup_secs = gate_cfg.get("dedup_days", 30) * 86400

    report = {"certified": [], "skipped": [], "enriched": []}

    # 1. gate
    certified = []
    for lead in leads:
        res = gatemod.certify(lead, gate_cfg)
        if res.certified:
            certified.append(lead)
            report["certified"].append({"company": lead.company, "track": lead.track,
                                        "pains": lead.pains})
        else:
            report["skipped"].append({"company": lead.company, "reason": res.reason})

    # 2. dedup + cap (keep strongest)
    fresh = [l for l in certified
             if (now - state.get(l.key, {}).get("ts", 0)) > dedup_secs]
    fresh.sort(key=gatemod.rank_key)
    cap = gate_cfg.get("nightly_cap", 10)
    to_enrich = fresh[:cap]

    # 3. enrich
    for lead in to_enrich:
        contacts = discovermod.discover(lead.domain, cfg)
        enriched_contacts = []
        for c in contacts:
            email = c.get("email")
            conf = c.get("confidence")
            if email and conf is None:
                conf = verifymod.verify(email, vmethod, cfg=cfg)
            # gap-fill: have a name but no email -> generate + verify patterns
            if not email and c.get("name"):
                best = None
                for cand, w in patternmod.candidates(c["name"], lead.domain)[:4]:
                    score = verifymod.verify(cand, vmethod, pattern_weight=w, cfg=cfg)
                    if best is None or score > best[1]:
                        best = (cand, score)
                if best:
                    email, conf = best
            if email and (conf or 0) >= vthresh:
                enriched_contacts.append({
                    "name": c.get("name") or "",
                    "title": c.get("title") or "",
                    "email": email,
                    "confidence": round(conf or 0, 3),
                    "source": c.get("source", ""),
                    "linkedin_hint": _li_hint(c.get("name"), lead.company),
                })
        enriched_contacts.sort(key=lambda c: (_title_rank(c["title"], targets), -c["confidence"]))
        lead.contacts = enriched_contacts
        state[lead.key] = {"ts": now, "company": lead.company, "n": len(enriched_contacts)}
        report["enriched"].append({
            "company": lead.company, "domain": lead.domain,
            "track": lead.track, "pains": lead.pains,
            "contacts": enriched_contacts,
        })

    _save_state(cfg.get("state", {}).get("db", "./state/enriched.json"), state)
    _write_outputs(report, cfg)
    return report


def _li_hint(name, company):
    if not name:
        return ""
    return f"https://www.linkedin.com/search/results/people/?keywords={name.replace(' ', '%20')}%20{str(company).replace(' ', '%20')}"


def _write_outputs(report, cfg):
    ocfg = cfg.get("output", {})
    odir = ocfg.get("dir", "./out")
    os.makedirs(odir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fmts = ocfg.get("formats", ["csv", "json"])
    if "json" in fmts:
        with open(os.path.join(odir, f"contacts-{stamp}.json"), "w") as fh:
            json.dump(report, fh, indent=2)
    if "csv" in fmts:
        with open(os.path.join(odir, f"contacts-{stamp}.csv"), "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["company", "domain", "track", "pains", "name", "title",
                        "email", "confidence", "source", "linkedin_hint"])
            for e in report["enriched"]:
                if not e["contacts"]:
                    w.writerow([e["company"], e["domain"], e["track"],
                                ";".join(map(str, e["pains"])), "", "", "", "", "", ""])
                for c in e["contacts"]:
                    w.writerow([e["company"], e["domain"], e["track"],
                                ";".join(map(str, e["pains"])), c["name"], c["title"],
                                c["email"], c["confidence"], c["source"], c["linkedin_hint"]])
