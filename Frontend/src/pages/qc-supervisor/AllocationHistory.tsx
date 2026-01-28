import React, { useState, useEffect } from 'react';
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
    Shield,
    CheckCircle,
    Clock,
    UserCheck,
    X
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

interface QCAllocationTask {
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
    total_count: number;
    upload_count: number;
    qc_done_count: number;
    accepted_count: number;
    rejected_count: number;
    qc_user_name: string;
    allocated_by_name: string;
    allocation_date: string;
    qc_completed_date?: string;
    qc_batch_status: string;
    upload_type: string;
}

const AllocationHistory: React.FC = () => {
    const { apiFetch } = useAuth();
    const [allocations, setAllocations] = useState<QCAllocationTask[]>([]);
    const [filteredAllocations, setFilteredAllocations] = useState<QCAllocationTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Filters
    const [projectFilter, setProjectFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [supervisorFilter, setSupervisorFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const { toast } = useToast();

    const fetchAllocationHistory = async () => {
        try {
            setIsLoading(true);
            const res = await apiFetch(`${API_BASE_URL}/qc-sup/allocation-history`);
            if (!res.ok) throw new Error('Failed to fetch allocation history');
            const data = await res.json();
            const mappedData = data.map((t: any) => ({ ...t, id: t.qc_allocation_id }));
            setAllocations(mappedData);
            setFilteredAllocations(mappedData);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Could not load allocation history',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAllocationHistory();
    }, []);

    useEffect(() => {
        let result = [...allocations];

        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            result = result.filter(task =>
                task.batch_id.toLowerCase().includes(lowSearch) ||
                task.project_name.toLowerCase().includes(lowSearch) ||
                task.qc_user_name.toLowerCase().includes(lowSearch) ||
                (task.record_name && task.record_name.toLowerCase().includes(lowSearch))
            );
        }

        if (projectFilter !== 'all') result = result.filter(t => t.project_name === projectFilter);
        if (userFilter !== 'all') result = result.filter(t => t.qc_user_name === userFilter);
        if (supervisorFilter !== 'all') result = result.filter(t => t.allocated_by_name === supervisorFilter);
        if (statusFilter !== 'all') result = result.filter(t => t.qc_batch_status === statusFilter);

        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            result = result.filter(t => {
                if (!t.allocation_date) return false;
                const allocDate = new Date(t.allocation_date);
                return isWithinInterval(allocDate, { start: from, end: to });
            });
        }

        setFilteredAllocations(result);
    }, [searchTerm, allocations, projectFilter, userFilter, supervisorFilter, statusFilter, dateRange]);

    // Derived Filter Options
    const projects = Array.from(new Set(allocations.map(t => t.project_name))).sort();
    const users = Array.from(new Set(allocations.map(t => t.qc_user_name))).sort();
    const supervisors = Array.from(new Set(allocations.map(t => t.allocated_by_name))).sort();
    const statuses = Array.from(new Set(allocations.map(t => t.qc_batch_status))).sort();

    const handleExport = () => {
        if (filteredAllocations.length === 0) {
            toast({ title: 'Export Info', description: 'No history to export' });
            return;
        }

        const exportData = filteredAllocations.map(t => ({
            ...t,
            allocation_date: formatToLocalTime(t.allocation_date),
            qc_completed_date: t.qc_completed_date ? formatToLocalTime(t.qc_completed_date) : 'N/A'
        }));

        exportToExcel(
            exportData,
            'QC_Allocation_History',
            {
                batch_id: 'Batch ID',
                project_name: 'Project',
                record_name: 'Book Name',
                qc_user_name: 'QC User',
                allocated_by_name: 'Allocated By',
                allocation_date: 'Allocation Date',
                total_count: 'Total Images',
                qc_done_count: 'Processed',
                accepted_count: 'Accepted',
                rejected_count: 'Rejected',
                qc_batch_status: 'Current Status',
                qc_completed_date: 'Completed At'
            }
        );
    };

    const handleRevoke = async (allocationId: string, batchId: string) => {
        if (!window.confirm(`Are you sure you want to revoke allocation for batch ${batchId}? This will remove the batch from the QC user and make it available for reallocation. All progress made by the QC user on this batch will be cleared.`)) {
            return;
        }

        try {
            const res = await apiFetch(`${API_BASE_URL}/qc-sup/revoke-allocation/${allocationId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.detail || 'Failed to revoke allocation');
            }

            toast({
                title: 'Success',
                description: `Allocation for batch ${batchId} revoked successfully`,
            });

            fetchAllocationHistory();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive'
            });
        }
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string, item: QCAllocationTask) => (
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
            key: 'record_name',
            header: 'Book Name',
            render: (val: string) => <span className="text-[11px] font-medium text-slate-700 max-w-[150px] truncate block">{val}</span>
        },
        {
            key: 'qc_user_name',
            header: 'QC User',
            render: (val: string) => (
                <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3 w-3 text-indigo-400" />
                    <span className="font-semibold text-slate-700">{val}</span>
                </div>
            )
        },
        {
            key: 'allocated_by_name',
            header: 'Allocated By',
            render: (val: string) => (
                <div className="flex items-center gap-1.5">
                    <UserCheck className="h-3 w-3 text-slate-400" />
                    <span className="text-slate-600 italic text-[11px]">{val}</span>
                </div>
            )
        },
        {
            key: 'allocation_date',
            header: 'Allocated On',
            sortable: true,
            render: (val: string) => <span className="text-[11px]">{formatToLocalTime(val)}</span>
        },
        {
            key: 'qc_batch_status',
            header: 'Status',
            render: (val: string) => {
                let badgeClass = "bg-slate-100 text-slate-700";
                let Icon = Clock;

                if (val === 'Completed') {
                    badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
                    Icon = CheckCircle;
                } else if (val === 'QC_In_Progress') {
                    badgeClass = "bg-blue-100 text-blue-700 border-blue-200";
                    Icon = RefreshCcw;
                } else if (val === 'Allocated' || val === 'QC_Pending') {
                    badgeClass = "bg-amber-100 text-amber-700 border-amber-200";
                    Icon = Clock;
                }

                return (
                    <Badge variant="outline" className={cn("text-[9px] font-bold uppercase gap-1 px-1.5 h-5", badgeClass)}>
                        <Icon className="h-2.5 w-2.5" />
                        {val.replace(/_/g, ' ')}
                    </Badge>
                );
            }
        },
        {
            key: 'progress',
            header: 'QC Progress',
            render: (_: any, item: QCAllocationTask) => {
                const perc = Math.round((item.qc_done_count / (item.total_count || 1)) * 100);
                return (
                    <div className="flex flex-col gap-0.5 min-w-[80px]">
                        <span className="text-[9px] font-bold text-slate-500">{item.qc_done_count}/{item.total_count} ({perc}%)</span>
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full transition-all" style={{ width: `${perc}%` }} />
                        </div>
                    </div>
                );
            }
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_: any, item: QCAllocationTask) => (
                <div className="flex justify-end">
                    {!['Completed', 'Verified', 'Verified_With_Rejection'].includes(item.qc_batch_status) ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevoke(item.qc_allocation_id, item.batch_id)}
                            className="h-7 px-3 text-[10px] font-bold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 gap-1.5 shadow-sm uppercase tracking-tighter"
                        >
                            <X className="h-3 w-3" />
                            Revoke
                        </Button>
                    ) : (
                        <Badge variant="outline" className="text-[9px] font-bold uppercase bg-slate-50 text-slate-500 border-slate-200">
                            <Shield className="h-2.5 w-2.5 mr-1" />
                            Finalized
                        </Badge>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <PageHeader
                    title="Allocation History"
                    description="View complete audit trail of batch assignments to QC users"
                />

                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleExport}
                        disabled={filteredAllocations.length === 0}
                        className="bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 gap-2 h-9 text-xs"
                    >
                        <Download className="h-4 w-4" />
                        Export Audit Log
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchAllocationHistory}
                        disabled={isLoading}
                        className="h-9 gap-2 border-slate-200 text-slate-600 hover:text-indigo-600"
                    >
                        <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Premium Filter Bar */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="space-y-1.5 lg:col-span-1">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-2">
                            Search Batches
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="ID, Book, User..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-9 border-slate-200 focus:ring-indigo-500 text-xs shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase">QC User</Label>
                        <Select value={userFilter} onValueChange={setUserFilter}>
                            <SelectTrigger className="h-9 border-slate-200 bg-white shadow-sm text-xs">
                                <SelectValue placeholder="All Users" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Users</SelectItem>
                                {users.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase">Manager</Label>
                        <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
                            <SelectTrigger className="h-9 border-slate-200 bg-white shadow-sm text-xs">
                                <SelectValue placeholder="All Managers" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Managers</SelectItem>
                                {supervisors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase">Batch Status</Label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-9 border-slate-200 bg-white shadow-sm text-xs">
                                <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                {statuses.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase">Allocation Period</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full h-9 justify-start text-left font-normal border-slate-200 shadow-sm text-xs",
                                        !dateRange && "text-slate-500"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <span className="truncate">
                                                {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}
                                            </span>
                                        ) : (
                                            <span>{format(dateRange.from, "MMM dd")}</span>
                                        )
                                    ) : (
                                        "Select Dates"
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={1}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {(searchTerm || projectFilter !== 'all' || userFilter !== 'all' || supervisorFilter !== 'all' || statusFilter !== 'all' || dateRange) && (
                    <div className="flex justify-end pt-2 border-t border-slate-50">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchTerm('');
                                setProjectFilter('all');
                                setUserFilter('all');
                                setSupervisorFilter('all');
                                setStatusFilter('all');
                                setDateRange(undefined);
                            }}
                            className="h-8 text-slate-500 gap-2 hover:bg-slate-100"
                        >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            Reset All Filters
                        </Button>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-80 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                    <p className="text-slate-500 font-medium">Loading audit logs...</p>
                </div>
            ) : filteredAllocations.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
                    <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Shield className="h-8 w-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">No allocations found</h3>
                    <p className="text-slate-500 max-w-sm mx-auto">We couldn't find any allocation records matching your current filter criteria.</p>
                    <Button
                        variant="link"
                        onClick={() => {
                            setSearchTerm('');
                            setProjectFilter('all');
                            setUserFilter('all');
                            setSupervisorFilter('all');
                            setStatusFilter('all');
                            setDateRange(undefined);
                        }}
                        className="mt-4 text-indigo-600"
                    >
                        Clear all filters
                    </Button>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <DataTable
                        data={filteredAllocations}
                        columns={columns}
                        searchable={false}
                    />
                </div>
            )}
        </div>
    );
};

export default AllocationHistory;
