'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const fn = mode === 'login' ? login : register;
    const result = await fn(email, password);

    if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-100/40 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-blue-100/30 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
      
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10 animate-slide-up">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-600/40 mb-5 animate-float">
            <span className="text-4xl">🏃</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">趕車</h1>
          <p className="text-sm text-gray-400 mt-1.5 font-medium tracking-wide">Chaser</p>
          <p className="text-xs text-gray-400 mt-2">香港智能轉乘助手</p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-6 animate-slide-up stagger-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                電郵
              </label>
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
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                密碼
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                required
                minLength={6}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 animate-scale-in">
                <p className="text-red-600 text-xs font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium py-3 px-4 rounded-xl transition-all active:scale-[0.98] shadow-sm"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-blue-200 border-t-white rounded-full animate-spin" />
                  <span>處理中...</span>
                </>
              ) : (
                <span>{mode === 'login' ? '登入' : '註冊'}</span>
              )}
            </button>
          </form>
        </div>

        {/* Toggle */}
        <div className="text-center mt-6 animate-slide-up stagger-3">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
            className="text-gray-500 hover:text-gray-700 text-xs font-medium transition-colors"
          >
            {mode === 'login' ? '未有帳號？立即註冊' : '已有帳號？立即登入'}
          </button>
        </div>
      </div>
    </div>
  );
}
