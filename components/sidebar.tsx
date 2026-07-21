'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Truck, X, PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/nav';
import { useAuth, ROLE_LABELS, isStaff } from '@/lib/auth-context';
import type { UserRole } from '@/lib/database-types';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const role = profile?.role;

  const items = NAV_ITEMS.filter((item) => {
    if (item.roles === 'all') return true;
    return role && (item.roles as UserRole[]).includes(role);
  });

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-all duration-300 ease-in-out lg:relative',
          open ? 'translate-x-0 w-64' : '-translate-x-full lg:w-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight truncate">
              <span className="text-sm font-bold tracking-tight">SafeFleet</span>
              <span className="text-[11px] text-sidebar-foreground/60">Training & Compliance</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground transition-colors"
            title="Close Sidebar"
            aria-label="Close Sidebar"
          >
            <PanelLeftClose className="h-5 w-5 hidden lg:block" />
            <X className="h-5 w-5 lg:hidden" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-primary-foreground' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary shrink-0">
              <Truck className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">
                {profile?.full_name ?? 'User'}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">
                {role ? ROLE_LABELS[role] : ''}
              </p>
            </div>
          </div>
          <p className="mt-3 px-1 text-center text-[10px] text-sidebar-foreground/40">
            {isStaff(role) ? 'Staff Portal' : 'Driver Portal'} v1.0
          </p>
        </div>
      </aside>
    </>
  );
}
