import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ArrowRight,
    FolderKanban,
    Users,
    Upload,
    CheckCircle,
    Database,
    MapPin,
    Building2,
    FileText,
    TrendingUp,
    ShieldCheck,
    Clock,
    Activity,
    Users2,
    Briefcase
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatToLocalTime } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';

interface AdminStats {
    counts: {
        projects: number;
        sources: number;
        locations: number;
        record_owners: number;
        record_types: number;
        users: number;
        vendors: number;
        operators: number;
        qc_users: number;
    };
    upload_stats: {
        total_batches: number;
        target_images: number;
        uploaded_images: number;
    };
    qc_stats: {
        verified_batches: number;
        accepted_images: number;
        rejected_images: number;
        accuracy: number;
        total_qc_pending: number;
    };
    recent_uploads: Array<{
        batch_id: string;
        operator: string;
        images: number;
        date: string;
    }>;
    recent_qc: Array<{
        batch_id: string;
        qc_user: string;
        status: string;
        date: string;
    }>;
}

const SuperAdminDashboard: React.FC = () => {
    const { apiFetch } = useAuth();
    const { toast } = useToast();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setIsLoading(true);
                const res = await apiFetch(`${API_BASE_URL}/admin/dashboard-stats`);
                if (!res.ok) throw new Error('Failed to fetch stats');
                const data = await res.json();
                setStats(data);
            } catch (error) {
                console.error(error);
                toast({ title: 'Sync Error', description: 'Could not refresh dashboard statistics', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    const actions = [
        { title: 'Project Management', desc: 'Create and manage global projects', icon: FolderKanban, link: '/projects', color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: 'User Directory', desc: 'Manage all system users and roles', icon: Users, link: '/users', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { title: 'Master Uploads', desc: 'Global audit of all batch uploads', icon: Upload, link: '/upload-history', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { title: 'System QC Log', desc: 'Consolidated verification history', icon: CheckCircle, link: '/qc-history', color: 'text-amber-600', bg: 'bg-amber-50' },
    ];

    if (isLoading || !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-medium animate-pulse text-sm tracking-widest uppercase">Building Audit Intelligence...</p>
            </div>
        );
    }

    const accuracy = stats.qc_stats.accuracy;

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <PageHeader
                title="Super Admin Control Center"
                description="Global overview and system-wide administrative metrics"
            />

            {/* Top Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {actions.map((action, i) => (
                    <Link key={i} to={action.link}>
                        <Card className="group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-slate-200 cursor-pointer overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className={cn("p-3 rounded-xl mb-4 transition-colors", action.bg, i === 0 && "group-hover:bg-blue-100", i === 1 && "group-hover:bg-indigo-100", i === 2 && "group-hover:bg-emerald-100", i === 3 && "group-hover:bg-amber-100")}>
                                        <action.icon className={cn("h-6 w-6", action.color)} />
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                </div>
                                <h3 className="font-bold text-slate-900 mb-1">{action.title}</h3>
                                <p className="text-xs text-slate-500 leading-relaxed font-medium">{action.desc}</p>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Core Metrics Grid */}
            <div className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
                {[
                    { label: 'Live Projects', val: stats.counts.projects, icon: Briefcase, color: 'text-blue-600' },
                    { label: 'Global Users', val: stats.counts.users, icon: Users2, color: 'text-indigo-600' },
                    { label: 'Total Images', val: stats.upload_stats.uploaded_images.toLocaleString(), icon: Database, color: 'text-emerald-600' },
                    { label: 'Quality Index', val: `${accuracy}%`, icon: ShieldCheck, color: 'text-amber-600' },
                ].map((stat, i) => (
                    <Card key={i} className="border-slate-200 shadow-sm">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                                <stat.icon className={cn("h-6 w-6", stat.color)} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                                <p className="text-2xl font-black text-slate-900">{stat.val}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Mid Section: Trends & Throughput */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Upload Pipeline */}
                <Card className="border-slate-200">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                                Upload Pipeline Progress
                            </h3>
                            <Link to="/upload-history" className="text-[10px] font-bold text-primary hover:underline">AUDIT FULL LOG</Link>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between text-xs mb-2">
                                    <span className="font-bold text-slate-600">Total Image Repository</span>
                                    <span className="font-black text-slate-900">{stats.upload_stats.uploaded_images.toLocaleString()} / {stats.upload_stats.target_images.toLocaleString()}</span>
                                </div>
                                <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                                    <div
                                        className="bg-emerald-500 h-full transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                        style={{ width: `${(stats.upload_stats.uploaded_images / (stats.upload_stats.target_images || 1)) * 100}%` }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total batches</p>
                                    <p className="text-lg font-black text-slate-800">{stats.upload_stats.total_batches}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Est. Remaining</p>
                                    <p className="text-lg font-black text-slate-800">{(stats.upload_stats.target_images - stats.upload_stats.uploaded_images).toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Progress</p>
                                    <p className="text-lg font-black text-emerald-600">{Math.round((stats.upload_stats.uploaded_images / (stats.upload_stats.target_images || 1)) * 100)}%</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* QC Health */}
                <Card className="border-slate-200">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <Activity className="h-4 w-4 text-indigo-600" />
                                QC Verification Health
                            </h3>
                            <Link to="/qc-history" className="text-[10px] font-bold text-primary hover:underline">SYSTEM QC HISTORY</Link>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl bg-indigo-50/50 border border-indigo-100/50 hover:bg-indigo-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                                        <CheckCircle className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-900">Verified Batches</p>
                                        <p className="text-[10px] text-muted-foreground uppercase font-medium">Global completion count</p>
                                    </div>
                                </div>
                                <p className="text-xl font-black text-indigo-700">{stats.qc_stats.verified_batches}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50/50 border border-emerald-100/50">
                                    <div>
                                        <p className="text-xs font-bold text-slate-900">Approved</p>
                                        <p className="text-xl font-black text-emerald-600">{stats.qc_stats.accepted_images.toLocaleString()}</p>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl bg-orange-50/50 border border-orange-100/50">
                                    <div>
                                        <p className="text-xs font-bold text-slate-900">Pending QC</p>
                                        <p className="text-xl font-black text-orange-600">{stats.qc_stats.total_qc_pending.toLocaleString()}</p>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                                        <Clock className="h-4 w-4 text-orange-600" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Activity Section */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent Uploads */}
                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-400" />
                            Recent System Uploads
                        </h3>
                        <Link to="/upload-history" className="text-[10px] font-bold text-slate-400 hover:text-primary uppercase">View All</Link>
                    </div>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                            {stats.recent_uploads.length > 0 ? (
                                stats.recent_uploads.map((upload, idx) => (
                                    <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                                                <Upload className="h-5 w-5 text-emerald-600" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{upload.batch_id}</h4>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">By: {upload.operator}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-800">{upload.images} imgs</p>
                                            <p className="text-[10px] text-slate-400 font-medium uppercase">{formatToLocalTime(upload.date)}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-12 text-center text-slate-400 text-sm italic">No recent upload activity found.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent QC Activity */}
                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-slate-400" />
                            Recent QC Verification Events
                        </h3>
                        <Link to="/qc-history" className="text-[10px] font-bold text-slate-400 hover:text-primary uppercase">View All</Link>
                    </div>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                            {stats.recent_qc.length > 0 ? (
                                stats.recent_qc.map((qc, idx) => (
                                    <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                                                <CheckCircle className="h-5 w-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{qc.batch_id}</h4>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">QC User: {qc.qc_user}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge className={cn(
                                                "text-[10px] uppercase font-bold mb-1",
                                                qc.status === 'Verified' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                            )}>
                                                {qc.status.replace(/_/g, ' ')}
                                            </Badge>
                                            <p className="text-[10px] text-slate-400 font-medium uppercase">{formatToLocalTime(qc.date)}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-12 text-center text-slate-400 text-sm italic">No recent QC activity found.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

        </div>
    );
};

// Standard Badge component placeholder if not imported
const Badge: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold inline-block", className)}>
        {children}
    </span>
);

export default SuperAdminDashboard;
