#!/usr/bin/env python3
"""Fetch real MTR track geometry from OSM Overpass, simplify, emit TS static data.

For each MTR line: query route relation by ref, get full way geometry,
chain ways into a continuous polyline, simplify with Douglas-Peucker,
and project station coords onto the polyline to record along-distances.
"""
import json
import math
import sys
import urllib.parse
import urllib.request
import time

OVERPASS = "https://overpass-api.de/api/interpreter"

# lineCode -> OSM ref (same codes used in mtr-api.ts)
LINES = {
    "TWL": "TWL",
    "KTL": "KTL",
    "ISL": "ISL",
    "TKL": "TKL",
    "EAL": "EAL",
    "TML": "TML",
    "SIL": "SIL",
    "DRL": "DRL",
    "AEL": "AEL",
}

# Station list imported from mtr-api.ts (parsed at runtime from the TS file)
def load_stations(ts_path):
    """Parse MTR_STATIONS array out of mtr-api.ts."""
    import re
    src = open(ts_path).read()
    stations = []
    for m in re.finditer(
        r"\{\s*line:\s*'([A-Z]+)'\s*,\s*stationId:\s*'([^']*)'\s*,\s*stationCode:\s*'([^']*)'\s*,"
        r"\s*name_tc:\s*'([^']*)'\s*,\s*name_en:\s*'([^']*)'\s*,\s*lat:\s*([\d.]+)\s*,\s*lng:\s*([\d.]+)",
        src,
    ):
        stations.append({
            "line": m.group(1),
            "code": m.group(3),
            "name_tc": m.group(4),
            "lat": float(m.group(6)),
            "lng": float(m.group(7)),
        })
    return stations


def overpass_query(q, retries=3):
    for attempt in range(retries):
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(OVERPASS, data=data,
                                         headers={"User-Agent": "chaser-mtr-geometry/1.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read())
        except Exception as e:
            print(f"  attempt {attempt+1} failed: {e}", file=sys.stderr)
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    return None


def fetch_line_ways(ref):
    """Return ordered list of ways, each a list of [lat, lng]."""
    q = f'''[out:json][timeout:60];
relation["ref"="{ref}"]["network:en"="MTR"]["route"~"subway|railway|light_rail|monorail"];
out geom;'''
    d = overpass_query(q)
    if not d:
        return []
    rels = [e for e in d.get("elements", []) if e.get("type") == "relation"]
    if not rels:
        return []
    # Prefer the relation with the most way members (main line, not spur)
    rels.sort(key=lambda r: len([m for m in r.get("members", []) if m.get("type") == "way"]), reverse=True)
    rel = rels[0]
    print(f"  relation {rel['id']}: {rel.get('tags', {}).get('name:en', '?')}")
    ways = []
    for m in rel.get("members", []):
        if m.get("type") != "way":
            continue
        if m.get("role") in ("platform", "stop", "station", "entrance"):
            continue
        geom = m.get("geometry")
        if not geom or len(geom) < 2:
            continue
        ways.append([(p["lat"], p["lon"]) for p in geom])
    return ways


def dist_m(a, b):
    R = 6371000.0
    dlat = math.radians(b[0] - a[0])
    dlng = math.radians(b[1] - a[1])
    sla = math.sin(dlat / 2)
    slo = math.sin(dlng / 2)
    h = sla * sla + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * slo * slo
    return R * 2 * math.asin(math.sqrt(h))


def chain_ways(ways):
    """Greedy-chain ways into a continuous polyline by matching endpoints."""
    if not ways:
        return []
    remaining = list(ways)
    chain = remaining.pop(0)
    while remaining:
        head, tail = chain[0], chain[-1]
        best = None  # (index, flipped, at_tail, dist)
        for i, w in enumerate(remaining):
            for flip in (False, True):
                s, e = (w[0], w[-1]) if not flip else (w[-1], w[0])
                dt = dist_m(tail, s)
                dh = dist_m(head, e)
                if best is None or dt < best[3]:
                    best = (i, flip, True, dt)
                if best is None or dh < best[3]:
                    best = (i, flip, False, dh)
        if best is None or best[3] > 3000:
            break
        i, flip, at_tail, _ = best
        w = remaining.pop(i)
        if flip:
            w = list(reversed(w))
        if at_tail:
            chain.extend(w[1:])
        else:
            chain = w + chain[1:]
    return chain


def douglas_peucker(pts, eps_m):
    """Iterative Douglas-Peucker in local equirect projection."""
    if len(pts) < 3:
        return pts
    lat0 = sum(p[0] for p in pts) / len(pts)
    cos0 = math.cos(math.radians(lat0))

    def proj(p):
        return (p[1] * math.radians(1) * cos0 * 6371000, p[0] * math.radians(1) * 6371000)

    xy = [proj(p) for p in pts]
    keep = [False] * len(xy)
    keep[0] = keep[-1] = True
    stack = [(0, len(xy) - 1)]
    while stack:
        s, e = stack.pop()
        if e <= s + 1:
            continue
        ax, ay = xy[s]
        bx, by = xy[e]
        dx, dy = bx - ax, by - ay
        seg_len2 = dx * dx + dy * dy
        max_d, max_i = -1.0, -1
        for i in range(s + 1, e):
            px, py = xy[i]
            if seg_len2 < 1e-9:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > max_d:
                max_d, max_i = d, i
        if max_d > eps_m:
            keep[max_i] = True
            stack.append((s, max_i))
            stack.append((max_i, e))
    return [p for p, k in zip(pts, keep) if k]


def project_station(station, poly, cum):
    """Return along-route distance (m) of the nearest point on poly to station."""
    best_d, best_along = float("inf"), 0.0
    sp = (station["lat"], station["lng"])
    for i in range(len(poly) - 1):
        a, b = poly[i], poly[i + 1]
        # local projection
        lat0 = (a[0] + b[0]) / 2
        cos0 = math.cos(math.radians(lat0))
        def proj(p):
            return (p[1] * math.radians(1) * cos0 * 6371000, p[0] * math.radians(1) * 6371000)
        ax, ay = proj(a)
        bx, by = proj(b)
        px, py = proj(sp)
        dx, dy = bx - ax, by - ay
        seg_len2 = dx * dx + dy * dy
        t = 0.0 if seg_len2 < 1e-9 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
        qx, qy = ax + t * dx, ay + t * dy
        d = math.hypot(px - qx, py - qy)
        if d < best_d:
            best_d = d
            best_along = cum[i] + t * (cum[i + 1] - cum[i])
    return best_along, best_d


def main():
    ts_path = sys.argv[1] if len(sys.argv) > 1 else "/home/blackpi/chaser/src/lib/mtr-api.ts"
    stations = load_stations(ts_path)
    print(f"Loaded {len(stations)} stations")

    out = {}
    for code, ref in LINES.items():
        print(f"\n=== {code} ===")
        ways = fetch_line_ways(ref)
        if not ways:
            print(f"  no ways found for {ref}")
            continue
        print(f"  {len(ways)} ways")
        raw = chain_ways(ways)
        print(f"  chained: {len(raw)} points")
        simplified = douglas_peucker(raw, 40)  # 40m epsilon
        print(f"  simplified: {len(simplified)} points")

        # cumulative distances
        cum = [0.0]
        for i in range(len(simplified) - 1):
            cum.append(cum[-1] + dist_m(simplified[i], simplified[i + 1]))

        # project this line's stations onto the geometry
        line_stations = [s for s in stations if s["line"] == code]
        st = {}
        for s in line_stations:
            along, off = project_station(s, simplified, cum)
            if off > 800:
                print(f"  ⚠️ station {s['code']} ({s['name_tc']}) off by {off:.0f}m — excluded")
                continue
            st[s["code"]] = round(along)

        out[code] = {
            "points": [[round(p[0], 5), round(p[1], 5)] for p in simplified],
            "stations": st,
        }
        time.sleep(2)  # be nice to Overpass

    # Emit TS
    ts_out = "/home/blackpi/chaser/src/lib/mtr-geometry.ts"
    with open(ts_out, "w") as f:
        f.write("// Auto-generated MTR track geometry from OpenStreetMap (Overpass API).\n")
        f.write("// points: [lat, lng][] along the line; stations: stationCode -> along-route metres.\n")
        f.write("// Simplified with Douglas-Peucker (40m). Do not edit by hand.\n\n")
        f.write("export interface MTRLineGeometry {\n")
        f.write("  points: [number, number][];\n")
        f.write("  stations: Record<string, number>;\n")
        f.write("}\n\n")
        f.write("export const MTR_GEOMETRY: Record<string, MTRLineGeometry> = ")
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\n")
    print(f"\nWrote {ts_out}")
    import os
    print(f"Size: {os.path.getsize(ts_out)} bytes")


if __name__ == "__main__":
    main()
