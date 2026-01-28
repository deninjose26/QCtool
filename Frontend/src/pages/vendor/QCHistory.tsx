import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import DataTable from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Download,
    RefreshCcw,
    Search,
    Database,
    MapPin,
    FileText,
    Building2,
    Calendar as CalendarIcon,
    X,
    User as UserIcon,
    CheckCircle,
    Loader2
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

interface VendorQCHistoryBatch {
    id: string; // For DataTable
    batch_uid: string;
    batch_id: string;
    project_name: string;
    source_name: string;
    location_name: string;
    record_owner_name: string;
    record_type_name: string;
    book_name: string;
    total_count: number;
    upload_count: number;
    qc_done_count: number;
    accepted_count: number;
    rejected_count: number;
    qc_status: string;
    operator_name: string;
    allocation_date: string;
    qc_completed_date: string;
}

const VendorQCHistory: React.FC = () => {
    const { apiFetch } = useAuth();
    const [history, setHistory] = useState<VendorQCHistoryBatch[]>([]);
    const [filteredHistory, setFilteredHistory] = useState<VendorQCHistoryBatch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Filters
    const [projectFilter, setProjectFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [ownerFilter, setOwnerFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [operatorFilter, setOperatorFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const { toast } = useToast();

    const fetchHistory = async () => {
        try {
            setIsLoading(true);
            const res = await apiFetch(`${API_BASE_URL}/vendor/qc-history`);
            if (!res.ok) throw new Error('Failed to fetch history');
            const data = await res.json();
            const mappedData = data.map((t: any) => ({ ...t, id: t.batch_uid }));
            setHistory(mappedData);
            setFilteredHistory(mappedData);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Could not load QC History',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
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
                task.book_name.toLowerCase().includes(lowSearch) ||
                task.operator_name.toLowerCase().includes(lowSearch)
            );
        }

        if (projectFilter !== 'all') result = result.filter(t => t.project_name === projectFilter);
        if (sourceFilter !== 'all') result = result.filter(t => t.source_name === sourceFilter);
        if (locationFilter !== 'all') result = result.filter(t => t.location_name === locationFilter);
        if (ownerFilter !== 'all') result = result.filter(t => t.record_owner_name === ownerFilter);
        if (typeFilter !== 'all') result = result.filter(t => t.record_type_name === typeFilter);
        if (operatorFilter !== 'all') result = result.filter(t => t.operator_name === operatorFilter);
        if (statusFilter !== 'all') result = result.filter(t => t.qc_status === statusFilter);

        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            result = result.filter(t => {
                if (!t.qc_completed_date) return false;
                const compDate = new Date(t.qc_completed_date);
                return isWithinInterval(compDate, { start: from, end: to });
            });
        }

        setFilteredHistory(result);
    }, [searchTerm, history, projectFilter, sourceFilter, locationFilter, ownerFilter, typeFilter, operatorFilter, statusFilter, dateRange]);

    // Derived Filter Options
    const projects = Array.from(new Set(history.map(t => t.project_name))).sort();
    const sources = Array.from(new Set(history.map(t => t.source_name))).sort();
    const locations = Array.from(new Set(history.map(t => t.location_name))).sort();
    const owners = Array.from(new Set(history.map(t => t.record_owner_name))).sort();
    const types = Array.from(new Set(history.map(t => t.record_type_name))).sort();
    const operators = Array.from(new Set(history.map(t => t.operator_name))).sort();
    const statuses = Array.from(new Set(history.map(t => t.qc_status))).sort();

    const handleExport = () => {
        if (filteredHistory.length === 0) {
            toast({ title: 'Export Info', description: 'No history to export' });
            return;
        }

        const exportData = filteredHistory.map(t => ({
            ...t,
            qc_completed_date: t.qc_completed_date ? formatToLocalTime(t.qc_completed_date) : 'N/A'
        }));

        exportToExcel(
            exportData,
            'Vendor_QC_History',
            {
                batch_id: 'Batch ID',
                project_name: 'Project',
                source_name: 'Source',
                location_name: 'Location',
                record_owner_name: 'Record Owner',
                record_type_name: 'Record Type',
                book_name: 'Book Name',
                operator_name: 'Operator',
                total_count: 'Images Total',
                accepted_count: 'Accepted',
                rejected_count: 'Rejected',
                qc_status: 'QC Status',
                qc_completed_date: 'Completed At'
            }
        );
    };

    const handleDownloadReport = async (batch: VendorQCHistoryBatch) => {
        try {
            const res = await apiFetch(`${API_BASE_URL}/vendor/qc-report/${batch.batch_uid}`);
            if (!res.ok) throw new Error('Failed to fetch batch report');
            const data = await res.json();

            exportToExcel(
                data,
                `QC_Report_${batch.batch_id}`,
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
            render: (val: string) => <code className="text-[10px] font-bold text-indigo-600">{val}</code>
        },
        { key: 'project_name', header: 'Project' },
        { key: 'source_name', header: 'Source' },
        { key: 'location_name', header: 'Location' },
        { key: 'record_owner_name', header: 'Owner' },
        { key: 'record_type_name', header: 'Type' },
        { key: 'book_name', header: 'Book Name' },
        {
            key: 'operator_name',
            header: 'Operator',
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
            header: 'Accepted',
            sortable: true,
            render: (value: number) => (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">
                    {value}
                </Badge>
            )
        },
        {
            key: 'rejected_count',
            header: 'Rejected',
            sortable: true,
            render: (value: number) => (
                <Badge variant="outline" className={cn(
                    "font-bold",
                    value > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-400 border-slate-200"
                )}>
                    {value}
                </Badge>
            )
        },
        {
            key: 'qc_status',
            header: 'QC Status',
            render: (val: string) => {
                let color = "bg-slate-100 text-slate-600";
                if (val === 'Verified') color = "bg-indigo-100 text-indigo-700";
                if (val === 'Verified_With_Rejection') color = "bg-amber-100 text-amber-700";
                if (val === 'Completed') color = "bg-emerald-100 text-emerald-700";

                return (
                    <Badge variant="secondary" className={cn("text-[9px] font-black uppercase tracking-widest", color)}>
                        {val.replace(/_/g, ' ')}
                    </Badge>
                );
            }
        },
        {
            key: 'qc_completed_date',
            header: 'Completed At',
            sortable: true,
            render: (value: string) => value ? formatToLocalTime(value) : 'In Progress'
        },
        {
            key: 'actions',
            header: 'Report',
            render: (_: any, item: VendorQCHistoryBatch) => (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadReport(item)}
                    className="h-8 gap-1.5 text-[10px] font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                >
                    <Download className="h-3 w-3" />
                    DOWNLOAD
                </Button>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <PageHeader
                    title="Audit Verification Hub"
                    description="Monitor QC status of batches uploaded by your operators"
                />
            </div>

            {/* Premium Filter Hub */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-1.5 border-b-4 border-b-indigo-500/10 mb-6 font-geist">
                <div className="flex flex-col gap-2 p-3">
                    {/* Top Tier: Search, Date, and Actions */}
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[320px] group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                placeholder="Search by Batch ID, Book, Operator..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 bg-slate-50 border-slate-200/60 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all rounded-xl text-sm font-medium"
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-slate-500">
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
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}` : format(dateRange.from, "LLL dd")) : "Filter by Date"}
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

                            <Button onClick={fetchHistory} disabled={isLoading} variant="outline" className="h-11 px-4 gap-2 border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider">
                                <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                                Refresh
                            </Button>

                            <Button onClick={handleExport} disabled={filteredHistory.length === 0} variant="outline" className="h-11 px-4 gap-2 bg-green-50 border-green-200 text-green-700 hover:bg-green-100 rounded-xl font-bold text-xs uppercase tracking-wider">
                                <Download className="h-3.5 w-3.5" />
                                Export
                            </Button>
                        </div>
                    </div>

                    <div className="h-px bg-slate-100/80 mx-1 my-0.5" />

                    {/* Bottom Tier: Metadata Filters */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"><Building2 className="h-3 w-3" /></div>
                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="h-9 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all self-alignment-center"><SelectValue placeholder="Project" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Project</SelectItem>
                                    {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"><Database className="h-3 w-3" /></div>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-9 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all"><SelectValue placeholder="Source" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Source</SelectItem>
                                    {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"><MapPin className="h-3 w-3" /></div>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger className="h-9 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all"><SelectValue placeholder="Location" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Location</SelectItem>
                                    {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"><UserIcon className="h-3 w-3" /></div>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="h-9 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all"><SelectValue placeholder="Owner" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Owner</SelectItem>
                                    {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"><FileText className="h-3 w-3" /></div>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="h-9 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all"><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Type</SelectItem>
                                    {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"><UserIcon className="h-3 w-3" /></div>
                            <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                                <SelectTrigger className="h-9 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all"><SelectValue placeholder="Operator" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Operators</SelectItem>
                                    {operators.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"><CheckCircle className="h-3 w-3" /></div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-9 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-bold focus:ring-4 focus:ring-indigo-500/5 transition-all"><SelectValue placeholder="QC Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    {statuses.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 animate-pulse">Syncing Audit Logs...</p>
                </div>
            ) : filteredHistory.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center shadow-sm">
                    <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="h-8 w-8 text-slate-300" />
                    </div>
                    <h3 className="text-slate-900 font-bold mb-1">No QC History Found</h3>
                    <p className="text-slate-500 text-xs">When your batches are processed by QC, history will appear here.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden shadow-[0_0_20px_rgba(79,70,229,0.03)] font-geist">
                    <DataTable
                        data={filteredHistory}
                        columns={columns}
                        pageSize={15}
                        searchable={false}
                    />
                </div>
            )}
        </div>
    );
};

export default VendorQCHistory;
