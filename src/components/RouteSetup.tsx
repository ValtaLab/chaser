'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import { getKMBRouteInfo, getKMBRouteStops, getKMBStopInfo, getCitybusRouteInfo, getCitybusRouteStops, getCitybusStopInfo } from '@/lib/bus-api';
import { getGMBRouteInfo, getGMBRouteStops } from '@/lib/gmb-api';
import type { CommuteRoute } from '@/types';

interface RouteSetupProps {
  editRoute?: CommuteRoute | null;
  onDone?: (route?: CommuteRoute) => void;
  onSave?: (route: CommuteRoute) => void;
}

interface StopOption {
  id: string;
  name: string;
  seq: number;
}

interface RouteValidation {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  company?: 'KMB' | 'CTB' | 'GMB';
  routeId?: number;
  region?: string;
  directions?: Array<{ seq: number; orig: string; dest: string }>;
}

export default function RouteSetup({ editRoute, onDone, onSave }: RouteSetupProps) {
  const { addRoute, updateRoute } = useAppStore();
  const [step, setStep] = useState<'name' | 'segments' | 'confirm'>('name');
  const [routeName, setRouteName] = useState('');
  const [direction, setDirection] = useState<'to_work' | 'to_home'>('to_work');
  const [segments, setSegments] = useState<Array<{
    routeType: 'bus' | 'mtr' | 'minibus' | 'tram';
    routeName: string;
    fromStop: string;
    toStop: string;
    fromStopId: string;
    toStopId: string;
  }>>([]);
  const [savedRoute, setSavedRoute] = useState<CommuteRoute | undefined>();

  // Route validation state per segment
  const [validations, setValidations] = useState<Map<number, RouteValidation>>(new Map());
  const [stopsOptions, setStopsOptions] = useState<Map<number, StopOption[]>>(new Map());
  const [selectedDirection, setSelectedDirection] = useState<Map<number, number>>(new Map());
  const debounceTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());

  // Pre-fill form when editing
  useEffect(() => {
    if (editRoute) {
      setRouteName(editRoute.name);
      setDirection(editRoute.direction);
      setSegments(editRoute.segments.map(seg => ({
        routeType: seg.route.type as 'bus' | 'mtr' | 'minibus' | 'tram',
        routeName: seg.route.name,
        fromStop: seg.fromStop.nameZh,
        toStop: seg.toStop.nameZh,
        fromStopId: seg.fromStop.id,
        toStopId: seg.toStop.id,
      })));
      setStep('segments');
    }
  }, [editRoute]);

  // Validate route and load stops
  const validateAndLoadStops = useCallback(async (index: number, routeType: string, routeName: string) => {
    if (!routeName || routeName.length < 1) {
      setValidations(prev => new Map(prev).set(index, { status: 'idle' }));
      setStopsOptions(prev => new Map(prev).set(index, []));
      return;
    }

    setValidations(prev => new Map(prev).set(index, { status: 'checking' }));

    try {
      if (routeType === 'bus') {
        // Try KMB first
        const kmbRoutes = await getKMBRouteInfo(routeName);
        if (kmbRoutes.length > 0) {
          const route = kmbRoutes[0];
          const dirs = kmbRoutes.map((r, i) => ({
            seq: i + 1,
            orig: r.orig_tc,
            dest: r.dest_tc,
          }));
          setValidations(prev => new Map(prev).set(index, {
            status: 'valid',
            company: 'KMB',
            directions: dirs,
          }));
          // Load stops for first direction
          await loadKMBStops(index, routeName, 'O');
          return;
        }

        // Try Citybus
        const ctbRoutes = await getCitybusRouteInfo(routeName);
        if (ctbRoutes.length > 0) {
          const dirs = ctbRoutes.map((r, i) => ({
            seq: i + 1,
            orig: r.orig_tc,
            dest: r.dest_tc,
          }));
          setValidations(prev => new Map(prev).set(index, {
            status: 'valid',
            company: 'CTB',
            directions: dirs,
          }));
          // Load CTB stops for first direction
          await loadCTBStops(index, routeName, 'O');
          return;
        }

        setValidations(prev => new Map(prev).set(index, { status: 'invalid' }));
        setStopsOptions(prev => new Map(prev).set(index, []));

      } else if (routeType === 'minibus') {
        // Try GMB - need to check all regions
        for (const region of ['HKI', 'KLN', 'NT']) {
          const gmbRoutes = await getGMBRouteInfo(region, routeName);
          if (gmbRoutes.length > 0) {
            const route = gmbRoutes[0];
            const dirs = route.directions.map(d => ({
              seq: d.route_seq,
              orig: d.orig_tc,
              dest: d.dest_tc,
            }));
            setValidations(prev => new Map(prev).set(index, {
              status: 'valid',
              company: 'GMB',
              routeId: route.route_id,
              region,
              directions: dirs,
            }));
            // Load stops for first direction
            await loadGMBStops(index, route.route_id, 1);
            return;
          }
        }
        setValidations(prev => new Map(prev).set(index, { status: 'invalid' }));
        setStopsOptions(prev => new Map(prev).set(index, []));
      }
    } catch (e) {
      console.error('Route validation error:', e);
      setValidations(prev => new Map(prev).set(index, { status: 'invalid' }));
    }
  }, []);

  const loadKMBStops = async (index: number, route: string, bound: 'I' | 'O') => {
    const stops = await getKMBRouteStops(route, bound);
    const options: StopOption[] = await Promise.all(
      stops.map(async (s) => {
        const info = await getKMBStopInfo(s.stop);
        return {
          id: s.stop,
          name: info?.name_tc || s.stop,
          seq: s.seq,
        };
      })
    );
    setStopsOptions(prev => new Map(prev).set(index, options));
  };

  const loadCTBStops = async (index: number, route: string, bound: 'I' | 'O') => {
    const stops = await getCitybusRouteStops(route, bound);
    const options: StopOption[] = await Promise.all(
      stops.map(async (s) => {
        const info = await getCitybusStopInfo(s.stop);
        return {
          id: s.stop,
          name: info?.name_tc || s.stop,
          seq: s.seq,
        };
      })
    );
    setStopsOptions(prev => new Map(prev).set(index, options));
  };

  const loadGMBStops = async (index: number, routeId: number, routeSeq: number) => {
    const stops = await getGMBRouteStops(routeId, routeSeq);
    const options: StopOption[] = stops.map(s => ({
      id: String(s.stop_id),
      name: s.name_tc,
      seq: s.stop_seq,
    }));
    setStopsOptions(prev => new Map(prev).set(index, options));
  };

  const addSegment = () => {
    setSegments([...segments, {
      routeType: 'bus',
      routeName: '',
      fromStop: '',
      toStop: '',
      fromStopId: '',
      toStopId: '',
    }]);
  };

  const updateSegment = (index: number, field: string, value: string) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], [field]: value };
    setSegments(updated);

    // Debounce route validation
    if (field === 'routeName') {
      const timer = debounceTimers.current.get(index);
      if (timer) clearTimeout(timer);
      debounceTimers.current.set(index, setTimeout(() => {
        validateAndLoadStops(index, updated[index].routeType, value);
      }, 500));
    }

    // Re-validate when route type changes
    if (field === 'routeType' && updated[index].routeName) {
      validateAndLoadStops(index, value, updated[index].routeName);
    }
  };

  const removeSegment = (index: number) => {
    setSegments(segments.filter((_, i) => i !== index));
    setValidations(prev => {
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
    setStopsOptions(prev => {
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  };

  const handleDirectionChange = async (index: number, dirSeq: number) => {
    setSelectedDirection(prev => new Map(prev).set(index, dirSeq));
    const seg = segments[index];
    const validation = validations.get(index);
    if (!validation) return;

    if (validation.company === 'KMB') {
      await loadKMBStops(index, seg.routeName, dirSeq === 1 ? 'O' : 'I');
    } else if (validation.company === 'CTB') {
      await loadCTBStops(index, seg.routeName, dirSeq === 1 ? 'O' : 'I');
    } else if (validation.company === 'GMB' && validation.routeId) {
      await loadGMBStops(index, validation.routeId, dirSeq);
    }
  };

  const handleSave = () => {
    let savedRoute: CommuteRoute | undefined;
    
    if (editRoute) {
      const updatedRoute = {
        ...editRoute,
        name: routeName,
        direction,
        segments: segments.map((seg, index) => ({
          id: editRoute.segments[index]?.id || `seg-${index}`,
          route: {
            id: editRoute.segments[index]?.route.id || `r-${index}`,
            name: seg.routeName,
            type: seg.routeType,
            operator: (seg.routeType === 'mtr' ? 'mtr' : seg.routeType === 'minibus' ? 'gmb' : seg.routeType === 'tram' ? 'mtr' : 'kmb') as 'mtr' | 'gmb' | 'kmb',
            stops: [],
          },
          fromStop: {
            id: seg.fromStopId || editRoute.segments[index]?.fromStop.id || `stop-from-${index}`,
            name: seg.fromStop,
            nameZh: seg.fromStop,
            location: { lat: 0, lng: 0 },
            routes: [],
          },
          toStop: {
            id: seg.toStopId || editRoute.segments[index]?.toStop.id || `stop-to-${index}`,
            name: seg.toStop,
            nameZh: seg.toStop,
            location: { lat: 0, lng: 0 },
            routes: [],
          },
        })),
        updatedAt: new Date(),
      };
      updateRoute(editRoute.id, updatedRoute);
      savedRoute = updatedRoute as CommuteRoute;
    } else {
      const route: CommuteRoute = {
        id: `route-${Date.now()}`,
        name: routeName,
        direction,
        segments: segments.map((seg, index) => ({
          id: `seg-${index}`,
          route: {
            id: `r-${index}`,
            name: seg.routeName,
            type: seg.routeType,
            operator: (seg.routeType === 'mtr' ? 'mtr' : seg.routeType === 'minibus' ? 'gmb' : seg.routeType === 'tram' ? 'mtr' : 'kmb') as 'mtr' | 'gmb' | 'kmb',
            stops: [],
          },
          fromStop: {
            id: seg.fromStopId || `stop-from-${index}`,
            name: seg.fromStop,
            nameZh: seg.fromStop,
            location: { lat: 0, lng: 0 },
            routes: [],
          },
          toStop: {
            id: seg.toStopId || `stop-to-${index}`,
            name: seg.toStop,
            nameZh: seg.toStop,
            location: { lat: 0, lng: 0 },
            routes: [],
          },
        })),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      addRoute(route);
      savedRoute = route;
    }
    setSavedRoute(savedRoute);
    setStep('confirm');
    // Save to cloud immediately — don't wait for handleDone
    if (savedRoute && onSave) {
      onSave(savedRoute);
    }
  };

  const handleDone = () => {
    if (onDone) {
      onDone(savedRoute);
    } else {
      setStep('name');
      setRouteName('');
      setSegments([]);
      setSavedRoute(undefined);
    }
  };

  const getInputClasses = (index: number) => {
    const validation = validations.get(index);
    const base = 'w-full bg-white/10 border rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none';
    if (validation?.status === 'valid') {
      return `${base} border-green-500 focus:ring-2 focus:ring-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]`;
    }
    if (validation?.status === 'invalid') {
      return `${base} border-red-500/50 focus:ring-2 focus:ring-red-500`;
    }
    if (validation?.status === 'checking') {
      return `${base} border-yellow-500/50 focus:ring-2 focus:ring-yellow-500`;
    }
    return `${base} border-white/20 focus:ring-2 focus:ring-blue-500`;
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">
          {editRoute ? '編輯路線' : '設定路線'}
        </h2>
        <p className="text-gray-400 mt-2">
          {editRoute ? '修改你的通勤路線' : '設定你的通勤路線'}
        </p>
      </div>

      {step === 'name' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">路線名稱</label>
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="例：返工路線"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">方向</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDirection('to_work')} className={`p-4 rounded-lg border-2 transition-colors ${direction === 'to_work' ? 'border-blue-500 bg-blue-500/20' : 'border-white/20 bg-white/5'}`}>
                <span className="text-2xl">🏢</span>
                <p className="text-white mt-2">返工</p>
              </button>
              <button onClick={() => setDirection('to_home')} className={`p-4 rounded-lg border-2 transition-colors ${direction === 'to_home' ? 'border-blue-500 bg-blue-500/20' : 'border-white/20 bg-white/5'}`}>
                <span className="text-2xl">🏠</span>
                <p className="text-white mt-2">放工</p>
              </button>
            </div>
          </div>

          <button onClick={() => setStep('segments')} disabled={!routeName} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors">
            下一步
          </button>
        </div>
      )}

      {step === 'segments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">轉乘路段</h3>
            <button onClick={addSegment} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors">
              + 新增路段
            </button>
          </div>

          {editRoute && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">方向</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setDirection('to_work')} className={`p-3 rounded-lg border-2 transition-colors text-sm ${direction === 'to_work' ? 'border-blue-500 bg-blue-500/20' : 'border-white/20 bg-white/5'}`}>
                  🏢 返工
                </button>
                <button onClick={() => setDirection('to_home')} className={`p-3 rounded-lg border-2 transition-colors text-sm ${direction === 'to_home' ? 'border-blue-500 bg-blue-500/20' : 'border-white/20 bg-white/5'}`}>
                  🏠 放工
                </button>
              </div>
            </div>
          )}

          {segments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>點擊「新增路段」開始設定</p>
            </div>
          ) : (
            <div className="space-y-4">
              {segments.map((seg, index) => {
                const validation = validations.get(index);
                const stops = stopsOptions.get(index) || [];
                const dirs = validation?.directions || [];
                const currentDir = selectedDirection.get(index) || 1;

                return (
                  <div key={index} className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-300">路段 {index + 1}</span>
                      <button onClick={() => removeSegment(index)} className="text-red-400 hover:text-red-300 text-sm">刪除</button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">交通工具</label>
                        <select value={seg.routeType} onChange={(e) => updateSegment(index, 'routeType', e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="bus">🚌 巴士</option>
                          <option value="mtr">🚇 港鐵</option>
                          <option value="minibus">🚐 小巴</option>
                          <option value="tram">🚊 電車</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">路線號碼</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={seg.routeName}
                            onChange={(e) => updateSegment(index, 'routeName', e.target.value.toUpperCase())}
                            placeholder="例：1A"
                            className={getInputClasses(index)}
                          />
                          {validation?.status === 'checking' && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          {validation?.status === 'valid' && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400">✓</div>
                          )}
                        </div>
                        {validation?.status === 'valid' && validation.company && (
                          <p className="text-xs text-green-400 mt-1">
                            {validation.company === 'KMB' ? '九巴' : validation.company === 'CTB' ? '城巴' : '小巴'} ✓
                          </p>
                        )}
                        {validation?.status === 'invalid' && (
                          <p className="text-xs text-red-400 mt-1">找不到此路線</p>
                        )}
                      </div>
                    </div>

                    {/* Direction selector - compact inline toggle */}
                    {validation?.status === 'valid' && dirs.length > 0 && (seg.routeType === 'bus' || seg.routeType === 'minibus') && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400 shrink-0">方向</label>
                        <div className="flex gap-1 flex-wrap">
                          {dirs.map((d) => (
                            <button
                              key={d.seq}
                              onClick={() => handleDirectionChange(index, d.seq)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                currentDir === d.seq
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
                              }`}
                            >
                              {d.orig} → {d.dest}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stop selectors */}
                    {(seg.routeType === 'mtr' || seg.routeType === 'tram' || stops.length > 0) && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">上車站</label>
                          {stops.length > 0 ? (
                            <select
                              value={seg.fromStop}
                              onChange={(e) => {
                                const selected = stops.find(s => s.name === e.target.value);
                                const updated = [...segments];
                                updated[index] = {
                                  ...updated[index],
                                  fromStop: e.target.value,
                                  fromStopId: selected?.id || '',
                                };
                                setSegments(updated);

                                // Debounce route validation if needed
                                if (updated[index].routeName) {
                                  const timer = debounceTimers.current.get(index);
                                  if (timer) clearTimeout(timer);
                                }
                              }}
                              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32 overflow-y-auto"
                            >
                              <option value="">選擇車站</option>
                              {stops.map((s) => (
                                <option key={s.id} value={s.name}>{s.seq}. {s.name}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={seg.fromStop}
                              onChange={(e) => updateSegment(index, 'fromStop', e.target.value)}
                              placeholder="例：旺角站"
                              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">落車站</label>
                          {stops.length > 0 ? (
                            <select
                              value={seg.toStop}
                              onChange={(e) => {
                                const selected = stops.find(s => s.name === e.target.value);
                                const updated = [...segments];
                                updated[index] = {
                                  ...updated[index],
                                  toStop: e.target.value,
                                  toStopId: selected?.id || '',
                                };
                                setSegments(updated);
                              }}
                              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32 overflow-y-auto"
                            >
                              <option value="">選擇車站</option>
                              {stops.map((s) => (
                                <option key={s.id} value={s.name}>{s.seq}. {s.name}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={seg.toStop}
                              onChange={(e) => updateSegment(index, 'toStop', e.target.value)}
                              placeholder="例：中環站"
                              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => editRoute ? handleDone() : setStep('name')} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-4 rounded-lg transition-colors">
              {editRoute ? '取消' : '返回'}
            </button>
            <button onClick={handleSave} disabled={segments.length === 0} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors">
              {editRoute ? '更新路線' : '儲存路線'}
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h3 className="text-xl font-semibold text-white">
            {editRoute ? '路線已更新！' : '路線已儲存！'}
          </h3>
          <p className="text-gray-400">「{routeName}」已成功{editRoute ? '更新' : '建立'}</p>
          <button onClick={handleDone} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors">
            {editRoute ? '返回' : '建立另一條路線'}
          </button>
        </div>
      )}
    </div>
  );
}
