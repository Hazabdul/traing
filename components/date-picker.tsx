'use client';

import { Input } from '@/components/ui/input';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/** Minimal date picker using the native input[type=date]. */
export function DatePicker({ value, onChange, placeholder, className }: DatePickerProps) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}
