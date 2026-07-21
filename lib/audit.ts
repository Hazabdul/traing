'use client';

import { supabase } from '@/lib/supabase-client';
import type { AuditAction } from '@/lib/database-types';

/**
 * Writes an audit log entry. Silently fails on error so it never blocks the
 * calling operation — audit is best-effort from the client.
 */
export async function logAudit(
  action: AuditAction,
  entity: string,
  description: string,
  meta: Record<string, unknown> = {},
  entityId?: string
) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    await supabase.from('audit_logs').insert({
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? 'system',
      action,
      entity,
      entity_id: entityId ?? null,
      description,
      meta,
    });
  } catch (e) {
    console.error('audit log failed', e);
  }
}
