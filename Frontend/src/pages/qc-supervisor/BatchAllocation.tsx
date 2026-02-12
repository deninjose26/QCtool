import React, { useState, useEffect } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config";
import DataTable from "@/components/common/DataTable";
import PageHeader from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel } from '@/utils/excelExport';
import { formatToLocalTime } from '@/utils/dateUtils';
import { Progress } from '@/components/ui/progress';
import { RefreshCcw } from 'lucide-react';
import {
    Loader2,
    Download,
    Filter,
    X,
    MapPin,
    Building2,
    Search,
    User as UserIcon,
    Database,
    GitBranch,
    FileText,
    Briefcase,
    Users,
    Tag,
    Book,
    Calendar as CalendarIcon
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface QCBatch {
    id: string; // For DataTable
    batch_uid: string;
    batch_id: string;
    project_name: string;
    source_name: string;
    location_name: string;
    record_owner_name: string;
    record_type_name: string;
    record_name: string;
    total_count: number;
    upload_count: number;
    upload_status: string;
    qc_status: string;
    allocated_to_user_name: string;
    upload_type: string;
    created_date: string;
}

interface QCUser {
    user_id: string; // Backend sends user_id
    name: string;
}

const BatchAllocation = () => {
    const { user, apiFetch } = useAuth();
    const { toast } = useToast();
    const [batches, setBatches] = useState<QCBatch[]>([]);
    const [filteredBatches, setFilteredBatches] = useState<QCBatch[]>([]);
    const [qcUsers, setQcUsers] = useState<QCUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<QCBatch | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [ownerFilter, setOwnerFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [bookFilter, setBookFilter] = useState('all');
    const [uploadTypeFilter, setUploadTypeFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();


    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [batchesRes, usersRes] = await Promise.all([
                apiFetch(`${API_BASE_URL}/qc-sup/batches`),
                apiFetch(`${API_BASE_URL}/qc-sup/qc-users`)
            ]);

            if (batchesRes.ok) {
                const data = await batchesRes.json();
                const mappedData = data.map((b: any) => ({ ...b, id: b.batch_uid }));
                setBatches(mappedData);
                // Initial filter to avoid flash of allocated items
                setFilteredBatches(mappedData.filter((b: any) => !b.qc_status || b.qc_status === 'Not Allocated'));
            }
            if (usersRes.ok) {
                const data = await usersRes.json();
                setQcUsers(data);
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
            toast({ title: 'Error', description: 'Failed to fetch batches', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter Logic
    useEffect(() => {
        let result = batches;

        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            result = result.filter(b =>
                b.batch_id.toLowerCase().includes(lowerSearch) ||
                b.project_name.toLowerCase().includes(lowerSearch) ||
                (b.record_name && b.record_name.toLowerCase().includes(lowerSearch))
            );
        }

        if (projectFilter !== 'all') {
            result = result.filter(b => b.project_name === projectFilter);
        }
        if (sourceFilter !== 'all') {
            result = result.filter(b => b.source_name === sourceFilter);
        }
        if (locationFilter !== 'all') {
            result = result.filter(b => b.location_name === locationFilter);
        }
        if (ownerFilter !== 'all') {
            result = result.filter(b => b.record_owner_name === ownerFilter);
        }
        if (typeFilter !== 'all') {
            result = result.filter(b => b.record_type_name === typeFilter);
        }
        if (bookFilter !== 'all') {
            result = result.filter(b => b.record_name === bookFilter);
        }
        if (uploadTypeFilter !== 'all') {
            result = result.filter(b => b.upload_type === uploadTypeFilter);
        }
        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            result = result.filter(b => {
                if (!b.created_date) return false;
                const uploadDate = new Date(b.created_date);
                return isWithinInterval(uploadDate, { start: from, end: to });
            });
        }

        // STRICT FILTER: Only show Unallocated Batches (Empty status or explicitly 'Not Allocated')
        result = result.filter(b => !b.qc_status || b.qc_status === 'Not Allocated');

        setFilteredBatches(result);
    }, [searchTerm, projectFilter, sourceFilter, locationFilter, ownerFilter, typeFilter, bookFilter, uploadTypeFilter, dateRange, batches]);

    const handleExport = () => {
        if (filteredBatches.length === 0) {
            toast({ title: 'Export Info', description: 'No data to export' });
            return;
        }

        const exportData = filteredBatches.map(b => ({
            ...b,
            created_date: formatToLocalTime(b.created_date)
        }));

        exportToExcel(
            exportData,
            'QC_Batch_Allocation',
            {
                batch_id: 'Batch ID',
                project_name: 'Project',
                source_name: 'Source',
                location_name: 'Location',
                record_owner_name: 'Record Owner',
                record_type_name: 'Record Type',
                record_name: 'Book Name',
                total_count: 'Total Images',
                upload_count: 'Uploaded Images',
                upload_status: 'Upload Status',
                qc_status: 'QC Status',
                created_date: 'Uploaded Date'
            }
        );
    };

    const handleAllocateClick = (batch: QCBatch) => {
        setSelectedBatch(batch);
        setSelectedUserId(""); // Reset selection
        setIsDialogOpen(true);
    };

    const handleConfirmAllocate = async () => {
        if (!selectedBatch || !selectedUserId) return;

        try {
            setIsSubmitting(true);
            const res = await apiFetch(`${API_BASE_URL}/qc-sup/allocate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    batch_uid: selectedBatch.batch_uid,
                    qc_user_id: selectedUserId
                })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error.detail || 'Allocation failed');
            }

            toast({ title: 'Success', description: 'Batch allocated successfully' });
            setIsDialogOpen(false);
            fetchData();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to allocate batch', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (value: string, batch: QCBatch) => (
                <span className={cn(
                    "text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border shadow-sm",
                    batch.upload_type === 'Complete' ? "text-emerald-700 bg-emerald-50 border-emerald-100/50" :
                        batch.upload_type === 'Partial' ? "text-blue-700 bg-blue-50 border-blue-100/50" :
                            "text-amber-700 bg-amber-50 border-amber-100/50"
                )}>
                    {value}
                </span>
            )
        },
        {
            key: 'project_name',
            header: 'Project',
            sortable: true,
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'source_name',
            header: 'Source',
            sortable: true,
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'location_name',
            header: 'Location',
            sortable: true,
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'record_owner_name',
            header: 'Record Owner',
            sortable: true,
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        {
            key: 'record_name',
            header: 'Book Name',
            sortable: true,
            render: (value: string) => (
                <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-xs font-semibold text-slate-600 uppercase tracking-tight max-w-[220px] line-clamp-2 leading-relaxed cursor-help">
                                {value}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[300px] text-xs">
                            {value}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )
        },
        {
            key: 'record_type_name',
            header: 'Record Type',
            sortable: true,
            render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
        },
        { key: 'total_count', header: 'Total Images', sortable: true },
        { key: 'upload_count', header: 'Uploaded', sortable: true },
        {
            key: 'upload_status',
            header: 'Upload Type',
            render: (_: any, batch: QCBatch) => {
                const type = batch.upload_type || 'Complete';
                return (
                    <Badge variant="outline" className={cn(
                        "text-[10px] font-bold uppercase",
                        type === 'Complete' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                            type === 'Partial' ? "bg-blue-100 text-blue-700 border-blue-200" :
                                "bg-amber-100 text-amber-700 border-amber-200"
                    )}>
                        {type}
                    </Badge>
                );
            }
        },
        {
            key: 'created_date',
            header: 'Uploaded On',
            render: (value: string) => formatToLocalTime(value)
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, batch: QCBatch) => (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100/50"
                    onClick={() => handleAllocateClick(batch)}
                >
                    <GitBranch className="h-4 w-4" />
                    <span>Allocate</span>
                </Button>
            )
        }
    ];

    // Options for filters
    const projects = Array.from(new Set(batches.map(b => b.project_name))).sort();
    const sources = Array.from(new Set(batches.map(b => b.source_name))).sort();
    const locations = Array.from(new Set(batches.map(b => b.location_name))).sort();
    const owners = Array.from(new Set(batches.filter(b => b.record_owner_name).map(b => b.record_owner_name))).sort();
    const types = Array.from(new Set(batches.filter(b => b.record_type_name).map(b => b.record_type_name))).sort();
    const bookNames = Array.from(new Set(batches.filter(b => b.record_name).map(b => b.record_name))).sort();
    const uploadTypes = Array.from(new Set(batches.filter(b => b.upload_type).map(b => b.upload_type))).sort();

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <PageHeader
                title="Batch Allocation"
                description="Allocate uploaded batches to quality control team members"
                action={{
                    label: 'Export to Excel',
                    onClick: handleExport,
                    icon: <Download className="h-4 w-4 mr-2" />
                }}
            />

            {/* Premium Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex-1 space-y-1.5 text-left">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-2">
                            <Search className="h-3 w-3" /> Search Batches
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search by ID, Book, Project..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-9 border-slate-200 focus:ring-indigo-500 shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-[220px] space-y-1.5 text-left">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-2">
                            <CalendarIcon className="h-3 w-3" /> Upload Period
                        </Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full h-9 justify-start text-left font-normal border-slate-200 shadow-sm",
                                        !dateRange && "text-slate-500"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y")
                                        )
                                    ) : (
                                        "Select Date Range"
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <CalendarPicker
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all' || bookFilter !== 'all' || uploadTypeFilter !== 'all' || dateRange) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchTerm('');
                                setProjectFilter('all');
                                setSourceFilter('all');
                                setLocationFilter('all');
                                setOwnerFilter('all');
                                setTypeFilter('all');
                                setBookFilter('all');
                                setUploadTypeFilter('all');
                                setDateRange(undefined);
                            }}
                            className="h-9 text-slate-500 gap-2 hover:bg-slate-100"
                        >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            Reset
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-3 pt-2 border-t border-slate-50">
                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Project</Label>
                        <Select value={projectFilter} onValueChange={setProjectFilter}>
                            <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50">
                                <SelectValue placeholder="All Projects" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Projects</SelectItem>
                                {projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Source</Label>
                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                            <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50">
                                <SelectValue placeholder="All Sources" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sources</SelectItem>
                                {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Location</Label>
                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                            <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50">
                                <SelectValue placeholder="All Locations" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Locations</SelectItem>
                                {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Record Owner</Label>
                        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                            <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50">
                                <SelectValue placeholder="All Record Owners" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Record Owners</SelectItem>
                                {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Book</Label>
                        <Select value={bookFilter} onValueChange={setBookFilter}>
                            <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50">
                                <SelectValue placeholder="All Books" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Books</SelectItem>
                                {bookNames.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Type</Label>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 text-left">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase">Upload Type</Label>
                        <Select value={uploadTypeFilter} onValueChange={setUploadTypeFilter}>
                            <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50">
                                <SelectValue placeholder="All Upload Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Upload Types</SelectItem>
                                {uploadTypes.map(ut => <SelectItem key={ut} value={ut}>{ut}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                    </div>
                )}
                <DataTable
                    data={filteredBatches}
                    columns={columns}
                    searchable={false}
                />
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <GitBranch className="h-5 w-5 text-indigo-600" />
                            Allocate Batch
                        </DialogTitle>
                        <DialogDescription>
                            Assign batch <span className="font-semibold text-slate-900">{selectedBatch?.batch_id}</span> to a quality control team member.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 flex flex-col gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="qc-user" className="text-sm font-medium">Select QC User</Label>
                            <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                                <SelectTrigger id="qc-user" className="w-full">
                                    <SelectValue placeholder="Choose a member..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {qcUsers.length === 0 ? (
                                        <SelectItem value="none" disabled>No QC users found</SelectItem>
                                    ) : (
                                        qcUsers.map((u) => (
                                            <SelectItem key={u.user_id} value={u.user_id}>
                                                {u.name}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedBatch && (
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Project:</span>
                                    <span className="font-medium text-slate-700">{selectedBatch.project_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Source:</span>
                                    <span className="font-medium text-slate-700">{selectedBatch.source_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Images:</span>
                                    <span className="font-medium text-slate-700">{selectedBatch.total_count}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-10" disabled={isSubmitting}>Cancel</Button>
                        <Button
                            onClick={handleConfirmAllocate}
                            disabled={!selectedUserId || isSubmitting}
                            className="h-10 bg-indigo-600 hover:bg-indigo-700 gap-2 min-w-[150px]"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Allocating...</span>
                                </>
                            ) : (
                                "Confirm Allocation"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default BatchAllocation;
