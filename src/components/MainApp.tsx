'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/lib/auth-context';
import RouteSetup from './RouteSetup';
import LocationTracker from './LocationTracker';
import ETADisplay from './ETADisplay';
import InstallPrompt from './InstallPrompt';
import PushNotification from './PushNotification';
import SwipeableRouteCard from './SwipeableRouteCard';
import TrackingView from './TrackingView';
import AuthScreen from './AuthScreen';
import UserMenu from './UserMenu';
import Settings from './Settings';
import { setOnUpdateAvailable } from './ServiceWorker注册';
import type { CommuteRoute } from '@/types';

const NAV_ITEMS = [
  { key: 'home' as const, icon: '🏠', label: '首頁' },
  { key: 'setup' as const, icon: '➕', label: '新增' },
  { key: 'tracking' as const, icon: '📍', label: '追蹤' },
];

export default function MainApp() {
  const { 
    routes, 
    activeRoute,
    currentLocation,
    currentJourney, 
    isTracking,
    startJourney, 
    endJourney, 
    setActiveRoute,
    removeRoute,
    setRoutes
  } = useAppStore();

  const activeRouteData = activeRoute || (currentJourney ? routes.find(r => r.id === currentJourney.routeId) || null : null);
  
  const { user, token, isLoading, authenticatedFetch } = useAuth();
  const [currentView, setCurrentView] = useState<'home' | 'setup' | 'tracking' | 'edit' | 'settings'>('home');
  const [editingRoute, setEditingRoute] = useState<CommuteRoute | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const addDebug = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const line = `${ts} ${msg}`;
    console.log(line);
    setDebugLogs(prev => [...prev.slice(-30), line]);
  }, []);

  const prevView = useRef(currentView);
  useEffect(() => {
    if (prevView.current !== currentView) {
      setViewKey(k => k + 1);
      prevView.current = currentView;
    }
  }, [currentView]);

  const syncFromCloud = useCallback(async () => {
    if (!user || !token) {
      addDebug('⚠️ sync: no user/token');
      return;
    }
    setSyncing(true);
    try {
      addDebug('☁️ sync: fetching...');
      const res = await authenticatedFetch('/routes');
      addDebug(`☁️ sync: status ${res.status}`);
      if (!res.ok) {
        const errText = await res.text();
        addDebug(`❌ sync error: ${res.status} ${errText.substring(0, 80)}`);
        setSyncing(false);
        return;
      }
      const data = await res.json();
      const count = data.routes?.length ?? 0;
      addDebug(`☁️ sync: got ${count} routes`);
      if (data.routes) {
        const cloudRoutes: CommuteRoute[] = data.routes.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          name: r.name as string,
          direction: r.direction as 'to_work' | 'to_home',
          segments: r.segments as CommuteRoute['segments'],
          createdAt: new Date(r.created_at as string),
          updatedAt: new Date(r.updated_at as string),
        }));
        addDebug(`✅ sync: set ${cloudRoutes.map(r => r.name).join(',')}`);
        setRoutes(cloudRoutes);
      }
    } catch (e) {
      addDebug(`❌ sync exception: ${e}`);
    }
    setSyncing(false);
  }, [user, token, authenticatedFetch, setRoutes, addDebug]);

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    setOnUpdateAvailable(() => setUpdateAvailable(true));
    return () => setOnUpdateAvailable(null);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (currentView !== 'home') return;
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    if (scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [currentView]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || currentView !== 'home') return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 120));
    }
  }, [currentView]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(60);
      addDebug('🔄 pull-to-refresh triggered');

      await syncFromCloud();

      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.update();
          addDebug('🔄 SW update check done');
        } catch (e) {
          addDebug('⚠️ SW update check failed');
        }
      }

      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, isRefreshing, syncFromCloud, addDebug]);

  useEffect(() => {
    addDebug(`🔑 auth: user=${!!user} token=${!!token} loading=${isLoading}`);
    if (user && token) {
      addDebug('🔄 auth: triggering sync');
      syncFromCloud();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, isLoading]);

  const saveToCloud = useCallback(async (route: CommuteRoute) => {
    if (!user || !token) {
      addDebug('⚠️ save: no user/token');
      return;
    }
    try {
      addDebug(`💾 save: ${route.name} (${route.id})`);
      const res = await authenticatedFetch('/routes', {
        method: 'POST',
        body: JSON.stringify({
          id: route.id,
          name: route.name,
          direction: route.direction,
          segments: route.segments,
        }),
      });
      addDebug(`💾 save: status ${res.status}`);
      if (!res.ok) {
        const err = await res.text();
        addDebug(`❌ save error: ${res.status} ${err.substring(0, 80)}`);
      } else {
        addDebug('✅ save: ok');
      }
    } catch (e) {
      addDebug(`❌ save exception: ${e}`);
    }
  }, [user, token, authenticatedFetch, addDebug]);

  const deleteFromCloud = useCallback(async (routeId: string) => {
    if (!user || !token) return;
    try {
      await authenticatedFetch(`/routes/${routeId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Delete from cloud failed:', e);
    }
  }, [user, token, authenticatedFetch]);

  const handleStartJourney = (routeId: string) => {
    startJourney(routeId);
    setCurrentView('tracking');
  };
  const handleEndJourney = () => {
    endJourney();
    setCurrentView('home');
  };

  const handleBackFromTracking = () => {
    setCurrentView('home');
  };

  const handleDeleteRoute = (routeId: string) => {
    removeRoute(routeId);
    deleteFromCloud(routeId);
    setDeleteConfirm(null);
  };

  const navigateTo = (view: typeof currentView) => {
    setCurrentView(view);
  };

  if (!isLoading && !user) {
    return <AuthScreen />;
  }

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center transition-all"
          style={{ height: pullDistance, opacity: Math.min(pullDistance / 60, 1) }}
        >
          <div className={`text-gray-600 text-center transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
            style={{ transform: isRefreshing ? undefined : `rotate(${pullDistance * 3}deg)` }}>
            {isRefreshing ? '🔄' : pullDistance >= PULL_THRESHOLD ? '🔃' : '⬇️'}
          </div>
          <p className="text-gray-500 text-xs ml-2 font-medium">
            {isRefreshing ? '刷新中...' : pullDistance >= PULL_THRESHOLD ? '鬆開刷新' : '下拉刷新'}
          </p>
        </div>
      )}

      {/* Update available banner */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-center py-2.5 px-4 flex items-center justify-center gap-3 shadow-lg animate-slide-down">
          <span className="text-sm font-medium">🆕 有新版本！</span>
          <button
            onClick={() => window.location.reload()}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-semibold px-4 py-1 rounded-full text-xs transition-all active:scale-95"
          >
            更新
          </button>
        </div>
      )}
      
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-xl sticky top-0 z-40 border-b border-gray-200 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                <span className="text-lg">🏃</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">趕車</h1>
                <p className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">Chaser</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {user && (
                <button
                  onClick={syncFromCloud}
                  disabled={syncing}
                  className="w-9 h-9 bg-white border border-gray-200 flex items-center justify-center rounded-xl text-sm shadow-sm transition-all active:scale-90"
                  title="同步雲端路線"
                >
                  <span className={`inline-block transition-transform ${syncing ? 'animate-spin' : ''}`}>☁️</span>
                </button>
              )}
              <PushNotification />
              <InstallPrompt />
              <UserMenu />
              <button
                onClick={() => navigateTo(currentView === 'settings' ? 'home' : 'settings')}
                className="w-9 h-9 bg-white border border-gray-200 flex items-center justify-center rounded-xl text-sm shadow-sm transition-all active:scale-90"
              >
                {currentView === 'settings' ? '✕' : '⚙️'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 pt-4 pb-28">
        {currentView === 'home' && (
          <div key={`home-${viewKey}`} className="page-enter space-y-5">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white border border-blue-100 rounded-2xl p-3.5 text-center shadow-sm animate-scale-in stagger-1">
                <p className="text-2xl font-bold text-blue-600">{routes.length}</p>
                <p className="text-[10px] text-gray-400 mt-1 font-medium">已存路線</p>
              </div>
              <div className="bg-white border border-green-100 rounded-2xl p-3.5 text-center shadow-sm animate-scale-in stagger-2">
                <p className="text-2xl font-bold text-green-600">
                  {currentJourney ? '1' : '0'}
                </p>
                <p className="text-[10px] text-gray-400 mt-1 font-medium">進行中</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-3.5 text-center shadow-sm animate-scale-in stagger-3">
                <p className="text-2xl font-bold text-gray-300">0</p>
                <p className="text-[10px] text-gray-400 mt-1 font-medium">今日旅程</p>
              </div>
            </div>

            {/* Location Tracker */}
            <LocationTracker />

            {/* ETA Display */}
            <ETADisplay />

            {/* Routes List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">我的路線</h3>
                {routes.length > 0 && (
                  <span className="text-xs text-gray-300">{routes.length} 條</span>
                )}
              </div>
              {routes.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-md animate-scale-in">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center mb-4 animate-float">
                    <span className="text-4xl">🚇</span>
                  </div>
                  <p className="text-gray-500 text-sm font-medium">尚未設定路線</p>
                  <p className="text-gray-400 text-xs mt-1">建立你的第一條通勤路線</p>
                  <button
                    onClick={() => navigateTo('setup')}
                    className="btn-primary mt-5 text-sm"
                  >
                    建立路線
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {routes.map((route, index) => {
                    const isRouteActive = currentJourney && isTracking && currentJourney.routeId === route.id;
                    return (
                    <div key={route.id} className={`animate-slide-up stagger-${Math.min(index + 1, 5)}`}>
                      <SwipeableRouteCard
                        route={route}
                        isActive={!!isRouteActive}
                        onStart={() => handleStartJourney(route.id)}
                        onEdit={() => {
                          setEditingRoute(route);
                          setCurrentView('edit');
                        }}
                        onDelete={() => setDeleteConfirm(route.id)}
                        onReturn={() => setCurrentView('tracking')}
                        onEnd={handleEndJourney}
                      />
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Delete Confirmation Dialog */}
            {deleteConfirm && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 animate-scale-in">
                  <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
                    <span className="text-2xl">🗑️</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 text-center mb-1">確認刪除？</h3>
                  <p className="text-gray-400 text-sm text-center mb-6">
                    刪除後無法恢復{user ? '（雲端同步刪除）' : ''}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 btn-glass text-sm py-3"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(deleteConfirm)}
                      className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-semibold py-3 px-4 rounded-xl transition-all active:scale-95 text-sm shadow-lg shadow-red-500/20"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'settings' && (
          <div key={`settings-${viewKey}`} className="page-enter">
            <Settings onClose={() => navigateTo('home')} />
          </div>
        )}

        {currentView === 'setup' && (
          <div key={`setup-${viewKey}`} className="page-enter">
            <RouteSetup
              onSave={(route) => {
                if (user) saveToCloud(route);
              }}
              onDone={(route) => {
                navigateTo('home');
              }}
            />
          </div>
        )}

        {currentView === 'edit' && editingRoute && (
          <div key={`edit-${viewKey}`} className="page-enter">
            <RouteSetup
              editRoute={editingRoute}
              onSave={(route) => {
                if (user) saveToCloud(route);
              }}
              onDone={(route) => {
                navigateTo('home');
                setEditingRoute(null);
              }}
            />
          </div>
        )}

        {activeRouteData && isTracking && (
          <div style={{ display: currentView === 'tracking' ? 'block' : 'none' }}>
            <TrackingView
              route={activeRouteData}
              currentLocation={currentLocation}
              onEndJourney={handleEndJourney}
              onBack={handleBackFromTracking}
            />
          </div>
        )}
      </main>

      {/* Debug Panel */}
      <div className="fixed bottom-20 left-0 right-0 z-50 max-w-md mx-auto pointer-events-none">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="ml-auto mr-3 mb-1 bg-white border border-gray-200 text-gray-500 text-[10px] px-2.5 py-1 rounded-lg shadow-sm pointer-events-auto transition-all active:scale-95 font-mono"
        >
          🐛 {showDebug ? '收起' : debugLogs.length}
        </button>
        {showDebug && (
          <div className="mx-3 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-3 max-h-48 overflow-y-auto pointer-events-auto">
            {debugLogs.length === 0 ? (
              <p className="text-gray-400 text-xs">No logs yet</p>
            ) : (
              debugLogs.map((log, i) => (
                <p key={i} className="text-[10px] font-mono text-green-600 leading-relaxed whitespace-nowrap overflow-x-auto">{log}</p>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40">
        <div className="bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="max-w-md mx-auto px-6 py-2">
            <div className="flex items-center justify-around">
              {NAV_ITEMS.map((item) => {
                const isActive = currentView === item.key || 
                  (item.key === 'tracking' && currentView === 'tracking');
                return (
                  <button
                    key={item.key}
                    onClick={() => navigateTo(item.key)}
                    className={`nav-pill flex flex-col items-center gap-0.5 py-1.5 px-4 rounded-xl transition-all active:scale-90 ${
                      isActive ? 'active' : ''
                    }`}
                  >
                    <span className={`text-lg transition-all ${
                      isActive ? 'scale-110' : 'grayscale opacity-40'
                    }`}>
                      {item.icon}
                    </span>
                    <span className={`text-[10px] font-medium transition-colors ${
                      isActive ? 'text-blue-600 font-semibold' : 'text-gray-400'
                    }`}>
                      {item.label}
                    </span>
                    {isActive && (
                      <div className="absolute -bottom-1 w-5 h-0.5 rounded-full bg-blue-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Home indicator bar */}
        <div className="glass-strong border-t border-gray-200/60 flex justify-center py-1">
          <div className="w-32 h-1 rounded-full bg-gray-200" />
        </div>
      </nav>
    </div>
  );
}
