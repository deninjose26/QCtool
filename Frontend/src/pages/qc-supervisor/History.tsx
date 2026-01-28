import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import DataTable from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Download,
    RefreshCcw,
    Search,
    Calendar as CalendarIcon,
    User as UserIcon,
    Eye,
    Building2,
    Database,
    MapPin,
    LayoutGrid,
    FileText,
    Book,
    X,
    Filter,
    Building
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

interface QCSupHistoryTask {
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
    allocation_date: string;
    qc_completed_date: string;
    qc_batch_status: string;
    upload_type: string;
}

const STATUS_DISPLAY_NAMES: Record<string, string> = {
    'Allocated': 'Allocated',
    'In_Progress': 'In Progress',
    'Completed': 'Completed',
    'Verified': 'Verified',
    'Verified_With_Rejection': 'Verified (Rejected items exist)'
};

const QCSupervisorHistory: React.FC = () => {
    const { apiFetch } = useAuth();
    const navigate = useNavigate();
    const [history, setHistory] = useState<QCSupHistoryTask[]>([]);
    const [filteredHistory, setFilteredHistory] = useState<QCSupHistoryTask[]>([]);
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
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const { toast } = useToast();

    const fetchHistory = async () => {
        try {
            setIsLoading(true);
            const res = await apiFetch(`${API_BASE_URL}/qc-sup/history`);
            if (!res.ok) throw new Error('Failed to fetch history');
            const data = await res.json();
            // FILTER FOR VERIFIED ONLY
            const verifiedData = data.filter((t: any) =>
                t.qc_batch_status === 'Verified' || t.qc_batch_status === 'Verified_With_Rejection'
            );
            const mappedData = verifiedData.map((t: any) => ({ ...t, id: t.qc_allocation_id }));
            setHistory(mappedData);
            setFilteredHistory(mappedData);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Could not load QC history',
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
        setStatusFilter('all');
        setDateRange(undefined);
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    useEffect(() => {
        let result = [...history];

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
        if (statusFilter !== 'all') result = result.filter(t => t.qc_batch_status === statusFilter);

        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            result = result.filter(t => {
                const compDate = new Date(t.qc_completed_date);
                return isWithinInterval(compDate, { start: from, end: to });
            });
        }

        setFilteredHistory(result);
    }, [searchTerm, history, projectFilter, sourceFilter, locationFilter, vendorFilter, ownerFilter, typeFilter, userFilter, statusFilter, dateRange]);

    // Derived Filter Options
    const projects = Array.from(new Set(history.map(t => t.project_name))).sort();
    const sources = Array.from(new Set(history.map(t => t.source_name))).sort();
    const locations = Array.from(new Set(history.map(t => t.location_name))).sort();
    const vendors = Array.from(new Set(history.map(t => t.vendor_name))).sort();
    const owners = Array.from(new Set(history.map(t => t.record_owner_name))).sort();
    const types = Array.from(new Set(history.map(t => t.record_type_name))).sort();
    const users = Array.from(new Set(history.map(t => t.qc_user_name))).sort();
    const statuses = Array.from(new Set(history.map(t => t.qc_batch_status))).sort();

    const handleExport = () => {
        if (filteredHistory.length === 0) {
            toast({ title: 'Export Info', description: 'No history to export' });
            return;
        }

        const exportData = filteredHistory.map(t => ({
            ...t,
            qc_completed_date: formatToLocalTime(t.qc_completed_date)
        }));

        exportToExcel(
            exportData,
            'Master_QC_History',
            {
                batch_id: 'Batch ID',
                project_name: 'Project',
                vendor_name: 'Vendor',
                qc_user_name: 'QC User',
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

    const handleDownloadBatch = async (task: QCSupHistoryTask) => {
        try {
            const res = await apiFetch(`${API_BASE_URL}/qc/export-batch/${task.batch_uid}`);
            if (!res.ok) throw new Error('Failed to fetch batch details');
            const data = await res.json();

            exportToExcel(
                data,
                `Detailed_Report_${task.batch_id}`,
                {
                    image_name: 'Image Name',
                    qc_status: 'QC Status',
                    orientation_error: 'Orientation Issue',
                    remarks: 'Remarks / Rejection Reason',
                    qc_date: 'QC Date'
                }
            );
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Could not generate batch report',
                variant: 'destructive'
            });
        }
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string, item: QCSupHistoryTask) => (
                <code className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm",
                    item.upload_type === 'Complete' ? "text-emerald-700 bg-emerald-50 border border-emerald-100/50" :
                        item.upload_type === 'Partial' ? "text-blue-700 bg-blue-50 border border-blue-100/50" :
                            "text-amber-700 bg-amber-50 border border-amber-100/50"
                )}>
                    {val}
                </code>
            )
        },
        { key: 'project_name', header: 'Project' },
        {
            key: 'upload_type',
            header: 'Type',
            render: (val: string) => (
                <Badge className={cn(
                    "text-[10px] font-bold uppercase",
                    val === 'Complete' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        val === 'Partial' ? "bg-blue-100 text-blue-700 border-blue-200" :
                            "bg-amber-100 text-amber-700 border-amber-200"
                )}>
                    {val}
                </Badge>
            )
        },
        {
            key: 'vendor_name',
            header: 'Vendor',
            render: (val: string) => <span className="text-[10px] font-medium text-slate-600">{val}</span>
        },
        { key: 'location_name', header: 'Location' },
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
        { key: 'record_owner_name', header: 'Owner' },
        { key: 'record_type_name', header: 'Type' },
        { key: 'record_name', header: 'Name' },
        { key: 'total_count', header: 'Total', sortable: true },
        {
            key: 'accepted_count',
            header: 'Acc.',
            render: (value: number) => (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {value}
                </Badge>
            )
        },
        {
            key: 'rejected_count',
            header: 'Rej.',
            render: (value: number) => (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    {value}
                </Badge>
            )
        },
        {
            key: 'qc_batch_status',
            header: 'Status',
            render: (val: string) => (
                <Badge
                    className={cn(
                        "text-[10px] uppercase font-bold",
                        val === 'Verified' ? "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100" :
                            val === 'Verified_With_Rejection' ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100" :
                                "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    )}
                >
                    {STATUS_DISPLAY_NAMES[val] || val.replace(/_/g, ' ')}
                </Badge>
            )
        },
        {
            key: 'qc_completed_date',
            header: 'Completed At',
            sortable: true,
            render: (value: string) => value ? formatToLocalTime(value) : 'N/A'
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: QCSupHistoryTask) => (
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDownloadBatch(item)}
                        title="Download Report"
                        className="h-7 w-7 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <PageHeader
                    title="Master QC History"
                    description="Historical record of all verified quality control batches"
                />

                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleExport}
                        disabled={filteredHistory.length === 0}
                        className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 gap-2 h-9"
                    >
                        <Download className="h-4 w-4" />
                        Export Master Log
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchHistory}
                        disabled={isLoading}
                        className="h-9 gap-2 border-slate-200 text-slate-600 hover:text-indigo-600"
                    >
                        <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Premium Filter Hub */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-1.5 border-b-4 border-b-indigo-500/10">
                <div className="flex flex-col gap-2 p-3">
                    {/* Top Tier: Search, Date, and Actions */}
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[320px] group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                placeholder="Search by Batch ID, Record Name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 bg-slate-50 border-slate-200/60 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all rounded-xl text-sm font-medium"
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
                            <div className="h-11 flex items-center gap-2 px-3 bg-slate-50 border border-slate-200/60 rounded-xl group focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all min-w-[280px]">
                                <CalendarIcon className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500" />
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className={cn("text-sm font-semibold outline-none flex-1 text-left", !dateRange && "text-slate-400")}>
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}` : format(dateRange.from, "LLL dd")) : "Filter by Date Range"}
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

                            <Button
                                variant="outline"
                                onClick={fetchHistory}
                                disabled={isLoading}
                                className="h-11 px-4 gap-2 border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider"
                            >
                                <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                                Refresh
                            </Button>

                            {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || userFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all' || vendorFilter !== 'all' || statusFilter !== 'all' || dateRange) && (
                                <Button
                                    variant="ghost"
                                    onClick={resetFilters}
                                    className="h-11 px-4 gap-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-xs uppercase tracking-wider"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-slate-100/80 mx-1 my-0.5" />

                    {/* Bottom Tier: Metadata Filter Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-2">
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Building2 className="h-3.5 w-3.5" />
                            </div>
                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
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
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
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
                                <UserIcon className="h-3.5 w-3.5" />
                            </div>
                            <Select value={userFilter} onValueChange={setUserFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="QC User" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All QC Users</SelectItem>
                                    {users.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <MapPin className="h-3.5 w-3.5" />
                            </div>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
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
                                <Building className="h-3.5 w-3.5" />
                            </div>
                            <Select value={vendorFilter} onValueChange={setVendorFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
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
                                <LayoutGrid className="h-3.5 w-3.5" />
                            </div>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
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
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
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
                                <Filter className="h-3.5 w-3.5" />
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Verified Statuses</SelectItem>
                                    <SelectItem value="Verified">Verified Only</SelectItem>
                                    <SelectItem value="Verified_With_Rejection">Verified with Rejections</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                </div>
            ) : filteredHistory.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <p className="text-slate-500">No verified history found.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <DataTable
                        data={filteredHistory}
                        columns={columns}
                        searchable={false}
                    />
                </div>
            )}
        </div>
    );
};

export default QCSupervisorHistory;
