import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import {
    Sun, Moon, Monitor, Laptop, Info, Mail, Bell, Wrench, RefreshCw,
    Loader2, AlertTriangle, ShieldAlert, Database, FolderOpen,
    ChevronRight, ChevronLeft, HardDrive, Folder, Lock, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';

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
    const [downloadPath, setDownloadPath] = useState(() => {
        return localStorage.getItem('local_download_path') || 'C:\\QC_Output';
    });
    const [isSavingPath, setIsSavingPath] = useState(false);
    const [allowMultipleVendors, setAllowMultipleVendors] = useState(false);
    const [isUpdatingAllocSetting, setIsUpdatingAllocSetting] = useState(false);
    const [auditLogsEnabled, setAuditLogsEnabled] = useState(false);
    const [isUpdatingAuditLogs, setIsUpdatingAuditLogs] = useState(false);
    const [manualLockReleaseEnabled, setManualLockReleaseEnabled] = useState(false);
    const [isUpdatingManualLockRelease, setIsUpdatingManualLockRelease] = useState(false);

    // Folder Picker States
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [browsingPath, setBrowsingPath] = useState('');
    const [directories, setDirectories] = useState<string[]>([]);
    const [parentPath, setParentPath] = useState<string | null>(null);
    const [isBrowsing, setIsBrowsing] = useState(false);

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

    // Fetch settings on mount
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Email Pref
                const prefRes = await apiFetch(`${API_BASE_URL}/auth/profile/email-notifications`);
                if (prefRes.ok) {
                    const data = await prefRes.json();
                    setEmailNotificationsEnabled(data.email_notifications_enabled);
                }
                if (user?.role === 'SuperAdmin') {
                    const allocRes = await apiFetch(`${API_BASE_URL}/admin/settings/allow_multiple_vendor_allocations`);
                    if (allocRes.ok) {
                        const data = await allocRes.json();
                        setAllowMultipleVendors(data.setting_value === 'true');
                    }

                    // Fetch audit logs setting
                    const auditRes = await apiFetch(`${API_BASE_URL}/admin/settings/enable_audit_logs`);
                    if (auditRes.ok) {
                        const data = await auditRes.json();
                        setAuditLogsEnabled(data.setting_value === 'true');
                    }

                    // Fetch manual lock release setting
                    const lockRes = await apiFetch(`${API_BASE_URL}/admin/settings/enable_manual_lock_release`);
                    if (lockRes.ok) {
                        const data = await lockRes.json();
                        setManualLockReleaseEnabled(data.setting_value === 'true');
                    }
                }
            } catch (error) {
                console.error('Failed to fetch settings:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, [user?.role]);

    const handleSaveDownloadPath = async () => {
        try {
            setIsSavingPath(true);
            await new Promise(resolve => setTimeout(resolve, 500));
            localStorage.setItem('local_download_path', downloadPath);
            toast({
                title: 'Settings Saved',
                description: 'Local download path updated successfully',
            });
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: 'Could not update download path',
                variant: 'destructive'
            });
        } finally {
            setIsSavingPath(false);
        }
    };

    // Folder Browsing Logic
    const browseTo = async (path: string = '') => {
        try {
            setIsBrowsing(true);
            const encodedPath = encodeURIComponent(path);
            const res = await apiFetch(`${API_BASE_URL}/admin/maintenance/list-directories?path=${encodedPath}`);
            if (res.ok) {
                const data = await res.json();
                setBrowsingPath(data.current_path);
                setDirectories(data.directories);
                setParentPath(data.parent);

                if (data.error) {
                    console.warn('Folder Browse Warning:', data.error);
                }
            } else {
                if (path !== '') browseTo('');
            }
        } catch (error) {
            console.error('Browse error:', error);
            if (path !== '') browseTo('');
        } finally {
            setIsBrowsing(false);
        }
    };

    const handleOpenPicker = () => {
        setIsPickerOpen(true);
        browseTo(downloadPath || '');
    };

    const handleSelectPath = () => {
        setDownloadPath(browsingPath);
        setIsPickerOpen(false);
    };

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

    const handleToggleMultipleVendors = async (enabled: boolean) => {
        try {
            setIsUpdatingAllocSetting(true);
            const res = await apiFetch(`${API_BASE_URL}/admin/settings/allow_multiple_vendor_allocations`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: String(enabled) })
            });

            if (res.ok) {
                setAllowMultipleVendors(enabled);
                toast({
                    title: 'System Setting Updated',
                    description: `Multiple vendor allocations are now ${enabled ? 'allowed' : 'restricted'}`,
                });
            } else {
                throw new Error('Failed to update setting');
            }
        } catch (error) {
            toast({
                title: 'Operation Failed',
                description: 'Could not update allocation policy',
                variant: 'destructive'
            });
        } finally {
            setIsUpdatingAllocSetting(false);
        }
    };

    const handleToggleAuditLogs = async (enabled: boolean) => {
        try {
            setIsUpdatingAuditLogs(true);
            const res = await apiFetch(`${API_BASE_URL}/admin/settings/enable_audit_logs`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: String(enabled) })
            });

            if (res.ok) {
                setAuditLogsEnabled(enabled);

                // Dispatch event to update sidebar instantly
                window.dispatchEvent(new Event('settings-updated'));

                toast({
                    title: 'Audit Logs Updated',
                    description: `Audit logging is now ${enabled ? 'enabled' : 'disabled'}. Sidebar updated.`,
                });
            } else {
                throw new Error('Failed to update setting');
            }
        } catch (error) {
            toast({
                title: 'Operation Failed',
                description: 'Could not update audit logs setting',
                variant: 'destructive'
            });
        } finally {
            setIsUpdatingAuditLogs(false);
        }
    };

    const handleToggleManualLockRelease = async (enabled: boolean) => {
        try {
            setIsUpdatingManualLockRelease(true);
            const res = await apiFetch(`${API_BASE_URL}/admin/settings/enable_manual_lock_release`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: String(enabled) })
            });

            if (res.ok) {
                setManualLockReleaseEnabled(enabled);
                toast({
                    title: 'Security Policy Updated',
                    description: `Manual lock release is now ${enabled ? 'enabled' : 'disabled'}.`,
                });
            } else {
                throw new Error('Failed to update setting');
            }
        } catch (error) {
            toast({
                title: 'Operation Failed',
                description: 'Could not update manual lock release setting',
                variant: 'destructive'
            });
        } finally {
            setIsUpdatingManualLockRelease(false);
        }
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
                                <div key={t.id} className="h-full">
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

                {/* System-wide Allocation Policy - SuperAdmin Only */}
                {user?.role === 'SuperAdmin' && (
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
                                    <ShieldAlert className="h-5 w-5 text-orange-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Allocation Policy</CardTitle>
                                    <CardDescription className="text-xs font-medium text-slate-400">Manage vendor assignment restrictions</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                        <RefreshCw className={cn(
                                            "h-6 w-6 transition-colors",
                                            allowMultipleVendors ? "text-orange-500" : "text-slate-300"
                                        )} />
                                    </div>
                                    <div>
                                        <Label className="text-sm font-bold text-slate-900 cursor-pointer">
                                            Allow Multiple Vendors per Combination
                                        </Label>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            Enable to allow the same Project + Source + Location + Record Owner to be assigned to multiple vendors simultaneously
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={allowMultipleVendors}
                                    onCheckedChange={handleToggleMultipleVendors}
                                    disabled={isUpdatingAllocSetting}
                                    className="data-[state=checked]:bg-orange-500"
                                />
                            </div>

                            {!allowMultipleVendors && (
                                <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                    <p className="text-xs text-blue-700 font-semibold flex items-center gap-2">
                                        <Info className="h-3 w-3" />
                                        Strict Allocation Policy Active
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1 ml-5">
                                        Currently, each combination can only be assigned to one active vendor at a time.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Local Storage Settings - Supervisor/Admin Only */}
                {['SuperAdmin', 'QC_Supervisor', 'Upload_Supervisor'].includes(user?.role || '') && (
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                    <Database className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Storage & Downloads</CardTitle>
                                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-bold px-1.5 h-4 text-[8px] uppercase tracking-tighter">System Only</Badge>
                                    </div>
                                    <CardDescription className="text-xs font-medium text-slate-400">Configure local file management preferences</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-bold text-slate-900">Default Local Download Path</Label>
                                    <p className="text-[11px] text-slate-500 font-medium">Specify the folder on the server where batch images should be exported</p>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1 group/input">
                                            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within/input:text-blue-600 transition-colors" />
                                            <input
                                                type="text"
                                                value={downloadPath}
                                                onChange={(e) => setDownloadPath(e.target.value)}
                                                placeholder="C:\\QC_Output"
                                                className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-600/5 focus:border-blue-600 transition-all font-mono"
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={handleOpenPicker}
                                            className="h-11 px-4 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-bold"
                                        >
                                            <FolderOpen className="h-4 w-4 mr-2" />
                                            Browse
                                        </Button>
                                        <Button
                                            onClick={handleSaveDownloadPath}
                                            disabled={isSavingPath}
                                            className="h-11 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md active:scale-95"
                                        >
                                            {isSavingPath ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Path'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Folder Picker Dialog */}
                <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                    <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-white">
                        <DialogHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <FolderOpen className="h-5 w-5 text-blue-600" />
                                Server Directory Browser
                            </DialogTitle>
                            <DialogDescription className="text-xs font-medium text-slate-500">
                                Navigate and select a destination folder directly on the server
                            </DialogDescription>
                        </DialogHeader>

                        <div className="p-6">
                            <div className="flex items-center gap-2 mb-4 p-2 bg-slate-900 rounded-xl">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white hover:bg-white/10"
                                    onClick={() => browseTo('')}
                                    title="Go to Computer"
                                >
                                    <Monitor className="h-4 w-4" />
                                </Button>
                                {parentPath !== null && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-white hover:bg-white/10"
                                        onClick={() => browseTo(parentPath)}
                                        title="Go Up"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                )}
                                <div className="flex-1 overflow-hidden ml-1">
                                    <p className="text-[10px] font-mono text-blue-400 truncate tracking-tight">{browsingPath || 'My Computer'}</p>
                                </div>
                            </div>

                            <div className="h-[300px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50 bg-white">
                                {isBrowsing ? (
                                    <div className="h-full flex flex-col items-center justify-center gap-3">
                                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Scanning system...</p>
                                    </div>
                                ) : directories.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center gap-2 p-10 text-center">
                                        <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-2">
                                            <Folder className="h-6 w-6 text-slate-200" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-400">No subdirectories found</p>
                                        <p className="text-[10px] text-slate-400 max-w-[200px]">This may be a restricted folder or an empty directory</p>
                                    </div>
                                ) : (
                                    directories.map((dir) => (
                                        <button
                                            key={dir}
                                            onClick={() => browseTo(browsingPath ? (browsingPath.endsWith('\\') || browsingPath.endsWith('/') ? `${browsingPath}${dir}` : `${browsingPath}${os_path_separator()}${dir}`) : dir)}
                                            className="w-full flex items-center gap-3 p-4 hover:bg-blue-50/50 group transition-all text-left"
                                        >
                                            <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                                {browsingPath === '' ? <HardDrive className="h-4 w-4 text-slate-500 group-hover:text-blue-600" /> : <Folder className="h-4 w-4 text-slate-400 group-hover:text-blue-500" />}
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 flex-1">{dir}</span>
                                            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400" />
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
                            <Button
                                variant="ghost"
                                onClick={() => setIsPickerOpen(false)}
                                className="font-bold text-slate-500"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSelectPath}
                                disabled={!browsingPath || isBrowsing}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 rounded-xl shadow-lg shadow-blue-200 active:scale-95"
                            >
                                Select This Folder
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Audit Logs - SuperAdmin Only */}
                {user?.role === 'SuperAdmin' && (
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                                    <Database className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Audit Logs</CardTitle>
                                    <CardDescription className="text-xs font-medium text-slate-400">Track user actions for accountability</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                        <Database className={cn(
                                            "h-6 w-6 transition-colors",
                                            auditLogsEnabled ? "text-emerald-500" : "text-slate-300"
                                        )} />
                                    </div>
                                    <div>
                                        <Label className="text-sm font-bold text-slate-900 cursor-pointer">
                                            Enable Audit Logs
                                        </Label>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            Track all user actions including deletions, updates, and approvals
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={auditLogsEnabled}
                                    onCheckedChange={handleToggleAuditLogs}
                                    disabled={isUpdatingAuditLogs}
                                    className="data-[state=checked]:bg-emerald-500"
                                />
                            </div>

                            {auditLogsEnabled && (
                                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                                    <p className="text-xs text-emerald-700 font-semibold flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Audit logging is active
                                    </p>
                                    <p className="text-xs text-emerald-600 mt-1 ml-4">
                                        View logs in the Admin Dashboard sidebar. All user actions are being tracked.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Manual Lock Release - SuperAdmin Only */}
                {user?.role === 'SuperAdmin' && (
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                    <Lock className="h-5 w-5 text-amber-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Upload Locking & Security</CardTitle>
                                    <CardDescription className="text-xs font-medium text-slate-400">Configure how batch locks are managed</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                        <Shield className={cn(
                                            "h-6 w-6 transition-colors",
                                            manualLockReleaseEnabled ? "text-amber-500" : "text-slate-300"
                                        )} />
                                    </div>
                                    <div>
                                        <Label className="text-sm font-bold text-slate-900 cursor-pointer">
                                            Enable Manual Lock Release
                                        </Label>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            Allow operators to manually release a batch lock if they are blocked by a previous session
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={manualLockReleaseEnabled}
                                    onCheckedChange={handleToggleManualLockRelease}
                                    disabled={isUpdatingManualLockRelease}
                                    className="data-[state=checked]:bg-amber-500"
                                />
                            </div>

                            {manualLockReleaseEnabled && (
                                <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-amber-700 font-semibold">
                                            Manual lock override is active
                                        </p>
                                        <p className="text-[10px] text-amber-600 mt-0.5 font-medium leading-relaxed">
                                            Operators can now bypass the 24-hour protection period. Use this sparingly as it can lead to concurrent uploads if misused.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Troubleshooting */}
                {user?.role === 'SuperAdmin' && (
                    <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                    <Wrench className="h-5 w-5 text-amber-600" />
                                </div>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Troubleshooting</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                                <Label className="text-sm font-bold">Enable Repair Tools</Label>
                                <Switch checked={repairToolsEnabled} onCheckedChange={handleToggleRepairTools} />
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
};

// Helper for cross-platform path separators
const os_path_separator = () => {
    return navigator.userAgent.includes('Windows') ? '\\' : '/';
};

export default Settings;
