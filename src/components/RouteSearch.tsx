'use client';

import { useState, useEffect, useRef } from 'react';
import { getKMBRouteInfo, getKMBRouteStops, getKMBStopInfo, getCitybusRouteInfo, getCitybusRouteStops, getCitybusStopInfo, type BusRoute, type BusStop } from '@/lib/bus-api';
import { MTR_LINES, MTR_STATIONS, type MTRLine, type MTRStation } from '@/lib/mtr-api';

interface RouteSearchProps {
  onSelect: (selection: SelectionResult) => void;
  onCancel: () => void;
}

export interface SelectionResult {
  type: 'bus' | 'mtr';
  company?: 'KMB' | 'CTB';
  route?: string;
  lineCode?: string;
  fromStop: string;
  toStop: string;
  fromStopName: string;
  toStopName: string;
  bound?: 'I' | 'O';
}

type SearchStep = 'transport' | 'route' | 'from_stop' | 'to_stop' | 'confirm';

export default function RouteSearch({ onSelect, onCancel }: RouteSearchProps) {
  const [step, setStep] = useState<SearchStep>('transport');
  const [transportType, setTransportType] = useState<'bus' | 'mtr'>('bus');
  const [company, setCompany] = useState<'KMB' | 'CTB'>('KMB');
  const [routeInput, setRouteInput] = useState('');
  const [routeResults, setRouteResults] = useState<BusRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [selectedMTRLine, setSelectedMTRLine] = useState<MTRLine | null>(null);
  const [direction, setDirection] = useState<'O' | 'I'>('O');
  const [stops, setStops] = useState<Array<{ stopId: string; name: string; seq: number }>>([]);
  const [fromStop, setFromStop] = useState<{ stopId: string; name: string } | null>(null);
  const [toStop, setToStop] = useState<{ stopId: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeDirections, setRouteDirections] = useState<Array<{ bound: 'O' | 'I'; orig: string; dest: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search bus routes
  useEffect(() => {
    if (step !== 'route' || transportType !== 'bus') return;
    
    const timer = setTimeout(async () => {
      if (routeInput.length === 0) return;
      setLoading(true);
      try {
        const kmbRoutes = await getKMBRouteInfo(routeInput);
        if (kmbRoutes.length > 0) {
          const dirs = kmbRoutes.map(r => ({
            bound: r.bound as 'O' | 'I',
            orig: r.orig_tc,
            dest: r.dest_tc,
          }));
          setRouteDirections(dirs);
          setCompany('KMB');
          setRouteResults(kmbRoutes);
        } else {
          // Try CTB
          const ctbRoutes = await getCitybusRouteInfo(routeInput);
          if (ctbRoutes.length > 0) {
            const dirs = ctbRoutes.map(r => ({
              bound: r.bound as 'O' | 'I',
              orig: r.orig_tc,
              dest: r.dest_tc,
            }));
            setRouteDirections(dirs);
            setCompany('CTB');
            setRouteResults(ctbRoutes);
          } else {
            setRouteResults([]);
            setRouteDirections([]);
          }
        }
      } catch (err) {
        console.error('Route search error:', err);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [routeInput, step, transportType]);

  // Fetch stops when entering stop selection
  useEffect(() => {
    if (step !== 'from_stop' && step !== 'to_stop') return;
    if (!selectedRoute && transportType === 'bus') return;

    const fetchStops = async () => {
      setLoading(true);
      try {
        if (transportType === 'bus' && selectedRoute) {
          let routeStops: { stop: string; seq: number }[] = [];
          if (company === 'KMB') {
            routeStops = await getKMBRouteStops(selectedRoute.route, direction);
          } else {
            routeStops = await getCitybusRouteStops(selectedRoute.route, direction);
          }

          const stopsWithNames = await Promise.all(
            routeStops.map(async (s) => {
              const info = company === 'KMB'
                ? await getKMBStopInfo(s.stop)
                : await getCitybusStopInfo(s.stop);
              return {
                stopId: s.stop,
                name: info?.name_tc || s.stop,
                seq: s.seq,
              };
            })
          );
          setStops(stopsWithNames.sort((a, b) => a.seq - b.seq));
        }
      } catch (err) {
        console.error('Stops fetch error:', err);
      }
      setLoading(false);
    };

    fetchStops();
  }, [step, selectedRoute, direction, transportType, company]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const handleTransportSelect = (type: 'bus' | 'mtr') => {
    setTransportType(type);
    setStep('route');
  };

  const handleRouteSelect = async (route: BusRoute) => {
    setSelectedRoute(route);
    setDirection(route.bound);
    setFromStop(null);
    setToStop(null);
    // Go directly to stop selection
    setStep('from_stop');
  };

  const handleMTRLineSelect = (line: MTRLine) => {
    setSelectedMTRLine(line);
    const lineStations = MTR_STATIONS.filter(s => s.line === line.code);
    setStops(lineStations.map((s, i) => ({
      stopId: s.stationCode,
      name: s.name_tc,
      seq: i + 1,
    })));
    setStep('from_stop');
  };

  const handleDirectionChange = (dir: 'O' | 'I') => {
    setDirection(dir);
    setFromStop(null);
    setToStop(null);
    // Stops will re-fetch via useEffect
  };

  const handleFromStopSelect = (stop: { stopId: string; name: string }) => {
    setFromStop(stop);
    setStep('to_stop');
  };

  const handleToStopSelect = (stop: { stopId: string; name: string }) => {
    setToStop(stop);
    setStep('confirm');
  };

  const handleConfirm = () => {
    if (!fromStop || !toStop) return;

    onSelect({
      type: transportType,
      company: transportType === 'bus' ? company : undefined,
      route: transportType === 'bus' ? selectedRoute?.route : undefined,
      lineCode: transportType === 'mtr' ? selectedMTRLine?.code : undefined,
      fromStop: fromStop.stopId,
      toStop: toStop.stopId,
      fromStopName: fromStop.name,
      toStopName: toStop.name,
      bound: transportType === 'bus' ? direction : undefined,
    });
  };

  const handleBack = () => {
    switch (step) {
      case 'route': setStep('transport'); break;
      case 'from_stop':
        if (transportType === 'mtr') setStep('route');
        else setStep('route');
        break;
      case 'to_stop': setStep('from_stop'); break;
      case 'confirm': setStep('to_stop'); break;
    }
  };

  // Get current direction display text
  const currentDirInfo = routeDirections.find(d => d.bound === direction);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={step === 'transport' ? onCancel : handleBack} className="text-gray-400 hover:text-white">
          ← {step === 'transport' ? '取消' : '返回'}
        </button>
        <h3 className="text-lg font-semibold text-white">新增路段</h3>
        <div className="w-12" />
      </div>

      {/* Step: Transport Type */}
      {step === 'transport' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm">選擇交通工具</p>
          <button
            onClick={() => handleTransportSelect('bus')}
            className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-left hover:bg-white/10 transition-colors"
          >
            <span className="text-2xl">🚌</span>
            <span className="text-white font-medium ml-3">巴士</span>
            <span className="text-gray-400 text-sm ml-2">KMB / Citybus</span>
          </button>
          <button
            onClick={() => handleTransportSelect('mtr')}
            className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-left hover:bg-white/10 transition-colors"
          >
            <span className="text-2xl">🚇</span>
            <span className="text-white font-medium ml-3">港鐵</span>
            <span className="text-gray-400 text-sm ml-2">MTR</span>
          </button>
        </div>
      )}

      {/* Step: Route (Bus) */}
      {step === 'route' && transportType === 'bus' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm">輸入巴士路線號碼</p>
          <input
            ref={inputRef}
            type="text"
            value={routeInput}
            onChange={(e) => setRouteInput(e.target.value.toUpperCase())}
            placeholder="例：1A、960、E23"
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          />
          {loading && <p className="text-gray-400 text-sm">搜尋中...</p>}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {routeResults.map((route, i) => (
              <button
                key={`${route.route}-${route.bound}-${i}`}
                onClick={() => handleRouteSelect(route)}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-left hover:bg-white/10 transition-colors"
              >
                <span className="text-white font-bold text-lg">{route.route}</span>
                <span className="text-gray-400 text-sm ml-3">
                  {route.orig_tc} → {route.dest_tc}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Route (MTR) */}
      {step === 'route' && transportType === 'mtr' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm">選擇港鐵線路</p>
          <div className="grid grid-cols-2 gap-2">
            {MTR_LINES.filter(l => l.code !== 'DRL').map((line) => (
              <button
                key={line.code}
                onClick={() => handleMTRLineSelect(line)}
                className="bg-white/5 border border-white/10 rounded-lg p-3 text-left hover:bg-white/10 transition-colors"
              >
                <span className="text-white font-medium">{line.name_tc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: From Stop (with inline direction toggle for bus) */}
      {step === 'from_stop' && (
        <div className="space-y-3">
          {/* Inline direction toggle for bus */}
          {transportType === 'bus' && routeDirections.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 shrink-0">方向</label>
              <div className="flex gap-1 flex-wrap">
                {routeDirections.map((d) => (
                  <button
                    key={d.bound}
                    onClick={() => handleDirectionChange(d.bound)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      direction === d.bound
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

          <p className="text-gray-400 text-sm">選擇上車站</p>
          {loading ? (
            <p className="text-gray-400 text-sm">載入車站中...</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {stops.map((stop) => (
                <button
                  key={stop.stopId}
                  onClick={() => handleFromStopSelect(stop)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-left hover:bg-white/10 transition-colors"
                >
                  <span className="text-white">{stop.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: To Stop */}
      {step === 'to_stop' && (
        <div className="space-y-3">
          {/* Inline direction toggle for bus */}
          {transportType === 'bus' && routeDirections.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 shrink-0">方向</label>
              <div className="flex gap-1 flex-wrap">
                {routeDirections.map((d) => (
                  <button
                    key={d.bound}
                    onClick={() => handleDirectionChange(d.bound)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      direction === d.bound
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

          <p className="text-gray-400 text-sm">選擇落車站</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {stops
              .filter(s => {
                if (!fromStop) return true;
                const fromSeq = stops.find(x => x.stopId === fromStop.stopId)?.seq || 0;
                return s.seq > fromSeq;
              })
              .map((stop) => (
                <button
                  key={stop.stopId}
                  onClick={() => handleToStopSelect(stop)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-left hover:bg-white/10 transition-colors"
                >
                  <span className="text-white">{stop.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && fromStop && toStop && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{transportType === 'bus' ? '🚌' : '🚇'}</span>
              <span className="text-white font-bold text-lg">
                {transportType === 'bus' ? selectedRoute?.route : selectedMTRLine?.name_tc}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <span>{fromStop.name}</span>
              <span>→</span>
              <span>{toStop.name}</span>
            </div>
          </div>
          <button
            onClick={handleConfirm}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            確認新增
          </button>
        </div>
      )}
    </div>
  );
}
