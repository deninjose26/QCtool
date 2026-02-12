import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/config';
import { Database, Search, X, Activity, Users, Calendar as CalendarIcon, TrendingUp, Download, FileSpreadsheet, AlertTriangle, RefreshCcw } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

interface AuditLog {
    id: string; // Required by DataTable
    log_id: number;
    user_id: string;
    username: string;
    action: string;
    endpoint: string | null;
    method: string | null;
    ip_address: string | null;
    payload: string | null;
    result: string | null;
    timestamp: string;
}

interface AuditStats {
    total_logs: number;
    unique_users: number;
    unique_actions: number;
    logs_today: number;
}

const AuditLogs: React.FC = () => {
    const { apiFetch } = useAuth();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [stats, setStats] = useState<AuditStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userFilter, setUserFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        fetchLogs();
        fetchStats();
    }, [dateRange]);

    const fetchLogs = async () => {
        try {
            setIsLoading(true);
            let url = `${API_BASE_URL}/admin/audit-logs?`;

            if (dateRange?.from) {
                const fromStr = format(startOfDay(dateRange.from), 'yyyy-MM-dd');
                url += `start_date=${fromStr}&`;
            }
            if (dateRange?.to) {
                const toStr = format(endOfDay(dateRange.to), 'yyyy-MM-dd');
                url += `end_date=${toStr}&`;
            } else if (dateRange?.from) {
                const toStr = format(endOfDay(dateRange.from), 'yyyy-MM-dd');
                url += `end_date=${toStr}&`;
            }

            const res = await apiFetch(url);
            if (res.ok) {
                const data = await res.json();
                // Add id field for DataTable
                const logsWithId = data.map((log: any) => ({
                    ...log,
                    id: log.log_id.toString()
                }));
                setLogs(logsWithId);
            }
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await apiFetch(`${API_BASE_URL}/admin/audit-logs/stats`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const resetFilters = () => {
        setUserFilter('all');
        setActionFilter('all');
        setStatusFilter('all');
        setSearchQuery('');
        setDateRange(undefined);
    };

    const handleExport = async () => {
        try {
            setIsExporting(true);
            const res = await apiFetch(`${API_BASE_URL}/admin/audit-logs/export`);
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit_logs_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast.success('Audit logs exported successfully');
            } else {
                toast.error('Failed to export audit logs');
            }
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('An error occurred during export');
        } finally {
            setIsExporting(false);
        }
    };

    // Filter logs
    const filteredLogs = logs.filter(log => {
        const matchesUser = userFilter === 'all' || log.username.toLowerCase().includes(userFilter.toLowerCase());
        const matchesAction = actionFilter === 'all' || log.action.toLowerCase().includes(actionFilter.toLowerCase());
        const matchesSearch = !searchQuery ||
            log.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (log.payload && log.payload.toLowerCase().includes(searchQuery.toLowerCase()));

        // Status filter logic
        let matchesStatus = true;
        if (statusFilter !== 'all') {
            const status = log.result?.toLowerCase();
            const action = log.action.toLowerCase();
            const isFailed = status === 'failed' || status === 'failure' || status === 'error' || action.includes('failed') || action.includes('error');
            const isSuccess = status === 'success' && !isFailed;

            if (statusFilter === 'success') matchesStatus = isSuccess;
            if (statusFilter === 'failed') matchesStatus = isFailed;
        }

        return matchesUser && matchesAction && matchesSearch && matchesStatus;
    });

    // Extract unique users and actions for filters
    const uniqueUsers = Array.from(new Set(logs.map(log => log.username))).sort();
    const uniqueActions = Array.from(new Set(logs.map(log => log.action))).sort();

    const columns = [
        {
            key: 'timestamp',
            header: 'Timestamp',
            render: (value: string) => (
                <div className="text-xs font-mono">
                    {format(new Date(value), 'MMM dd, yyyy HH:mm:ss')}
                </div>
            ),
            sortable: true
        },
        {
            key: 'username',
            header: 'User',
            render: (value: string) => (
                <div className="font-semibold text-sm">{value}</div>
            ),
            sortable: true
        },
        {
            key: 'action',
            header: 'Action',
            render: (value: string) => (
                <Badge variant="outline" className="font-mono text-xs">
                    {value}
                </Badge>
            ),
            sortable: true
        },
        {
            key: 'method',
            header: 'Method',
            render: (value: string | null) => {
                if (!value) return null;
                const colors: Record<string, string> = {
                    'GET': 'bg-blue-100 text-blue-700',
                    'POST': 'bg-green-100 text-green-700',
                    'PUT': 'bg-yellow-100 text-yellow-700',
                    'DELETE': 'bg-red-100 text-red-700'
                };
                return (
                    <Badge className={`${colors[value] || 'bg-gray-100 text-gray-700'} font-bold text-[10px]`}>
                        {value}
                    </Badge>
                );
            }
        },
        {
            key: 'endpoint',
            header: 'Endpoint',
            render: (value: string | null) => (
                <div className="text-xs font-mono text-muted-foreground truncate max-w-[150px]">
                    {value || '-'}
                </div>
            )
        },
        {
            key: 'payload',
            header: 'Payload',
            render: (value: string | null) => {
                if (!value) return <span className="text-muted-foreground">-</span>;
                return (
                    <div className="text-[10px] font-mono whitespace-pre-wrap max-w-[250px] max-h-[80px] overflow-y-auto bg-slate-50/50 p-1.5 rounded border border-slate-100 leading-tight">
                        {value}
                    </div>
                );
            }
        },
        {
            key: 'result',
            header: 'Status',
            render: (value: string | null, item: AuditLog) => {
                const status = value?.toLowerCase();
                const action = item.action.toLowerCase();

                // Explicit Success
                if (status === 'success') {
                    return <Badge className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase shadow-none ring-1 ring-emerald-200">Success</Badge>;
                }

                // Detect Failure (from result field or action name)
                const isFailed =
                    status === 'failed' ||
                    status === 'failure' ||
                    status === 'error' ||
                    action.includes('failed') ||
                    action.includes('error');

                if (isFailed) {
                    return <Badge className="bg-red-100 text-red-700 text-[10px] font-bold uppercase shadow-none ring-1 ring-red-200">Failed</Badge>;
                }

                return <span className="text-xs text-muted-foreground">-</span>;
            }
        }
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Audit Logs"
                description="Track all user actions for accountability and compliance"
            >
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "text-white h-9 font-semibold text-xs gap-2 shadow-sm border-none transition-all px-4",
                            filteredLogs.length > 0
                                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                                : "bg-slate-300 text-slate-500 cursor-not-allowed"
                        )}
                        onClick={handleExport}
                        disabled={isExporting || filteredLogs.length === 0}
                    >
                        {isExporting ? <Activity className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Export to Excel
                    </Button>

                </div>
            </PageHeader>

            {/* Filters */}
            <Card className="border-none shadow-sm ring-1 ring-slate-200/60">
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-end gap-3">
                        {/* Search */}
                        <div className="flex-[2] min-w-[250px] space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                                <Search className="h-3 w-3" /> Search
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by user, action, or payload..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 bg-muted/30 border-none h-10 shadow-inner text-xs"
                                />
                            </div>
                        </div>

                        {/* User Filter */}
                        <div className="flex-1 min-w-[150px] space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase">User</label>
                            <Select value={userFilter} onValueChange={setUserFilter}>
                                <SelectTrigger className="h-10 bg-muted/30 border-none shadow-inner text-xs">
                                    <SelectValue placeholder="All Users" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Users</SelectItem>
                                    {uniqueUsers.map(user => (
                                        <SelectItem key={user} value={user}>{user}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Action Filter */}
                        <div className="flex-1 min-w-[150px] space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Action</label>
                            <Select value={actionFilter} onValueChange={setActionFilter}>
                                <SelectTrigger className="h-10 bg-muted/30 border-none shadow-inner text-xs">
                                    <SelectValue placeholder="All Actions" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Actions</SelectItem>
                                    {uniqueActions.map(action => (
                                        <SelectItem key={action} value={action}>{action}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status Filter */}
                        <div className="flex-1 min-w-[120px] space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Status</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-10 bg-muted/30 border-none shadow-inner text-xs">
                                    <SelectValue placeholder="All Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="success">Success</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date Range Picker */}
                        <div className="flex-1 min-w-[280px] space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                                <CalendarIcon className="h-3 w-3" /> Time Range
                            </label>
                            <div className="h-10 flex items-center gap-2 px-3 bg-muted/30 border-none rounded-md shadow-inner transition-all group focus-within:ring-2 focus-within:ring-teal-500/20">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className={cn(
                                            "text-[11px] font-semibold outline-none flex-1 text-left uppercase tracking-tight",
                                            !dateRange && "text-muted-foreground/60"
                                        )}>
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                    `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
                                                ) : format(dateRange.from, "LLL dd, y")
                                            ) : "Filter by Date Range"}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 border-none shadow-2xl ring-1 ring-slate-200" align="start">
                                        <Calendar
                                            mode="range"
                                            selected={dateRange}
                                            onSelect={setDateRange}
                                            numberOfMonths={2}
                                            className="p-3"
                                        />
                                    </PopoverContent>
                                </Popover>
                                {dateRange && (
                                    <X
                                        className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-red-500 cursor-pointer transition-colors"
                                        onClick={() => setDateRange(undefined)}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Reset Button */}
                        {(userFilter !== 'all' || actionFilter !== 'all' || statusFilter !== 'all' || searchQuery || dateRange) && (
                            <Button
                                variant="ghost"
                                onClick={resetFilters}
                                className="h-10 px-4 gap-2 text-slate-500 hover:text-red-600 hover:bg-red-50 font-bold text-[10px] uppercase tracking-widest transition-all"
                            >
                                <RefreshCcw className="h-3.5 w-3.5" />
                                Reset
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Data Table */}
            <DataTable
                columns={columns}
                data={filteredLogs}
                searchable={false}
                emptyMessage="No audit logs found. Enable audit logging in Settings to start tracking user actions."
            />
        </div>
    );
};

export default AuditLogs;
