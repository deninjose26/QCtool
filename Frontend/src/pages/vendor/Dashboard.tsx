import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ArrowRight,
    UserCog,
    GitBranch,
    Upload,
    History,
    RefreshCw,
    TrendingUp,
    CheckCircle2,
    Clock,
    Activity,
    ShieldAlert,
    Users
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatToLocalTime } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface VendorStats {
    counts: {
        operators: number;
        allocations: number;
    };
    performance: {
        total_batches: number;
        completed_batches: number;
        target_images: number;
        uploaded_images: number;
        rework_needed: number;
    };
    qc_stats: {
        total_accepted: number;
        total_rejected: number;
        accuracy: number;
    };
    recent_batches: Array<any>;
}

const VendorDashboard: React.FC = () => {
    const { apiFetch } = useAuth();
    const { toast } = useToast();
    const [stats, setStats] = useState<VendorStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setIsLoading(true);
                const res = await apiFetch(`${API_BASE_URL}/vendor/dashboard-stats`);
                if (!res.ok) throw new Error('Failed to fetch vendor stats');
                const data = await res.json();
                setStats(data);
            } catch (error) {
                console.error(error);
                toast({ title: 'Sync Error', description: 'Could not refresh your dashboard', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    const actions = [
        { title: 'Operators', desc: 'Manage your scanning team', icon: UserCog, link: '/operators', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { title: 'Allocations', desc: 'Assign resources to operators', icon: GitBranch, link: '/operator-allocation', color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: 'Upload Feed', desc: 'Live monitoring of your batches', icon: Upload, link: '/upload-history', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { title: 'Rework Queue', desc: 'Batches requiring corrections', icon: RefreshCw, link: '/reallocation', color: 'text-red-600', bg: 'bg-red-50', badge: stats?.performance.rework_needed },
    ];

    if (isLoading || !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse text-[10px] tracking-[0.3em] uppercase">Loading Vendor Intelligence...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <PageHeader
                title="Vendor Control Center"
                description="Monitor operator efficiency and manage your assigned project resources"
            />

            {/* Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {actions.map((action, i) => (
                    <Link key={i} to={action.link} className="block group">
                        <Card className="hover:shadow-xl hover:border-emerald-200 transition-all duration-300 border-slate-200 cursor-pointer h-full relative overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className={cn("p-3 rounded-xl transition-colors", action.bg)}>
                                        <action.icon className={cn("h-6 w-6", action.color)} />
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                                </div>
                                <h3 className="font-bold text-slate-900">{action.title}</h3>
                                <p className="text-[11px] text-slate-500 mt-1 font-semibold leading-tight">{action.desc}</p>

                                {action.badge !== undefined && action.badge > 0 && (
                                    <div className="absolute top-4 right-12">
                                        <Badge className="bg-red-600 text-white border-none animate-bounce">{action.badge}</Badge>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Main Stats Row */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Team & Distribution */}
                <Card className="border-slate-200 flex flex-col justify-between overflow-hidden">
                    <CardContent className="p-0 flex flex-col h-full">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Resource Portfolio</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-indigo-600 mb-1">
                                        <Users className="h-4 w-4" />
                                        <span className="text-[10px] font-bold uppercase">Team Size</span>
                                    </div>
                                    <p className="text-3xl font-black text-slate-900">{stats.counts.operators}</p>
                                    <p className="text-[9px] text-slate-400 font-bold">Active Operators</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-blue-600 mb-1">
                                        <GitBranch className="h-4 w-4" />
                                        <span className="text-[10px] font-bold uppercase">Allocations</span>
                                    </div>
                                    <p className="text-3xl font-black text-slate-900">{stats.counts.allocations}</p>
                                    <p className="text-[9px] text-slate-400 font-bold">Project Hubs</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <div className="flex justify-between text-[11px] font-bold mb-2">
                                    <span className="text-slate-500">Image Goal Completion</span>
                                    <span className="text-emerald-600">{Math.round((stats.performance.uploaded_images / (stats.performance.target_images || 1)) * 100)}%</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="bg-emerald-500 h-full transition-all duration-1000"
                                        style={{ width: `${(stats.performance.uploaded_images / (stats.performance.target_images || 1)) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-black text-slate-400">
                                <span>{stats.performance.uploaded_images.toLocaleString()} UPLOADED</span>
                                <span>{stats.performance.target_images.toLocaleString()} TARGET</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Accuracy Card */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                        <ShieldAlert className="h-32 w-32 text-emerald-300" />
                    </div>
                    <CardContent className="p-8 h-full flex flex-col justify-between relative z-10">
                        <div>
                            <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">Quality Score</h3>
                            <p className="text-5xl font-black mb-2 text-slate-900">{stats.qc_stats.accuracy}%</p>
                            <p className="text-xs font-bold text-slate-400 italic">Across {stats.performance.total_batches} batches</p>
                        </div>

                        <div className="space-y-4 mt-8">
                            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                                <span className="text-[10px] font-black uppercase text-slate-400">Accepted Images</span>
                                <span className="text-lg font-black text-emerald-600">{stats.qc_stats.total_accepted.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase text-slate-400">Rejected Images</span>
                                <span className="text-lg font-black text-red-600">{stats.qc_stats.total_rejected.toLocaleString()}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>


                {/* Efficiency/Throughput */}
                <Card className="border-slate-200 flex flex-col justify-center text-center p-8 bg-white shadow-sm">
                    <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <TrendingUp className="h-10 w-10 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-1">Throughput</h3>
                    <p className="text-3xl font-black text-slate-900 mb-2">{stats.performance.completed_batches}</p>
                    <p className="text-xs text-slate-500 font-bold mb-6 italic leading-tight">Total Batches successfully pushed through the system</p>

                    <div className="flex gap-2">
                        <div className="flex-1 p-2 bg-slate-50 rounded-xl">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Current</p>
                            <p className="text-sm font-black text-blue-600">{stats.performance.total_batches - stats.performance.completed_batches}</p>
                        </div>
                        <div className="flex-1 p-2 bg-slate-50 rounded-xl">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Rework</p>
                            <p className="text-sm font-black text-red-600">{stats.performance.rework_needed}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Recent Activity Table style */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-emerald-100 bg-emerald-50/30 flex items-center justify-between">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <Clock className="h-4 w-4 text-emerald-600" />
                        Live Feed: Recent Batch Uploads
                    </h3>
                    <Link to="/upload-history" className="text-[10px] font-bold text-emerald-600 hover:underline">VIEW MASTER FEED</Link>
                </div>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                        {stats.recent_batches.length > 0 ? (
                            stats.recent_batches.map((batch, idx) => (
                                <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={cn(
                                            "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                                            batch.status === 'uploaded' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-blue-50 border-blue-100 text-blue-600"
                                        )}>
                                            {batch.status === 'uploaded' ? <CheckCircle2 className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold text-slate-900 truncate">{batch.batch_id}</h4>
                                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter truncate">{batch.project_name} • {batch.operator_name}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Volume</p>
                                            <p className="text-xs font-black text-slate-800">{batch.completed_count.toLocaleString()} imgs</p>
                                        </div>
                                        <div className="text-right">
                                            <Badge className={cn(
                                                "text-[9px] uppercase font-bold tracking-tight h-5 px-2",
                                                batch.status === 'uploaded' ? "bg-emerald-600" : "bg-blue-600"
                                            )}>
                                                {batch.status}
                                            </Badge>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{formatToLocalTime(batch.upload_end_date)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-16 text-center">
                                <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <History className="h-6 w-6 text-slate-200" />
                                </div>
                                <p className="text-sm text-slate-400 font-medium">No live upload events detected.</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Rework Alert (If needed) */}
            {stats.performance.rework_needed > 0 && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 animate-pulse">
                    <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <RefreshCw className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-red-900">{stats.performance.rework_needed} Batches Require Attention</h4>
                        <p className="text-[11px] text-red-700 font-medium tracking-tight">Quality control has flagged several batches for rework. Please reallocate them to your operators immediately.</p>
                    </div>
                    <Link to="/reallocation" className="ml-auto">
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-4">
                            GO TO REWORK
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
};

export default VendorDashboard;
