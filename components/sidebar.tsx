'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Truck, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-all duration-300 ease-in-out lg:relative',
          // Mobile: slide in/out fully
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          // Desktop: full width (256px) when open, icon-rail (64px) when closed
          open ? 'w-64' : 'w-0 lg:w-16'
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex h-16 shrink-0 items-center border-b border-white/10 transition-all duration-300',
          open ? 'justify-between px-5' : 'justify-center px-0'
        )}>
          {open ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="flex flex-col leading-tight truncate">
                  <span className="text-sm font-bold tracking-tight">SafeFleet</span>
                  <span className="text-[11px] text-sidebar-foreground/60">Training &amp; Compliance</span>
                </div>
              </div>
              {/* Desktop collapse button */}
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground transition-colors hidden lg:block"
                title="Collapse Sidebar"
                aria-label="Collapse Sidebar"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
              {/* Mobile close button */}
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground transition-colors lg:hidden"
                title="Close Sidebar"
                aria-label="Close Sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          ) : (
            /* Collapsed: just the logo icon, click to expand */
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              title="Expand Sidebar"
              aria-label="Expand Sidebar"
            >
              <ShieldCheck className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto overflow-x-hidden py-4 px-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!open ? item.label : undefined}
                className={cn(
                  'group flex items-center rounded-lg transition-colors',
                  open ? 'gap-3 px-3 py-2.5 text-sm font-medium' : 'justify-center p-2.5',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground'
                )}
              >
                <Icon className={cn(
                  'shrink-0',
                  open ? 'h-[18px] w-[18px]' : 'h-5 w-5',
                  active ? 'text-primary-foreground' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'
                )} />
                {open && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer user info */}
        <div className="border-t border-white/10 p-3">
          {open ? (
            <>
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
              <p className="mt-2 px-1 text-center text-[10px] text-sidebar-foreground/40">
                {isStaff(role) ? 'Staff Portal' : 'Driver Portal'} v1.0
              </p>
            </>
          ) : (
            <div
              className="flex justify-center rounded-lg bg-white/5 p-2"
              title={profile?.full_name ?? 'User'}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Truck className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
