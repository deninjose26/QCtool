import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    RefreshCw,
    FolderOpen,
    CheckCircle,
    Loader2,
    ListFilter,
    Files,
    Info,
    Download,
    Search,
    Building2,
    Database,
    MapPin,
    FileText,
    X,
    Eye,
    Calendar as CalendarIcon,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL } from '@/config';
import { storeFilesInQueue, getPendingFiles, clearBatch } from '@/utils/uploadDB';
import { UploadManager, syncWithServer } from '@/utils/uploadManager';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportToExcel } from '@/utils/excelExport';
import { cn } from '@/lib/utils';

interface OperatorBatch {
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
    status: 'pending' | 'uploading' | 'uploaded';
    upload_type: string;
    created_date: string;
}

const ReuploadBatches: React.FC = () => {
    const [batches, setBatches] = useState<OperatorBatch[]>([]);
    const [filteredBatches, setFilteredBatches] = useState<OperatorBatch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [ownerFilter, setOwnerFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<OperatorBatch | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [rejectedFilenames, setRejectedFilenames] = useState<string[]>([]);
    const [invalidFileNames, setInvalidFileNames] = useState<string[]>([]);
    const [preparationProgress, setPreparationProgress] = useState(0);

    // Upload Progress State
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentFileName, setCurrentFileName] = useState('');
    const [filesCompleted, setFilesCompleted] = useState(0);

    const { toast } = useToast();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadManagerRef = useRef<UploadManager | null>(null);

    const token = localStorage.getItem('qc_token');
    const headers = { 'Authorization': `Bearer ${token}` };
    const { isOnline } = useNetworkStatus();

    const fetchBatches = async () => {
        try {
            setIsLoading(true);
            if (!token) return;

            const res = await fetch(`${API_BASE_URL}/operator/batches`, { headers });
            if (!res.ok) throw new Error('Failed to fetch batches');

            const data = await res.json();
            const mappedData = data
                .filter((item: any) => item.upload_type === 'Re-upload' && item.status !== 'uploaded')
                .map((item: any) => ({
                    ...item,
                    id: item.batch_uid
                }));
            setBatches(mappedData);
        } catch (err) {
            console.error(err);
            toast({ title: 'Error', description: 'Failed to load re-upload batches', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBatches();
    }, []);

    // Derived Filter Options
    const projects = Array.from(new Set(batches.map(b => b.project_name))).sort();
    const sources = Array.from(new Set(batches.map(b => b.source_name))).sort();
    const locations = Array.from(new Set(batches.map(b => b.location_name))).sort();
    const owners = Array.from(new Set(batches.map(b => b.record_owner_name))).sort();
    const recordTypes = Array.from(new Set(batches.map(b => b.record_type_name))).sort();

    // Filter Logic
    useEffect(() => {
        let result = [...batches];

        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            result = result.filter(item =>
                item.batch_id.toLowerCase().includes(lowSearch) ||
                item.book_name.toLowerCase().includes(lowSearch) ||
                item.project_name.toLowerCase().includes(lowSearch)
            );
        }

        if (projectFilter !== 'all') result = result.filter(b => b.project_name === projectFilter);
        if (sourceFilter !== 'all') result = result.filter(b => b.source_name === sourceFilter);
        if (locationFilter !== 'all') result = result.filter(b => b.location_name === locationFilter);
        if (ownerFilter !== 'all') result = result.filter(b => b.record_owner_name === ownerFilter);
        if (typeFilter !== 'all') result = result.filter(b => b.record_type_name === typeFilter);

        setFilteredBatches(result);
    }, [batches, searchTerm, projectFilter, sourceFilter, locationFilter, ownerFilter, typeFilter]);

    // Check for pending uploads on page load and auto-resume
    const checkAndResumePendingUploads = async () => {
        try {
            if (!token) return;

            const { getBatchesWithPendingUploads } = await import('@/utils/uploadDB');
            const pendingBatchUids = await getBatchesWithPendingUploads();

            if (pendingBatchUids.length === 0) return;

            // Get the first pending batch
            const batchUid = pendingBatchUids[0];

            // Find the batch in our list
            const batch = batches.find(b => b.batch_uid === batchUid);

            if (!batch) {
                console.log('Batch not found in list, clearing IndexedDB');
                const { clearBatch } = await import('@/utils/uploadDB');
                await clearBatch(batchUid);
                return;
            }

            // Sync with server to get uploaded files
            const uploadedFiles = await syncWithServer(batchUid, token);

            // Get pending files from IndexedDB
            const pendingFiles = await getPendingFiles(batchUid);
            const filesToUpload = pendingFiles.filter(f => !uploadedFiles.includes(f.file_name));

            if (filesToUpload.length === 0) {
                await clearBatch(batchUid);
                fetchBatches();
                return;
            }

            // Set state for this batch
            setSelectedBatch(batch);
            setIsUploading(true);
            setFilesCompleted(uploadedFiles.length);
            setUploadProgress(0);

            toast({
                title: 'Resuming Rework',
                description: `Continuing re-upload of ${filesToUpload.length} remaining images for batch ${batch.batch_id}`,
            });

            const uploadManager = new UploadManager(token);
            uploadManagerRef.current = uploadManager;

            uploadManager.processUploadQueue(
                batchUid,
                filesToUpload,
                (fileProgress) => {
                    setCurrentFileName(fileProgress.fileName);
                    setUploadProgress(fileProgress.progress);
                },
                (batchProgress) => {
                    const currentCount = uploadedFiles.length + batchProgress.completed;
                    setFilesCompleted(currentCount);

                    setBatches(prev => prev.map(b =>
                        b.batch_uid === batchUid
                            ? { ...b, completed_count: currentCount, status: 'uploading' }
                            : b
                    ));
                },
                async () => {
                    await clearBatch(batchUid);
                    toast({
                        title: 'Re-upload Complete',
                        description: `Successfully re-uploaded all images for batch ${batch.batch_id}`,
                    });
                    setIsUploading(false);
                    setSelectedBatch(null);
                    fetchBatches();
                },
                (error) => {
                    console.error('Resume rework error:', error);
                    toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
                }
            );

        } catch (error) {
            console.error('Error checking pending rework uploads:', error);
        }
    };

    // Check for pending uploads after batches are loaded
    useEffect(() => {
        if (batches.length > 0 && !isUploading) {
            checkAndResumePendingUploads();
        }
    }, [batches]);

    const handleExport = () => {
        const exportData = filteredBatches.map(b => ({
            batch_id: b.batch_id,
            project: b.project_name,
            source: b.source_name,
            location: b.location_name,
            owner: b.record_owner_name,
            record_type: b.record_type_name,
            book: b.book_name,
            target_count: b.target_count,
            completed_count: b.completed_count,
            status: b.status,
            created_at: b.created_date
        }));

        const headersMap = {
            batch_id: 'Batch ID',
            project: 'Project',
            source: 'Source',
            location: 'Location',
            owner: 'Record Owner',
            record_type: 'Record Type',
            book: 'Book Name',
            target_count: 'Required Images',
            completed_count: 'Uploaded Images',
            status: 'Status',
            created_at: 'Assignment Date'
        };

        exportToExcel(exportData, 'Operator_Rework_Pending', headersMap);
    };

    const resetFilters = () => {
        setSearchTerm('');
        setProjectFilter('all');
        setSourceFilter('all');
        setLocationFilter('all');
        setOwnerFilter('all');
        setTypeFilter('all');
    };

    const handleUploadClick = async (batch: OperatorBatch) => {
        // If there's an active upload pending in IndexDB for this batch, resume it directly
        const { getBatchesWithPendingUploads } = await import('@/utils/uploadDB');
        const pendingBatchUids = await getBatchesWithPendingUploads();

        if (pendingBatchUids.includes(batch.batch_uid)) {
            checkAndResumePendingUploads();
            return;
        }

        setSelectedBatch(batch);
        setSelectedFiles([]);
        setRejectedFilenames([]);
        setInvalidFileNames([]);
        setIsDialogOpen(true);

        // Fetch rejected filenames for validation
        try {
            const res = await fetch(`${API_BASE_URL}/operator/batches/${batch.batch_uid}/rejected-filenames`, { headers });
            if (res.ok) {
                const data = await res.json();
                setRejectedFilenames(data);
            }
        } catch (error) {
            console.error("Error fetching rejected filenames:", error);
        }
    };

    const handleBrowseClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const imageFiles = Array.from(files).filter(file =>
            ['image/jpeg', 'image/png', 'image/tiff', 'image/jpg'].includes(file.type) ||
            file.name.toLowerCase().endsWith('.jpg') ||
            file.name.toLowerCase().endsWith('.jpeg') ||
            file.name.toLowerCase().endsWith('.png') ||
            file.name.toLowerCase().endsWith('.tif') ||
            file.name.toLowerCase().endsWith('.tiff')
        );

        if (imageFiles.length === 0) {
            toast({ title: 'No Images', description: 'No valid images found in the selected folder.', variant: 'destructive' });
            return;
        }

        if (selectedBatch && imageFiles.length !== selectedBatch.target_count) {
            toast({
                title: 'Validation Error',
                description: `Selected folder has ${imageFiles.length} images, but exactly ${selectedBatch.target_count} images are required for this rework batch.`,
                variant: 'destructive',
            });
            return;
        }

        // Strict Filename Validation for Rework
        if (selectedBatch && rejectedFilenames.length > 0) {
            const invalidFiles = imageFiles.filter(f => !rejectedFilenames.includes(f.name));
            if (invalidFiles.length > 0) {
                setInvalidFileNames(invalidFiles.map(f => f.name));
                setSelectedFiles([]); // Reset selection if invalid
                return;
            }
        }

        setInvalidFileNames([]);

        setSelectedFiles(imageFiles);
        e.target.value = '';
    };

    const handleStartUpload = async () => {
        if (!selectedBatch || selectedFiles.length === 0 || !token) return;

        try {
            setIsSubmitting(true);
            setPreparationProgress(0);
            await storeFilesInQueue(selectedBatch.batch_uid, selectedFiles, (progress) => {
                setPreparationProgress(progress);
            });
            const uploadedFiles = await syncWithServer(selectedBatch.batch_uid, token);

            let pendingFiles = await getPendingFiles(selectedBatch.batch_uid);
            pendingFiles = pendingFiles.filter(f => !uploadedFiles.includes(f.file_name));

            if (pendingFiles.length === 0) {
                toast({ title: 'Already Complete', description: 'All files have already been uploaded.' });
                await clearBatch(selectedBatch.batch_uid);
                setIsDialogOpen(false);
                fetchBatches();
                return;
            }

            setIsDialogOpen(false);
            setIsUploading(true);
            setUploadProgress(0);
            setFilesCompleted(0);

            const uploadManager = new UploadManager(token);
            uploadManagerRef.current = uploadManager;

            uploadManager.processUploadQueue(
                selectedBatch.batch_uid,
                pendingFiles,
                (fileProgress) => {
                    setCurrentFileName(fileProgress.fileName);
                    setUploadProgress(fileProgress.progress);
                },
                (batchProgress) => {
                    setFilesCompleted(batchProgress.completed);
                    setBatches(prev => prev.map(b =>
                        b.batch_uid === selectedBatch.batch_uid
                            ? { ...b, completed_count: batchProgress.completed, status: 'uploading' }
                            : b
                    ));
                },
                async () => {
                    await clearBatch(selectedBatch.batch_uid);
                    toast({
                        title: 'Re-upload Complete',
                        description: `Successfully re-uploaded all corrected images for batch ${selectedBatch.batch_id}`,
                    });
                    setIsUploading(false);
                    setSelectedBatch(null);
                    fetchBatches();
                },
                (error) => {
                    console.error('Upload error:', error);
                    toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
                }
            );

        } catch (err) {
            console.error(err);
            toast({ title: 'Upload Failed', description: 'An error occurred during re-upload', variant: 'destructive' });
        } finally {
            setIsUploading(false);
            setIsSubmitting(false);
        }
    };

    const columns = [
        {
            key: 'batch_id',
            header: 'Batch ID',
            sortable: true,
            render: (val: string) => <code className="text-xs font-bold text-amber-600">{val}</code>
        },
        { key: 'project_name', header: 'Project' },
        { key: 'source_name', header: 'Source' },
        { key: 'location_name', header: 'Location' },
        { key: 'record_owner_name', header: 'Owner' },
        { key: 'record_type_name', header: 'Type' },
        { key: 'book_name', header: 'Book Name' },
        {
            key: 'count',
            header: 'Rework Count',
            render: (_: any, item: OperatorBatch) => (
                <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">
                    {item.completed_count} / {item.target_count}
                </span>
            )
        },
        {
            key: 'progress',
            header: 'Progress',
            render: (_: any, item: OperatorBatch) => {
                const percentage = Math.round((item.completed_count / item.target_count) * 100) || 0;
                return (
                    <div className="flex flex-col gap-1 min-w-[100px]">
                        <div className="flex justify-between items-center text-[10px] font-bold text-amber-600/70 uppercase">
                            <span>{percentage}%</span>
                        </div>
                        <Progress value={percentage} className="h-1.5 bg-slate-100" />
                    </div>
                );
            }
        },
        {
            key: 'status',
            header: 'Status',
            render: (value: string) => <StatusBadge status={value as any} />
        },
        {
            key: 'actions',
            header: 'Action',
            render: (_: any, item: OperatorBatch) => {
                const isFixed = item.status === 'uploaded';

                return (
                    <div className="flex items-center gap-2">
                        {isFixed ? (
                            <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs uppercase">
                                <CheckCircle className="h-4 w-4" /> Fixed
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                onClick={() => handleUploadClick(item)}
                                className="h-8 gap-2 bg-amber-600 hover:bg-amber-700 shadow-sm"
                            >
                                <RefreshCw className={cn("h-4 w-4", isUploading && selectedBatch?.batch_uid === item.batch_uid && "animate-spin")} />
                                {item.completed_count > 0 ? 'Continue' : 'Re-upload'}
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/image-preview/${item.batch_uid}`)}
                            className="h-8 w-8 p-0 border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-200 transition-all shadow-sm"
                            title="View Rejected Images"
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                    </div>
                );
            }
        }
    ];

    const pendingRework = filteredBatches.filter(b => b.status !== 'uploaded');

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex items-center justify-between">
                <PageHeader
                    title="Re-upload Batches"
                    description="Batches rejected by QC requiring your correction and re-upload"
                />
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={fetchBatches}
                        className="gap-2"
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button
                        onClick={handleExport}
                        disabled={filteredBatches.length === 0}
                        className="gap-2 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                    >
                        <Download className="h-4 w-4" /> Export Excel
                    </Button>
                </div>
            </div>

            {/* Hidden Folder Input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                {...({ webkitdirectory: "", directory: "" } as any)}
                multiple
                onChange={handleFolderSelect}
            />

            {/* Filter Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-1.5 border-b-4 border-b-amber-500/10">
                <div className="flex flex-col gap-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[320px] group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-amber-500 transition-colors">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                placeholder="Search by Batch ID, Book Name, Project..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 bg-slate-50 border-slate-200/60 focus:bg-white focus:ring-4 focus:ring-amber-500/5 transition-all rounded-xl text-sm font-medium"
                            />
                        </div>

                        {(searchTerm || projectFilter !== 'all' || sourceFilter !== 'all' || locationFilter !== 'all' || ownerFilter !== 'all' || typeFilter !== 'all') && (
                            <Button
                                variant="ghost"
                                onClick={resetFilters}
                                className="h-11 px-4 gap-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl font-bold text-xs uppercase tracking-wider"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Clear
                            </Button>
                        )}
                    </div>

                    <div className="h-px bg-slate-100/80 mx-1 my-1" />

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Building2 className="h-3.5 w-3.5" />
                            </div>
                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold">
                                    <SelectValue placeholder="All Projects" />
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
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold">
                                    <SelectValue placeholder="All Sources" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Source</SelectItem>
                                    {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <MapPin className="h-3.5 w-3.5" />
                            </div>
                            <Select value={locationFilter} onValueChange={setLocationFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold">
                                    <SelectValue placeholder="All Locations" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Location</SelectItem>
                                    {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative group/filter">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400">
                                <Files className="h-3.5 w-3.5" />
                            </div>
                            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold">
                                    <SelectValue placeholder="All Owners" />
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
                                <SelectTrigger className="h-9 pl-9 bg-white border-slate-200/50 rounded-lg text-xs font-semibold">
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Every Type</SelectItem>
                                    {recordTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>


            {isLoading ? (
                <div className="flex flex-col justify-center items-center py-24 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
                    <p className="text-sm font-bold text-slate-500">Loading your rework tasks...</p>
                </div>
            ) : filteredBatches.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-20 flex flex-col items-center text-center gap-4 shadow-sm border-dashed">
                    <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-700">No Rework Found</h3>
                        <p className="text-sm text-slate-500 max-w-md mx-auto">
                            Great job! No assigned rework batches match your current filters.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <DataTable
                        data={filteredBatches}
                        columns={columns}
                        searchPlaceholder="Search rework batches..."
                        searchable={false}
                    />
                </div>
            )}

            {/* Upload Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-700">
                            <RefreshCw className="h-5 w-5" />
                            Start Re-upload Process
                        </DialogTitle>
                        <DialogDescription>
                            {isSubmitting
                                ? "Please wait while we prepare your corrections..."
                                : "Select the folder containing the corrected images for this batch."}
                        </DialogDescription>
                    </DialogHeader>

                    {isSubmitting ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in zoom-in duration-300">
                            <div className="relative flex items-center justify-center">
                                <Loader2 className="h-16 w-16 animate-spin text-amber-600 opacity-20" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xl font-black text-amber-600">{preparationProgress}%</span>
                                </div>
                            </div>
                            <div className="w-full max-w-xs space-y-2">
                                <Progress value={preparationProgress} className="h-2 shadow-inner" />
                                <p className="text-[10px] text-center font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                                    Preparing Corrections...
                                </p>
                            </div>
                        </div>
                    ) : selectedBatch && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="col-span-2 flex justify-between">
                                    <span className="text-slate-500 font-bold uppercase tracking-wider">Batch ID</span>
                                    <span className="font-mono font-bold text-amber-700">{selectedBatch.batch_id}</span>
                                </div>
                                <div className="h-px bg-slate-200 col-span-2 my-1" />
                                <div className="space-y-0.5">
                                    <p className="text-slate-400 font-bold uppercase">Project</p>
                                    <p className="font-semibold text-slate-700">{selectedBatch.project_name}</p>
                                </div>
                                <div className="space-y-0.5 text-right">
                                    <p className="text-slate-400 font-bold uppercase">Required Images</p>
                                    <p className="font-black text-amber-700 text-lg">{selectedBatch.target_count}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold flex items-center gap-2">
                                        <FolderOpen className="h-4 w-4 text-amber-600" />
                                        Corrected Images Folder
                                    </p>
                                    <Button variant="outline" size="sm" onClick={handleBrowseClick} className="h-8 gap-2 border-amber-200 text-amber-700 hover:bg-amber-50">
                                        Browse Folder
                                    </Button>
                                </div>

                                {selectedFiles.length > 0 ? (
                                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                                            <div className="text-sm font-bold text-emerald-800">
                                                {selectedFiles.length} Images Selected
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div onClick={handleBrowseClick} className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-slate-50 hover:bg-amber-50/50 hover:border-amber-300 transition-all cursor-pointer">
                                        <RefreshCw className="h-8 w-8 text-slate-300" />
                                        <p className="text-sm font-medium text-slate-500 text-center">Click to select the folder with corrected images</p>
                                    </div>
                                )}
                            </div>

                            {invalidFileNames.length > 0 && (
                                <Alert variant="destructive" className="bg-rose-50 border-rose-200 text-rose-800 animate-in fade-in zoom-in duration-300">
                                    <AlertCircle className="h-4 w-4 text-rose-600" />
                                    <AlertTitle className="text-xs font-black uppercase tracking-tight flex items-center justify-between">
                                        <span>{invalidFileNames.length} Incorrect Filenames Detected</span>
                                        <Badge className="bg-rose-600 text-white border-none text-[10px]">FIX REQUIRED</Badge>
                                    </AlertTitle>
                                    <AlertDescription className="text-[11px] font-medium leading-relaxed mt-2">
                                        <p className="mb-2">In rework, files must match original rejected names <strong>EXACTLY</strong>. The following files are invalid:</p>
                                        <div className="max-h-[120px] overflow-y-auto px-2 py-1.5 bg-white/50 rounded-lg border border-rose-100 flex flex-col gap-1 shadow-inner">
                                            {invalidFileNames.slice(0, 10).map((name, idx) => (
                                                <div key={idx} className="flex items-center gap-2 group">
                                                    <div className="h-1 w-1 rounded-full bg-rose-400" />
                                                    <code className="text-rose-700 font-bold break-all">{name}</code>
                                                </div>
                                            ))}
                                            {invalidFileNames.length > 10 && (
                                                <p className="text-[10px] text-rose-400 font-black pt-1 border-t border-rose-100 italic">
                                                    + {invalidFileNames.length - 10} more files have naming issues
                                                </p>
                                            )}
                                        </div>
                                        <div className="mt-2 text-[9px] text-rose-600 italic">
                                            Check for leading zeros (e.g. Image001.tif vs Image00001.tif)
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-800 text-[11px]">
                                <Info className="h-4 w-4 shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-bold">Important Instructions:</p>
                                    <ul className="list-disc pl-4 space-y-0.5">
                                        <li>Only upload the rejected images.</li>
                                        <li>Filenames must match the original rejected names exactly.</li>
                                        <li>Check for padding (Image00001.tif vs Image001.tif).</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleStartUpload}
                            disabled={selectedFiles.length === 0 || isSubmitting}
                            className="bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/20"
                        >
                            {isSubmitting ? (
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Processing {preparationProgress}%</span>
                                    </div>
                                    <Progress value={preparationProgress} className="h-1 w-24 bg-white/20" />
                                </div>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Start Re-upload
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ReuploadBatches;
