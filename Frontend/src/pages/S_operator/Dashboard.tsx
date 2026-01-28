import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ArrowRight,
    PlusCircle,
    Upload,
    History,
    RefreshCw,
    Activity,
    ShieldCheck,
    Image as ImageIcon,
    Clock,
    CheckCircle2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatToLocalTime } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface OperatorStats {
    metrics: {
        total_batches: number;
        uploaded_images: number;
        rework_batches: number;
        accuracy: number;
    };
    recent_uploads: Array<{
        batch_id: string;
        status: string;
        images: number;
        date: string;
    }>;
}

const ScanningOperatorDashboard: React.FC = () => {
    const { apiFetch } = useAuth();
    const { toast } = useToast();
    const [stats, setStats] = useState<OperatorStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setIsLoading(true);
                const res = await apiFetch(`${API_BASE_URL}/operator/dashboard-stats`);
                if (!res.ok) throw new Error('Failed to fetch operator stats');
                const data = await res.json();
                setStats(data);
            } catch (error) {
                console.error(error);
                toast({ title: 'Sync Error', description: 'Could not refresh your progress', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    const actions = [
        { title: 'New Batch', desc: 'Initialize scanning session', icon: PlusCircle, link: '/create-batch', color: 'text-sky-600', bg: 'bg-sky-50' },
        { title: 'Upload', desc: 'Push images to cloud', icon: Upload, link: '/upload', color: 'text-violet-600', bg: 'bg-violet-50' },
        { title: 'Rework', desc: 'Fix batches flagged by QC', icon: RefreshCw, link: '/re-upload', color: 'text-rose-600', bg: 'bg-rose-50', badge: stats?.metrics.rework_batches },
        { title: 'History', desc: 'View previous work', icon: History, link: '/upload-history', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    ];

    if (isLoading || !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse text-[10px] tracking-[0.3em] uppercase">Calculating your impact...</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1700px] mx-auto space-y-10 animate-fade-in pb-12">
            <PageHeader
                title="S_operator Dashboard"
                description="Manage your active scanning sessions and monitor data quality"
            />

            {/* Main Action Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {actions.map((action, i) => (
                    <Link key={i} to={action.link} className="block group">
                        <Card className="group-hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] group-hover:-translate-y-2 transition-all duration-500 border-none bg-white cursor-pointer h-full relative overflow-hidden ring-1 ring-slate-200/60 shadow-md shadow-slate-200/50 will-change-transform">
                            <CardContent className="p-7">
                                <div className="flex items-center justify-between mb-4">
                                    <div className={cn("p-4 rounded-2xl transition-all duration-300 group-hover:scale-110", action.bg)}>
                                        <action.icon className={cn("h-6 w-6", action.color)} />
                                    </div>
                                    <div className="h-8 w-8 rounded-full border border-slate-100 flex items-center justify-center group-hover:bg-slate-50 transition-colors">
                                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                </div>
                                <h3 className="font-extrabold text-slate-800 text-sm group-hover:text-slate-900 transition-colors tracking-tight uppercase">{action.title}</h3>
                                <p className="text-[11px] text-slate-500 mt-1 font-medium leading-tight h-8">{action.desc}</p>

                                {action.badge !== undefined && action.badge > 0 && (
                                    <div className="absolute top-4 right-14">
                                        <Badge className="bg-rose-500 text-white border-none shadow-lg shadow-rose-200 animate-pulse px-2 py-0.5 text-[9px]">{action.badge} URGENT</Badge>
                                    </div>
                                )}

                                <div className={cn("absolute -bottom-6 -right-6 h-20 w-20 rounded-full opacity-[0.03] group-hover:scale-150 transition-transform duration-700", action.bg)} />
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Stats Row */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Performance Hub */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                    <CardContent className="p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Efficiency index</h3>
                                <p className="text-2xl font-black text-slate-800 mt-1">Operational Metrics</p>
                            </div>
                            <div className="h-14 w-14 rounded-3xl bg-violet-50 flex items-center justify-center">
                                <Activity className="h-7 w-7 text-violet-500" />
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div className="flex items-end justify-between">
                                <div className="space-y-1">
                                    <p className="text-4xl font-black text-slate-900 tracking-tighter">{stats.metrics.total_batches}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">Batches Processed</p>
                                </div>
                                <div className="text-right space-y-1">
                                    <p className="text-2xl font-black text-violet-600 tracking-tighter">{stats.metrics.uploaded_images.toLocaleString()}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Images</p>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-blue-500" />
                                    <span className="text-xs font-bold text-slate-600">Pending Rework</span>
                                </div>
                                <span className={cn(
                                    "text-sm font-black",
                                    stats.metrics.rework_batches > 0 ? "text-rose-600" : "text-emerald-600"
                                )}>
                                    {stats.metrics.rework_batches} units
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Accuracy/Quality */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white p-8 relative overflow-hidden group">
                    <div className="absolute top-[-20%] right-[-20%] h-64 w-64 bg-emerald-500/5 rounded-full blur-3xl" />
                    <div className="absolute bottom-4 right-4 opacity-5 group-hover:scale-125 transition-transform duration-1000">
                        <ShieldCheck className="h-32 w-32 text-emerald-100" />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-between items-center text-center">
                        <div>
                            <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4">Quality Rating</h3>
                            <div className="flex items-baseline justify-center gap-1">
                                <p className="text-5xl font-black text-slate-900 tracking-tighter">{stats.metrics.accuracy}</p>
                                <span className="text-xl font-bold text-emerald-400">%</span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Accuracy Perf</p>
                        </div>

                        <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100 mt-8 w-full">
                            <div className="flex items-center justify-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-white flex items-center justify-center text-emerald-600 shadow-md">
                                    <CheckCircle2 className="h-5 w-5" />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase">Status</p>
                                    <p className="text-xs font-black tracking-tight text-slate-700">EXCELLENT GRADE</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Quick Launch */}
                <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 bg-white p-0 overflow-hidden flex flex-col relative">
                    <div className="bg-sky-50/50 p-8 relative border-b border-sky-100">
                        <div className="absolute top-0 right-0 h-full w-1/3 bg-white/40 skew-x-[30deg] translate-x-1/2" />
                        <h3 className="text-[10px] font-black text-sky-600 uppercase tracking-widest mb-6">Immediate Actions</h3>
                        <div className="flex flex-col gap-5 relative z-10">
                            <Link to="/create-batch" className="block">
                                <Button className="w-full bg-sky-600 text-white hover:bg-sky-700 font-black h-12 rounded-2xl border-none shadow-xl shadow-sky-600/20 transition-all duration-150 active:scale-95 will-change-transform">
                                    START NEW BATCH
                                </Button>
                            </Link>
                            <Link to="/upload" className="block">
                                <Button variant="outline" className="w-full bg-white border-sky-200 text-sky-700 hover:bg-sky-50 font-bold h-11 rounded-2xl transition-all duration-150 will-change-transform">
                                    CONTINUE WORK
                                </Button>
                            </Link>
                        </div>
                    </div>
                    <div className="p-8 grow flex flex-col justify-center bg-white">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                                    <ImageIcon className="h-6 w-6 text-sky-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-800">Total Work volume</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Historical records</p>
                                </div>
                            </div>
                            <p className="text-xl font-black text-slate-900 tracking-tighter">{stats.metrics.uploaded_images.toLocaleString()}</p>
                        </div>
                    </div>
                </Card>

            </div>

            {/* Recent Uploads Table */}
            <Card className="border-none shadow-md shadow-slate-200/50 ring-1 ring-slate-200/60 overflow-hidden bg-white">
                <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                    <div>
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Clock className="h-4 w-4 text-violet-500" />
                            Submission Activity
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Tracking your latest upload streams</p>
                    </div>
                    <Link to="/upload-history">
                        <Button variant="outline" size="sm" className="h-8 rounded-xl border-slate-200 text-[10px] font-black text-slate-600 hover:bg-slate-50">
                            VIEW FULL LOG
                        </Button>
                    </Link>
                </div>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-50">
                        {stats.recent_uploads.length > 0 ? (
                            stats.recent_uploads.map((upload, idx) => (
                                <div key={idx} className="px-8 py-5 flex items-center justify-between hover:bg-slate-50/50 transition-all duration-300">
                                    <div className="flex items-center gap-5 min-w-0">
                                        <div className={cn(
                                            "h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm border",
                                            upload.status === 'Completed' || upload.status === 'uploaded' ? "bg-emerald-50 border-emerald-100 text-emerald-500" : "bg-sky-50 border-sky-100 text-sky-500"
                                        )}>
                                            {upload.status === 'Completed' || upload.status === 'uploaded' ? <CheckCircle2 className="h-6 w-6" /> : <Activity className="h-6 w-6" />}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-black text-slate-800 tracking-tight truncate">{upload.batch_id}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="outline" className="h-4 px-1 text-[8px] font-black tracking-widest text-slate-400 border-slate-200">BATCH</Badge>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">{formatToLocalTime(upload.date)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-12">
                                        <div className="hidden md:block text-right">
                                            <p className="text-sm font-black text-slate-800 tracking-tighter">{upload.images.toLocaleString()} images</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase">Volume</p>
                                        </div>
                                        <div className="text-right">
                                            <Badge className={cn(
                                                "text-[9px] uppercase font-black px-2 py-0.5 rounded-lg shadow-sm",
                                                upload.status === 'Completed' || upload.status === 'uploaded' ? "bg-emerald-500 text-white" : "bg-sky-500 text-white"
                                            )}>
                                                {upload.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-20 text-center">
                                <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <History className="h-8 w-8 text-slate-300" />
                                </div>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">No Recent Streams</p>
                                <p className="text-xs text-slate-300 mt-1 uppercase font-medium">Initiate a batch to begin tracking</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Rework Highlight */}
            {stats.metrics.rework_batches > 0 && (
                <div className="p-0.5 w-full bg-gradient-to-r from-rose-500/80 to-orange-400/80 rounded-2xl mt-8 shadow-xl shadow-rose-200/40">
                    <div className="bg-white rounded-[0.9rem] p-4 flex flex-col md:flex-row items-center gap-6">
                        <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0 ring-1 ring-rose-100 shadow-sm">
                            <RefreshCw className="h-6 w-6 text-rose-500 animate-spin-slow" />
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <div className="flex items-center gap-2 justify-center md:justify-start mb-0.5">
                                <Badge className="bg-rose-100 text-rose-600 hover:bg-rose-100 border-none font-black px-2 py-0.5 text-[8px] tracking-[0.15em] uppercase">Critical Correction</Badge>
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                            </div>
                            <h4 className="text-lg font-black text-slate-800 tracking-tight">Resolution Required: {stats.metrics.rework_batches} Batches</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">Immediate attendance required for flagged batches.</p>
                        </div>
                        <Link to="/re-upload" className="w-full md:w-auto">
                            <Button className="w-full md:w-[180px] bg-slate-900 text-white hover:bg-black font-black h-10 rounded-xl shadow-lg transition-all active:scale-95 group text-xs">
                                RESOLVE NOW
                                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1.5 transition-transform" />
                            </Button>
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScanningOperatorDashboard;
