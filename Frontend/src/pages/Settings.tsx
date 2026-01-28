import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sun, Moon, Monitor, Laptop, Info, Mail, Bell, Wrench, RefreshCw, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const Settings: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const { apiFetch, user } = useAuth();
    const { toast } = useToast();
    const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
    const [partialUploadEnabled, setPartialUploadEnabled] = useState(() => {
        const saved = localStorage.getItem('partial_upload_enabled');
        return saved === 'true';
    });
    const [isLoading, setIsLoading] = useState(true);
    const [repairToolsEnabled, setRepairToolsEnabled] = useState(() => {
        const saved = localStorage.getItem('admin_repair_tools_enabled');
        return saved === 'true';
    });

    const handleToggleRepairTools = (enabled: boolean) => {
        setRepairToolsEnabled(enabled);
        localStorage.setItem('admin_repair_tools_enabled', String(enabled));
        toast({
            title: 'Repair Tools Updated',
            description: `Batch repair actions are now ${enabled ? 'visible' : 'hidden'} in Upload History`,
        });
    };

    const themes = [
        { id: 'light', name: 'Light Mode', icon: Sun, desc: 'Clean and bright appearance', color: 'bg-white' },
        { id: 'dark', name: 'Dark Mode', icon: Moon, desc: 'Midnight obsidian theme', color: 'bg-slate-900' },
        { id: 'system', name: 'System', icon: Monitor, desc: 'Follow device preferences', color: 'bg-slate-200' },
        { id: 'midnight', name: 'Midnight Blue', icon: Laptop, desc: 'Deep indigo professional theme', color: 'bg-indigo-950' },
    ];

    // Fetch email notification preference
    useEffect(() => {
        const fetchEmailPreference = async () => {
            try {
                const res = await apiFetch(`${API_BASE_URL}/auth/profile/email-notifications`);
                if (res.ok) {
                    const data = await res.json();
                    setEmailNotificationsEnabled(data.email_notifications_enabled);
                }
            } catch (error) {
                console.error('Failed to fetch email preference:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchEmailPreference();
    }, []);

    // Toggle email notifications
    const handleToggleEmailNotifications = async (enabled: boolean) => {
        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/profile/email-notifications`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });

            if (res.ok) {
                setEmailNotificationsEnabled(enabled);
                toast({
                    title: 'Success',
                    description: `Email notifications ${enabled ? 'enabled' : 'disabled'} successfully`,
                });
            } else {
                throw new Error('Failed to update preference');
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to update email notification preference',
                variant: 'destructive'
            });
            // Revert the switch
            setEmailNotificationsEnabled(!enabled);
        }
    };

    // Toggle partial upload feature
    const handleTogglePartialUpload = (enabled: boolean) => {
        setPartialUploadEnabled(enabled);
        localStorage.setItem('partial_upload_enabled', String(enabled));
        toast({
            title: 'Success',
            description: `Partial upload ${enabled ? 'enabled' : 'disabled'} successfully`,
        });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
            <PageHeader
                title="Application Settings"
                description="Configure your workspace & personalization preferences"
            />

            <div className="grid gap-8">
                {/* Visual Preference */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Visual Theme</CardTitle>
                        <CardDescription className="text-xs font-medium text-slate-400">Choose the appearance that best suits your work environment</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        <RadioGroup
                            defaultValue={theme}
                            onValueChange={(val) => setTheme(val as any)}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                        >
                            {themes.map((t) => (
                                <div key={t.id}>
                                    <RadioGroupItem
                                        value={t.id}
                                        id={t.id}
                                        className="peer sr-only"
                                    />
                                    <Label
                                        htmlFor={t.id}
                                        className={cn(
                                            "flex flex-col items-center justify-between rounded-2xl border-2 border-slate-100 bg-slate-50 p-4 hover:bg-slate-100 peer-data-[state=checked]:border-indigo-600 peer-data-[state=checked]:bg-indigo-50/50 cursor-pointer transition-all duration-300 h-full",
                                            theme === t.id && "border-indigo-600 bg-indigo-50/50"
                                        )}
                                    >
                                        <div className={cn("h-10 w-10 rounded-xl mb-3 flex items-center justify-center shadow-sm", t.color)}>
                                            <t.icon className={cn("h-5 w-5", t.id === 'light' ? 'text-amber-500' : 'text-indigo-500')} />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-tight text-slate-700">{t.name}</span>
                                        <span className="text-[10px] text-slate-400 font-medium text-center mt-1 leading-tight">{t.desc}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </CardContent>
                </Card>

                {/* Email Notifications */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                <Mail className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Email Notifications</CardTitle>
                                <CardDescription className="text-xs font-medium text-slate-400">Control when you receive email updates</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                    <Bell className={cn(
                                        "h-6 w-6 transition-colors",
                                        emailNotificationsEnabled ? "text-emerald-500" : "text-slate-300"
                                    )} />
                                </div>
                                <div>
                                    <Label className="text-sm font-bold text-slate-900 cursor-pointer">
                                        Receive Email Notifications
                                    </Label>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Get notified about batch allocations, completions, and daily summaries
                                    </p>
                                </div>
                            </div>
                            <Switch
                                checked={emailNotificationsEnabled}
                                onCheckedChange={handleToggleEmailNotifications}
                                disabled={isLoading}
                                className="data-[state=checked]:bg-emerald-500"
                            />
                        </div>

                        {emailNotificationsEnabled && (
                            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                                <p className="text-xs text-emerald-700 font-semibold flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Email notifications are enabled
                                </p>
                                <p className="text-xs text-emerald-600 mt-1 ml-4">
                                    You'll receive updates about your work assignments and daily summaries
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Partial Upload Feature - Admin Only */}
                {(user?.role === 'SuperAdmin' || user?.role === 'Upload_Supervisor') && (
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
                                    <Info className="h-5 w-5 text-purple-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Upload Features</CardTitle>
                                    <CardDescription className="text-xs font-medium text-slate-400">Control available upload options for operators</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                        <Laptop className={cn(
                                            "h-6 w-6 transition-colors",
                                            partialUploadEnabled ? "text-purple-500" : "text-slate-300"
                                        )} />
                                    </div>
                                    <div>
                                        <Label className="text-sm font-bold text-slate-900 cursor-pointer">
                                            Enable Partial Upload
                                        </Label>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            Allow operators to upload incomplete batches for partial submissions
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={partialUploadEnabled}
                                    onCheckedChange={handleTogglePartialUpload}
                                    className="data-[state=checked]:bg-purple-500"
                                />
                            </div>

                            {partialUploadEnabled && (
                                <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                                    <p className="text-xs text-purple-700 font-semibold flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                                        Partial upload is enabled
                                    </p>
                                    <p className="text-xs text-purple-600 mt-1 ml-4">
                                        Operators can now choose between complete and partial uploads when creating batches
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Admin Troubleshooting - Controlled Visibility */}
                {user?.role === 'SuperAdmin' && (
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                    <Wrench className="h-5 w-5 text-amber-600" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Troubleshooting Tools</CardTitle>
                                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-bold px-1.5 h-4 text-[8px] uppercase tracking-tighter">Diagnostic</Badge>
                                    </div>
                                    <CardDescription className="text-xs font-medium text-slate-400">Manage manual recovery and repair features</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                        <RefreshCw className={cn(
                                            "h-6 w-6 transition-colors",
                                            repairToolsEnabled ? "text-amber-500" : "text-slate-300"
                                        )} />
                                    </div>
                                    <div className="flex-1">
                                        <Label className="text-sm font-bold text-slate-900 cursor-pointer">
                                            Enable Batch Repair Options
                                        </Label>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5 max-w-md">
                                            When enabled, a "Repair" column will appear in the Master Upload History to re-trigger image optimization for specific batches.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={repairToolsEnabled}
                                    onCheckedChange={handleToggleRepairTools}
                                    className="data-[state=checked]:bg-amber-500"
                                />
                            </div>

                            <Alert className="bg-blue-50/50 border-blue-100">
                                <Info className="h-4 w-4 text-blue-500" />
                                <AlertTitle className="text-[10px] font-bold uppercase text-blue-800 tracking-wider">Optimization Note</AlertTitle>
                                <AlertDescription className="text-xs text-blue-600 font-medium leading-relaxed">
                                    Keeping these tools hidden prevents accidental re-triggers during active production hours. Enable them only when diagnostic work is required.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                )}

                {/* Info Card */}
                <div className="p-6 bg-slate-900 rounded-2xl text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <p className="text-xs text-slate-400 font-medium italic relative z-10">
                        "Your settings are automatically synchronized across all your devices."
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
