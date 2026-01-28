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
    Eye,
    AlertCircle,
    UserCog,
    CheckCircle
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

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
    vendor_approved: boolean;
    upload_end_date?: string;
}

interface Operator {
    user_id: string;
    name: string;
    username: string;
}

const ReworkBatches: React.FC = () => {
    const navigate = useNavigate();
    const [batches, setBatches] = useState<VendorBatch[]>([]);
    const [filteredBatches, setFilteredBatches] = useState<VendorBatch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const token = localStorage.getItem('qc_token');

    // Reallocation States
    const [isReallocateOpen, setIsReallocateOpen] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<VendorBatch | null>(null);
    const [availableOperators, setAvailableOperators] = useState<Operator[]>([]);
    const [newOperatorId, setNewOperatorId] = useState<string>('');
    const [isReallocating, setIsReallocating] = useState(false);

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [approvalFilter, setApprovalFilter] = useState<string>('pending'); // Default: Show awaiting approval
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [ownerFilter, setOwnerFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [operatorFilter, setOperatorFilter] = useState<string>('all');
    const [bookFilter, setBookFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    useEffect(() => {
        fetchReworkHistory();
        fetchOperators();
    }, []);

    const fetchReworkHistory = async () => {
        try {
            setIsLoading(true);
            if (!token) return;

            const res = await fetch(`${API_BASE_URL}/vendor/rework-batches`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch rework batches');

            const data = await res.json();
            const mappedData = data.map((item: any) => ({
                ...item,
                id: item.batch_uid
            }));

            setBatches(mappedData);
        } catch (err) {
            console.error(err);
            toast({ title: 'Error', description: 'Failed to load rework batches', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    const fetchOperators = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/vendor/operators`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableOperators(data);
            }
        } catch (err) {
            console.error('Failed to fetch operators', err);
        }
    };

    const handleApproveBatch = async (batchUid: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/vendor/approve-rework/${batchUid}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to approve batch');

            toast({ title: 'Success', description: 'Batch released to operator' });
            fetchReworkHistory();
        } catch (err) {
            toast({ title: 'Error', description: 'Could not approve batch', variant: 'destructive' });
        }
    };

    const handleReallocate = async () => {
        if (!selectedBatch || !newOperatorId) return;

        try {
            setIsReallocating(true);
            const res = await fetch(`${API_BASE_URL}/vendor/reallocate-batch/${selectedBatch.batch_uid}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ operator_id: newOperatorId })
            });

            if (!res.ok) throw new Error('Reallocation failed');

            toast({ title: 'Success', description: 'Batch reallocated successfully' });
            setIsReallocateOpen(false);
            fetchReworkHistory(); // Refresh table
        } catch (err) {
            toast({ title: 'Error', description: 'Could not reallocate batch', variant: 'destructive' });
        } finally {
            setIsReallocating(false);
        }
    };

    const openReallocateDialog = (batch: VendorBatch) => {
        setSelectedBatch(batch);
        setNewOperatorId('');
        setIsReallocateOpen(true);
    };

    // Derived Filter Options
    const projects = Array.from(new Set(batches.map(b => b.project_name))).sort();
    const sources = Array.from(new Set(batches.map(b => b.source_name))).sort();
    const locations = Array.from(new Set(batches.map(b => b.location_name))).sort();
    const owners = Array.from(new Set(batches.map(b => b.record_owner_name))).sort();
    const recordTypes = Array.from(new Set(batches.map(b => b.record_type_name))).sort();
    const books = Array.from(new Set(batches.map(b => b.book_name))).sort();
    const operators = Array.from(new Set(batches.map(b => b.operator_name))).sort();

    // Apply filters and search
    useEffect(() => {
        let result = [...batches];

        // EXCLUDE completed uploads entirely
        result = result.filter(b => b.status !== 'uploaded');

        // Apply approval status filtering
        if (approvalFilter === 'pending') {
            result = result.filter(b => !b.vendor_approved);
        } else if (approvalFilter === 'approved') {
            result = result.filter(b => b.vendor_approved);
        }
        // 'all' shows both

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
    }, [batches, approvalFilter, searchTerm, projectFilter, sourceFilter, locationFilter, ownerFilter, typeFilter, bookFilter, operatorFilter, dateRange]);

    const handleExport = () => {
        const exportData = filteredBatches.map(b => ({
            batch_id: b.batch_id,
            project: b.project_name,
            source: b.source_name,
            location: b.location_name,
            owner: b.record_owner_name,
            record_type: b.record_type_name,
            operator: b.operator_name,
            book: b.book_name,
            rejected_images: b.target_count,
            reuploaded_images: b.completed_count,
            status: b.status,
            completed_at: b.upload_end_date ? formatToLocalTime(b.upload_end_date) : 'Pending'
        }));

        const headers = {
            batch_id: 'Batch ID',
            project: 'Project',
            source: 'Source',
            location: 'Location',
            owner: 'Record Owner',
            record_type: 'Record Type',
            operator: 'Operator',
            book: 'Book Name',
            rejected_images: 'Rejected Images (Total)',
            reuploaded_images: 'Re-uploaded Images',
            status: 'Current Status',
            completed_at: 'Re-upload Date'
        };

        exportToExcel(exportData, 'Vendor_Rework_Queue', headers);
    };

    const resetFilters = () => {
        setSearchTerm('');
        setApprovalFilter('all');
        setProjectFilter('all');
        setSourceFilter('all');
        setLocationFilter('all');
        setOwnerFilter('all');
        setTypeFilter('all');
        setBookFilter('all');
        setOperatorFilter('all');
        setDateRange(undefined);
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string, item: VendorBatch) => (
                <div className="flex flex-col gap-1">
                    <code className="text-xs font-bold text-indigo-600">{val}</code>
                    {!item.vendor_approved ? (
                        <Badge className="w-fit px-1.5 py-0 text-[9px] bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-50 shadow-none font-black uppercase">
                            Awaiting your Approval
                        </Badge>
                    ) : (
                        <Badge className="w-fit px-1.5 py-0 text-[10px] bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50 shadow-none font-black uppercase">
                            Released to Operator
                        </Badge>
                    )}
                </div>
            )
        },
        { key: 'project_name', header: 'Project' },
        { key: 'source_name', header: 'Source' },
        { key: 'location_name', header: 'Location' },
        { key: 'record_owner_name', header: 'Owner' },
        { key: 'record_type_name', header: 'Type' },
        {
            key: 'operator_name',
            header: 'Upload Operator',
            render: (val: string) => (
                <div className="flex items-center gap-2">
                    <UserIcon className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-medium text-slate-700">{val}</span>
                </div>
            )
        },
        {
            key: 'count',
            header: 'Rework Progress',
            render: (_: any, item: VendorBatch) => (
                <div className="flex flex-col gap-0.5 min-w-[100px]">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                        {item.completed_count} / {item.target_count}
                    </span>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full transition-all duration-500",
                                item.status === 'uploaded' ? "bg-emerald-500" : "bg-indigo-500"
                            )}
                            style={{ width: `${(item.completed_count / item.target_count) * 100}%` }}
                        />
                    </div>
                </div>
            )
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
                <div className="flex items-center gap-2">
                    {!item.vendor_approved && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApproveBatch(item.batch_uid)}
                            className="h-8 px-3 gap-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 border-none shadow-sm font-bold"
                            title="Release to Operator"
                        >
                            <CheckCircle className="h-4 w-4" />
                            Release to Operator
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openReallocateDialog(item)}
                        className="h-8 w-8 text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 shadow-sm"
                        title="Reassign to another operator"
                    >
                        <UserCog className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={item.status !== 'uploaded'}
                        onClick={() => navigate(`/vendor/image-preview/${item.batch_uid}`)}
                        className="h-8 w-8 hover:text-indigo-600"
                        title="Preview fixed images"
                    >
                        <Eye className="h-4 w-4" />
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="Re-upload Queue (Rework)"
                    description="Monitor batches with rejected images requiring operator correction"
                />
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={fetchReworkHistory}
                        className="gap-2"
                        disabled={isLoading}
                    >
                        <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button onClick={handleExport} disabled={filteredBatches.length === 0} className="gap-2 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20">
                        <Download className="h-4 w-4" /> Export Master
                    </Button>
                </div>
            </div>

            {/* Premium Filter Control Center */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-1.5 border-b-4 border-b-indigo-500/10">
                <div className="flex flex-col gap-1.5 p-3">
                    {/* Top Row: Search and Date Range */}
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[320px] group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                placeholder="Search by Batch ID, Book Name, Project..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 bg-slate-50 border-slate-200/60 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all rounded-xl text-sm font-medium"
                            />
                        </div>

                        <div className="flex items-center gap-2 flex-none">
                            <div className="h-11 flex items-center gap-2 px-3 bg-slate-50 border border-slate-200/60 rounded-xl group focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all min-w-[280px]">
                                <CalendarIcon className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500" />
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className={cn("text-sm font-semibold outline-none flex-1 text-left", !dateRange && "text-slate-400")}>
                                            {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}` : format(dateRange.from, "LLL dd")) : "Re-upload Date Range"}
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

                            {(searchTerm || approvalFilter !== 'all' || projectFilter !== 'all' || sourceFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all' || bookFilter !== 'all' || operatorFilter !== 'all' || dateRange) && (
                                <Button
                                    variant="ghost"
                                    onClick={resetFilters}
                                    className="h-11 px-4 gap-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-xs uppercase tracking-wider"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Clear All
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-slate-100/80 mx-1 my-1" />

                    {/* Bottom Row: Metadata Selects */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
                        {/* 1. Project */}
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Building2 className="h-3.5 w-3.5" />
                            </div>
                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Projects" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Project</SelectItem>
                                    {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 2. Source */}
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Database className="h-3.5 w-3.5" />
                            </div>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Sources" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Source</SelectItem>
                                    {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 3. Operator */}
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <UserIcon className="h-3.5 w-3.5" />
                            </div>
                            <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Operators" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Operator</SelectItem>
                                    {operators.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 4. Location */}
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <MapPin className="h-3.5 w-3.5" />
                            </div>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Locations" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Location</SelectItem>
                                    {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 5. Record Owner */}
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <UserIcon className="h-3.5 w-3.5" />
                            </div>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Owners" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Owner</SelectItem>
                                    {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 6. Record Type */}
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <FileText className="h-3.5 w-3.5" />
                            </div>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Type</SelectItem>
                                    {recordTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 7. Approval Status */}
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <CheckCircle className="h-3.5 w-3.5" />
                            </div>
                            <Select value={approvalFilter} onValueChange={setApprovalFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                                    <SelectValue placeholder="Approval Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Batches</SelectItem>
                                    <SelectItem value="pending">⏳ Awaiting Approval</SelectItem>
                                    <SelectItem value="approved">✅ Released to Operator</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Section */}
            <div>
                {
                    isLoading ? (
                        <div className="flex flex-col justify-center items-center py-32 gap-4">
                            <Loader2 className="h-12 w-12 animate-spin text-indigo-500" />
                            <p className="text-sm font-semibold text-slate-500 animate-pulse">Scanning rework queue...</p>
                        </div>
                    ) : filteredBatches.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-20 flex flex-col items-center text-center gap-4 shadow-inner">
                            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
                                <AlertCircle className="h-8 w-8 text-slate-300" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-700">No Rework Batches Found</h3>
                                <p className="text-sm text-slate-500 max-w-md mx-auto">
                                    {approvalFilter === 'pending'
                                        ? 'No batches awaiting approval. All rework tasks have been released to operators.'
                                        : approvalFilter === 'approved'
                                            ? 'No operators are currently working on rework batches.'
                                            : 'No rework batches match your current filters. Try adjusting your search criteria.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <DataTable data={filteredBatches} columns={columns} searchable={false} />
                        </div>
                    )
                }

                {/* Reallocate Dialog */}
                <Dialog open={isReallocateOpen} onOpenChange={setIsReallocateOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <UserCog className="h-5 w-5 text-amber-600" />
                                Reallocate Batch
                            </DialogTitle>
                            <DialogDescription>
                                Assign this rework task to an operator. This will also <strong>release</strong> the batch to their active queue.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Current Operator</label>
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700">
                                    {selectedBatch?.operator_name}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Select New Operator</label>
                                <Select value={newOperatorId} onValueChange={setNewOperatorId}>
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Choose an operator..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableOperators
                                            .filter(op => op.name !== selectedBatch?.operator_name)
                                            .map(op => (
                                                <SelectItem key={op.user_id} value={op.user_id}>
                                                    {op.name} ({op.username})
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsReallocateOpen(false)} disabled={isReallocating}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleReallocate}
                                disabled={!newOperatorId || isReallocating}
                                className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                            >
                                {isReallocating && <Loader2 className="h-4 w-4 animate-spin" />}
                                Confirm Reallocation
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3 shadow-inner">
                    <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-sm font-bold text-amber-900">Important Note for Vendors</p>
                        <p className="text-xs text-amber-800 leading-relaxed">
                            The batches listed here are <strong>rework tasks</strong> generated automatically after Supervisor Verification.
                            They represent rejected images that must be re-scanned or corrected and then re-uploaded by your operators.
                            You can reallocate these batches to any of your active operators if the original operator is unavailable.
                        </p>
                    </div>
                </div>
            </div >
        </div>
    );
};

export default ReworkBatches;
