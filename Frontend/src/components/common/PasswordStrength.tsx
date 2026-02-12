import React from 'react';
import { Check, X, Circle } from 'lucide-react';

interface PasswordStrengthProps {
    password: string;
}

const PasswordStrength: React.FC<PasswordStrengthProps> = ({ password }) => {
    const criteria = [
        { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
        { label: 'At least one uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
        { label: 'At least one lowercase letter', test: (p: string) => /[a-z]/.test(p) },
        { label: 'At least one digit', test: (p: string) => /\d/.test(p) },
        { label: 'At least one special character', test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
    ];

    if (!password) return null;

    return (
        <div className="mt-2 space-y-1 bg-slate-50 p-3 rounded-md border border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Password Requirements</p>
            {criteria.map((item, index) => {
                const isMet = item.test(password);
                return (
                    <div key={index} className="flex items-center gap-2">
                        {isMet ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                            <Circle className="h-3 w-3 text-slate-300" />
                        )}
                        <span className={`text-xs ${isMet ? 'text-emerald-600 font-medium' : 'text-slate-500'}`}>
                            {item.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default PasswordStrength;
