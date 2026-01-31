import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import {
  Play,
  LayoutGrid,
  List as ListIcon,
  Book,
  MapPin,
  Calendar as CalendarIcon,
  Search,
  RefreshCcw,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  Database,
  User as UserIcon,
  Building2,
  X,
  Filter as FilterIcon
} from 'lucide-react';
import { exportToExcel } from '@/utils/excelExport';
import { API_BASE_URL } from '@/config';
import { useToast } from '@/hooks/use-toast';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { syncManager } from '@/utils/syncManager';
import { formatToLocalTime } from '@/utils/dateUtils';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';


interface QCUserTask {
  id: string; // Added for DataTable compatibility
  qc_allocation_id: string;
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
  allocation_date: string;
  qc_batch_status: string;
  upload_type: string;
}

const QCTasks: React.FC = () => {
  const [tasks, setTasks] = useState<QCUserTask[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<QCUserTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'tiles'>('table');
  const [searchTerm, setSearchTerm] = useState('');

  // New Filter States
  const [projectFilter, setProjectFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [bookFilter, setBookFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const { toast } = useToast();
  const token = localStorage.getItem('qc_token');
  const navigate = useNavigate();
  const { isOnline } = useNetworkStatus();

  const handleCompleteTask = async (allocationId: string) => {
    const endpoint = `${API_BASE_URL}/qc/complete-task/${allocationId}`;

    try {
      if (!isOnline) {
        // Save to offline sync queue
        await syncManager.addToQueue('create', endpoint, {});

        toast({
          title: 'Success (Offline)',
          description: 'Batch will be marked as completed once you\'re back online.'
        });

        // Optimistically remove from list
        setTasks(prev => prev.filter(t => t.qc_allocation_id !== allocationId));
        setFilteredTasks(prev => prev.filter(t => t.qc_allocation_id !== allocationId));

        navigate('/qc-history');
      } else {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to complete task');

        toast({ title: 'Success', description: 'Batch marked as completed' });
        navigate('/qc-history');
      }
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Could not complete task', variant: 'destructive' });
    }
  };

  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/qc/my-tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      const mappedData = data.map((t: QCUserTask) => ({ ...t, id: t.qc_allocation_id }));
      setTasks(mappedData);
      setFilteredTasks(mappedData);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Could not load your tasks', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    let result = [...tasks];

    if (searchTerm) {
      const lowSearch = searchTerm.toLowerCase();
      result = result.filter(task =>
        task.batch_id.toLowerCase().includes(lowSearch) ||
        task.book_name.toLowerCase().includes(lowSearch) ||
        task.project_name.toLowerCase().includes(lowSearch) ||
        task.location_name.toLowerCase().includes(lowSearch)
      );
    }

    if (projectFilter !== 'all') result = result.filter(t => t.project_name === projectFilter);
    if (sourceFilter !== 'all') result = result.filter(t => t.source_name === sourceFilter);
    if (locationFilter !== 'all') result = result.filter(t => t.location_name === locationFilter);
    if (ownerFilter !== 'all') result = result.filter(t => t.record_owner_name === ownerFilter);
    if (bookFilter !== 'all') result = result.filter(t => t.book_name === bookFilter);
    if (typeFilter !== 'all') result = result.filter(t => t.record_type_name === typeFilter);
    if (statusFilter !== 'all') result = result.filter(t => t.qc_batch_status === statusFilter);

    if (dateRange?.from) {
      const from = startOfDay(dateRange.from);
      const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      result = result.filter(t => {
        const allocDate = new Date(t.allocation_date);
        return isWithinInterval(allocDate, { start: from, end: to });
      });
    }

    setFilteredTasks(result);
    setCurrentPage(1);
  }, [searchTerm, tasks, projectFilter, sourceFilter, locationFilter, ownerFilter, bookFilter, typeFilter, statusFilter, dateRange]);

  // Derived Filter Options
  const projects = Array.from(new Set(tasks.map(t => t.project_name))).sort();
  const sources = Array.from(new Set(tasks.map(t => t.source_name))).sort();
  const locations = Array.from(new Set(tasks.map(t => t.location_name))).sort();
  const owners = Array.from(new Set(tasks.map(t => t.record_owner_name))).sort();
  const books = Array.from(new Set(tasks.map(t => t.book_name))).sort();
  const types = Array.from(new Set(tasks.map(t => t.record_type_name))).sort();
  const statuses = Array.from(new Set(tasks.map(t => t.qc_batch_status))).sort();

  const resetFilters = () => {
    setSearchTerm('');
    setProjectFilter('all');
    setSourceFilter('all');
    setLocationFilter('all');
    setOwnerFilter('all');
    setBookFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setDateRange(undefined);
  };

  const handleExport = () => {
    if (filteredTasks.length === 0) {
      toast({ title: 'Export Info', description: 'No tasks to export' });
      return;
    }

    const exportData = filteredTasks.map(t => ({
      ...t,
      allocation_date: formatToLocalTime(t.allocation_date)
    }));

    exportToExcel(
      exportData,
      'My_QC_Assignments',
      {
        batch_id: 'Batch ID',
        project_name: 'Project',
        source_name: 'Source',
        location_name: 'Location',
        record_owner_name: 'Record Owner',
        book_name: 'Book Name',
        upload_count: 'Uploaded Images',
        qc_done_count: 'QC Done',
        allocation_date: 'Assigned On',
        qc_batch_status: 'Status'
      }
    );
  };

  const columns = [
    {
      key: 'batch_id',
      header: 'Batch ID',
      sortable: true,
      render: (val: string, item: QCUserTask) => (
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
    {
      key: 'project_name',
      header: 'Project',
      render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
    },
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
      key: 'book_name',
      header: 'Book Name',
      render: (val: string) => <span className="text-[10px] font-black text-slate-700 max-w-[150px] truncate block" title={val}>{val}</span>
    },
    {
      key: 'qc_progress',
      header: 'QC Status',
      render: (_: any, item: QCUserTask) => {
        const percentage = Math.round((item.qc_done_count / (item.upload_count || 1)) * 100) || 0;
        return (
          <div className="flex flex-col gap-1 min-w-[140px]">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
              <span className="text-indigo-600">{percentage}%</span>
              <span>{item.qc_done_count} / {item.upload_count}</span>
            </div>
            <Progress value={percentage} className="h-1.5 shadow-sm" />
          </div>
        );
      }
    },
    {
      key: 'allocation_date',
      header: 'Assigned On',
      render: (value: string) => formatToLocalTime(value)
    },
    {
      key: 'qc_batch_status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value as any} />
    },
    {
      key: 'actions',
      header: 'Action',
      render: (_: any, item: QCUserTask) => {
        const isReadyForCompletion = item.qc_done_count === item.upload_count && item.upload_count > 0;

        if (isReadyForCompletion) {
          return (
            <div className="flex items-center gap-2">
              <Link to={`/qc/${item.batch_uid}`}>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-black uppercase tracking-wider border-slate-200 text-slate-600 hover:bg-slate-50 gap-1.5"
                >
                  <Search className="h-3 w-3" />
                  Review
                </Button>
              </Link>
              <Button
                size="sm"
                variant="default"
                onClick={() => handleCompleteTask(item.qc_allocation_id)}
                className="gap-1.5 h-8 text-[10px] font-black uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white border-none shadow-sm shadow-green-200"
              >
                <CheckCircle2 className="h-3 w-3" />
                Mark as Complete
              </Button>
            </div>
          );
        }

        const label = item.qc_done_count === 0 ? "Start QC" : "Resume QC";

        return (
          <Link to={`/qc/${item.batch_uid}`}>
            <Button
              size="sm"
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 h-8 text-[10px] font-bold uppercase tracking-wider px-6 shadow-md shadow-indigo-100"
            >
              <Play className="h-3 w-3 fill-current" />
              {label}
            </Button>
          </Link>
        );
      }
    }
  ];

  const TaskCard = ({ task }: { task: QCUserTask }) => {
    const percentage = Math.round((task.qc_done_count / (task.upload_count || 1)) * 100) || 0;

    return (
      <Card className="group relative overflow-hidden transition-all duration-500 border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(79,70,229,0.1)] rounded-[20px]">
        <div className="p-5 space-y-4">
          {/* Header row: Project & Status */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#F1F5F9]/80 border border-slate-100/50">
              <Building2 className="h-3.5 w-3.5 text-[#64748B]" />
              <span className="text-[10px] font-bold text-[#475569] uppercase tracking-wider truncate max-w-[120px]">
                {task.project_name}
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-[#E0E7FF] border border-[#C7D2FE] text-[#4338CA] text-[9px] font-black uppercase">
              {task.qc_batch_status}
            </div>
          </div>

          <div className="space-y-1 pt-0.5">
            <h3 className="text-lg font-black text-[#1E293B] tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-1">
              {task.book_name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="text-slate-400 font-medium uppercase tracking-tight">Batch ID:</span>
              <span className={cn(
                "font-bold break-all px-1 rounded",
                task.upload_type === 'Complete' ? "text-emerald-700 bg-emerald-50" :
                  task.upload_type === 'Partial' ? "text-blue-700 bg-blue-50" :
                    "text-amber-700 bg-amber-50"
              )}>{task.batch_id}</span>
            </div>
          </div>

          <div className="h-px bg-slate-50 w-full" />

          {/* QC Section */}
          <div className="space-y-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em]">QUALITY CONTROL</p>

            <div className="flex justify-between items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-[#1E293B] tracking-tighter">{percentage}%</span>
                <span className="text-[10px] font-bold text-slate-400">complete</span>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-base font-black text-[#1E293B] leading-none">{task.qc_done_count} / {task.upload_count}</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">IMAGES</span>
              </div>
            </div>

            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner flex items-center p-[1px]">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <div className="h-px bg-slate-50 w-full" />

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-y-3 pt-0.5">
            <div className="flex items-center gap-2 text-[#475569]">
              <UserIcon className="h-3.5 w-3.5 text-slate-300" />
              <span className="text-[10px] font-black uppercase tracking-wider truncate">{task.record_owner_name}</span>
            </div>
            <div className="flex items-center gap-2 text-[#475569] justify-end">
              <FileText className="h-3.5 w-3.5 text-slate-300" />
              <span className="text-[10px] font-black uppercase tracking-wider truncate text-right">{task.record_type_name}</span>
            </div>
            <div className="flex items-center gap-2 text-[#475569]">
              <MapPin className="h-3.5 w-3.5 text-slate-300" />
              <span className="text-[10px] font-black uppercase tracking-wider truncate">{task.location_name}</span>
            </div>
            <div className="flex items-center gap-2 text-[#475569] justify-end">
              <CalendarIcon className="h-3.5 w-3.5 text-slate-300" />
              <span className="text-[10px] font-black uppercase tracking-wider">{format(new Date(task.allocation_date), 'MMM dd, yyyy')}</span>
            </div>
          </div>

          <div className="pt-1">
            {(() => {
              const isReadyForCompletion = task.qc_done_count === task.upload_count && task.upload_count > 0;

              if (isReadyForCompletion) {
                return (
                  <div className="flex flex-col gap-2">
                    <Link to={`/qc/${task.batch_uid}`} className="w-full">
                      <Button
                        variant="outline"
                        className="w-full h-10 rounded-xl border-slate-200 text-slate-500 hover:bg-slate-50 font-black text-[10px] uppercase tracking-widest gap-2"
                      >
                        <Search className="h-4 w-4" />
                        Review Batch
                      </Button>
                    </Link>
                    <Button
                      onClick={() => handleCompleteTask(task.qc_allocation_id)}
                      className="w-full h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-[0_4px_12px_rgba(22,163,74,0.1)] hover:shadow-[0_8px_20px_rgba(22,163,74,0.2)] transition-all duration-300 font-black text-[10px] uppercase tracking-widest gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark as Complete
                    </Button>
                  </div>
                );
              }

              const label = task.qc_done_count === 0 ? "START QC" : "RESUME QC";

              return (
                <Link to={`/qc/${task.batch_uid}`} className="block">
                  <Button className="w-full h-11 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:from-[#2563EB] hover:to-[#1D4ED8] text-white shadow-[0_4px_12px_rgba(37,99,235,0.15)] hover:shadow-[0_8px_20px_rgba(37,99,235,0.25)] transition-all duration-300 font-black text-[10px] uppercase tracking-[0.2em] gap-2">
                    <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm">
                      <Play className="h-2.5 w-2.5 fill-white ml-0.5" />
                    </div>
                    {label}
                  </Button>
                </Link>
              );
            })()}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="My QC Assignments"
          description="Execute quality control on your allocated batches"
        />

        <div className="flex items-center gap-3">
          <Button
            onClick={handleExport}
            disabled={filteredTasks.length === 0}
            className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 gap-2 h-9"
          >
            <Download className="h-4 w-4" />
            Export to Excel
          </Button>

          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner">
            <Button
              variant={viewMode === 'tiles' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('tiles')}
              className={cn(
                "h-8 w-8 p-0 rounded-md transition-all",
                viewMode === 'tiles' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className={cn(
                "h-8 w-8 p-0 rounded-md transition-all",
                viewMode === 'table' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500"
              )}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchTasks}
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
                placeholder="Search by Batch ID, Book Name..."
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
                      {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd")} - ${format(dateRange.to, "LLL dd")}` : format(dateRange.from, "LLL dd")) : "Filter by Allocation Date"}
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
                onClick={fetchTasks}
                disabled={isLoading}
                className="h-11 px-4 gap-2 border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider"
              >
                <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                Refresh
              </Button>

              {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || bookFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all' || dateRange) && (
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

          {/* Bottom Tier: Grouped Metadata Filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="relative group/filter">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every Project</SelectItem>
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
                  <SelectItem value="all">Every Source</SelectItem>
                  {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="relative group/filter">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                <AlertCircle className="h-3.5 w-3.5" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-[11px] font-semibold focus:ring-4 focus:ring-indigo-500/5 hover:border-indigo-200 transition-all">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every Status</SelectItem>
                  {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                  <SelectItem value="all">Every Location</SelectItem>
                  {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
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
                  <SelectItem value="all">Every Owner</SelectItem>
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
                  <SelectItem value="all">Every Type</SelectItem>
                  {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="min-h-[400px] flex flex-col justify-center items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm font-medium text-slate-500 animate-pulse">Loading your assignments...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="bg-slate-50/50 border-dashed border-2 flex flex-col items-center py-20 px-4 text-center">
          <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
            <AlertCircle className="h-8 w-8 text-slate-300" />
          </div>
          <CardTitle className="text-slate-600">No tasks found</CardTitle>
          <p className="text-slate-500 text-sm max-w-xs mt-2">
            You don't have any quality control tasks assigned to you right now. Please check back later or contact your supervisor.
          </p>
          <Button variant="outline" className="mt-6 border-slate-200" onClick={() => setSearchTerm('')}>
            Clear search filters
          </Button>
        </Card>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            data={filteredTasks}
            columns={columns}
            searchable={false}
          />
        </div>
      ) : (
        <div className="space-y-8 pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(task => (
              <TaskCard key={task.qc_allocation_id} task={task} />
            ))}
          </div>

          {/* Pagination UI */}
          {filteredTasks.length > itemsPerPage && (
            <div className="flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-sm text-slate-500">
                Showing <span className="font-bold text-slate-700">{Math.min((currentPage - 1) * itemsPerPage + 1, filteredTasks.length)}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredTasks.length)}</span> of <span className="font-bold text-slate-700">{filteredTasks.length}</span> tasks
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="h-9 w-9 p-0 rounded-lg border-slate-200 shadow-sm disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-1 mx-2">
                  {(() => {
                    const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
                    const pages = [];
                    let startPage = Math.max(1, currentPage - 1);
                    let endPage = Math.min(totalPages, startPage + 2);

                    if (endPage - startPage < 2) {
                      startPage = Math.max(1, endPage - 2);
                    }

                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(
                        <Button
                          key={i}
                          variant={currentPage === i ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setCurrentPage(i)}
                          className={cn(
                            "h-9 w-9 rounded-lg font-bold text-xs transition-all",
                            currentPage === i ? "bg-indigo-600 shadow-md shadow-indigo-600/20" : "text-slate-500 hover:bg-slate-100"
                          )}
                        >
                          {i}
                        </Button>
                      );
                    }
                    return pages;
                  })()}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredTasks.length / itemsPerPage)))}
                  disabled={currentPage === Math.ceil(filteredTasks.length / itemsPerPage)}
                  className="h-9 w-9 p-0 rounded-lg border-slate-200 shadow-sm disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3 border-l border-slate-100 pl-6">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Per Page</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(val) => {
                    setItemsPerPage(parseInt(val));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-20 border-slate-200 bg-slate-50/50 font-bold text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 20, 50].map(size => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QCTasks;
