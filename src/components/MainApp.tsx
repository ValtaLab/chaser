'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import RouteSetup from './RouteSetup';
import LocationTracker from './LocationTracker';
import ETADisplay from './ETADisplay';

export default function MainApp() {
  const { 
    routes, 
    activeRoute, 
    currentJourney, 
    isTracking,
    startJourney, 
    endJourney, 
    setActiveRoute 
  } = useAppStore();
  
  const [currentView, setCurrentView] = useState<'home' | 'setup' | 'tracking'>('home');

  const handleStartJourney = (routeId: string) => {
    startJourney(routeId);
    setCurrentView('tracking');
  };

  const handleEndJourney = () => {
    endJourney();
    setCurrentView('home');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏃</span>
              <div>
                <h1 className="text-xl font-bold text-white">趕車</h1>
                <p className="text-xs text-gray-400">Chaser</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentView(currentView === 'setup' ? 'home' : 'setup')}
              className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
            >
              {currentView === 'setup' ? '✕' : '⚙️'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6">
        {currentView === 'home' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-white">{routes.length}</p>
                <p className="text-xs text-gray-400 mt-1">已存路線</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-white">
                  {currentJourney ? '1' : '0'}
                </p>
                <p className="text-xs text-gray-400 mt-1">進行中</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-white">0</p>
                <p className="text-xs text-gray-400 mt-1">今日旅程</p>
              </div>
            </div>

            {/* Location Tracker */}
            <LocationTracker />

            {/* ETA Display */}
            <ETADisplay />

            {/* Routes List */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">我的路線</h3>
              {routes.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-6xl">🚇</span>
                  <p className="text-gray-400 mt-4">尚未設定路線</p>
                  <button
                    onClick={() => setCurrentView('setup')}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                  >
                    建立第一條路線
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {routes.map((route) => (
                    <div
                      key={route.id}
                      className="bg-white/5 border border-white/10 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white">{route.name}</p>
                          <p className="text-sm text-gray-400">
                            {route.direction === 'to_work' ? '🏢 返工' : '🏠 放工'} • 
                            {route.segments.length} 個路段
                          </p>
                        </div>
                        <button
                          onClick={() => handleStartJourney(route.id)}
                          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          開始
                        </button>
                      </div>
                      
                      {/* Route segments preview */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {route.segments.map((seg, index) => (
                          <div key={seg.id} className="flex items-center gap-1">
                            <span className="bg-white/10 text-white text-xs px-2 py-1 rounded">
                              {seg.route.name}
                            </span>
                            {index < route.segments.length - 1 && (
                              <span className="text-gray-500">→</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Start Journey Button */}
            {currentJourney && (
              <button
                onClick={handleEndJourney}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-4 px-4 rounded-lg transition-colors"
              >
                結束旅程
              </button>
            )}
          </div>
        )}

        {currentView === 'setup' && <RouteSetup />}

        {currentView === 'tracking' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-6xl animate-pulse">🏃</div>
              <h2 className="text-2xl font-bold text-white mt-4">追蹤中</h2>
              <p className="text-gray-400 mt-2">正在追蹤你的位置</p>
            </div>

            <LocationTracker />
            <ETADisplay />

            <button
              onClick={handleEndJourney}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-4 px-4 rounded-lg transition-colors"
            >
              結束旅程
            </button>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/20 backdrop-blur-lg border-t border-white/10">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-around">
            <button
              onClick={() => setCurrentView('home')}
              className={`flex flex-col items-center gap-1 ${
                currentView === 'home' ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">🏠</span>
              <span className="text-xs">首頁</span>
            </button>
            <button
              onClick={() => setCurrentView('setup')}
              className={`flex flex-col items-center gap-1 ${
                currentView === 'setup' ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">➕</span>
              <span className="text-xs">新增</span>
            </button>
            <button
              onClick={() => setCurrentView('tracking')}
              className={`flex flex-col items-center gap-1 ${
                currentView === 'tracking' ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">📍</span>
              <span className="text-xs">追蹤</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
