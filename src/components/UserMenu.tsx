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
        className="w-9 h-9 bg-white border border-gray-200 flex items-center justify-center rounded-xl text-sm transition-all active:scale-90 shadow-sm hover:shadow"
      >
        👤
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-scale-in">
            <div className="p-3 border-b border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">已登入</p>
              <p className="text-gray-900 text-sm font-medium truncate mt-0.5">{user.email}</p>
            </div>
            <button
              onClick={() => {
                logout();
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 text-red-500 hover:text-red-600 hover:bg-red-50 transition-all text-sm font-medium"
            >
              登出
            </button>
          </div>
        </>
      )}
    </div>
  );
}
