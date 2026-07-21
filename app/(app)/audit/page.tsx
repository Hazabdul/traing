'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase-client';
import type { AuditLog, AuditAction } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { ColumnDef } from '@tanstack/react-table';
import { AUDIT_ACTION_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import { exportToCSV } from '@/lib/export';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const ACTION_COLORS: Record<AuditAction, string> = {
  create: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  assign: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  complete: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  fail_exam: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  training_change: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  status_change: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  login: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
    setLogs((data ?? []) as AuditLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => logs.filter((l) => actionFilter === 'all' || l.action === actionFilter), [logs, actionFilter]);

  const columns: ColumnDef<AuditLog>[] = useMemo(() => [
    {
      accessorKey: 'created_at', header: 'Timestamp',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span>,
    },
    { accessorKey: 'actor_email', header: 'Actor', cell: ({ row }) => <span className="text-xs font-medium">{row.original.actor_email ?? 'system'}</span> },
    {
      accessorKey: 'action', header: 'Action',
      cell: ({ row }) => <Badge variant="secondary" className={ACTION_COLORS[row.original.action]}>{AUDIT_ACTION_LABELS[row.original.action]}</Badge>,
    },
    { accessorKey: 'entity', header: 'Entity', cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.entity}</Badge> },
    { accessorKey: 'description', header: 'Description' },
  ], []);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description={`${logs.length} recorded actions`}
        actions={<Button variant="outline" size="sm" onClick={() => exportToCSV(filtered.map((l) => ({
          Timestamp: formatDateTime(l.created_at), Actor: l.actor_email ?? 'system',
          Action: AUDIT_ACTION_LABELS[l.action], Entity: l.entity, Description: l.description ?? '',
        })), 'audit_logs.csv')} className="gap-1"><Download className="h-4 w-4" /> Export</Button>}
      />

      <Select value={actionFilter} onValueChange={setActionFilter}>
        <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((a) => <SelectItem key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</SelectItem>)}
        </SelectContent>
      </Select>

      <DataTable columns={columns} data={filtered} globalFilter={globalFilter} onGlobalFilterChange={setGlobalFilter} searchPlaceholder="Search audit logs…" pageSize={20} />
    </div>
  );
}
