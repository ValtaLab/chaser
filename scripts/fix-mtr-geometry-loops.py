#!/usr/bin/env python3
"""Fix backtrack loops in mtr-geometry.ts.

Problem: OSM parallel tracks / branch spurs (e.g. TKL 康城 LHP, ISL 筲箕灣,
TML 天水圍) make the Dijkstra-routed polyline fold back on itself, so
TrackingView draws the MTR line wrong and GPS mid-journey matching breaks.

Fix: walk each polyline; when the current point returns near an earlier kept
point (loop), cut the loop. Then re-project every station onto the cleaned
polyline and rebuild the stations map (off > 800m excluded → runtime falls
back to station-path/straight line).
"""
import json, math, re

TS_GEOM = "src/lib/mtr-geometry.ts"
TS_API = "src/lib/mtr-api.ts"
MIN_LOOP_M = 120  # a point this close to an earlier point = loop
MAX_OFF_M = 800   # station projection limit (same as fetch script)

# Stations that are spurs/branches — never on the main line polyline.
# RAC = Racecourse spur (EAL), LMC = Lok Ma Chau branch (EAL),
# LHP = LOHAS Park branch (TKL, auto-excluded by off distance but list for clarity)
SKIP_STATIONS = {"EAL": {"RAC", "LMC"}}

# Lines whose OSM track is unreliable (mixed light-rail, backtracking spurs).
# Removed entirely → runtime falls back to station-path straight lines.
DROP_LINES = {"TML"}

def dist_m(a, b):
    R = 6371000.0
    dl = math.radians(b[0]-a[0]); dn = math.radians(b[1]-a[1])
    sl = math.sin(dl/2); sn = math.sin(dn/2)
    return R*2*math.asin(math.sqrt(sl*sl + math.cos(math.radians(a[0]))*math.cos(math.radians(b[0]))*sn*sn))

def load_geometry():
    src = open(TS_GEOM).read()
    m = re.search(r"MTR_GEOMETRY: Record<string, MTRLineGeometry> = (.*?);", src, re.S)
    return json.loads(m.group(1))

def load_stations():
    src = open(TS_API).read()
    out = []
    for m in re.finditer(
        r"\{\s*line:\s*'([A-Z]+)'\s*,\s*stationId:\s*'([^']*)'\s*,\s*stationCode:\s*'([^']*)'\s*,"
        r"\s*name_tc:\s*'([^']*)'\s*,\s*name_en:\s*'([^']*)'\s*,\s*lat:\s*([\d.]+)\s*,\s*lng:\s*([\d.]+)", src):
        out.append({"line": m.group(1), "code": m.group(3), "name_tc": m.group(4),
                    "lat": float(m.group(6)), "lng": float(m.group(7))})
    return out

def remove_loops(points, min_loop=MIN_LOOP_M):
    if len(points) < 3:
        return points
    kept = [points[0]]
    for p in points[1:]:
        last = kept[-1]
        if dist_m(last, p) < min_loop:
            kept.append(p)  # normal forward movement
            continue
        # Jumped somewhere — check against earlier points (newest → oldest)
        cut = None
        for i in range(len(kept)-2, -1, -1):
            if dist_m(kept[i], p) < min_loop:
                cut = i
                break
        if cut is not None:
            kept = kept[:cut+1]  # cut the loop, keep up to the earlier point
        else:
            kept.append(p)
    return kept

def project_station(station, poly, cum):
    best_d, best_along = float("inf"), 0.0
    sp = (station["lat"], station["lng"])
    for i in range(len(poly)-1):
        a, b = poly[i], poly[i+1]
        lat0 = (a[0]+b[0])/2; cos0 = math.cos(math.radians(lat0))
        def proj(p):
            return (p[1]*math.radians(1)*cos0*6371000, p[0]*math.radians(1)*6371000)
        ax, ay = proj(a); bx, by = proj(b); px, py = proj(sp)
        dx, dy = bx-ax, by-ay; sl2 = dx*dx + dy*dy
        t = 0.0 if sl2 < 1e-9 else max(0.0, min(1.0, ((px-ax)*dx + (py-ay)*dy)/sl2))
        qx, qy = ax + t*dx, ay + t*dy
        d = math.hypot(px-qx, py-qy)
        if d < best_d:
            best_d = d; best_along = cum[i] + t*(cum[i+1]-cum[i])
    return best_along, best_d

def main():
    geom = load_geometry()
    stations = load_stations()
    out = {}
    for code, g in geom.items():
        if code in DROP_LINES:
            print(f"{code}: DROPPED (unreliable OSM track → runtime station-path fallback)")
            continue
        cleaned = remove_loops(g["points"])
        removed = len(g["points"]) - len(cleaned)
        print(f"{code}: {len(g['points'])} → {len(cleaned)} pts (removed {removed} loop pts)")

        cum = [0.0]
        for i in range(len(cleaned)-1):
            cum.append(cum[-1] + dist_m(cleaned[i], cleaned[i+1]))

        st = {}
        skip = SKIP_STATIONS.get(code, set())
        line_stations = [s for s in stations if s["line"] == code and s["code"] not in skip]
        for s in line_stations:
            along, off = project_station(s, cleaned, cum)
            if off > MAX_OFF_M:
                print(f"  ⚠️ {s['code']} ({s['name_tc']}) off {off:.0f}m — excluded")
                continue
            st[s["code"]] = round(along)

        # Force monotonic along station definition order
        prev = -1
        for s in line_stations:
            if s["code"] not in st:
                continue
            if st[s["code"]] <= prev:
                st[s["code"]] = prev + 100
            prev = st[s["code"]]

        vals = list(st.values())
        mono = all(vals[i] <= vals[i+1] for i in range(len(vals)-1))
        print(f"  ✅ {len(st)}/{len(line_stations)} stations, monotonic={'✅' if mono else '❌'}, total {cum[-1]/1000:.1f}km")
        out[code] = {"points": [[round(p[0],5), round(p[1],5)] for p in cleaned], "stations": st}

    with open(TS_GEOM, "w") as f:
        f.write("// Auto-generated MTR track geometry from OpenStreetMap (Overpass API).\n")
        f.write("// points: [lat, lng][] along the line; stations: stationCode -> along-route metres.\n")
        f.write("// Loop-cleaned: backtrack spurs removed (TKL 康城, ISL 筲箕灣, TML 天水圍).\n\n")
        f.write("export interface MTRLineGeometry {\n  points: [number, number][];\n  stations: Record<string, number>;\n}\n\n")
        f.write("export const MTR_GEOMETRY: Record<string, MTRLineGeometry> = ")
        json.dump(out, f, separators=(",",":"), ensure_ascii=False)
        f.write(";\n")
    print(f"\n✅ Wrote {TS_GEOM}")

if __name__ == "__main__":
    main()
