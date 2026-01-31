import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import DataTable from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Download,
    RefreshCcw,
    Search,
    Calendar as CalendarIcon,
    User as UserIcon,
    Building2,
    Database,
    MapPin,
    LayoutGrid,
    FileText,
    X,
    Filter,
    Building,
    CheckCircle2,
    History,
    Files,
    Terminal
} from 'lucide-react';
import { formatToLocalTime } from '@/utils/dateUtils';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { exportToExcel } from '@/utils/excelExport';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

interface AcceptedBatchTask {
    qc_allocation_id: string;
    id: string; // For DataTable
    batch_uid: string;
    batch_id: string;
    project_name: string;
    source_name: string;
    location_name: string;
    record_owner_name: string;
    record_type_name: string;
    record_name: string;
    vendor_name: string;
    total_count: number;
    upload_count: number;
    qc_done_count: number;
    accepted_count: number;
    rejected_count: number;
    qc_user_name: string;
    allocated_by_name: string;
    allocation_date: string;
    qc_completed_date: string;
    qc_batch_status: string;
    upload_type: string;
    parent_batch_uid?: string;
    parent_batch_id?: string;
    replaced_by_batch_uid?: string;
    status_detail?: string;
}

const STATUS_DISPLAY_NAMES: Record<string, string> = {
    'Verified': 'Verified',
    'Verified_With_Rejection': 'Verified (Accepted with Rejections)'
};

const AcceptedBatches: React.FC = () => {
    const { apiFetch } = useAuth();
    const navigate = useNavigate();
    const [batches, setBatches] = useState<AcceptedBatchTask[]>([]);
    const [filteredBatches, setFilteredBatches] = useState<AcceptedBatchTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Filters
    const [projectFilter, setProjectFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [vendorFilter, setVendorFilter] = useState('all');
    const [ownerFilter, setOwnerFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    // Lineage History State
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [lineageLoading, setLineageLoading] = useState(false);
    const [selectedLineage, setSelectedLineage] = useState<AcceptedBatchTask[]>([]);
    const [activeBatchName, setActiveBatchName] = useState('');

    // Real-time Download Progress State
    const [downloadStates, setDownloadStates] = useState<Record<string, {
        status: string;
        current: number;
        total: number;
        target_dir: string;
        errors: number;
    }>>({});


    const { toast } = useToast();

    const fetchBatches = async () => {
        try {
            setIsLoading(true);
            const res = await apiFetch(`${API_BASE_URL}/admin/accepted-batches`);
            if (!res.ok) throw new Error('Failed to fetch accepted batches');
            const data = await res.json();
            const mappedData = data.map((t: any) => ({ ...t, id: t.qc_allocation_id }));
            setBatches(mappedData);
            setFilteredBatches(mappedData);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Could not load accepted batches',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const resetFilters = () => {
        setSearchTerm('');
        setProjectFilter('all');
        setSourceFilter('all');
        setUserFilter('all');
        setLocationFilter('all');
        setOwnerFilter('all');
        setTypeFilter('all');
        setVendorFilter('all');
        setDateRange(undefined);
    };

    useEffect(() => {
        fetchBatches();
    }, []);

    useEffect(() => {
        let result = [...batches];

        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            result = result.filter(task =>
                task.batch_id.toLowerCase().includes(lowSearch) ||
                task.project_name.toLowerCase().includes(lowSearch) ||
                task.qc_user_name.toLowerCase().includes(lowSearch) ||
                task.vendor_name?.toLowerCase().includes(lowSearch) ||
                task.record_name?.toLowerCase().includes(lowSearch)
            );
        }

        if (projectFilter !== 'all') result = result.filter(t => t.project_name === projectFilter);
        if (sourceFilter !== 'all') result = result.filter(t => t.source_name === sourceFilter);
        if (locationFilter !== 'all') result = result.filter(t => t.location_name === locationFilter);
        if (vendorFilter !== 'all') result = result.filter(t => t.vendor_name === vendorFilter);
        if (ownerFilter !== 'all') result = result.filter(t => t.record_owner_name === ownerFilter);
        if (typeFilter !== 'all') result = result.filter(t => t.record_type_name === typeFilter);
        if (userFilter !== 'all') result = result.filter(t => t.qc_user_name === userFilter);

        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            result = result.filter(t => {
                if (!t.qc_completed_date) return false;
                const compDate = new Date(t.qc_completed_date);
                return isWithinInterval(compDate, { start: from, end: to });
            });
        }

        setFilteredBatches(result);
    }, [searchTerm, batches, projectFilter, sourceFilter, locationFilter, vendorFilter, ownerFilter, typeFilter, userFilter, dateRange]);

    // Live Polling for Download Progress
    useEffect(() => {
        const activeBatchUids = Object.keys(downloadStates).filter(
            uid => downloadStates[uid].status === 'processing'
        );

        if (activeBatchUids.length === 0) return;

        const pollProgress = async () => {
            for (const uid of activeBatchUids) {
                try {
                    const res = await apiFetch(`${API_BASE_URL}/admin/download-status/${uid}`);
                    if (res.ok) {
                        const data = await res.json();
                        setDownloadStates(prev => ({ ...prev, [uid]: data }));

                        if (data.status === 'completed') {
                            if (data.errors > 0) {
                                toast({
                                    title: 'Sync Finished with Errors',
                                    description: `Exported ${data.current - data.errors} images, but ${data.errors} failed. Check server logs.`,
                                    variant: 'destructive'
                                });
                            } else {
                                toast({
                                    title: 'Sync Completed',
                                    description: `Batch images exported to ${data.target_dir}`,
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error('Progress poll failed for', uid, err);
                }
            }
        };

        const interval = setInterval(pollProgress, 2000);
        return () => clearInterval(interval);
    }, [downloadStates, apiFetch]);


    // Derived Filter Options
    const projects = Array.from(new Set(batches.map(t => t.project_name))).sort();
    const sources = Array.from(new Set(batches.map(t => t.source_name))).sort();
    const locations = Array.from(new Set(batches.map(t => t.location_name))).sort();
    const vendors = Array.from(new Set(batches.map(t => t.vendor_name))).sort();
    const owners = Array.from(new Set(batches.map(t => t.record_owner_name))).sort();
    const types = Array.from(new Set(batches.map(t => t.record_type_name))).sort();
    const users = Array.from(new Set(batches.map(t => t.qc_user_name))).sort();

    const handleExport = () => {
        if (filteredBatches.length === 0) {
            toast({ title: 'Export Info', description: 'No data to export' });
            return;
        }

        const exportData = filteredBatches.map(t => ({
            ...t,
            qc_completed_date: formatToLocalTime(t.qc_completed_date)
        }));

        exportToExcel(
            exportData,
            'Accepted_Batches_Export',
            {
                batch_id: 'Batch ID',
                project_name: 'Project',
                vendor_name: 'Vendor',
                qc_user_name: 'QC User',
                allocated_by_name: 'Allocated By',
                source_name: 'Source',
                location_name: 'Location',
                record_owner_name: 'Record Owner',
                record_type_name: 'Record Type',
                record_name: 'Record Name',
                total_count: 'Total Images',
                accepted_count: 'Accepted',
                rejected_count: 'Rejected',
                qc_batch_status: 'Status',
                qc_completed_date: 'Completed At'
            }
        );
    };

    const handleDownloadBatch = async (task: AcceptedBatchTask) => {
        try {
            const localPath = localStorage.getItem('local_download_path') || 'C:\\QC_Output';

            const res = await apiFetch(`${API_BASE_URL}/admin/download-batch-files/${task.batch_uid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ download_path: localPath })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to start download');
            }

            const data = await res.json();

            // Register download for tracking
            setDownloadStates(prev => ({
                ...prev,
                [data.batch_uid]: {
                    status: 'processing',
                    current: 0,
                    total: data.count,
                    target_dir: data.target_directory
                }
            }));

            toast({
                title: 'Download Started',
                description: `Syncing ${data.count} images via Pre-signed URLs to: ${data.target_directory}`,
            });
        } catch (error: any) {
            toast({
                title: 'Download Error',
                description: error.message || 'Could not start batch download',
                variant: 'destructive'
            });
        }
    };

    const handleViewHistory = async (task: AcceptedBatchTask) => {
        try {
            setIsHistoryModalOpen(true);
            setLineageLoading(true);
            setActiveBatchName(task.parent_batch_id || task.batch_id);

            const res = await apiFetch(`${API_BASE_URL}/admin/batch-lineage/${task.batch_uid}`);
            if (!res.ok) throw new Error('Failed to fetch lineage');

            const data = await res.json();
            setSelectedLineage(data);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Could not load version history',
                variant: 'destructive'
            });
            setIsHistoryModalOpen(false);
        } finally {
            setLineageLoading(false);
        }
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string, item: AcceptedBatchTask) => (
                <code className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm w-fit",
                    item.upload_type === 'Complete' ? "text-emerald-700 bg-emerald-50 border border-emerald-100/50" :
                        item.upload_type === 'Partial' ? "text-blue-700 bg-blue-50 border border-blue-100/50" :
                            "text-amber-700 bg-amber-50 border border-amber-100/50"
                )}>
                    {item.parent_batch_id || val}
                </code>
            )
        },
        {
            key: 'project_name',
            header: 'Project',
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'source_name',
            header: 'Source',
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'location_name',
            header: 'Location',
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'record_owner_name',
            header: 'Record Owner',
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'record_type_name',
            header: 'Record Type',
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'vendor_name',
            header: 'Vendor',
            render: (val: string) => <span className="text-[10px] font-medium text-slate-600">{val}</span>
        },
        {
            key: 'record_name',
            header: 'Book Name',
            render: (val: string) => <span className="text-[10px] font-black text-slate-700 max-w-[150px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'qc_user_name',
            header: 'QC User',
            render: (val: string) => (
                <div className="flex items-center gap-2">
                    <UserIcon className="h-3 w-3 text-slate-400" />
                    <span className="font-medium text-slate-700">{val}</span>
                </div>
            )
        },
        { key: 'total_count', header: 'Images', sortable: true },
        {
            key: 'accepted_count',
            header: 'Final Acc.',
            render: (value: number) => (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {value}
                </Badge>
            )
        },
        {
            key: 'qc_batch_status',
            header: 'QC Result',
            render: (val: string) => (
                <Badge
                    className={cn(
                        "text-[10px] uppercase font-bold",
                        val === 'Verified' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                            "bg-amber-100 text-amber-700 border-amber-200"
                    )}
                >
                    {STATUS_DISPLAY_NAMES[val] || val.replace(/_/g, ' ')}
                </Badge>
            )
        },
        {
            key: 'qc_completed_date',
            header: 'Verified At',
            sortable: true,
            render: (value: string) => value ? formatToLocalTime(value) : 'N/A'
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: AcceptedBatchTask) => (
                <div className="flex items-center gap-2">
                    {/* Progress Indicator */}
                    {downloadStates[item.batch_uid] && (
                        <div className="flex items-center gap-1.5 mr-2">
                            {downloadStates[item.batch_uid].status === 'processing' ? (
                                <Badge className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1.5 animate-pulse px-2 h-7">
                                    <RefreshCcw className="h-3 w-3 animate-spin" />
                                    <span className="font-black text-[9px]">
                                        {Math.round((downloadStates[item.batch_uid].current / downloadStates[item.batch_uid].total) * 100)}%
                                    </span>
                                    {downloadStates[item.batch_uid].errors > 0 && (
                                        <span className="bg-red-500 text-white rounded-full px-1 text-[7px]" title={`${downloadStates[item.batch_uid].errors} errors`}>
                                            !
                                        </span>
                                    )}
                                </Badge>
                            ) : (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 px-2 h-7">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    <span className="font-black text-[9px]">SYNCED</span>
                                </Badge>
                            )}
                        </div>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadBatch(item)}
                        disabled={downloadStates[item.batch_uid]?.status === 'processing'}
                        className={cn(
                            "h-8 px-2.5 text-slate-500 border-slate-200 hover:text-emerald-600 hover:border-emerald-200 transition-all",
                            downloadStates[item.batch_uid]?.status === 'completed' && "text-emerald-600 border-emerald-100 bg-emerald-50/30"
                        )}
                        title="Sync images to local server path"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleViewHistory(item)}
                        title={item.parent_batch_id ? `View Detail History (Current Version: ${item.batch_id})` : "View Full Version History"}
                        className="h-7 w-7 border-slate-200 text-slate-600 hover:bg-slate-50 relative"
                    >
                        <History className="h-3.5 w-3.5" />
                        {item.parent_batch_id && item.parent_batch_id !== item.batch_id && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                        )}
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <PageHeader
                    title="Accepted Batches (Final)"
                    description="Repository of all books and records that have cleared the final quality gate"
                />

                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleExport}
                        disabled={filteredBatches.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 gap-2 h-9"
                    >
                        <Download className="h-4 w-4" />
                        Export Accepted List
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchBatches}
                        disabled={isLoading}
                        className="h-9 gap-2 border-slate-200 text-slate-600 hover:text-indigo-600"
                    >
                        <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Premium Filter Hub */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-1.5 border-b-4 border-b-emerald-500/10">
                <div className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[320px] group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                placeholder="Search by Batch ID, Book Name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 bg-slate-50 border-slate-200/60 focus:bg-white focus:ring-4 focus:ring-emerald-500/5 transition-all rounded-xl text-sm font-medium"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-slate-500"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-none">
                            <div className="h-11 flex items-center gap-2 px-3 bg-slate-50 border border-slate-200/60 rounded-xl group focus-within:ring-4 focus-within:ring-emerald-500/5 transition-all min-w-[280px]">
                                <CalendarIcon className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500" />
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className={cn("text-sm font-semibold outline-none flex-1 text-left", !dateRange && "text-slate-400")}>
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}` : format(dateRange.from, "LLL dd")) : "Completed Date Range"}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
                                    </PopoverContent>
                                </Popover>
                                {dateRange && (
                                    <X className="h-4 w-4 text-slate-300 hover:text-red-500 cursor-pointer" onClick={() => setDateRange(undefined)} />
                                )}
                            </div>

                            {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || userFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all' || vendorFilter !== 'all' || dateRange) && (
                                <Button
                                    variant="ghost"
                                    onClick={resetFilters}
                                    className="h-11 px-4 gap-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl font-bold text-xs uppercase tracking-wider"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-slate-100/80 mx-1 my-0.5" />

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Building2 className="h-3.5 w-3.5" />
                            </div>
                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-emerald-500/5 hover:border-emerald-200 transition-all">
                                    <SelectValue placeholder="Project" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Projects</SelectItem>
                                    {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Database className="h-3.5 w-3.5" />
                            </div>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-emerald-500/5 hover:border-emerald-200 transition-all">
                                    <SelectValue placeholder="Source" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Sources</SelectItem>
                                    {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <MapPin className="h-3.5 w-3.5" />
                            </div>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-emerald-500/5 hover:border-emerald-200 transition-all">
                                    <SelectValue placeholder="Location" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Locations</SelectItem>
                                    {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Files className="h-3.5 w-3.5" />
                            </div>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-emerald-500/5 hover:border-emerald-200 transition-all">
                                    <SelectValue placeholder="Owner" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Owners</SelectItem>
                                    {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <FileText className="h-3.5 w-3.5" />
                            </div>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-emerald-500/5 hover:border-emerald-200 transition-all">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Building className="h-3.5 w-3.5" />
                            </div>
                            <Select value={vendorFilter} onValueChange={setVendorFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-emerald-500/5 hover:border-emerald-200 transition-all">
                                    <SelectValue placeholder="Vendor" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Vendors</SelectItem>
                                    {vendors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <UserIcon className="h-3.5 w-3.5" />
                            </div>
                            <Select value={userFilter} onValueChange={setUserFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-emerald-500/5 hover:border-emerald-200 transition-all">
                                    <SelectValue placeholder="QC User" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All QC Users</SelectItem>
                                    {users.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col justify-center items-center py-32 gap-4">
                    <RefreshCcw className="h-12 w-12 animate-spin text-emerald-600" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] animate-pulse">Loading cleared records...</p>
                </div>
            ) : filteredBatches.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-20 text-center animate-in fade-in zoom-in duration-300">
                    <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-4">
                        <CheckCircle2 className="h-8 w-8 text-slate-200" />
                    </div>
                    <p className="text-slate-500 font-medium">No records have reached final acceptance yet.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md">
                    <DataTable
                        data={filteredBatches}
                        columns={columns}
                        searchable={false}
                    />
                </div>
            )}

            {/* Version History Modal */}
            <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-slate-50">
                    <DialogHeader className="p-6 bg-white border-b border-slate-100 flex flex-row items-center justify-between">
                        <div className="space-y-1">
                            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <History className="h-5 w-5 text-indigo-600" />
                                Version Lineage Tracking
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 font-medium">
                                Audit trail for <span className="text-indigo-600 font-bold">#{activeBatchName}</span> from original upload to final acceptance
                            </DialogDescription>
                        </div>
                    </DialogHeader>

                    <div className="p-6 max-h-[70vh] overflow-y-auto">
                        {lineageLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <RefreshCcw className="h-10 w-10 animate-spin text-indigo-500" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reconstructing Lineage...</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {selectedLineage.map((v, i) => (
                                    <div key={v.qc_allocation_id} className="relative pl-8 group">
                                        {/* Timeline Line */}
                                        {i !== selectedLineage.length - 1 && (
                                            <div className="absolute left-[11px] top-6 bottom-[-24px] w-0.5 bg-slate-200 group-hover:bg-indigo-200 transition-colors" />
                                        )}

                                        {/* Timeline Dot */}
                                        <div className={cn(
                                            "absolute left-0 top-1.5 h-6 w-6 rounded-full border-4 border-white shadow-md z-10 flex items-center justify-center transition-all duration-300",
                                            v.qc_batch_status === 'Verified' ? "bg-emerald-500 scale-110" : "bg-slate-300"
                                        )}>
                                            {v.qc_batch_status === 'Verified' ? <CheckCircle2 className="h-3 w-3 text-white" /> : <div className="h-2 w-2 rounded-full bg-white opacity-40" />}
                                        </div>

                                        <div className={cn(
                                            "bg-white rounded-xl border p-4 shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:border-indigo-100",
                                            v.qc_batch_status === 'Verified' ? "border-emerald-100 bg-emerald-50/20" : "border-slate-100"
                                        )}>
                                            <div className="flex items-start justify-between mb-4">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <code className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                                            {v.batch_id}
                                                        </code>
                                                        <Badge variant="outline" className={cn(
                                                            "text-[9px] font-bold uppercase",
                                                            v.upload_type === 'Complete' ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
                                                        )}>
                                                            {v.upload_type}
                                                        </Badge>
                                                        {v.status_detail && (
                                                            <Badge className="bg-slate-100 text-slate-600 text-[9px] border-none">{v.status_detail}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 font-medium">
                                                        Attempt processed on {formatToLocalTime(v.qc_completed_date || v.allocation_date)}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mb-1">QC Disposition</div>
                                                    <Badge className={cn(
                                                        "text-[10px] font-bold",
                                                        v.qc_batch_status === 'Verified' ? "bg-emerald-500 hover:bg-emerald-500" :
                                                            v.qc_batch_status === 'Verified_With_Rejection' ? "bg-amber-500 hover:bg-amber-500" :
                                                                "bg-slate-400 hover:bg-slate-400"
                                                    )}>
                                                        {v.qc_batch_status.replace(/_/g, ' ')}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100/50">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Volume</p>
                                                    <p className="text-lg font-bold text-slate-700">{v.total_count}</p>
                                                </div>
                                                <div className="space-y-1 border-x border-slate-200 px-4 text-center">
                                                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">Accepted</p>
                                                    <p className="text-lg font-bold text-emerald-600">{v.accepted_count}</p>
                                                </div>
                                                <div className="space-y-1 text-right">
                                                    <p className="text-[9px] font-black text-red-400 uppercase tracking-wider">Rejected</p>
                                                    <p className="text-lg font-bold text-red-500">{v.rejected_count}</p>
                                                </div>
                                            </div>

                                            <div className="mt-4 flex items-center justify-between text-[11px]">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <UserIcon className="h-3 w-3" />
                                                    QC by <span className="font-bold text-slate-700">{v.qc_user_name}</span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                                                    onClick={() => handleDownloadBatch(v)}
                                                >
                                                    <Download className="h-3 w-3 mr-1.5" />
                                                    Download Version Report
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-slate-500 text-[11px] mt-4 flex items-center gap-3 backdrop-blur-sm">
                <div className="p-2 bg-emerald-100 rounded-xl">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                    <span className="font-bold text-emerald-900 uppercase tracking-wider block mb-0.5">Finalized Record Repository</span>
                    <p>This view displays only batches that have passed the final verification stage. These records are considered project-complete and are ready for archival or further processing.</p>
                </div>
            </div>
        </div>
    );
};

export default AcceptedBatches;
