import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatError(detail: any): string {
  if (typeof detail === 'string') {
    // Clean up raw database unique constraint errors if they leak
    if (detail.includes('duplicate key value violates unique constraint')) {
      if (detail.includes('users_email_key')) return 'This email address is already registered to another user.';
      if (detail.includes('users_username_key')) return 'This username is already taken. Please choose another one.';
      return 'This record already exists in the system.';
    }
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const path = d.loc ? d.loc.filter((l: any) => l !== 'body').join('.') : '';
      return `${path ? path + ': ' : ''}${d.msg}`;
    }).join(', ');
  }
  if (typeof detail === 'object' && detail !== null) {
    // If it's a JSON object but not a FastAPI error array, just return the detail string if it exists
    if ('message' in detail) return String(detail.message);
    return JSON.stringify(detail);
  }
  return 'An unexpected error occurred';
}
