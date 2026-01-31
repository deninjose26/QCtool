import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ArrowRight,
    ListChecks,
    History,
    Settings,
    CheckCircle2,
    Activity,
    TrendingUp,
    ShieldCheck,
    Clock,
    Zap,
    User,
    Bell
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
    total: number;
    pending: number;
    completed: number;
    totalImages: number;
    doneImages: number;
    acceptedImages: number;
    rejectedImages: number;
}

interface RecentTask {
    batch_id: string;
    batch_uid: string;
    qc_completed_date: string;
    accepted_count: number;
    rejected_count: number;
    project_name: string;
}

const QCUserDashboard: React.FC = () => {
    const { apiFetch } = useAuth();
    const { toast } = useToast();
    const [stats, setStats] = useState<QCStats>({
        total: 0, pending: 0, completed: 0,
        totalImages: 0, doneImages: 0, acceptedImages: 0, rejectedImages: 0
    });
    const [recentHistory, setRecentHistory] = useState<RecentTask[]>([]);
    const [activeTask, setActiveTask] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                setIsLoading(true);
                const [tasksRes, historyRes] = await Promise.all([
                    apiFetch(`${API_BASE_URL}/qc/my-tasks`),
                    apiFetch(`${API_BASE_URL}/qc/my-history`)
                ]);

                let tasks = [];
                let history = [];

                if (tasksRes.ok) tasks = await tasksRes.json();
                if (historyRes.ok) history = await historyRes.json();

                const allBatches = [...tasks, ...history];

                // Compute stats
                const total = allBatches.length;
                const completed = history.length;
                const pending = tasks.length;
                const totalImages = allBatches.reduce((acc: number, t: any) => acc + (t.upload_count || 0), 0);
                const doneImages = allBatches.reduce((acc: number, t: any) => acc + (t.qc_done_count || 0), 0);
                const acceptedImages = allBatches.reduce((acc: number, t: any) => acc + (t.accepted_count || 0), 0);
                const rejectedImages = allBatches.reduce((acc: number, t: any) => acc + (t.rejected_count || 0), 0);

                setStats({ total, pending, completed, totalImages, doneImages, acceptedImages, rejectedImages });
                setRecentHistory(history.slice(0, 3));
                if (tasks.length > 0) {
                    setActiveTask(tasks[0]);
                }
            } catch (error) {
                console.error(error);
                toast({ title: 'Sync Error', description: 'Could not refresh your workload stats', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const actionCards = [
        { title: 'My Worklist', desc: 'Active QC assignments', icon: ListChecks, link: '/tasks', color: 'text-indigo-700', bg: 'bg-indigo-100', cardBg: 'bg-indigo-50/30', ring: 'ring-indigo-200/50' },
        { title: 'My History', desc: 'Past quality audits', icon: History, link: '/qc-history', color: 'text-violet-700', bg: 'bg-violet-100', cardBg: 'bg-violet-50/30', ring: 'ring-violet-200/50' },
        { title: 'My Profile', desc: 'View & manage your details', icon: User, link: '/profile', color: 'text-emerald-700', bg: 'bg-emerald-100', cardBg: 'bg-emerald-50/30', ring: 'ring-emerald-200/50' },
        { title: 'Notifications', desc: 'System alerts & updates', icon: Bell, link: '/notifications', color: 'text-amber-700', bg: 'bg-amber-100', cardBg: 'bg-amber-50/30', ring: 'ring-amber-200/50' }
    ];

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-black animate-pulse text-[10px] tracking-[0.3em] uppercase">Loading Auditor Workspace...</p>
            </div>
        );
    }

    const accuracy = stats.doneImages > 0
        ? Math.round((stats.acceptedImages / stats.doneImages) * 100)
        : 100;

    return (
        <div className="max-w-[1700px] mx-auto space-y-10 animate-fade-in pb-12">
            <PageHeader
                title="QC Auditor Workspace"
                description="Secure quality control portal for batch verification and decision management"
            />

            {/* Top Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {actionCards.map((card, idx) => (
                    <Link key={idx} to={card.link} className="block group">
                        <Card className={cn(
                            "group-hover:shadow-lg group-hover:-translate-y-2 transition-all duration-500 border-none cursor-pointer h-full relative overflow-hidden ring-1 shadow-sm will-change-transform",
                            card.cardBg,
                            card.ring
                        )}>
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div className={cn("p-3 rounded-xl transition-all duration-300 group-hover:scale-110 shadow-sm", card.bg)}>
                                        <card.icon className={cn("h-5 w-5", card.color)} />
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-white/50 backdrop-blur-sm border border-white flex items-center justify-center group-hover:bg-white transition-colors">
                                        <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                </div>
                                <h3 className="font-extrabold text-slate-800 text-sm group-hover:text-slate-900 transition-colors tracking-tight uppercase">{card.title}</h3>
                                <p className="text-[11px] text-slate-500 mt-1 font-medium leading-tight h-8">{card.desc}</p>

                                <div className={cn("absolute -bottom-6 -right-6 h-20 w-20 rounded-full opacity-[0.1] group-hover:scale-150 transition-transform duration-700", card.bg)} />
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Performance Snapshot */}
            <div className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
                {[
                    { label: 'Batches Pending', val: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100', cardBg: 'bg-amber-50/40', ring: 'ring-amber-200/50' },
                    { label: 'Completed Unit', val: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100', cardBg: 'bg-emerald-50/40', ring: 'ring-emerald-200/50' },
                    { label: 'Total Audited', val: stats.doneImages.toLocaleString(), icon: Zap, color: 'text-indigo-600', bg: 'bg-indigo-100', cardBg: 'bg-indigo-50/40', ring: 'ring-indigo-200/50' },
                    { label: 'My Accuracy', val: `${accuracy}%`, icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-100', cardBg: 'bg-blue-50/40', ring: 'ring-blue-200/50' },
                ].map((stat, i) => (
                    <Card key={i} className={cn(
                        "border-none shadow-sm ring-1 group hover:shadow-md transition-all duration-300",
                        stat.cardBg,
                        stat.ring
                    )}>
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110 shadow-sm bg-white")}>
                                <stat.icon className={cn("h-5 w-5", stat.color)} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1.5">{stat.label}</p>
                                <p className="text-xl font-black text-slate-900 tracking-tight">{stat.val}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Active Assignment / Jump Back In */}
                <Card className="lg:col-span-1 border-none bg-white shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 relative overflow-hidden group">
                    <div className="absolute top-[-20%] right-[-20%] h-64 w-64 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors duration-1000" />
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Activity className="h-32 w-32 text-indigo-200" />
                    </div>
                    <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full min-h-[300px]">
                        <div>
                            <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4">Current Focus</h3>
                            {activeTask ? (
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-lg font-black mb-1 break-all tracking-tight text-slate-900 leading-tight">{activeTask.batch_id}</h4>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="border-slate-100 text-slate-400 text-[8px] font-black px-1.5 h-4">PROJECT</Badge>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{activeTask.project_name}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Efficiency</span>
                                            <span className="text-2xl font-black text-indigo-600 tracking-tighter">{Math.round((activeTask.qc_done_count / (activeTask.upload_count || 1)) * 100)}%</span>
                                        </div>
                                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 shadow-inner">
                                            <div
                                                className="bg-indigo-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(99,102,241,0.3)] relative"
                                                style={{ width: `${(activeTask.qc_done_count / (activeTask.upload_count || 1)) * 100}%` }}
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center bg-indigo-50/50 rounded-xl p-3 border border-indigo-100/50">
                                            <p className="text-[10px] font-black text-indigo-600 uppercase">Audit Volume</p>
                                            <p className="text-xs font-black text-slate-700">
                                                {activeTask.qc_done_count} / {activeTask.upload_count} <span className="text-slate-400 ml-1">IMG</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <div className="h-20 w-20 rounded-3xl bg-slate-50 flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
                                        <ShieldCheck className="h-10 w-10 text-indigo-300" />
                                    </div>
                                    <p className="text-slate-900 font-black uppercase tracking-widest text-sm">Clear Queue</p>
                                    <p className="text-slate-400 text-[10px] mt-1 font-bold">ALL BATCHES VERIFIED</p>
                                </div>
                            )}
                        </div>

                        {activeTask && (
                            <Link to={`/qc/${activeTask.batch_uid}`} className="mt-8">
                                <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-700 font-black h-12 rounded-xl transition-all active:scale-95 shadow-xl shadow-indigo-600/20 border-none group">
                                    RESUME WORK
                                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                        )}
                    </CardContent>
                </Card>


                {/* Quality Metrics Index */}
                <Card className="lg:col-span-2 border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quality Metrics Index</h3>
                                <p className="text-xl font-black text-slate-800 mt-1 uppercase tracking-tighter">Verification Outcomes</p>
                            </div>
                            <Link to="/qc-history">
                                <Button variant="outline" size="sm" className="h-8 rounded-xl border-slate-200 text-[10px] font-black text-slate-500 hover:bg-slate-50 uppercase">
                                    Full Insights
                                </Button>
                            </Link>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="group relative p-6 bg-slate-50/50 rounded-3xl border border-slate-100 hover:bg-emerald-50/30 hover:border-emerald-100 transition-all duration-300">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="h-14 w-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner group-hover:scale-110 transition-transform">
                                        <TrendingUp className="h-7 w-7" />
                                    </div>
                                    <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[9px] uppercase px-2 py-0.5">Approved</Badge>
                                </div>
                                <p className="text-4xl font-black text-slate-900 tracking-tighter">{stats.acceptedImages.toLocaleString()}</p>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Compliance Confirmed</p>
                                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Audit Rating</span>
                                    <span className="text-xs font-black text-emerald-600">PASSED</span>
                                </div>
                            </div>

                            <div className="group relative p-6 bg-slate-50/50 rounded-3xl border border-slate-100 hover:bg-rose-50/30 hover:border-rose-100 transition-all duration-300">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="h-14 w-14 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shadow-inner group-hover:scale-110 transition-transform">
                                        <History className="h-7 w-7" />
                                    </div>
                                    <Badge className="bg-rose-500/10 text-rose-600 border-none font-black text-[9px] uppercase px-2 py-0.5">Rejected</Badge>
                                </div>
                                <p className="text-4xl font-black text-slate-900 tracking-tighter">{stats.rejectedImages.toLocaleString()}</p>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Corrections Required</p>
                                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Exception Rate</span>
                                    <span className="text-xs font-black text-rose-600">{stats.doneImages > 0 ? ((stats.rejectedImages / stats.doneImages) * 100).toFixed(1) : 0}%</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent History Table */}
            <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                    <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <History className="h-4 w-4 text-indigo-500" />
                            Historical Submission Trace
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Tracking your latest quality audits</p>
                    </div>
                    <Link to="/qc-history">
                        <Button variant="outline" size="sm" className="h-8 rounded-xl border-slate-200 text-[10px] font-black text-slate-600 hover:bg-slate-50 uppercase">
                            View Full Log
                        </Button>
                    </Link>
                </div>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-50">
                        {recentHistory.length > 0 ? (
                            recentHistory.map((item, idx) => (
                                <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-all duration-300">
                                    <div className="flex items-center gap-6 min-w-0">
                                        <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shadow-sm flex-shrink-0">
                                            <CheckCircle2 className="h-6 w-6" />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-black text-slate-800 tracking-tight break-all uppercase leading-tight">{item.batch_id}</h4>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <Badge variant="outline" className="h-4 px-1.5 text-[8px] font-black tracking-widest text-slate-400 border-slate-200">VERIFIED</Badge>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">{item.project_name} • {formatToLocalTime(item.qc_completed_date)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-12">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest leading-none">Accepted</p>
                                            <p className="text-base font-black text-emerald-600 tracking-tighter leading-none">{item.accepted_count}</p>
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest leading-none">Rejected</p>
                                            <p className="text-base font-black text-rose-600 tracking-tighter leading-none">{item.rejected_count}</p>
                                        </div>
                                        <div className="h-8 w-8 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group hover:bg-slate-50 transition-colors">
                                            <ArrowRight className="h-4 w-4" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-20 text-center">
                                <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Clock className="h-8 w-8 text-slate-200" />
                                </div>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">No Terminal Records</p>
                                <p className="text-xs text-slate-300 mt-1 uppercase font-medium">Complete a batch to see audit history</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};


export default QCUserDashboard;
