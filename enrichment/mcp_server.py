"""Optional MCP server — exposes the enrichment pipeline as a tool for Claude/Cowork.

This turns the pipeline into "your own connector": Claude can call `enrich_company`
and `enrich_leads` directly. OPTIONAL and UNTESTED in this environment.

Setup:
    pip install mcp PyYAML dnspython
    python mcp_server.py            # runs stdio MCP server
Then register it as a local MCP server in your client.
"""
from __future__ import annotations
import os

try:
    import yaml
    from mcp.server.fastmcp import FastMCP
except Exception as e:  # pragma: no cover
    raise SystemExit("Needs: pip install mcp PyYAML dnspython  (" + str(e) + ")")

from enrich import pipeline as pipelinemod
from enrich import digest as digestmod
from enrich.gate import Lead

_CFG_PATH = os.environ.get("ENRICH_CONFIG", "config.yaml")


def _cfg():
    with open(_CFG_PATH) as fh:
        return yaml.safe_load(fh)


mcp = FastMCP("one-mining-enrichment")


@mcp.tool()
def enrich_company(company: str, domain: str, track: str = "operating",
                   pains: list[int] | None = None) -> dict:
    """Certify one company and, if warm, discover + verify contacts."""
    lead = Lead(company=company, domain=domain, track=track, pains=pains or [])
    return pipelinemod.run([lead], _cfg())


@mcp.tool()
def enrich_leads(leads_json_path: str) -> dict:
    """Run the full nightly leads.json file through the gate + enrichment."""
    leads = digestmod.load_json(leads_json_path)
    return pipelinemod.run(leads, _cfg())


if __name__ == "__main__":
    mcp.run()
