import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ArrowRight,
    Users,
    GitBranch,
    CheckCircle,
    History,
    Search,
    Clock,
    Activity,
    ShieldCheck,
    TrendingUp,
    AlertCircle,
    ClipboardList
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatToLocalTime } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface QCStats {
    counts: {
        qc_users: number;
        allocations: number;
    };
    metrics: {
        pending_review: number;
        pending_allocation: number;
        total_accepted: number;
        total_rejected: number;
        accuracy: number;
    };
    recent_history: Array<any>;
}

const QCSupervisorDashboard: React.FC = () => {
    const { apiFetch } = useAuth();
    const { toast } = useToast();
    const [stats, setStats] = useState<QCStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setIsLoading(true);
                const res = await apiFetch(`${API_BASE_URL}/qc-sup/dashboard-stats`);
                if (!res.ok) throw new Error('Failed to fetch stats');
                const data = await res.json();
                setStats(data);
            } catch (error) {
                console.error(error);
                toast({ title: 'Sync Error', description: 'Could not refresh QC supervisor dashboard', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    const actions = [
        { title: 'QC Team', desc: 'Manage quality control auditors', icon: Users, link: '/qc-users', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { title: 'Allocation', desc: 'Assign batches to auditors', icon: GitBranch, link: '/batch-allocation', color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: 'Review Queue', desc: 'Verify completed QC assignments', icon: Search, link: '/qc-review-queue', color: 'text-emerald-600', bg: 'bg-emerald-50', badge: stats?.metrics.pending_review },
        { title: 'Master History', desc: 'Audit terminal QC results', icon: History, link: '/qc-history', color: 'text-amber-600', bg: 'bg-amber-50' },
    ];

    if (isLoading || !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-black animate-pulse text-[10px] tracking-[0.3em] uppercase">Refining Quality Metrics...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <PageHeader
                title="QC Manager Console"
                description="Manage the quality assurance lifecycle and auditor performance"
            />

            {/* Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {actions.map((action, i) => (
                    <Link key={i} to={action.link} className="block group">
                        <Card className="hover:shadow-xl hover:border-indigo-200 transition-all duration-300 border-slate-200 cursor-pointer h-full relative overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className={cn("p-3 rounded-xl transition-colors", action.bg)}>
                                        <action.icon className={cn("h-6 w-6", action.color)} />
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                </div>
                                <h3 className="font-bold text-slate-900">{action.title}</h3>
                                <p className="text-[11px] text-slate-500 mt-1 font-semibold leading-tight">{action.desc}</p>

                                {action.badge !== undefined && action.badge > 0 && (
                                    <div className="absolute top-4 right-12">
                                        <Badge className="bg-emerald-500 text-white border-none animate-pulse">{action.badge} NEW</Badge>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Stats Row */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Accuracy Card */}
                <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-8 pb-4">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Team Accuracy</h3>
                            <TrendingUp className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="text-center mb-8">
                            <p className="text-6xl font-black text-slate-900 mb-1">{stats.metrics.accuracy}%</p>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Global Accuracy Index</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-8">
                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                                <p className="text-[10px] font-black text-emerald-700 uppercase mb-1">Accepted</p>
                                <p className="text-2xl font-black text-slate-900">{stats.metrics.total_accepted.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-red-50 rounded-2xl border border-red-100/50">
                                <p className="text-[10px] font-black text-red-700 uppercase mb-1">Rejected</p>
                                <p className="text-2xl font-black text-slate-900">{stats.metrics.total_rejected.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                    <div className="px-8 py-4 bg-slate-50 border-t border-slate-100">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight italic">Based on verified batches. Excludes in-progress audits.</p>
                    </div>
                </Card>

                {/* Status Breakdown */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white p-8 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                        <ClipboardList className="h-32 w-32 text-indigo-300" />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div>
                            <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-6">Auditing Pipeline</h3>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center shadow-sm">
                                            <AlertCircle className="h-4 w-4 text-amber-500 animate-pulse" />
                                        </div>
                                        <span className="text-sm font-black text-slate-700">Awaiting Review</span>
                                    </div>
                                    <span className="text-2xl font-black text-slate-900">{stats.metrics.pending_review}</span>
                                </div>

                                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shadow-sm">
                                            <GitBranch className="h-4 w-4 text-blue-500" />
                                        </div>
                                        <span className="text-sm font-black text-slate-700">Unallocated Batches</span>
                                    </div>
                                    <span className="text-2xl font-black text-slate-900">{stats.metrics.pending_allocation}</span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shadow-sm">
                                            <Users className="h-4 w-4 text-emerald-500" />
                                        </div>
                                        <span className="text-sm font-black text-slate-700">Active Force</span>
                                    </div>
                                    <span className="text-2xl font-black text-slate-900">{stats.counts.qc_users}</span>
                                </div>
                            </div>
                        </div>

                        <Link to="/batch-allocation">
                            <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-700 font-black h-11 rounded-xl mt-8 shadow-lg shadow-indigo-600/20 border-none transition-all active:scale-95">
                                Allocate Pending
                            </Button>
                        </Link>
                    </div>
                </Card>


                {/* Efficiency Stats */}
                <Card className="border-slate-200 shadow-sm bg-white p-8 flex flex-col items-center justify-between text-center">
                    <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle className="h-10 w-10 text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Audit Log Size</h3>
                        <p className="text-4xl font-black text-slate-900 mb-1">{stats.counts.allocations}</p>
                        <p className="text-xs font-bold text-slate-500">Total processed units</p>
                    </div>

                    <div className="w-full h-px bg-slate-100 my-8" />

                    <div className="grid grid-cols-2 gap-8 w-full">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Current Ratio</p>
                            <p className="text-lg font-black text-indigo-600">{(stats.metrics.total_accepted / (stats.metrics.total_rejected || 1)).toFixed(1)}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Apprv/Rej</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Auditors</p>
                            <p className="text-lg font-black text-blue-600">{stats.counts.qc_users}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Registered</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Recent History Table Style */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-indigo-100 bg-indigo-50/30 flex items-center justify-between">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <Clock className="h-4 w-4 text-indigo-600" />
                        Audit Trail: Recent Quality Determinations
                    </h3>
                    <Link to="/qc-history" className="text-[10px] font-bold text-indigo-600 hover:underline">VIEW MASTER ARCHIVE</Link>
                </div>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                        {stats.recent_history.length > 0 ? (
                            stats.recent_history.map((item, idx) => (
                                <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={cn(
                                            "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                                            item.qc_batch_status === 'Verified' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-amber-50 border-amber-100 text-amber-600"
                                        )}>
                                            {item.qc_batch_status === 'Verified' ? <CheckCircle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold text-slate-900 truncate">{item.batch_id}</h4>
                                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter truncate">{item.project_name} • Auditor: {item.qc_user_name}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-center hidden sm:block">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">PASS/FAIL</p>
                                            <p className="text-xs font-black text-slate-800">{item.accepted_count}/{item.rejected_count}</p>
                                        </div>
                                        <div className="text-right">
                                            <Badge className={cn(
                                                "text-[9px] uppercase font-bold tracking-tight h-5 px-2",
                                                item.qc_batch_status === 'Verified' ? "bg-emerald-600" : "bg-amber-600"
                                            )}>
                                                {item.qc_batch_status.replace(/_/g, ' ')}
                                            </Badge>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{formatToLocalTime(item.qc_completed_date)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-16 text-center">
                                <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <History className="h-6 w-6 text-slate-200" />
                                </div>
                                <p className="text-sm text-slate-400 font-medium">No audit events to display.</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Review Banner */}
            {stats.metrics.pending_review > 0 && (
                <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-3xl flex items-center gap-5 shadow-sm">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0 animate-bounce">
                        <Search className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-base font-black text-emerald-900">{stats.metrics.pending_review} Batches Ready for Verification</h4>
                        <p className="text-sm text-emerald-700 font-medium">Auditors have submitted new quality reports. Your verification is required to complete the ingestion lifecycle.</p>
                    </div>
                    <Link to="/qc-review-queue">
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 h-12 rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-95">
                            START REVIEW
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
};

export default QCSupervisorDashboard;
