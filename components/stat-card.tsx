'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  sub?: string;
}

const TONE_STYLES: Record<NonNullable<StatCardProps['tone']>, { icon: string; ring: string }> = {
  default: { icon: 'bg-muted text-muted-foreground', ring: '' },
  primary: { icon: 'bg-primary/15 text-primary', ring: 'ring-1 ring-primary/20' },
  success: { icon: 'bg-success/15 text-success', ring: 'ring-1 ring-success/20' },
  warning: { icon: 'bg-warning/15 text-warning', ring: 'ring-1 ring-warning/20' },
  danger: { icon: 'bg-destructive/15 text-destructive', ring: 'ring-1 ring-destructive/20' },
};

export function StatCard({ label, value, icon: Icon, tone = 'default', sub }: StatCardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <Card className={cn('overflow-hidden transition-shadow hover:shadow-md', styles.ring)}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', styles.icon)}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
