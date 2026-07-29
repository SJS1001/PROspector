"""CLI entry point.

Examples:
  python -m enrich.cli --leads sample_leads.json
  python -m enrich.cli --digest digest-2026-06-28.md
  python -m enrich.cli --company "Acme Copper" --domain acme.com --track operating --pains 3,5
"""
from __future__ import annotations
import argparse
import os
import sys

try:
    import yaml
except Exception:
    yaml = None

from . import digest as digestmod
from . import pipeline as pipelinemod
from .gate import Lead


def load_cfg(path: str) -> dict:
    if yaml is None:
        sys.exit("PyYAML not installed. Run: pip install -r requirements.txt")
    with open(path) as fh:
        return yaml.safe_load(fh)


def main(argv=None):
    if os.environ.get("PROSPECTOR_ENABLE_UNSAFE_LEGACY") != "acknowledged-local-migration-only":
        sys.exit(
            "Blocked: this archived pipeline can promote guessed/MX-only emails and "
            "bypass the new approval ledger. It is migration evidence, not a production "
            "runtime. See docs/IMPLEMENTATION-SPEC.md."
        )
    ap = argparse.ArgumentParser(description="ONE for Mining — OSS contact enrichment")
    ap.add_argument("--config", default="config.yaml")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--leads", help="leads JSON file from the nightly agent")
    src.add_argument("--digest", help="markdown digest to parse (fallback)")
    src.add_argument("--company", help="single company name")
    ap.add_argument("--domain")
    ap.add_argument("--track", default="operating")
    ap.add_argument("--pains", default="")
    ap.add_argument("--cap", type=int, help="override nightly_cap")
    ap.add_argument("--verify", help="override verify method: none|mx|smtp|hunter")
    args = ap.parse_args(argv)

    cfg = load_cfg(args.config)
    if args.cap is not None:
        cfg.setdefault("gate", {})["nightly_cap"] = args.cap
    if args.verify:
        cfg.setdefault("verify", {})["method"] = args.verify

    if args.leads:
        leads = digestmod.load_json(args.leads)
    elif args.digest:
        leads = digestmod.load_markdown(args.digest)
    else:
        pains = [int(x) for x in args.pains.split(",") if x.strip().isdigit()]
        leads = [Lead(company=args.company, domain=args.domain,
                      track=args.track, pains=pains)]

    report = pipelinemod.run(leads, cfg)
    print(f"certified: {len(report['certified'])} | "
          f"skipped: {len(report['skipped'])} | "
          f"enriched: {len(report['enriched'])}")
    for e in report["enriched"]:
        print(f"\n{e['company']} ({e['domain']}) [{e['track']}] pains={e['pains']}")
        for c in e["contacts"]:
            print(f"  - {c['name'] or '?':28} {c['title'][:28]:28} "
                  f"{c['email']:36} conf={c['confidence']} ({c['source']})")
        if not e["contacts"]:
            print("  (no contacts above confidence threshold)")
    if report["skipped"]:
        print("\nskipped (not certified):")
        for s in report["skipped"]:
            print(f"  - {s['company']}: {s['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
