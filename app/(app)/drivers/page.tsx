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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Eye, Star, Trash2, AlertTriangle } from 'lucide-react';
import { RATING_BAND_COLORS, DRIVER_STATUS_COLORS, DRIVER_STATUS_LABELS } from '@/lib/constants';
import { exportToCSV } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';

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
  const { toast } = useToast();

  // Delete Driver modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; empId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDeleteDriver() {
    if (!deleteTarget) return;
    setDeleting(true);
    const driverId = deleteTarget.id;

    try {
      // 1. Unlink profiles
      await supabase.from('profiles').update({ driver_id: null }).eq('driver_id', driverId);

      // 2. Clear dependent records safely using ID list matching
      const tables = [
        'notifications',
        'trainings',
        'certificates',
        'driver_documents',
        'accidents',
        'violations',
        'safety_warnings',
        'behaviour_assessments',
        'driver_ratings',
        'exam_attempts',
      ];

      for (const tableName of tables) {
        const { data: rows } = await supabase.from(tableName).select('id').eq('driver_id', driverId);
        if (rows && rows.length > 0) {
          const ids = rows.map((r: any) => r.id).filter(Boolean);
          if (ids.length > 0) {
            await supabase.from(tableName).delete().in('id', ids);
          }
        }
      }

      // 3. Delete driver record
      const { error } = await supabase.from('drivers').delete().eq('id', driverId);

      if (error) {
        setDeleting(false);
        toast({ title: 'Failed to delete driver', description: error.message, variant: 'destructive' });
        return;
      }

      await logAudit('delete', 'driver', `Deleted driver: ${deleteTarget.name} (${deleteTarget.empId})`);
      toast({ title: 'Driver deleted successfully' });
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast({ title: 'Delete error', description: err.message ?? 'Unknown error occurred', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
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
        <div className="flex justify-end gap-1">
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1">
            <Link href={`/drivers/${row.original.id}`}>
              <Eye className="h-4 w-4" /> View
            </Link>
          </Button>
          {canEdit && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              title="Delete Driver"
              onClick={() => setDeleteTarget({
                id: row.original.id,
                name: row.original.full_name,
                empId: row.original.employee_id,
              })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
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

      {/* Delete Driver Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">Delete Driver Record</DialogTitle>
            <DialogDescription className="text-center text-xs">
              Are you sure you want to delete driver <strong>"{deleteTarget?.name}"</strong> ({deleteTarget?.empId})?
              This will permanently remove the driver profile along with their training records, certificates, and safety history.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDeleteDriver}>
              {deleting ? 'Deleting...' : 'Yes, Delete Driver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
