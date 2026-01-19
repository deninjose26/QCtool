import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatError(detail: any): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const path = d.loc ? d.loc.filter((l: any) => l !== 'body').join('.') : '';
      return `${path ? path + ': ' : ''}${d.msg}`;
    }).join(', ');
  }
  if (typeof detail === 'object' && detail !== null) {
    return JSON.stringify(detail);
  }
  return 'An unexpected error occurred';
}
