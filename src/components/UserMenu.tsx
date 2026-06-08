'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors text-sm"
      >
        👤
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Menu */}
          <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-white/10">
              <p className="text-xs text-gray-400">已登入</p>
              <p className="text-white text-sm font-medium truncate">{user.email}</p>
            </div>
            <button
              onClick={() => {
                logout();
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 text-red-400 hover:bg-white/5 transition-colors text-sm"
            >
              登出
            </button>
          </div>
        </>
      )}
    </div>
  );
}
