'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { useAuth, isStaff } from '@/lib/auth-context';
import type { Driver, Branch, Plant, DriverRatingBand } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DriverFormDialog } from '@/components/driver-form-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Eye, Star } from 'lucide-react';
import { RATING_BAND_COLORS, DRIVER_STATUS_COLORS, DRIVER_STATUS_LABELS } from '@/lib/constants';
import { exportToCSV } from '@/lib/export';

interface DriverRow extends Driver {
  branch_name?: string | null;
  plant_name?: string | null;
}

export default function DriversPage() {
  const { profile } = useAuth();
  const canEdit = isStaff(profile?.role);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: d }, { data: b }, { data: p }] = await Promise.all([
      supabase.from('drivers').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
      supabase.from('plants').select('*').order('name'),
    ]);
    const branchMap = new Map((b ?? []).map((x: Branch) => [x.id, x.name]));
    const plantMap = new Map((p ?? []).map((x: Plant) => [x.id, x.name]));
    setDrivers((d ?? []).map((drv: Driver) => ({
      ...drv,
      branch_name: drv.branch_id ? branchMap.get(drv.branch_id) ?? null : null,
      plant_name: drv.plant_id ? plantMap.get(drv.plant_id) ?? null : null,
    })));
    setBranches(b ?? []);
    setPlants(p ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (ratingFilter !== 'all' && d.last_rating_band !== ratingFilter) return false;
      if (branchFilter !== 'all' && d.branch_id !== branchFilter) return false;
      return true;
    });
  }, [drivers, statusFilter, ratingFilter, branchFilter]);

  function handleExport() {
    exportToCSV(
      filtered.map((d) => ({
        EmployeeID: d.employee_id,
        Name: d.full_name,
        Nationality: d.nationality ?? '',
        Branch: d.branch_name ?? '',
        Plant: d.plant_name ?? '',
        Status: DRIVER_STATUS_LABELS[d.status],
        Rating: d.last_rating_band,
        Score: d.last_rating_score,
        Risk: d.last_risk_level,
        Experience: d.experience_years ?? 0,
        Truck: d.truck_number ?? '',
        Supervisor: d.supervisor ?? '',
      })),
      'drivers.csv'
    );
  }

  const columns: ColumnDef<DriverRow>[] = useMemo(() => [
    {
      accessorKey: 'full_name',
      header: 'Driver',
      cell: ({ row }) => {
        const d = row.original;
        const initials = d.full_name.split(' ').map((s) => s[0]).slice(0, 2).join('');
        return (
          <Link href={`/drivers/${d.id}`} className="flex items-center gap-3 hover:underline">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{d.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{d.employee_id}</p>
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'branch_name',
      header: 'Branch',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.branch_name ?? '—'}</span>,
    },
    {
      accessorKey: 'plant_name',
      header: 'Plant',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.plant_name ?? '—'}</span>,
    },
    {
      id: 'rating',
      accessorKey: 'last_rating_band',
      header: 'Rating',
      cell: ({ row }) => {
        const band = row.original.last_rating_band as DriverRatingBand;
        return (
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5" style={{ color: RATING_BAND_COLORS[band] }} fill={RATING_BAND_COLORS[band]} />
            <span className="font-medium" style={{ color: RATING_BAND_COLORS[band] }}>{band}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{row.original.last_rating_score}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'last_risk_level',
      header: 'Risk',
      cell: ({ row }) => {
        const risk = row.original.last_risk_level;
        const cls = risk === 'Low' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : risk === 'Low-Medium' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : risk === 'Medium-High' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{risk}</span>;
      },
    },
    {
      accessorKey: 'experience_years',
      header: 'Exp (yrs)',
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.experience_years ?? 0}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="secondary" className={DRIVER_STATUS_COLORS[row.original.status]}>
          {DRIVER_STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1">
            <Link href={`/drivers/${row.original.id}`}>
              <Eye className="h-4 w-4" /> View
            </Link>
          </Button>
        </div>
      ),
    },
  ], []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        description={`${drivers.length} drivers in the system`}
        actions={
          canEdit ? (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Add Driver
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="resigned">Resigned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Rating" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratings</SelectItem>
            <SelectItem value="D1">D1 - Excellent</SelectItem>
            <SelectItem value="D2">D2 - Good</SelectItem>
            <SelectItem value="D3">D3 - Improve</SelectItem>
            <SelectItem value="D4">D4 - High Risk</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExport} className="h-9">
          Export CSV
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        searchPlaceholder="Search by name or employee ID…"
      />

      <DriverFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        driver={editing}
        branches={branches}
        plants={plants}
        onSaved={load}
      />
    </div>
  );
}
