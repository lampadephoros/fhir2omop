// Shared render helpers for the DQ dashboard routes (/dq and /dq/:id).
export const esc = (s: any) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Kahn data-quality category → accent colour.
export const KAHN_COLOR: Record<string, string> = {
    conformance: "#dc2626", completeness: "#d97706", plausibility: "#7c3aed",
};

// Coloured status pill for a check result.
export const statusBadge = (s: string) => {
    const c: Record<string, string> = { PASS: "#16a34a", FAIL: "#dc2626", ERROR: "#b91c1c", NA: "#9ca3af" };
    const label = s === "PASS" ? "✓ PASS" : s === "FAIL" ? "✗ FAIL" : s === "ERROR" ? "! ERR" : "· N/A";
    return `<span style="font-size:10px;font-weight:700;color:${c[s]}">${label}</span>`;
};
