'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import PushNotification from './PushNotification';

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">⚙️ 設定</h2>
        <button
          onClick={onClose}
          className="w-9 h-9 bg-gray-100 hover:bg-gray-200 flex items-center justify-center rounded-xl text-sm transition-all active:scale-90 text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Account Section */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden animate-slide-up">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">👤 帳號</h3>
        </div>

        {user ? (
          <div className="p-4 space-y-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">已登入</p>
              <p className="text-gray-900 text-sm font-medium mt-0.5">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium py-2.5 px-4 rounded-xl transition-all active:scale-95 border border-red-200"
            >
              登出
            </button>
          </div>
        ) : authMode === 'menu' ? (
          <div className="p-4 space-y-2">
            <p className="text-gray-400 text-xs mb-3">登入以同步路線到雲端</p>
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className="w-full bg-blue-500 hover:bg-blue-600 text-gray-900 text-sm font-semibold py-2.5 px-4 rounded-xl transition-all active:scale-[0.98] shadow-sm"
            >
              登入
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 px-4 rounded-xl transition-all active:scale-[0.98] border border-gray-200"
            >
              註冊新帳號
            </button>
          </div>
        ) : (
          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">電郵</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="至少 6 位"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
            {authError && (
              <p className="text-red-600 text-xs font-medium">{authError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('menu')}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 px-4 rounded-xl transition-all active:scale-[0.98] border border-gray-200"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={authLoading}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-gray-900 text-sm font-semibold py-2.5 px-4 rounded-xl transition-all active:scale-[0.98] shadow-sm"
              >
                {authLoading ? '...' : authMode === 'login' ? '登入' : '註冊'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Notifications Section */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden animate-slide-up stagger-2">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">🔔 通知</h3>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-900 text-sm font-medium">推播通知</p>
              <p className="text-gray-400 text-[11px] mt-0.5">到站提醒、路線更新</p>
            </div>
            <PushNotification />
          </div>
        </div>
      </div>

      {/* Data Section */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden animate-slide-up stagger-3">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">🗄️ 資料</h3>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-gray-900 text-sm font-medium">巴士路線資料</p>
            <p className="text-gray-400 text-[11px] mt-0.5">KMB、Citybus、小巴路線及車站</p>
          </div>
          <button
            onClick={() => {
              if ('caches' in window) {
                caches.delete('chaser-v2').then(() => {
                  alert('快取已清除，下次查詢會更新資料');
                });
              }
            }}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 px-4 rounded-xl transition-all active:scale-[0.98] border border-gray-200"
          >
            🔄 清除快取
          </button>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden animate-slide-up stagger-4">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ℹ️ 關於</h3>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-sm">
              <span className="text-lg">🏃</span>
            </div>
            <div>
              <p className="text-gray-900 text-sm font-semibold">趕車 Chaser</p>
              <p className="text-gray-400 text-[11px]">香港智能轉乘助手 · v1.0.0</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
