"""Certification gate — the 'warm certified' rule.

Only leads that pass `certify()` are enriched. Everything else is logged with a
reason and skipped, so no enrichment effort/credits are spent on cold leads.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Lead:
    company: str
    domain: Optional[str] = None
    track: str = ""                 # operating | greenfield | channel | multiplier
    pains: list = field(default_factory=list)   # e.g. [3, 5]
    country: str = ""
    commodity: str = ""
    signal: str = ""
    source_url: str = ""
    disqualified: bool = False
    # filled by discovery:
    contacts: list = field(default_factory=list)

    @property
    def key(self) -> str:
        return (self.domain or self.company).strip().lower()


@dataclass
class GateResult:
    certified: bool
    reason: str


def certify(lead: Lead, gate_cfg: dict) -> GateResult:
    """Return whether a lead is warm-certified for enrichment, with a reason."""
    if lead.disqualified:
        return GateResult(False, "disqualified")

    allowed = [t.lower() for t in gate_cfg.get("allowed_tracks", [])]
    if allowed and lead.track.lower() not in allowed:
        return GateResult(False, f"track '{lead.track}' not in {allowed}")

    if gate_cfg.get("require_pain_signal", True) and not lead.pains:
        return GateResult(False, "no pain signal matched")

    if gate_cfg.get("require_domain", True) and not lead.domain:
        return GateResult(False, "no company domain")

    return GateResult(True, "certified")


def rank_key(lead: Lead) -> tuple:
    """Sort certified leads by strength so the nightly cap keeps the best.
    More pain signals first; operating track before greenfield."""
    track_rank = 0 if lead.track.lower() == "operating" else 1
    return (-len(lead.pains), track_rank, lead.company.lower())
