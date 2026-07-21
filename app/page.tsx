'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';

export default function RootRedirect() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace('/dashboard');
      else router.replace('/login');
      setChecked(true);
    })();
  }, [router]);

  if (!checked) return null;
  return null;
}
