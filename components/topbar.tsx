'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { PanelLeft, PanelLeftClose, Moon, Sun, LogOut, ChevronDown, Bell, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth, ROLE_LABELS } from '@/lib/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';

export function Topbar({ onMenuClick, isSidebarOpen }: { onMenuClick: () => void; isSidebarOpen?: boolean }) {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!profile) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function load() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .eq('user_id', profile!.user_id);
      setUnread(count ?? 0);
    }
    load();
    channel = supabase
      .channel('notifications-topbar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, load)
      .subscribe();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile]);

  const initials = (profile?.full_name ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:px-6">
      {/* Sidebar Toggle Button for both Desktop & Mobile */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
        aria-label="Toggle Sidebar"
        className="hover:bg-muted text-muted-foreground hover:text-foreground"
      >
        {isSidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
      </Button>

      <div className="hidden flex-col sm:flex">
        <h1 className="text-sm font-semibold leading-tight text-foreground">
          Welcome, {profile?.full_name?.split(' ')[0] ?? 'User'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {profile ? ROLE_LABELS[profile.role] : ''}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/notifications')}
          aria-label="Notifications"
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {mounted && theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{profile?.full_name}</span>
              <span className="text-xs font-normal text-muted-foreground">{profile?.email}</span>
              <Badge variant="secondary" className="mt-1 w-fit text-[10px]">
                {profile ? ROLE_LABELS[profile.role] : ''}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push('/profile')}
            >
              <UserCircle className="mr-2 h-4 w-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
