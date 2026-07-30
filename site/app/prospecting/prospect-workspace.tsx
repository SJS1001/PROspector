import React from "react";
export function ProspectWorkspace({ evidence = [] as unknown[] }: { evidence?: unknown[] }) { return <section><h2>Prospect Workspace</h2>{evidence.length ? <p>Evidence provenance appears before score.</p> : <p>No evidence submitted yet</p>}<p>Application-calculated qualification</p><button disabled>Find Prospects</button></section>; }
