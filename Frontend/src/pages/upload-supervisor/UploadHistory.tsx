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
    Briefcase,
    ShieldCheck,
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

interface SupBatch {
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

const SupervisorUploadHistory: React.FC = () => {
    const navigate = useNavigate();
    const [batches, setBatches] = useState<SupBatch[]>([]);
    const [filteredBatches, setFilteredBatches] = useState<SupBatch[]>([]);
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

    // Derived Filter Options
    const projects = Array.from(new Set(batches.map(b => b.project_name))).sort();
    const sources = Array.from(new Set(batches.map(b => b.source_name))).sort();
    const vendors = Array.from(new Set(batches.map(b => b.vendor_name))).sort();
    const operators = Array.from(new Set(batches.map(b => b.operator_name))).sort();
    const locations = Array.from(new Set(batches.map(b => b.location_name))).sort();
    const entities = Array.from(new Set(batches.map(b => b.record_owner_name))).sort();
    const types = Array.from(new Set(batches.map(b => b.record_type_name))).sort();
    const books = Array.from(new Set(batches.map(b => b.book_name))).sort();
    const uploadTypes = Array.from(new Set(batches.map(b => b.upload_type))).sort();

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setIsLoading(true);
            if (!token) return;

            // Supervisor API on port 8003 (shares with vendors but different path)
            const res = await fetch(`${API_BASE_URL}/upload-sup/batches`, {
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

        exportToExcel(exportData, 'Supervisor_Upload_History', headers);
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
        { key: 'project_name', header: 'Project', sortable: true },
        { key: 'source_name', header: 'Source', sortable: true },
        { key: 'location_name', header: 'Location', sortable: true },
        { key: 'record_owner_name', header: 'Owner', sortable: true },
        { key: 'record_type_name', header: 'Type', sortable: true },
        { key: 'book_name', header: 'Book', sortable: true },
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string, item: SupBatch) => (
                <code className={cn(
                    "text-xs font-bold px-1.5 py-0.5 rounded shadow-sm",
                    item.upload_type === 'Complete' ? "text-emerald-700 bg-emerald-50 border border-emerald-100/50" :
                        item.upload_type === 'Partial' ? "text-blue-700 bg-blue-50 border border-blue-100/50" :
                            "text-amber-700 bg-amber-50 border border-amber-100/50"
                )}>
                    {val}
                </code>
            )
        },
        { key: 'vendor_name', header: 'Vendor', sortable: true },
        { key: 'operator_name', header: 'Operator', sortable: true },
        {
            key: 'upload_type',
            header: 'Upload Type',
            render: (val: string) => (
                <Badge variant="outline" className={cn(
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
            key: 'count',
            header: 'Images',
            render: (_: any, item: SupBatch) => (
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
            render: (_: any, item: SupBatch) => (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate(`/supervisor/image-preview/${item.batch_uid}`)}
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
                <PageHeader title="Upload Manager History" description="Global monitor for all vendor uploads and batch status" />
                <Button onClick={handleExport} disabled={filteredBatches.length === 0} className="gap-2 bg-green-600 hover:bg-green-700">
                    <Download className="h-4 w-4" /> Export All
                </Button>
            </div>

            <div className="p-4 bg-background border rounded-xl shadow-sm space-y-4">
                <div className="flex flex-wrap items-end gap-3 pb-2 border-b">
                    <div className="space-y-1.5 flex-[2] min-w-[300px]">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Search className="h-3 w-3" /> Search</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search everything..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-muted/30 border-none h-10 shadow-inner"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-[250px]">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5">
                            <CalendarIcon className="h-3 w-3" /> Date Range
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10 shadow-inner", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}` : format(dateRange.from, "LLL dd, y")) : <span>Pick a date range</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || vendorFilter !== 'all' || operatorFilter !== 'all' || uploadTypeFilter !== 'all' || bookFilter !== 'all' || dateRange) && (
                        <Button variant="ghost" onClick={resetFilters} className="h-10 text-muted-foreground flex gap-2">
                            <X className="h-4 w-4" /> Reset Filters
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Filter className="h-3 w-3" /> Project</label>
                        <Select value={projectFilter} onValueChange={setProjectFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Projects</SelectItem>
                                {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Database className="h-3 w-3" /> Source</label>
                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sources</SelectItem>
                                {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Briefcase className="h-3 w-3" /> Vendor</label>
                        <Select value={vendorFilter} onValueChange={setVendorFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Vendors</SelectItem>
                                {vendors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><UserIcon className="h-3 w-3" /> Operator</label>
                        <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Operators</SelectItem>
                                {operators.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><MapPin className="h-3 w-3" /> Location</label>
                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Locations</SelectItem>
                                {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Building2 className="h-3 w-3" /> Owner</label>
                        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Owners</SelectItem>
                                {entities.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><FileText className="h-3 w-3" /> Type</label>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><Book className="h-3 w-3" /> Book Name</label>
                        <Select value={bookFilter} onValueChange={setBookFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50 transition-colors"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Books</SelectItem>
                                {books.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 min-w-[150px]">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 px-0.5"><RefreshCcw className="h-3 w-3" /> Upload Type</label>
                        <Select value={uploadTypeFilter} onValueChange={setUploadTypeFilter}>
                            <SelectTrigger className="h-10 border-none bg-muted/50"><SelectValue placeholder="All" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Upload Types</SelectItem>
                                {uploadTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col justify-center items-center py-20 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium text-muted-foreground">Loading global history...</p>
                </div>
            ) : (
                <DataTable data={filteredBatches} columns={columns} searchable={false} emptyMessage="No global batches match your filters." />
            )}

            <div className="p-4 bg-muted/30 border rounded-lg text-muted-foreground text-xs mt-4 flex items-center gap-2">
                <Info className="h-4 w-4" />
                <p>Global monitor visibility enabled. You are viewing live upload feeds across all vendors and projects.</p>
            </div>
        </div >
    );
};

export default SupervisorUploadHistory;
