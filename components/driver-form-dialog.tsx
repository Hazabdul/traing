'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import type { Driver, Branch, Plant, DriverStatus } from '@/lib/database-types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';

const driverSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID required'),
  full_name: z.string().min(2, 'Name required'),
  nationality: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  date_of_birth: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  mobile: z.string().optional(),
  experience_years: z.coerce.number().int().min(0).optional(),
  branch_id: z.string().optional(),
  truck_number: z.string().optional(),
  equipment_number: z.string().optional(),
  supervisor: z.string().optional(),
  plant_id: z.string().optional(),
  status: z.enum(['active', 'suspended', 'resigned']),
  annual_training_frequency_months: z.coerce.number().int().min(1).max(24),
});

type DriverFormValues = z.infer<typeof driverSchema>;

interface DriverFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver?: Driver | null;
  branches: Branch[];
  plants: Plant[];
  onSaved: () => void;
}

const EMPTY: Partial<DriverFormValues> = {
  status: 'active',
  annual_training_frequency_months: 12,
  experience_years: 0,
  gender: 'male',
};

export function DriverFormDialog({ open, onOpenChange, driver, branches, plants, onSaved }: DriverFormDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const isEdit = !!driver;

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (driver) {
      reset({
        employee_id: driver.employee_id,
        full_name: driver.full_name,
        nationality: driver.nationality ?? '',
        gender: (driver.gender as 'male' | 'female' | 'other') ?? 'male',
        date_of_birth: driver.date_of_birth ?? '',
        email: driver.email ?? '',
        mobile: driver.mobile ?? '',
        experience_years: driver.experience_years ?? 0,
        branch_id: driver.branch_id ?? '',
        truck_number: driver.truck_number ?? '',
        equipment_number: driver.equipment_number ?? '',
        supervisor: driver.supervisor ?? '',
        plant_id: driver.plant_id ?? '',
        status: driver.status,
        annual_training_frequency_months: driver.annual_training_frequency_months,
      });
    } else {
      reset(EMPTY);
    }
  }, [driver, reset]);

  async function onSubmit(values: DriverFormValues) {
    setSaving(true);
    const payload = {
      employee_id: values.employee_id,
      full_name: values.full_name,
      nationality: values.nationality || null,
      gender: values.gender || null,
      date_of_birth: values.date_of_birth || null,
      email: values.email || null,
      mobile: values.mobile || null,
      experience_years: values.experience_years ?? 0,
      branch_id: values.branch_id || null,
      truck_number: values.truck_number || null,
      equipment_number: values.equipment_number || null,
      supervisor: values.supervisor || null,
      plant_id: values.plant_id || null,
      status: values.status,
      annual_training_frequency_months: values.annual_training_frequency_months,
    };

    try {
      if (isEdit && driver) {
        const { error } = await supabase.from('drivers').update(payload).eq('id', driver.id);
        if (error) throw error;
        await logAudit('update', 'driver', `Updated driver ${values.employee_id} (${values.full_name})`, { driver_id: driver.id }, driver.id);
        toast({ title: 'Driver updated', description: `${values.full_name} saved.` });
      } else {
        const { data: created, error } = await supabase.from('drivers').insert(payload).select().single();
        if (error) throw error;
        // Stage 1: auto-assign annual mandatory training
        await autoAssignAnnualTraining(created.id, values.annual_training_frequency_months, values.plant_id);
        await logAudit('create', 'driver', `Created driver ${values.employee_id} (${values.full_name})`, { driver_id: created.id }, created.id);
        toast({ title: 'Driver created', description: `${values.full_name} added. Annual training auto-scheduled.` });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function autoAssignAnnualTraining(driverId: string, freqMonths: number, plantId?: string) {
    // Schedule next annual training date
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + freqMonths);

    await supabase.from('drivers').update({ next_annual_training_date: nextDate.toISOString().slice(0, 10) }).eq('id', driverId);

    // Assign all annual mandatory courses
    const { data: annualCourses } = await supabase
      .from('courses')
      .select('id, title')
      .eq('frequency', 'annual')
      .eq('is_mandatory', true);

    if (annualCourses && annualCourses.length) {
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const rows = annualCourses.map((c) => ({
        driver_id: driverId,
        course_id: c.id,
        status: 'assigned' as const,
        due_date: due.toISOString().slice(0, 10),
        source: 'annual',
      }));
      await supabase.from('trainings').insert(rows);
    }

    // Assign plant-required courses if plant specified
    if (plantId) {
      const { data: plantCourses } = await supabase
        .from('plant_courses')
        .select('course_id')
        .eq('plant_id', plantId);
      if (plantCourses && plantCourses.length) {
        const due = new Date();
        due.setDate(due.getDate() + 45);
        const rows = plantCourses.map((pc) => ({
          driver_id: driverId,
          course_id: pc.course_id,
          status: 'assigned' as const,
          due_date: due.toISOString().slice(0, 10),
          source: 'plant_requirement',
        }));
        await supabase.from('trainings').insert(rows);
      }
    }
  }

  const watched = watch();
  const setSelect = (field: keyof DriverFormValues, value: string) => setValue(field, value as never);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update driver profile and operational data.' : 'Creating a driver auto-schedules annual mandatory training.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Tabs defaultValue="personal">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="operational">Operational</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Employee ID" error={errors.employee_id?.message}>
                  <Input {...register('employee_id')} placeholder="EMP-1001" />
                </Field>
                <Field label="Full Name" error={errors.full_name?.message}>
                  <Input {...register('full_name')} placeholder="Driver name" />
                </Field>
                <Field label="Nationality">
                  <Input {...register('nationality')} placeholder="Saudi" />
                </Field>
                <Field label="Gender">
                  <Select value={watched.gender} onValueChange={(v) => setSelect('gender', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Date of Birth">
                  <Input type="date" {...register('date_of_birth')} />
                </Field>
                <Field label="Experience (years)">
                  <Input type="number" min={0} {...register('experience_years')} />
                </Field>
                <Field label="Email" error={errors.email?.message}>
                  <Input type="email" {...register('email')} placeholder="driver@logistics.sa" />
                </Field>
                <Field label="Mobile">
                  <Input {...register('mobile')} placeholder="+9665…" />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="operational" className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Branch">
                  <Select value={watched.branch_id} onValueChange={(v) => setSelect('branch_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Plant Requirement">
                  <Select value={watched.plant_id} onValueChange={(v) => setSelect('plant_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select plant" /></SelectTrigger>
                    <SelectContent>
                      {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Truck Number">
                  <Input {...register('truck_number')} placeholder="TRK-201" />
                </Field>
                <Field label="Equipment Number">
                  <Input {...register('equipment_number')} placeholder="EQ-501" />
                </Field>
                <Field label="Supervisor">
                  <Input {...register('supervisor')} placeholder="Supervisor name" />
                </Field>
                <Field label="Status">
                  <Select value={watched.status} onValueChange={(v) => setSelect('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="resigned">Resigned</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Annual Training Frequency (months)" error={errors.annual_training_frequency_months?.message}>
                  <Input type="number" min={1} max={24} {...register('annual_training_frequency_months')} />
                </Field>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEdit ? 'Save Changes' : 'Create Driver'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
