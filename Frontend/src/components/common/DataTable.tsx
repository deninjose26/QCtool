import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (value: any, item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
}

function DataTable<T extends { id: string }>({
  data,
  columns,
  searchable = true,
  searchPlaceholder = 'Search...',
  pageSize: initialPageSize = 10,
  emptyMessage = 'No data found',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filter data
  const filteredData = data.filter((item) => {
    if (!search) return true;
    return Object.values(item).some(
      (value) =>
        value &&
        value.toString().toLowerCase().includes(search.toLowerCase())
    );
  });

  // Sort data
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortKey) return 0;
    const aValue = (a as any)[sortKey];
    const bValue = (b as any)[sortKey];
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginate
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div className="border border-slate-200/60 rounded-xl overflow-hidden shadow-sm bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/60">
              {columns.map((column) => (
                <TableHead
                  key={column.key as string}
                  className={cn(
                    'h-12 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500',
                    column.sortable && 'cursor-pointer hover:text-slate-900 transition-colors group',
                    column.className
                  )}
                  onClick={() => column.sortable && handleSort(column.key as string)}
                >
                  <div className="flex items-center gap-1.5">
                    {column.header}
                    {column.sortable && (
                      <div className={cn(
                        "transition-all duration-200",
                        sortKey === column.key ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 group-hover:opacity-40 group-hover:translate-y-0"
                      )}>
                        {sortKey === column.key ? (
                          sortDirection === 'asc' ? '↑' : '↓'
                        ) : '↑'}
                      </div>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-40 text-center"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center">
                      <Search className="h-6 w-6 text-slate-200" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{emptyMessage}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item, idx) => (
                <TableRow
                  key={item.id}
                  className={cn(
                    "group transition-all duration-200 border-b border-slate-100 hover:bg-slate-50/80 hover:shadow-[inset_4px_0_0_0_#6366f1]",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/20"
                  )}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key as string} className={cn("py-4 px-4 text-sm font-medium text-slate-700", column.className)}>
                      {column.render
                        ? column.render((item as any)[column.key], item)
                        : (item as any)[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4 bg-white/50 rounded-xl border border-slate-100 mt-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Show</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-16 h-8 bg-white border-slate-200 text-xs font-bold text-slate-700 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={size.toString()} className="text-xs font-bold">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {startIndex + 1}-{Math.min(startIndex + pageSize, sortedData.length)} OF {sortedData.length} RECORDS
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white hover:text-indigo-600 rounded-lg transition-all"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white hover:text-indigo-600 rounded-lg transition-all"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center px-4">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">
                PAGE {currentPage} <span className="text-slate-300 mx-1">/</span> {totalPages || 1}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white hover:text-indigo-600 rounded-lg transition-all"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white hover:text-indigo-600 rounded-lg transition-all"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default DataTable;
