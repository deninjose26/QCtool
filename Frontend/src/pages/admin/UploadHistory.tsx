import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import {
    Loader2,
    Download,
    RefreshCcw,
    Calendar as CalendarIcon,
    X,
    MapPin,
    Building2,
    Search,
    User as UserIcon,
    Briefcase,
    ShieldCheck,
    Database,
    Book,
    FileText,
    Filter,
    LayoutGrid,
    ChevronDown
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { exportToExcel } from '@/utils/excelExport';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { formatToLocalTime } from '@/utils/dateUtils';
import { useAuth } from '@/contexts/AuthContext';

interface AdminBatch {
    id: string;
    batch_uid: string;
    batch_id: string;
    project_name: string;
    source_name: string;
    location_name: string;
    record_owner_name: string;
    record_type_name: string;
    book_name: string;
    total_count: number;
    target_count: number;
    completed_count: number;
    vendor_name: string;
    operator_name: string;
    upload_type: string;
    status: 'pending' | 'uploading' | 'uploaded';
    upload_end_date?: string;
}

const AdminUploadHistory: React.FC = () => {
    const { apiFetch } = useAuth();
    const [batches, setBatches] = useState<AdminBatch[]>([]);
    const [filteredBatches, setFilteredBatches] = useState<AdminBatch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const token = localStorage.getItem('qc_token');

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [vendorFilter, setVendorFilter] = useState<string>('all');
    const [operatorFilter, setOperatorFilter] = useState<string>('all');
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [ownerFilter, setOwnerFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [bookFilter, setBookFilter] = useState<string>('all');
    const [uploadTypeFilter, setUploadTypeFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setIsLoading(true);
            const res = await apiFetch(`${API_BASE_URL}/admin/batches`);
            if (!res.ok) throw new Error('Failed to fetch history');

            const data = await res.json();
            const mappedData = data
                .filter((item: any) => item.status === 'uploaded')
                .map((item: any) => ({
                    ...item,
                    id: item.batch_uid
                }));

            setBatches(mappedData);
        } catch (err) {
            console.error(err);
            toast({ title: 'Error', description: 'Failed to load master history', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    // Derived Filter Options with Intelligent Dependencies
    const getOptions = (key: keyof AdminBatch, currentFilters: any) => {
        let items = [...batches];
        Object.keys(currentFilters).forEach(fKey => {
            if (fKey !== key && currentFilters[fKey] !== 'all') {
                items = items.filter(item => (item as any)[fKey] === currentFilters[fKey]);
            }
        });
        return Array.from(new Set(items.map(item => (item as any)[key]))).filter(Boolean).sort();
    };

    const currentFilters = {
        project_name: projectFilter,
        source_name: sourceFilter,
        vendor_name: vendorFilter,
        operator_name: operatorFilter,
        location_name: locationFilter,
        record_owner_name: ownerFilter,
        record_type_name: typeFilter,
        book_name: bookFilter,
        upload_type: uploadTypeFilter
    };

    const projects = useMemo(() => getOptions('project_name', currentFilters), [batches, currentFilters]);
    const sources = useMemo(() => getOptions('source_name', currentFilters), [batches, currentFilters]);
    const vendors = useMemo(() => getOptions('vendor_name', currentFilters), [batches, currentFilters]);
    const operators = useMemo(() => getOptions('operator_name', currentFilters), [batches, currentFilters]);
    const locations = useMemo(() => getOptions('location_name', currentFilters), [batches, currentFilters]);
    const owners = useMemo(() => getOptions('record_owner_name', currentFilters), [batches, currentFilters]);
    const types = useMemo(() => getOptions('record_type_name', currentFilters), [batches, currentFilters]);
    const books = useMemo(() => getOptions('book_name', currentFilters), [batches, currentFilters]);
    const uploadTypes = useMemo(() => getOptions('upload_type', currentFilters), [batches, currentFilters]);

    // Apply filters and search
    useEffect(() => {
        let result = [...batches];

        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            result = result.filter(item =>
                item.batch_id.toLowerCase().includes(lowSearch) ||
                item.project_name.toLowerCase().includes(lowSearch) ||
                item.vendor_name.toLowerCase().includes(lowSearch) ||
                item.book_name?.toLowerCase().includes(lowSearch)
            );
        }

        if (projectFilter !== 'all') result = result.filter(b => b.project_name === projectFilter);
        if (sourceFilter !== 'all') result = result.filter(b => b.source_name === sourceFilter);
        if (vendorFilter !== 'all') result = result.filter(b => b.vendor_name === vendorFilter);
        if (operatorFilter !== 'all') result = result.filter(b => b.operator_name === operatorFilter);
        if (locationFilter !== 'all') result = result.filter(b => b.location_name === locationFilter);
        if (ownerFilter !== 'all') result = result.filter(b => b.record_owner_name === ownerFilter);
        if (typeFilter !== 'all') result = result.filter(b => b.record_type_name === typeFilter);
        if (bookFilter !== 'all') result = result.filter(b => b.book_name === bookFilter);
        if (uploadTypeFilter !== 'all') result = result.filter(b => b.upload_type === uploadTypeFilter);

        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            result = result.filter(b => {
                if (!b.upload_end_date) return false;
                const uploadDate = new Date(b.upload_end_date);
                return isWithinInterval(uploadDate, { start: from, end: to });
            });
        }

        setFilteredBatches(result);
    }, [batches, searchTerm, projectFilter, sourceFilter, vendorFilter, operatorFilter, locationFilter, ownerFilter, typeFilter, bookFilter, uploadTypeFilter, dateRange]);

    const handleExport = () => {
        const exportData = filteredBatches.map(b => ({
            batch_id: b.batch_id,
            project: b.project_name,
            source: b.source_name,
            vendor: b.vendor_name,
            operator: b.operator_name,
            location: b.location_name,
            owner: b.record_owner_name,
            record_type: b.record_type_name,
            upload_type: b.upload_type,
            book: b.book_name,
            images: b.completed_count,
            completed_at: formatToLocalTime(b.upload_end_date)
        }));

        const headers = {
            batch_id: 'Batch ID',
            project: 'Project',
            source: 'Source',
            vendor: 'Vendor',
            operator: 'Operator',
            location: 'Location',
            owner: 'Record Owner',
            record_type: 'Record Type',
            upload_type: 'Upload Type',
            book: 'Book Name',
            images: 'Total Images',
            completed_at: 'Completion Date'
        };

        exportToExcel(exportData, 'Admin_Master_Upload_History', headers);
    };

    const resetFilters = () => {
        setSearchTerm('');
        setProjectFilter('all');
        setSourceFilter('all');
        setVendorFilter('all');
        setOperatorFilter('all');
        setLocationFilter('all');
        setOwnerFilter('all');
        setTypeFilter('all');
        setBookFilter('all');
        setUploadTypeFilter('all');
        setDateRange(undefined);
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string, item: AdminBatch) => (
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3 w-3 text-primary/50" />
                    <code className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm",
                        item.upload_type === 'Complete' ? "text-emerald-700 bg-emerald-50 border border-emerald-100/50" :
                            item.upload_type === 'Partial' ? "text-blue-700 bg-blue-50 border border-blue-100/50" :
                                "text-amber-700 bg-amber-50 border border-amber-100/50"
                    )}>
                        {val}
                    </code>
                </div>
            )
        },
        { key: 'project_name', header: 'Project' },
        { key: 'source_name', header: 'Source' },
        {
            key: 'vendor_name',
            header: 'Vendor',
            render: (val: string) => <span className="text-[10px] font-medium text-slate-600">{val}</span>
        },
        { key: 'operator_name', header: 'Operator' },
        { key: 'location_name', header: 'Location' },
        { key: 'record_owner_name', header: 'Owner' },
        { key: 'record_type_name', header: 'Type' },
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
        { key: 'book_name', header: 'Book' },
        {
            key: 'completed_count',
            header: 'Images',
            render: (val: number) => <span className="text-sm font-semibold text-slate-700">{val}</span>
        },
        {
            key: 'upload_end_date',
            header: 'Completed At',
            sortable: true,
            render: (val: string) => val ? formatToLocalTime(val) : 'N/A'
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <PageHeader
                    title="Master Upload History"
                    description="Full administrative audit trail for all system uploads"
                />

                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleExport}
                        disabled={filteredBatches.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 gap-2 h-9 text-xs font-bold uppercase tracking-wider"
                    >
                        <Download className="h-4 w-4" />
                        Global Export (XLSX)
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-1.5 border-b-4 border-b-indigo-500/10 transition-all hover:shadow-md">
                <div className="flex flex-col gap-2 p-3">
                    {/* Search & Date Range */}
                    <div className="flex flex-wrap items-center gap-4 mb-1">
                        <div className="relative flex-[2] min-w-[320px] group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                placeholder="Master Search Across All Metadata..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 bg-slate-50 border-slate-200/60 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all rounded-xl text-sm font-medium shadow-none"
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-red-500 transition-colors">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-1 min-w-[300px]">
                            <div className="h-11 flex items-center gap-2 px-3 bg-slate-50 border border-slate-200/60 rounded-xl group focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all flex-1">
                                <CalendarIcon className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500" />
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className={cn("text-xs font-bold outline-none flex-1 text-left uppercase tracking-tight", !dateRange && "text-slate-400")}>
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}` : format(dateRange.from, "LLL dd, y")) : "Select Audit Range"}
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

                            {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || vendorFilter !== 'all' || operatorFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all' || bookFilter !== 'all' || uploadTypeFilter !== 'all' || dateRange) && (
                                <Button
                                    variant="ghost"
                                    onClick={resetFilters}
                                    className="h-11 px-4 gap-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-slate-100/80 mx-1 mb-2" />

                    {/* Metadata Filters Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {/* Project */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Project</label>
                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Projects" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Projects</SelectItem>
                                    {projects.map(p => <SelectItem key={p} value={p} className="text-[11px]">{p}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Source */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><Database className="h-3 w-3" /> Source</label>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Sources" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Sources</SelectItem>
                                    {sources.map(s => <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Vendor */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><Briefcase className="h-3 w-3" /> Vendor</label>
                            <Select value={vendorFilter} onValueChange={setVendorFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Vendors" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Vendors</SelectItem>
                                    {vendors.map(v => <SelectItem key={v} value={v} className="text-[11px]">{v}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Operator */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><UserIcon className="h-3 w-3" /> Operator</label>
                            <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Operators" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Operators</SelectItem>
                                    {operators.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Location */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Location</label>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Locations" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Locations</SelectItem>
                                    {locations.map(l => <SelectItem key={l} value={l} className="text-[11px]">{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Owner */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Owner</label>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Owners" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Owners</SelectItem>
                                    {owners.map(o => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Record Type */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><FileText className="h-3 w-3" /> Record Type</label>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Types</SelectItem>
                                    {types.map(t => <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Book Name */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><Book className="h-3 w-3" /> Book Name</label>
                            <Select value={bookFilter} onValueChange={setBookFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Books" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Books</SelectItem>
                                    {books.map(b => <SelectItem key={b} value={b} className="text-[11px]">{b}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Upload Type */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><RefreshCcw className="h-3 w-3" /> Upload Type</label>
                            <Select value={uploadTypeFilter} onValueChange={setUploadTypeFilter}>
                                <SelectTrigger className="h-9 bg-slate-50 border-slate-100 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Upload Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-[11px] font-semibold text-indigo-600">All Upload Types</SelectItem>
                                    {uploadTypes.map(t => <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col justify-center items-center py-32 gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-indigo-600 transition-all" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] animate-pulse">Synchronizing Global History...</p>
                </div>
            ) : filteredBatches.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-20 text-center animate-in fade-in zoom-in duration-300">
                    <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-4">
                        <Filter className="h-8 w-8 text-slate-300" />
                    </div>
                    <p className="text-slate-500 font-medium">No system uploads found matching your specialized criteria.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md">
                    <DataTable
                        data={filteredBatches}
                        columns={columns}
                        searchable={false}
                        emptyMessage="No master batches match your criteria."
                    />
                </div>
            )}

            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-slate-500 text-[11px] mt-4 flex items-center gap-3 backdrop-blur-sm">
                <div className="p-2 bg-indigo-100 rounded-xl">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                    <span className="font-bold text-indigo-900 uppercase tracking-wider block mb-0.5">Administrative Audit Mode</span>
                    <p>You are accessing the global system audit trail. Every transaction, upload event, and metadata record is being tracked and logged under your session ID: <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700 font-bold">{token?.slice(-8)}</code></p>
                </div>
            </div>
        </div>
    );
};

export default AdminUploadHistory;
