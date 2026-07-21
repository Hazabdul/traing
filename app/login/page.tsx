'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck, Loader2, Eye, EyeOff, Truck, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DEMO_ACCOUNTS = [
  { email: 'admin@logistics.sa', role: 'System Administrator' },
  { email: 'ehss.manager@logistics.sa', role: 'EHSS Manager' },
  { email: 'ehss.officer@logistics.sa', role: 'EHSS Officer' },
  { email: 'hr@logistics.sa', role: 'HR' },
  { email: 'coordinator@logistics.sa', role: 'Training Coordinator' },
  { email: 'branch.manager@logistics.sa', role: 'Branch Manager' },
  { email: 'driver@logistics.sa', role: 'Driver' },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('admin@logistics.sa');
  const [password, setPassword] = useState('password123');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      toast({ title: 'Sign in failed', description: signInError.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Welcome back', description: 'Signed in successfully.' });
    router.replace('/dashboard');
  }

  function fillDemo(em: string) {
    setEmail(em);
    setPassword('password123');
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-sidebar p-8 text-sidebar-foreground lg:p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/5" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">SafeFleet</p>
            <p className="text-xs text-sidebar-foreground/60">Driver Training Management System</p>
          </div>
        </div>

        <div className="relative my-12 hidden lg:block">
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            Enterprise training & compliance for hazardous goods logistics
          </h2>
          <p className="mt-4 max-w-md text-sm text-sidebar-foreground/70">
            Automated driver ratings, mandatory training scheduling, online examinations,
            and full audit traceability — built for SABIC, ARAMCO, MAADEN and beyond.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
            {['Weighted D1-D4 Rating Engine', 'Automated Annual Training', 'Online Exams & Certificates', 'Plant-Specific Compliance'].map((f) => (
              <div key={f} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2.5">
                <Truck className="h-4 w-4 text-primary" />
                <span className="text-sidebar-foreground/90">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} SafeFleet. All rights reserved.
        </p>
      </div>

      {/* Login panel */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Sign in</CardTitle>
              <CardDescription>Enter your credentials to access the dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@logistics.sa"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-border/60 bg-muted/40 p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Demo accounts — click to autofill (password: password123)
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => fillDemo(a.email)}
                      className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="font-medium text-foreground">{a.role}</span>
                      <span className="text-muted-foreground">{a.email.split('@')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
