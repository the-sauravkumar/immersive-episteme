"""Load and verify an export bundle (format ``immersive-episteme-research-export`` v1).

Checksums are sha256 over canonical JSON exactly as the server computes them
(src/features/spatial/compiler/canonical.ts): object keys sorted, no whitespace, numbers in
JavaScript ``Number#toString`` form, strings as ``JSON.stringify`` writes them.
"""

from __future__ import annotations

import hashlib
import json
import math
from decimal import Decimal
from pathlib import Path
from typing import Any

FORMAT = "immersive-episteme-research-export"
SCHEMA_VERSION = 1


def js_number(x: float | int) -> str:
    """JavaScript Number#toString for a finite number (shortest round-trip digits)."""
    if isinstance(x, bool):
        raise TypeError("booleans are not numbers here")
    if isinstance(x, int):
        x = float(x) if abs(x) >= 2**53 else x
        if isinstance(x, int):
            return str(x)
    if not math.isfinite(x):
        raise ValueError("non-finite number in canonical JSON")
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    digits_tuple = Decimal(repr(abs(x))).normalize().as_tuple()
    digits = "".join(str(d) for d in digits_tuple.digits)
    k = len(digits)
    n = digits_tuple.exponent + k  # decimal point position
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    e = n - 1
    mant = digits[0] + ("." + digits[1:] if k > 1 else "")
    return f"{sign}{mant}e{'+' if e > 0 else '-'}{abs(e)}"


def canonical_json(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return js_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    if isinstance(value, dict):
        # JavaScript sorts by UTF-16 code units; UTF-16BE bytes compare in the same order.
        keys = sorted(value.keys(), key=lambda s: s.encode("utf-16-be", "surrogatepass"))
        return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{canonical_json(value[k])}" for k in keys) + "}"
    raise TypeError(f"unsupported value {type(value).__name__}")


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def load_bundle(path: str | Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def verify_bundle(bundle: dict[str, Any]) -> list[str]:
    """Format, checksums and join keys. Returns a list of problems (empty when valid)."""
    errors: list[str] = []
    if bundle.get("format") != FORMAT:
        errors.append(f"unknown format {bundle.get('format')!r}")
    if bundle.get("exportSchemaVersion") != SCHEMA_VERSION:
        errors.append(f"unsupported exportSchemaVersion {bundle.get('exportSchemaVersion')!r}")
    tables: dict[str, list[dict[str, Any]]] = bundle.get("tables", {})
    for name, rows in tables.items():
        if canonical_hash(rows) != bundle.get("checksums", {}).get(name):
            errors.append(f"checksum mismatch for table {name}")
    participants = {r["participant_code"] for r in tables.get("participants", [])}
    conditions = {r["condition_id"] for r in tables.get("conditions", [])}
    sessions = {r["session_id"]: r for r in tables.get("sessions", [])}
    concepts = {c["id"] for c in bundle.get("contentManifest", {}).get("concepts", [])}
    for s in sessions.values():
        if s["participant_code"] not in participants:
            errors.append(f"session {s['session_id']} has an unknown participant")
        # A NULL condition is "not allocated yet" (allocation follows the pre-test, D3), not a
        # broken join key (final review scoring-02); such a session cannot store telemetry.
        if s["condition_id"] is not None and s["condition_id"] not in conditions:
            errors.append(f"session {s['session_id']} has an unknown condition")
    seen: set[str] = set()
    for e in tables.get("events", []):
        s = sessions.get(e["session_id"])
        if s is None:
            errors.append(f"event {e['event_id']} has an unknown session")
        elif s["participant_code"] != e["participant_code"] or s["condition_id"] != e["condition_id"]:
            errors.append(f"event {e['event_id']} disagrees with its session")
        if e["event_id"] in seen:
            errors.append(f"duplicate event_id {e['event_id']}")
        seen.add(e["event_id"])
        if e.get("concept_id") and e["concept_id"] not in concepts:
            errors.append(f"event {e['event_id']} references an unknown concept")
    for name in ("derived_metrics", "derived_scores", "responses", "concept_maps"):
        for r in tables.get(name, []):
            if r["session_id"] not in sessions:
                errors.append(f"{name} row for unknown session {r['session_id']}")
    return errors
