'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const { user, token, login, register, logout } = useAuth();
  const [authMode, setAuthMode] = useState<'menu' | 'login' | 'register'>('menu');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const result = await login(email, password);
    if (result.error) setAuthError(result.error);
    else { setAuthMode('menu'); setEmail(''); setPassword(''); }
    setAuthLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const result = await register(email, password);
    if (result.error) setAuthError(result.error);
    else { setAuthMode('menu'); setEmail(''); setPassword(''); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    logout();
    setAuthMode('menu');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">⚙️ 設定</h2>
        <button
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Account Section */}
      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-white/5 border-b border-white/10">
          <h3 className="text-sm font-semibold text-gray-300">👤 帳號</h3>
        </div>

        {user ? (
          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-400">已登入</p>
              <p className="text-white font-medium">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium py-2 px-4 rounded-lg transition-colors border border-red-500/30"
            >
              登出
            </button>
          </div>
        ) : authMode === 'menu' ? (
          <div className="p-4 space-y-2">
            <p className="text-gray-400 text-sm mb-3">登入以同步路線到雲端</p>
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              登入
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              註冊新帳號
            </button>
          </div>
        ) : (
          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">電郵</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">密碼 (至少 6 位)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {authError && (
              <p className="text-red-400 text-sm">{authError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('menu')}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white text-sm py-2 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={authLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm py-2 rounded-lg transition-colors"
              >
                {authLoading ? '...' : authMode === 'login' ? '登入' : '註冊'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Notifications Section */}
      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-white/5 border-b border-white/10">
          <h3 className="text-sm font-semibold text-gray-300">🔔 通知</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm">推播通知</p>
              <p className="text-gray-400 text-xs">到站提醒、路線更新</p>
            </div>
            <PushToggle />
          </div>
        </div>
      </div>

      {/* Data Section */}
      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-white/5 border-b border-white/10">
          <h3 className="text-sm font-semibold text-gray-300">🗄️ 資料</h3>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-white text-sm">巴士路線資料</p>
            <p className="text-gray-400 text-xs">KMB、Citybus、小巴路線及車站</p>
          </div>
          <button
            onClick={() => {
              // Clear API cache
              if ('caches' in window) {
                caches.delete('chaser-v2').then(() => {
                  alert('快取已清除，下次查詢會更新資料');
                });
              }
            }}
            className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            🔄 清除快取（更新路線資料）
          </button>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-white/5 border-b border-white/10">
          <h3 className="text-sm font-semibold text-gray-300">ℹ️ 關於</h3>
        </div>
        <div className="p-4">
          <p className="text-white text-sm font-medium">趕車 Chaser</p>
          <p className="text-gray-400 text-xs mt-1">香港智能轉乘助手</p>
          <p className="text-gray-500 text-xs mt-2">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}

// Simple push toggle component
function PushToggle() {
  const [enabled, setEnabled] = useState(false);

  useState(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setEnabled(!!sub);
        });
      });
    }
  });

  const toggle = async () => {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if (enabled) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      setEnabled(false);
    } else {
      // Subscribe
      try {
        const res = await fetch('https://chaser-push.isearover.workers.dev/vapidPublicKey');
        const { publicKey } = await res.json();
        const enc = new TextEncoder();
        const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer });
        setEnabled(true);
      } catch (e) {
        console.error('Push subscribe failed:', e);
      }
    }
  };

  return (
    <button
      onClick={toggle}
      className={`relative w-12 h-6 rounded-full transition-colors ${
        enabled ? 'bg-green-600' : 'bg-gray-600'
      }`}
    >
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
        enabled ? 'translate-x-6' : 'translate-x-0.5'
      }`} />
    </button>
  );
}
