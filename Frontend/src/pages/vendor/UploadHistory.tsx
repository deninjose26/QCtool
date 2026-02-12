import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import {
    Loader2,
    FileText,
    Info,
    Download,
    Filter,
    RefreshCcw,
    Calendar as CalendarIcon,
    X,
    MapPin,
    Building2,
    Search,
    User as UserIcon,
    Database,
    Book,
    Eye
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

interface VendorBatch {
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
    operator_name: string;
    upload_type: string;
    status: 'pending' | 'uploading' | 'uploaded';
    upload_end_date?: string;
}

const VendorUploadHistory: React.FC = () => {
    const navigate = useNavigate();
    const [batches, setBatches] = useState<VendorBatch[]>([]);
    const [filteredBatches, setFilteredBatches] = useState<VendorBatch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const token = localStorage.getItem('qc_token');

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [ownerFilter, setOwnerFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [operatorFilter, setOperatorFilter] = useState<string>('all');
    const [bookFilter, setBookFilter] = useState<string>('all');
    const [uploadTypeFilter, setUploadTypeFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [isExporting, setIsExporting] = useState(false);

    // Derived Filter Options
    const projects = Array.from(new Set(batches.map(b => b.project_name))).sort();
    const sources = Array.from(new Set(batches.map(b => b.source_name))).sort();
    const locations = Array.from(new Set(batches.map(b => b.location_name))).sort();
    const owners = Array.from(new Set(batches.map(b => b.record_owner_name))).sort();
    const recordTypes = Array.from(new Set(batches.map(b => b.record_type_name))).sort();
    const books = Array.from(new Set(batches.map(b => b.book_name))).sort();
    const operators = Array.from(new Set(batches.map(b => b.operator_name))).sort();
    const uploadTypes = Array.from(new Set(batches.map(b => b.upload_type))).sort();

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setIsLoading(true);
            if (!token) return;

            // Vendor API on port 8003
            const res = await fetch(`${API_BASE_URL}/vendor/batches`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

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
            toast({ title: 'Error', description: 'Failed to load upload history', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    // Apply filters and search
    useEffect(() => {
        let result = [...batches];

        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            result = result.filter(item =>
                Object.values(item).some(val =>
                    val && val.toString().toLowerCase().includes(lowSearch)
                )
            );
        }

        if (projectFilter !== 'all') result = result.filter(b => b.project_name === projectFilter);
        if (sourceFilter !== 'all') result = result.filter(b => b.source_name === sourceFilter);
        if (locationFilter !== 'all') result = result.filter(b => b.location_name === locationFilter);
        if (ownerFilter !== 'all') result = result.filter(b => b.record_owner_name === ownerFilter);
        if (typeFilter !== 'all') result = result.filter(b => b.record_type_name === typeFilter);
        if (bookFilter !== 'all') result = result.filter(b => b.book_name === bookFilter);
        if (operatorFilter !== 'all') result = result.filter(b => b.operator_name === operatorFilter);
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
    }, [batches, searchTerm, projectFilter, sourceFilter, locationFilter, ownerFilter, typeFilter, bookFilter, operatorFilter, uploadTypeFilter, dateRange]);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            await new Promise(resolve => setTimeout(resolve, 800));
            const exportData = filteredBatches.map(b => ({
                batch_id: b.batch_id,
                project: b.project_name,
                source: b.source_name,
                location: b.location_name,
                owner: b.record_owner_name,
                record_type: b.record_type_name,
                upload_type: b.upload_type,
                operator: b.operator_name,
                book: b.book_name,
                images: b.completed_count,
                completed_at: formatToLocalTime(b.upload_end_date)
            }));

            const headers = {
                batch_id: 'Batch ID',
                project: 'Project',
                source: 'Source',
                location: 'Location',
                owner: 'Record Owner',
                record_type: 'Record Type',
                upload_type: 'Upload Type',
                operator: 'Operator',
                book: 'Book Name',
                images: 'Total Images',
                completed_at: 'Completion Date'
            };

            exportToExcel(exportData, 'Vendor_Upload_History', headers);
            toast({ title: 'Export Success', description: `Successfully exported ${filteredBatches.length} records.` });
        } catch (error) {
            toast({ title: 'Export Failed', description: 'Could not generate report.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const resetFilters = () => {
        setSearchTerm('');
        setProjectFilter('all');
        setSourceFilter('all');
        setLocationFilter('all');
        setOwnerFilter('all');
        setTypeFilter('all');
        setBookFilter('all');
        setOperatorFilter('all');
        setUploadTypeFilter('all');
        setDateRange(undefined);
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string, item: VendorBatch) => {
                const colors: Record<string, string> = {
                    'Complete': 'text-emerald-600',
                    'Partial': 'text-blue-600',
                    'Re-upload': 'text-amber-600'
                };
                return <code className={cn("text-xs font-bold", colors[item.upload_type] || "text-primary")}>{val}</code>;
            }
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
        { key: 'operator_name', header: 'Operator' },
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
            key: 'upload_type',
            header: 'Upload Type',
            render: (val: string) => (
                <Badge variant="outline" className={cn(
                    "text-[10px] font-bold uppercase",
                    val === 'Complete' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        val === 'Partial' ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-amber-50 text-amber-700 border-amber-200"
                )}>
                    {val}
                </Badge>
            )
        },
        {
            key: 'book_name',
            header: 'Book',
            render: (val: string) => <span className="text-[10px] font-black text-slate-700 max-w-[120px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'count',
            header: 'Images',
            render: (_: any, item: VendorBatch) => (
                <span className="text-sm font-semibold">{item.completed_count}</span>
            )
        },
        {
            key: 'upload_end_date',
            header: 'Completed At',
            render: (val: string) => formatToLocalTime(val)
        },
        {
            key: 'status',
            header: 'Status',
            render: (value: string) => <StatusBadge status={value as any} />
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: VendorBatch) => (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate(`/vendor/image-preview/${item.batch_uid}`)}
                    className="hover:text-primary transition-all duration-200"
                    title="Preview Images"
                >
                    <Eye className="h-4 w-4" />
                </Button>
            )
        }
    ];

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
                <PageHeader title="Vendor Upload History" description="Monitor all batch uploads by your operators" />
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        "text-white h-9 font-semibold text-xs gap-2 shadow-sm border-none transition-all px-4",
                        filteredBatches.length > 0
                            ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                            : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    )}
                    onClick={handleExport}
                    disabled={isExporting || filteredBatches.length === 0}
                >
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Download className="h-4 w-4" />}
                    Export to Excel
                </Button>
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
                                placeholder="Search by Batch ID, Operator, Book Name..."
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
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}` : format(dateRange.from, "LLL dd")) : "Filter by Upload Date"}
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

                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-11 px-4 gap-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all",
                                    filteredBatches.length > 0
                                        ? "bg-emerald-600/10 border-emerald-600/20 text-emerald-700 hover:bg-emerald-600/20"
                                        : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                )}
                                onClick={handleExport}
                                disabled={isExporting || filteredBatches.length === 0}
                            >
                                {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                Export
                            </Button>

                            {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all' || operatorFilter !== 'all' || bookFilter !== 'all' || uploadTypeFilter !== 'all' || dateRange) && (
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

                    {/* Bottom Tier: Metadata Filter Grid (Compact) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2">
                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Filter className="h-3 w-3" />
                            </div>
                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Project" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Project</SelectItem>
                                    {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Database className="h-3 w-3" />
                            </div>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Source" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Source</SelectItem>
                                    {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <MapPin className="h-3 w-3" />
                            </div>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Location" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Location</SelectItem>
                                    {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Building2 className="h-3 w-3" />
                            </div>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Owner" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Owner</SelectItem>
                                    {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <FileText className="h-3 w-3" />
                            </div>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Type</SelectItem>
                                    {recordTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Book className="h-3 w-3" />
                            </div>
                            <Select value={bookFilter} onValueChange={setBookFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Book" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Book</SelectItem>
                                    {books.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <UserIcon className="h-3 w-3" />
                            </div>
                            <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Operator" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Operator</SelectItem>
                                    {operators.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <RefreshCcw className="h-3 w-3" />
                            </div>
                            <Select value={uploadTypeFilter} onValueChange={setUploadTypeFilter}>
                                <SelectTrigger className="h-8 pl-8 bg-white border-slate-200/50 rounded-lg text-[10px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Mode</SelectItem>
                                    {uploadTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col justify-center items-center py-20 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium text-muted-foreground">Loading history...</p>
                </div>
            ) : (
                <DataTable data={filteredBatches} columns={columns} searchable={false} emptyMessage="No batches match your filters." />
            )}

            <div className="p-4 bg-muted/30 border rounded-lg text-muted-foreground text-xs mt-4 flex items-center gap-2">
                <Info className="h-4 w-4" />
                <p>This history shows batches uploaded by scanning operators managed by your organization.</p>
            </div>
        </div >
    );
};

export default VendorUploadHistory;
