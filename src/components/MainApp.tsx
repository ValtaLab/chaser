'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/lib/auth-context';
import RouteSetup from './RouteSetup';
import LocationTracker from './LocationTracker';
import ETADisplay from './ETADisplay';
import InstallPrompt from './InstallPrompt';
import PushNotification from './PushNotification';
import SwipeableRouteCard from './SwipeableRouteCard';
import AuthScreen from './AuthScreen';
import UserMenu from './UserMenu';
import Settings from './Settings';
import type { CommuteRoute } from '@/types';

export default function MainApp() {
  const { 
    routes, 
    activeRoute, 
    currentJourney, 
    isTracking,
    startJourney, 
    endJourney, 
    setActiveRoute,
    removeRoute,
    setRoutes
  } = useAppStore();
  
  const { user, token, isLoading, authenticatedFetch } = useAuth();
  const [currentView, setCurrentView] = useState<'home' | 'setup' | 'tracking' | 'edit' | 'settings'>('home');
  const [editingRoute, setEditingRoute] = useState<CommuteRoute | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [skipAuth, setSkipAuth] = useState(false);

  // Check skip auth on mount
  useEffect(() => {
    setSkipAuth(localStorage.getItem('chaser_skip_auth') === 'true');
  }, []);

  // Sync routes from cloud
  const syncFromCloud = useCallback(async () => {
    if (!user || !token) return;
    setSyncing(true);
    try {
      const res = await authenticatedFetch('/routes');
      const data = await res.json();
      if (data.routes) {
        const cloudRoutes: CommuteRoute[] = data.routes.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          name: r.name as string,
          direction: r.direction as 'to_work' | 'to_home',
          segments: r.segments as CommuteRoute['segments'],
          createdAt: new Date(r.created_at as string),
          updatedAt: new Date(r.updated_at as string),
        }));
        setRoutes(cloudRoutes);
      }
    } catch (e) {
      console.error('Sync failed:', e);
    }
    setSyncing(false);
  }, [user, token, authenticatedFetch, setRoutes]);

  // Auto sync on login
  useEffect(() => {
    if (user && token) {
      syncFromCloud();
    }
  }, [user, token, syncFromCloud]);

  // Save route to cloud
  const saveToCloud = useCallback(async (route: CommuteRoute) => {
    if (!user || !token) return;
    try {
      await authenticatedFetch('/routes', {
        method: 'POST',
        body: JSON.stringify({
          id: route.id,
          name: route.name,
          direction: route.direction,
          segments: route.segments,
        }),
      });
    } catch (e) {
      console.error('Save to cloud failed:', e);
    }
  }, [user, token, authenticatedFetch]);

  // Delete route from cloud
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

  const handleDeleteRoute = (routeId: string) => {
    removeRoute(routeId);
    deleteFromCloud(routeId);
    setDeleteConfirm(null);
  };

  // Show auth screen if not logged in and not skipping
  if (!isLoading && !user && !skipAuth) {
    return <AuthScreen />;
  }

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
            <div className="flex items-center gap-2">
              {user && (
                <button
                  onClick={syncFromCloud}
                  disabled={syncing}
                  className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors text-sm"
                  title="同步雲端路線"
                >
                  {syncing ? '🔄' : '☁️'}
                </button>
              )}
              <PushNotification />
              <InstallPrompt />
              {user ? <UserMenu /> : (
                <button
                  onClick={() => {
                    localStorage.removeItem('chaser_skip_auth');
                    window.location.reload();
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors text-sm"
                >
                  🔑
                </button>
              )}
              <button
                onClick={() => setCurrentView(currentView === 'settings' ? 'home' : 'settings')}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
              >
                {currentView === 'settings' ? '✕' : '⚙️'}
              </button>
            </div>
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
                    <div key={route.id}>
                      <SwipeableRouteCard
                        route={route}
                        onStart={() => handleStartJourney(route.id)}
                        onEdit={() => {
                          setEditingRoute(route);
                          setCurrentView('edit');
                        }}
                        onDelete={() => setDeleteConfirm(route.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delete Confirmation Dialog */}
            {deleteConfirm && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-2">確認刪除？</h3>
                  <p className="text-gray-400 text-sm mb-6">
                    刪除後無法恢復{user ? '（雲端同步刪除）' : ''}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(deleteConfirm)}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            )}

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

        {currentView === 'settings' && (
          <Settings onClose={() => setCurrentView('home')} />
        )}

        {currentView === 'setup' && (
          <RouteSetup
            onDone={(route) => {
              setCurrentView('home');
              if (route && user) saveToCloud(route);
            }}
          />
        )}

        {currentView === 'edit' && editingRoute && (
          <RouteSetup
            editRoute={editingRoute}
            onDone={(route) => {
              setCurrentView('home');
              setEditingRoute(null);
              if (route && user) saveToCloud(route);
            }}
          />
        )}

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
