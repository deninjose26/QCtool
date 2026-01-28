import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ArrowRight,
    Briefcase,
    GitBranch,
    Upload,
    CheckCircle,
    Database,
    MapPin,
    Building2,
    FileText,
    TrendingUp,
    Users,
    Clock,
    Activity,
    AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatToLocalTime } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface SupStats {
    counts: {
        vendors: number;
        allocations: number;
        sources: number;
        locations: number;
    };
    performance: {
        total_batches: number;
        completed_batches: number;
        in_progress_batches: number;
        target_images: number;
        uploaded_images: number;
    };
    recent_allocations: Array<{
        project: string;
        source: string;
        vendor: string;
        date: string;
    }>;
    recent_batches: Array<any>;
}

const UploadSupervisorDashboard: React.FC = () => {
    const { apiFetch } = useAuth();
    const { toast } = useToast();
    const [stats, setStats] = useState<SupStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setIsLoading(true);
                const res = await apiFetch(`${API_BASE_URL}/upload-sup/dashboard-stats`);
                if (!res.ok) throw new Error('Failed to fetch stats');
                const data = await res.json();
                setStats(data);
            } catch (error) {
                console.error(error);
                toast({ title: 'Sync Error', description: 'Could not refresh supervisor statistics', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    const actions = [
        { title: 'Vendor Management', desc: 'Manage vendor accounts and credentials', icon: Briefcase, link: '/vendors', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { title: 'Vendor Allocation', desc: 'Distribute sources to vendor teams', icon: GitBranch, link: '/vendor-allocation', color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: 'Upload History', desc: 'Monitor all incoming batch uploads', icon: Upload, link: '/upload-history', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { title: 'Resource Hub', desc: 'Configure sources and locations', icon: Database, link: '/sources', color: 'text-amber-600', bg: 'bg-amber-50' },
    ];

    if (isLoading || !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-medium animate-pulse text-sm tracking-widest uppercase text-center">Synchronizing Manager Dashboard...</p>
            </div>
        );
    }

    const progressPercent = Math.round((stats.performance.uploaded_images / (stats.performance.target_images || 1)) * 100);

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <PageHeader
                title="Upload Manager Dashboard"
                description="Monitor vendor performance and manage data ingestion pipelines"
            />

            {/* Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {actions.map((action, i) => (
                    <Link key={i} to={action.link} className="block group">
                        <Card className="hover:shadow-xl hover:border-indigo-200 transition-all duration-300 border-slate-200 cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className={cn("p-3 rounded-xl transition-colors", action.bg)}>
                                        <action.icon className={cn("h-6 w-6", action.color)} />
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                </div>
                                <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{action.title}</h3>
                                <p className="text-xs text-slate-500 mt-1 font-medium">{action.desc}</p>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Stats Breakdown */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Overall Progress */}
                <Card className="lg:col-span-2 border-slate-200 shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Ingestion In-Progress</h3>
                                <p className="text-xs text-slate-500 font-medium">Tracking live upload goals vs actuals</p>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-black text-indigo-600">{progressPercent}%</span>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Completion</p>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div>
                                <div className="flex justify-between text-xs mb-3 font-bold">
                                    <span className="text-slate-600">Total Image Volume</span>
                                    <span className="text-slate-900">{stats.performance.uploaded_images.toLocaleString()} / {stats.performance.target_images.toLocaleString()} imgs</span>
                                </div>
                                <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex p-1">
                                    <div
                                        className="bg-indigo-600 h-full rounded-full transition-all duration-1000 relative group"
                                        style={{ width: `${progressPercent}%` }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                {[
                                    { label: 'Total Batches', val: stats.performance.total_batches, icon: Activity, color: 'text-slate-600' },
                                    { label: 'Completed', val: stats.performance.completed_batches, icon: CheckCircle, color: 'text-emerald-600' },
                                    { label: 'In-Progress', val: stats.performance.in_progress_batches, icon: Clock, color: 'text-blue-600' },
                                    { label: 'Efficiency', val: '98%', icon: TrendingUp, color: 'text-amber-600' },
                                ].map((item, i) => (
                                    <div key={i} className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex justify-center mb-2">
                                            <item.icon className={cn("h-4 w-4", item.color)} />
                                        </div>
                                        <p className="text-lg font-black text-slate-900">{item.val}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Resource Summary */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white flex flex-col justify-center overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Database className="h-32 w-32 text-indigo-300" />
                    </div>
                    <CardContent className="p-8 space-y-8 relative z-10">
                        <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Resource Allocation</h3>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-sm">
                                    <Briefcase className="h-6 w-6 text-indigo-500" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-slate-900">{stats.counts.vendors}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Vendors</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100 shadow-sm">
                                    <GitBranch className="h-6 w-6 text-emerald-500" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-slate-900">{stats.counts.allocations}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Allocations</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 shadow-sm">
                                    <MapPin className="h-6 w-6 text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-slate-900">{stats.counts.locations}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Hubs</p>
                                </div>
                            </div>
                        </div>

                        <Link to="/vendors">
                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black h-11 rounded-xl mt-4 shadow-lg shadow-indigo-600/20 border-none transition-all active:scale-95">
                                Manage Vendors
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Section */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent Allocations */}
                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-indigo-600" />
                            Recent Vendor Allocations
                        </h3>
                        <Link to="/vendor-allocation" className="text-[10px] font-bold text-primary hover:underline uppercase">Manage All</Link>
                    </div>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                            {stats.recent_allocations.length > 0 ? (
                                stats.recent_allocations.map((alloc, idx) => (
                                    <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                                <Briefcase className="h-5 w-5 text-indigo-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-bold text-slate-900 truncate">{alloc.vendor}</h4>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight truncate">{alloc.project} / {alloc.source}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <Badge variant="outline" className="text-[10px] border-emerald-100 text-emerald-600 bg-emerald-50 mb-1">LIVE</Badge>
                                            <p className="text-[10px] text-slate-400 font-medium uppercase">{formatToLocalTime(alloc.date)}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-12 text-center text-slate-400 text-sm italic">No recent allocations found.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Batch Activity */}
                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2 text-emerald-600">
                            <Activity className="h-4 w-4" />
                            Latest Upload Events
                        </h3>
                        <Link to="/upload-history" className="text-[10px] font-bold text-primary hover:underline uppercase">View Logs</Link>
                    </div>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                            {stats.recent_batches.length > 0 ? (
                                stats.recent_batches.map((batch, idx) => (
                                    <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className={cn(
                                                "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                                batch.status === 'uploaded' ? "bg-emerald-50" : "bg-blue-50"
                                            )}>
                                                {batch.status === 'uploaded' ? (
                                                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                                                ) : (
                                                    <Clock className="h-5 w-5 text-blue-600" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-sm font-bold text-slate-900 truncate">{batch.batch_id}</h4>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight truncate">{batch.vendor_name} / {batch.operator_name}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-sm font-black text-slate-800">{batch.completed_count.toLocaleString()} imgs</p>
                                            <Badge className={cn(
                                                "text-[9px] uppercase h-4 px-1 leading-none font-bold",
                                                batch.status === 'uploaded' ? "bg-emerald-600" : "bg-blue-600"
                                            )}>
                                                {batch.status}
                                            </Badge>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-12 text-center text-slate-400 text-sm italic">No recent upload activity.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Verification Alert Section (Placeholder for future) */}
            <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-amber-900">System Performance Note</h4>
                    <p className="text-xs text-amber-700 font-medium">Global accuracy is currently at 98%. 2 batches are pending verification for more than 48 hours. Please check with the QC Manager.</p>
                </div>
                <Link to="/qc-history" className="ml-auto">
                    <Button variant="outline" size="sm" className="bg-white border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-bold">
                        Audit QC
                    </Button>
                </Link>
            </div>
        </div>
    );
};

export default UploadSupervisorDashboard;
