'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { CommuteRoute, Route, Stop, TransferPoint } from '@/types';

export default function RouteSetup() {
  const { addRoute } = useAppStore();
  const [step, setStep] = useState<'name' | 'segments' | 'confirm'>('name');
  const [routeName, setRouteName] = useState('');
  const [direction, setDirection] = useState<'to_work' | 'to_home'>('to_work');
  const [segments, setSegments] = useState<Array<{
    routeType: 'bus' | 'mtr' | 'minibus';
    routeName: string;
    fromStop: string;
    toStop: string;
  }>>([]);

  const addSegment = () => {
    setSegments([...segments, {
      routeType: 'bus',
      routeName: '',
      fromStop: '',
      toStop: '',
    }]);
  };

  const updateSegment = (index: number, field: string, value: string) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], [field]: value };
    setSegments(updated);
  };

  const removeSegment = (index: number) => {
    setSegments(segments.filter((_, i) => i !== index));
  };

  const handleSave = () => {
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
          operator: seg.routeType === 'mtr' ? 'mtr' : 'kmb',
          stops: [],
        },
        fromStop: {
          id: `stop-from-${index}`,
          name: seg.fromStop,
          nameZh: seg.fromStop,
          location: { lat: 0, lng: 0 },
          routes: [],
        },
        toStop: {
          id: `stop-to-${index}`,
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
    setStep('confirm');
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">設定路線</h2>
        <p className="text-gray-400 mt-2">設定你的通勤路線</p>
      </div>

      {step === 'name' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              路線名稱
            </label>
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="例：返工路線"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              方向
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDirection('to_work')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  direction === 'to_work'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-white/20 bg-white/5'
                }`}
              >
                <span className="text-2xl">🏢</span>
                <p className="text-white mt-2">返工</p>
              </button>
              <button
                onClick={() => setDirection('to_home')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  direction === 'to_home'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-white/20 bg-white/5'
                }`}
              >
                <span className="text-2xl">🏠</span>
                <p className="text-white mt-2">放工</p>
              </button>
            </div>
          </div>

          <button
            onClick={() => setStep('segments')}
            disabled={!routeName}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            下一步
          </button>
        </div>
      )}

      {step === 'segments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">轉乘路段</h3>
            <button
              onClick={addSegment}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              + 新增路段
            </button>
          </div>

          {segments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>點擊「新增路段」開始設定</p>
            </div>
          ) : (
            <div className="space-y-4">
              {segments.map((seg, index) => (
                <div
                  key={index}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">
                      路段 {index + 1}
                    </span>
                    <button
                      onClick={() => removeSegment(index)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      刪除
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        交通工具
                      </label>
                      <select
                        value={seg.routeType}
                        onChange={(e) => updateSegment(index, 'routeType', e.target.value)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="bus">🚌 巴士</option>
                        <option value="mtr">🚇 港鐵</option>
                        <option value="minibus">🚐 小巴</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        路線號碼
                      </label>
                      <input
                        type="text"
                        value={seg.routeName}
                        onChange={(e) => updateSegment(index, 'routeName', e.target.value)}
                        placeholder="例：1A"
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        上車站
                      </label>
                      <input
                        type="text"
                        value={seg.fromStop}
                        onChange={(e) => updateSegment(index, 'fromStop', e.target.value)}
                        placeholder="例：旺角站"
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        落車站
                      </label>
                      <input
                        type="text"
                        value={seg.toStop}
                        onChange={(e) => updateSegment(index, 'toStop', e.target.value)}
                        placeholder="例：中環站"
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('name')}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              返回
            </button>
            <button
              onClick={handleSave}
              disabled={segments.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              儲存路線
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="text-center space-y-4">
          <div className="text-6xl">✅</div>
          <h3 className="text-xl font-semibold text-white">路線已儲存！</h3>
          <p className="text-gray-400">
            「{routeName}」已成功建立
          </p>
          <button
            onClick={() => {
              setStep('name');
              setRouteName('');
              setSegments([]);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            建立另一條路線
          </button>
        </div>
      )}
    </div>
  );
}
