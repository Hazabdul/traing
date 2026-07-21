'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import type { Notification } from '@/lib/database-types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, BellOff, Check, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

const CHANNEL_ICONS = { email: Mail, sms: MessageSquare, push: Smartphone, in_app: Bell };

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.user_id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.user_id)
      .order('sent_at', { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }, [profile?.user_id]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((n) => n.map((x) => x.id === id ? { ...x, is_read: true } : x));
  }

  async function markAllRead() {
    if (!profile?.user_id) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.user_id).eq('is_read', false);
    setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`${notifications.filter((n) => !n.is_read).length} unread of ${notifications.length} total`}
        actions={notifications.some((n) => !n.is_read) ? <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1"><Check className="h-4 w-4" /> Mark all read</Button> : undefined}
      />

      <Card>
        <CardContent className="space-y-2 p-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <BellOff className="h-10 w-10 opacity-40" />
              <p className="text-sm">No notifications yet.</p>
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = CHANNEL_ICONS[n.channel];
              return (
                <div key={n.id} className={`flex items-start gap-3 rounded-lg border p-3 ${n.is_read ? 'opacity-70' : 'border-primary/30 bg-primary/5'}`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${n.is_read ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {!n.is_read && <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary">New</Badge>}
                    </div>
                    {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(n.sent_at)}</p>
                  </div>
                  {!n.is_read && <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => markRead(n.id)}><Check className="h-3.5 w-3.5" /></Button>}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
