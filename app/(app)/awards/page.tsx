'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import type { Driver, Branch, Plant } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Award, Star, Trophy, Medal } from 'lucide-react';
import { RATING_BAND_COLORS } from '@/lib/constants';
import { formatDate } from '@/lib/format';

export default function AwardsPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: d }, { data: b }, { data: p }] = await Promise.all([
      supabase.from('drivers').select('*').order('last_rating_score', { ascending: false }),
      supabase.from('branches').select('*'),
      supabase.from('plants').select('*'),
    ]);
    setDrivers((d ?? []) as Driver[]);
    setBranches(b ?? []);
    setPlants(p ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div></div>;
  }

  const eligible = drivers.filter((d) => d.last_rating_band === 'D1' && d.status === 'active');
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const plantMap = new Map(plants.map((p) => [p.id, p.name]));
  const top3 = eligible.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader title="Safety Awards" description={`${eligible.length} drivers eligible for safety awards (D1 rated, active)`} />

      {top3.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {top3.map((d, i) => {
            const Icon = i === 0 ? Trophy : i === 1 ? Medal : Award;
            const ring = i === 0 ? 'ring-amber-400/40' : i === 1 ? 'ring-slate-400/40' : 'ring-orange-400/30';
            const iconColor = i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : 'text-orange-500';
            return (
              <Card key={d.id} className={`relative overflow-hidden ${ring} ring-2`}>
                <CardContent className="flex flex-col items-center p-6 text-center">
                  <Icon className={`h-12 w-12 ${iconColor}`} />
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {i === 0 ? '1st Place' : i === 1 ? '2nd Place' : '3rd Place'}
                  </p>
                  <Avatar className="mt-3 h-14 w-14">
                    <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">
                      {d.full_name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <p className="mt-2 text-sm font-bold">{d.full_name}</p>
                  <p className="text-xs text-muted-foreground">{d.employee_id} · {branchMap.get(d.branch_id ?? '')}</p>
                  <div className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: `${RATING_BAND_COLORS.D1}20`, color: RATING_BAND_COLORS.D1 }}>
                    <Star className="h-3.5 w-3.5" fill={RATING_BAND_COLORS.D1} /> {d.last_rating_score}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">All Eligible Drivers</h3>
          <div className="space-y-2">
            {eligible.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No eligible drivers. D1 rated active drivers qualify.</p>}
            {eligible.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Award className="h-5 w-5 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.full_name}</p>
                  <p className="text-xs text-muted-foreground">{d.employee_id} · {branchMap.get(d.branch_id ?? '') ?? '—'} · {plantMap.get(d.plant_id ?? '') ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{d.experience_years ?? 0} yrs exp</span>
                  <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${RATING_BAND_COLORS.D1}20`, color: RATING_BAND_COLORS.D1 }}>
                    <Star className="h-3 w-3" fill={RATING_BAND_COLORS.D1} /> {d.last_rating_score}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
