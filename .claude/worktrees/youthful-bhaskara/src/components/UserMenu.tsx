'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface UserInfo {
  name: string;
  email: string;
  avatarUrl: string;
}

export default function UserMenu() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) {
        setUser({
          name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || '',
          email: u.email || '',
          avatarUrl: u.user_metadata?.avatar_url || u.user_metadata?.picture || '',
        });
      }
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (!user) return null;

  const initials = user.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0]?.toUpperCase() || '?';

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 transition-colors"
        style={{
          background: open ? '#1a1a1d' : 'transparent',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = '#141416'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-7 h-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: '#e8ff4730', color: '#e8ff47' }}
          >
            {initials}
          </div>
        )}
        <span className="text-[13px] hidden sm:inline" style={{ color: '#8a8a8e' }}>
          {user.name || user.email}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-48 rounded-xl py-1 z-[60]"
          style={{
            background: '#1a1a1d',
            border: '1px solid #2a2a2d',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: '#2a2a2d' }}>
            <p className="text-[13px] font-medium" style={{ color: '#f0f0f0' }}>
              {user.name}
            </p>
            <p className="text-[11px] truncate" style={{ color: '#5a5a5e' }}>
              {user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors"
            style={{ color: '#8a8a8e' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#8a8a8e'}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
