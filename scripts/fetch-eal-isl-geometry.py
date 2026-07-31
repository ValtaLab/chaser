#!/usr/bin/env python3
"""Re-generate EAL + ISL geometry using relation-based Dijkstra routing.
EAL: skip RAC (Racecourse) and LMC (Lok Ma Chau branch).
ISL: straightforward, no branches.
"""
import json, math, re, sys, heapq, time, urllib.parse, urllib.request
from collections import defaultdict

OVERPASS = "https://overpass-api.de/api/interpreter"

def load_stations(ts_path):
    src = open(ts_path).read()
    out = []
    for m in re.finditer(
        r"\{\s*line:\s*'([A-Z]+)'\s*,\s*stationId:\s*'([^']*)'\s*,\s*stationCode:\s*'([^']*)'\s*,"
        r"\s*name_tc:\s*'([^']*)'\s*,\s*name_en:\s*'([^']*)'\s*,\s*lat:\s*([\d.]+)\s*,\s*lng:\s*([\d.]+)", src):
        out.append({"line":m.group(1),"code":m.group(3),"name_tc":m.group(4),"lat":float(m.group(6)),"lng":float(m.group(7))})
    return out

def dist_m(a, b):
    R=6371000.0; dl=math.radians(b[0]-a[0]); dn=math.radians(b[1]-a[1])
    sl=math.sin(dl/2); sn=math.sin(dn/2)
    return R*2*math.asin(math.sqrt(sl*sl+math.cos(math.radians(a[0]))*math.cos(math.radians(b[0]))*sn*sn))

def overpass_query(q, retries=4):
    for a in range(retries):
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent":"chaser-mtr/8.0"})
            with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())
        except Exception as e:
            print(f"  attempt {a+1} failed: {e}", file=sys.stderr)
            if a < retries-1: time.sleep(10*(a+1))
    return None

def fetch_relation_ways(ref):
    q = f'[out:json][timeout:90];relation["ref"="{ref}"]["network:en"="MTR"]["route"~"subway|railway|light_rail|monorail"];out geom;'
    d = overpass_query(q)
    if not d: return []
    ways = []
    for rel in [e for e in d.get("elements",[]) if e.get("type")=="relation"]:
        for m in rel.get("members",[]):
            if m.get("type")!="way" or m.get("role") in ("platform","stop","station","entrance","stop_position"): continue
            g = m.get("geometry")
            if g and len(g)>=2: ways.append([(p["lat"],p["lon"]) for p in g])
    return ways

def build_graph(ways):
    def key(p): return (round(p[0],6), round(p[1],6))
    adj = defaultdict(set); coords = {}
    for way in ways:
        for i in range(len(way)-1):
            a, b = key(way[i]), key(way[i+1])
            if a == b: continue
            adj[a].add(b); adj[b].add(a)
            coords[a] = way[i]; coords[b] = way[i+1]
    return adj, coords

def nearest_node(station, coords):
    sp = (station["lat"], station["lng"])
    best_k, best_d = None, float("inf")
    for k, c in coords.items():
        d = dist_m(sp, c)
        if d < best_d: best_d, best_k = d, k
    return best_k, best_d

def dijkstra(adj, coords, start, end):
    if start == end: return [start]
    dist = {start: 0.0}; prev = {}; heap = [(0.0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == end: break
        if d > dist.get(u, float("inf")): continue
        for v in adj[u]:
            nd = d + dist_m(coords[u], coords[v])
            if nd < dist.get(v, float("inf")):
                dist[v] = nd; prev[v] = u; heapq.heappush(heap, (nd, v))
    if end not in prev and end != start: return None
    path = []; cur = end
    while cur != start:
        path.append(cur); cur = prev.get(cur)
        if cur is None: return None
    path.append(start); path.reverse()
    return path

def douglas_peucker(pts, eps_m):
    if len(pts) < 3: return pts
    lat0 = sum(p[0] for p in pts)/len(pts); cos0 = math.cos(math.radians(lat0))
    def proj(p): return (p[1]*math.radians(1)*cos0*6371000, p[0]*math.radians(1)*6371000)
    xy = [proj(p) for p in pts]
    keep = [False]*len(xy); keep[0]=keep[-1]=True
    stack = [(0, len(xy)-1)]
    while stack:
        s, e = stack.pop()
        if e <= s+1: continue
        ax,ay=xy[s]; bx,by=xy[e]; dx,dy=bx-ax,by-ay; sl2=dx*dx+dy*dy
        md, mi = -1.0, -1
        for i in range(s+1, e):
            px,py=xy[i]
            if sl2<1e-9: d=math.hypot(px-ax,py-ay)
            else:
                t=max(0.0,min(1.0,((px-ax)*dx+(py-ay)*dy)/sl2))
                d=math.hypot(px-(ax+t*dx),py-(ay+t*dy))
            if d>md: md,mi=d,i
        if md>eps_m: keep[mi]=True; stack.append((s,mi)); stack.append((mi,e))
    return [p for p,k in zip(pts,keep) if k]

def project_station(station, poly, cum):
    best_d, best_along = float("inf"), 0.0
    sp = (station["lat"], station["lng"])
    for i in range(len(poly)-1):
        a,b = poly[i],poly[i+1]
        lat0=(a[0]+b[0])/2; cos0=math.cos(math.radians(lat0))
        def proj(p): return (p[1]*math.radians(1)*cos0*6371000, p[0]*math.radians(1)*6371000)
        ax,ay=proj(a); bx,by=proj(b); px,py=proj(sp)
        dx,dy=bx-ax,by-ay; sl2=dx*dx+dy*dy
        t=0.0 if sl2<1e-9 else max(0.0,min(1.0,((px-ax)*dx+(py-ay)*dy)/sl2))
        qx,qy=ax+t*dx,ay+t*dy; d=math.hypot(px-qx,py-qy)
        if d<best_d: best_d=d; best_along=cum[i]+t*(cum[i+1]-cum[i])
    return best_along, best_d

def process_line(code, ref, stations, skip_codes=None):
    print(f"\n=== {code} ===")
    ways = fetch_relation_ways(ref)
    if not ways: print("  no ways"); return None
    print(f"  {len(ways)} ways")

    adj, coords = build_graph(ways)
    print(f"  graph: {len(coords)} nodes")

    line_stations = [s for s in stations if s["line"]==code]
    if skip_codes:
        line_stations = [s for s in line_stations if s["code"] not in skip_codes]

    nodes = []; valid = []
    for s in line_stations:
        n, off = nearest_node(s, coords)
        if off > 2000:
            print(f"  ⚠️ {s['code']} ({s['name_tc']}) {off:.0f}m — skipped")
        else:
            nodes.append(n); valid.append(s)

    full_coords = []
    for i in range(len(nodes)-1):
        seg = dijkstra(adj, coords, nodes[i], nodes[i+1])
        straight = dist_m(coords[nodes[i]], coords[nodes[i+1]])
        if seg is None:
            print(f"  ⚠️ no path {valid[i]['code']}→{valid[i+1]['code']}, straight")
            seg_coords = [coords[nodes[i]], coords[nodes[i+1]]]
        else:
            seg_coords = [coords[k] for k in seg]
            seg_len = sum(dist_m(seg_coords[j], seg_coords[j+1]) for j in range(len(seg_coords)-1))
            if straight > 100 and seg_len > straight * 3:
                print(f"  ⚠️ {valid[i]['code']}→{valid[i+1]['code']} detour ({seg_len:.0f}m vs {straight:.0f}m) — straight")
                seg_coords = [coords[nodes[i]], coords[nodes[i+1]]]
        if not full_coords: full_coords.extend(seg_coords)
        else: full_coords.extend(seg_coords[1:])

    if len(full_coords) < 2: print("  routing failed"); return None
    simplified = douglas_peucker(full_coords, 40)
    jumps = sum(1 for i in range(1, len(simplified)) if dist_m(simplified[i-1], simplified[i]) > 1500)
    cum = [0.0]
    for i in range(len(simplified)-1): cum.append(cum[-1]+dist_m(simplified[i],simplified[i+1]))
    print(f"  {len(simplified)} pts, {cum[-1]/1000:.1f}km, {jumps} jumps")

    # Project ALL line stations
    all_stations = [s for s in stations if s["line"]==code]
    if skip_codes:
        all_stations = [s for s in all_stations if s["code"] not in skip_codes]
    st = {}
    for s in all_stations:
        along, off = project_station(s, simplified, cum)
        if off > 800:
            print(f"  ⚠️ {s['code']} ({s['name_tc']}) off {off:.0f}m — excluded")
        else:
            st[s["code"]] = round(along)

    # Force monotonic
    prev = -1
    for s in all_stations:
        if s["code"] not in st: continue
        if st[s["code"]] <= prev: st[s["code"]] = prev + 100
        prev = st[s["code"]]

    vals = list(st.values())
    mono = all(vals[i] <= vals[i+1] for i in range(len(vals)-1))
    print(f"  ✅ {len(st)} stations, monotonic={'✅' if mono else '❌'}")
    return {"points":[[round(p[0],5),round(p[1],5)] for p in simplified], "stations":st}

def main():
    stations = load_stations("/home/blackpi/chaser/src/lib/mtr-api.ts")

    # EAL: skip RAC (Racecourse spur) and LMC (Lok Ma Chau branch)
    eal = process_line("EAL", "EAL", stations, skip_codes={"RAC","LMC"})
    time.sleep(5)

    # ISL: no branches
    isl = process_line("ISL", "ISL", stations)

    # Merge into existing geometry
    path = "/home/blackpi/chaser/src/lib/mtr-geometry.ts"
    src = open(path).read()
    m = re.search(r'MTR_GEOMETRY: Record<string, MTRLineGeometry> = (.*);\n', src, re.DOTALL)
    data = json.loads(m.group(1))

    if eal: data["EAL"] = eal
    if isl: data["ISL"] = isl

    header = src[:m.start(1)]
    out = header + json.dumps(data, separators=(",",":"), ensure_ascii=False) + ";\n"
    open(path, "w").write(out)
    import os
    print(f"\nWrote {path} ({os.path.getsize(path)} bytes)")
    print(f"Lines: {sorted(data.keys())}")

if __name__ == "__main__": main()
