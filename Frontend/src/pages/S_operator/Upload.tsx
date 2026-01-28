import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload as UploadIcon, FolderOpen, CheckCircle, Loader2, ListFilter, Files, Info, Wifi, WifiOff, Pause, Play, Eye, Edit, Settings2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL } from '@/config';
import { storeFilesInQueue, getPendingFiles, clearBatch, getBatchStats } from '@/utils/uploadDB';
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
import { Separator } from '@/components/ui/separator';

interface OperatorBatch {
  id: string; // Required by DataTable (mapped from batch_uid)
  batch_uid: string;
  batch_id: string;
  project_name: string;
  source_name: string;
  location_name: string;
  record_owner_name: string;
  record_type_name: string;
  book_name: string;
  total_count: number;    // Book total
  target_count: number;   // Batch target
  completed_count: number; // Actual uploaded
  status: 'pending' | 'uploading' | 'uploaded';
  created_date: string;
  is_reupload: boolean;
  is_partial: boolean;
  upload_type: string;
}

const Upload: React.FC = () => {
  const [batches, setBatches] = useState<OperatorBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<OperatorBatch | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Upload Progress State
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [filesCompleted, setFilesCompleted] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [queuedBatchUids, setQueuedBatchUids] = useState<string[]>([]);
  const [activeUploadUid, setActiveUploadUid] = useState<string | null>(null);

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<OperatorBatch | null>(null);
  const [editFields, setEditFields] = useState({
    book_name: '',
    total_count: 0,
    uploading_count: 0
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadManagerRef = useRef<UploadManager | null>(null);

  const token = localStorage.getItem('qc_token');
  const headers = { 'Authorization': `Bearer ${token}` };
  const { isOnline, wasOffline } = useNetworkStatus();

  const fetchBatches = async () => {
    try {
      setIsLoading(true);

      // Check if token exists
      if (!token) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to continue',
          variant: 'destructive'
        });
        window.location.href = '/login';
        return;
      }

      const res = await fetch(`${API_BASE_URL}/operator/batches`, { headers });

      // Handle 401 Unauthorized
      if (res.status === 401) {
        toast({
          title: 'Session Expired',
          description: 'Please log in again',
          variant: 'destructive'
        });
        localStorage.removeItem('qc_token');
        window.location.href = '/login';
        return;
      }

      if (!res.ok) throw new Error('Failed to fetch batches');

      const data = await res.json();
      const mappedData = data.map((item: any) => ({
        ...item,
        id: item.batch_uid
      }));
      setBatches(mappedData);
      await updateQueueStatus();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to load batches', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (batch: OperatorBatch) => {
    setEditingBatch(batch);
    setEditFields({
      book_name: batch.book_name,
      total_count: batch.total_count,
      uploading_count: batch.target_count
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch || !token) return;

    // Basic validation
    if (editingBatch.is_reupload || editingBatch.status === 'uploading') {
      // Logic from backend handles more precisely, but frontend should block obvious cases
    }

    try {
      setIsUpdating(true);
      const res = await fetch(`${API_BASE_URL}/operator/batches/${editingBatch.batch_uid}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          book_name: editFields.book_name,
          total_images: Number(editFields.total_count),
          uploading_count: Number(editFields.uploading_count)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Update failed');
      }

      toast({
        title: 'Success',
        description: 'Batch updated successfully',
      });

      setIsEditModalOpen(false);
      fetchBatches();
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const updateQueueStatus = async () => {
    try {
      const { getQueueCount, getBatchesWithPendingUploads } = await import('@/utils/uploadDB');
      const count = await getQueueCount();
      const uids = await getBatchesWithPendingUploads();
      setQueueCount(count);
      setQueuedBatchUids(uids);
    } catch (error) {
      console.error('Error updating queue status:', error);
    }
  };

  // Check for pending uploads on page load and auto-resume multi-batch queue
  const checkAndResumePendingUploads = async () => {
    try {
      if (!token || isUploading) return;

      const { getBatchesWithPendingUploads, getActiveBatch, getNextBatchInQueue } = await import('@/utils/uploadDB');

      // 1. Check if there's an active (interrupted) batch
      let activeBatchInfo = await getActiveBatch();

      // 2. If no active but there are queued, get the next one
      if (!activeBatchInfo) {
        activeBatchInfo = await getNextBatchInQueue() as any;
      }

      if (!activeBatchInfo) return;

      // 3. Find the batch in our current list (for UI state)
      const batch = batches.find(b => b.batch_uid === activeBatchInfo?.batch_uid);
      if (!batch) return;

      processNextBatchInQueue();

    } catch (error) {
      console.error('Error checking pending uploads:', error);
    }
  };

  /**
   * Master Queue Controller: Processes batches one-by-one
   */
  const processNextBatchInQueue = async () => {
    if (isUploading || !token) return;

    const { getActiveBatch, getNextBatchInQueue, updateBatchStatus, getPendingFiles, clearBatch, removeBatchFromQueue } = await import('@/utils/uploadDB');

    // 1. Get current or next batch
    let batchToProcess = await getActiveBatch();
    if (!batchToProcess) {
      batchToProcess = await getNextBatchInQueue();
    }

    if (!batchToProcess) {
      setIsUploading(false);
      setActiveUploadUid(null);
      return;
    }

    const batchUid = batchToProcess.batch_uid;
    const batchData = batches.find(b => b.batch_uid === batchUid);

    try {
      setIsUploading(true);
      setActiveUploadUid(batchUid);
      await updateBatchStatus(batchUid, 'uploading');
      await updateQueueStatus();

      // Sync with server
      const uploadedFiles = await syncWithServer(batchUid, token);
      const pendingFiles = await getPendingFiles(batchUid);
      const filesToUpload = pendingFiles.filter(f => !uploadedFiles.includes(f.file_name));

      if (filesToUpload.length === 0) {
        await clearBatch(batchUid);
        await removeBatchFromQueue(batchUid);
        await updateQueueStatus();
        fetchBatches();
        setIsUploading(false);
        processNextBatchInQueue(); // Move to next immediately
        return;
      }

      // Initialize upload manager
      const uploadManager = new UploadManager(token);
      uploadManagerRef.current = uploadManager;

      uploadManager.processUploadQueue(
        batchUid,
        filesToUpload,
        // On file progress
        (fileProgress) => {
          setCurrentFileName(fileProgress.fileName);
          setUploadProgress(fileProgress.progress);
        },
        // On batch progress
        (batchProgress) => {
          const currentCount = uploadedFiles.length + batchProgress.completed;
          setFilesCompleted(currentCount);

          // Update table list in real-time
          setBatches(prev => prev.map(b =>
            b.batch_uid === batchUid
              ? { ...b, completed_count: currentCount, status: 'uploading' }
              : b
          ));

          if (batchProgress.currentFile) {
            setCurrentFileName(batchProgress.currentFile);
          }
        },
        // On complete
        async () => {
          await clearBatch(batchUid);
          await removeBatchFromQueue(batchUid);
          await updateQueueStatus();
          setActiveUploadUid(null);

          toast({
            title: 'Batch Complete',
            description: `Successfully uploaded batch ${batchData?.batch_id || batchUid}`,
          });

          setIsUploading(false);
          fetchBatches();

          // CRITICAL: Trigger next batch in queue
          setTimeout(() => processNextBatchInQueue(), 1000);
        },
        // On error
        (error) => {
          console.error('Queue processing error:', error);
          toast({
            title: 'Upload Error',
            description: `Batch ${batchData?.batch_id}: ${error.message}`,
            variant: 'destructive'
          });
          setIsUploading(false);
        }
      );

    } catch (error) {
      console.error('Master queue error:', error);
      setIsUploading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  // Check for pending uploads after batches are loaded
  useEffect(() => {
    if (batches.length > 0 && !isUploading) {
      checkAndResumePendingUploads();
    }
  }, [batches]);

  const handleUploadClick = (batch: OperatorBatch) => {
    setSelectedBatch(batch);
    setSelectedFiles([]);
    setIsDialogOpen(true);
  };

  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Filter for TIFF images only
    const imageFiles = Array.from(files).filter(file =>
      file.name.toLowerCase().endsWith('.tif') ||
      file.name.toLowerCase().endsWith('.tiff')
    );

    if (imageFiles.length === 0) {
      toast({
        title: 'No TIFF Images',
        description: 'No valid TIFF (.tif, .tiff) images found in the selected folder. Only TIFF format is allowed.',
        variant: 'destructive'
      });
      return;
    }

    if (selectedBatch && imageFiles.length !== selectedBatch.target_count) {
      toast({
        title: 'Validation Error',
        description: `Selected folder has ${imageFiles.length} TIFF images, but exactly ${selectedBatch.target_count} images are required for this batch.`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedFiles(imageFiles);
    // Clear input so same folder can be re-selected if needed
    e.target.value = '';
  };

  const handleStartUpload = async () => {
    if (!selectedBatch || selectedFiles.length === 0 || !token) return;

    try {
      setIsSubmitting(true);
      // Check max queue limit (5 for Normal, 10 for Re-upload)
      const { addToBatchQueue, getQueueCount, getActiveBatch, getNextBatchInQueue } = await import('@/utils/uploadDB');

      const currentQueueSize = await getQueueCount();
      const maxLimit = selectedBatch.is_reupload ? 10 : 5;

      if (currentQueueSize >= maxLimit) {
        toast({
          title: 'Queue Full',
          description: `You can only queue up to ${maxLimit} ${selectedBatch.is_reupload ? 'Re-upload' : ''} batches at a time.`,
          variant: 'destructive'
        });
        return;
      }

      // 🔍 TYPE CHECK: Restrict Mixing Re-upload and Normal batches
      if (currentQueueSize > 0) {
        let referenceBatch = await getActiveBatch();
        if (!referenceBatch) {
          referenceBatch = await getNextBatchInQueue();
        }

        if (referenceBatch && referenceBatch.is_reupload !== selectedBatch.is_reupload) {
          toast({
            title: 'Queue Limitation',
            description: `You cannot mix ${selectedBatch.is_reupload ? 'Re-upload' : 'Normal'} batches with ${referenceBatch.is_reupload ? 'Re-upload' : 'Normal'} batches currently in queue.`,
            variant: 'destructive'
          });
          return;
        }
      }

      // Final check for non-TIFF files (extra safety)
      const nonTiffFiles = selectedFiles.filter(f =>
        !f.name.toLowerCase().endsWith('.tif') && !f.name.toLowerCase().endsWith('.tiff')
      );
      if (nonTiffFiles.length > 0) {
        toast({
          title: 'Invalid File Format',
          description: `Batch contains ${nonTiffFiles.length} non-TIFF files. Only .tif or .tiff files are accepted.`,
          variant: 'destructive'
        });
        setIsSubmitting(false);
        return;
      }

      // Store files in IndexedDB
      await storeFilesInQueue(selectedBatch.batch_uid, selectedFiles);

      // Add batch to metadata queue
      await addToBatchQueue(selectedBatch.batch_uid, selectedFiles.length, selectedBatch.is_reupload);
      await updateQueueStatus();

      toast({
        title: 'Batch Queued',
        description: `Added "${selectedBatch.batch_id}" to the upload queue.`,
      });

      setIsDialogOpen(false);
      setSelectedBatch(null);
      fetchBatches();

      // Trigger the queue processor if not already running
      if (!isUploading) {
        processNextBatchInQueue();
      }

    } catch (err) {
      console.error(err);
      toast({
        title: 'Queueing Failed',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePauseResume = () => {
    if (!uploadManagerRef.current) return;

    if (isPaused) {
      uploadManagerRef.current.resume();
      setIsPaused(false);
      toast({ title: 'Upload Resumed', description: 'Continuing upload...' });

      // Re-trigger the processing loop
      processNextBatchInQueue();
    } else {
      uploadManagerRef.current.pause();
      setIsPaused(true);
      toast({ title: 'Upload Paused', description: 'Upload paused. You can resume anytime.' });
    }
  };

  // Auto-pause on network loss
  useEffect(() => {
    if (!isOnline && isUploading && uploadManagerRef.current) {
      uploadManagerRef.current.pause();
      setIsPaused(true);
      toast({
        title: 'Network Lost',
        description: 'Upload paused. Will resume when connection is restored.',
        variant: 'destructive'
      });
    }
  }, [isOnline, isUploading]);

  // Auto-resume on network restore
  useEffect(() => {
    if (wasOffline && isOnline && isPaused && uploadManagerRef.current) {
      uploadManagerRef.current.resume();
      setIsPaused(false);
      toast({
        title: 'Network Restored',
        description: 'Resuming upload...',
      });
    }
  }, [wasOffline, isOnline, isPaused]);

  const activeBatches = batches.filter(batch => batch.status !== 'uploaded' && !batch.is_reupload);
  const activeQueueBatch = batches.find(b => queuedBatchUids.includes(b.batch_uid));
  const activeQueueIsReupload = activeQueueBatch ? activeQueueBatch.is_reupload : null;

  const columns = [
    {
      key: 'batch_id',
      header: 'Batch ID',
      sortable: true,
      render: (val: string) => <code className="text-xs font-bold text-primary">{val}</code>
    },
    { key: 'project_name', header: 'Project' },
    { key: 'book_name', header: 'Book Name' },
    { key: 'source_name', header: 'Source' },
    { key: 'location_name', header: 'Location' },
    { key: 'record_owner_name', header: 'Record Owner' },
    { key: 'record_type_name', header: 'Record Type' },
    {
      key: 'count',
      header: 'Count',
      render: (_: any, item: OperatorBatch) => (
        <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
          {item.completed_count} / {item.target_count}
        </span>
      )
    },
    {
      key: 'progress_bar',
      header: 'Progress',
      render: (_: any, item: OperatorBatch) => {
        const percentage = Math.round((item.completed_count / item.target_count) * 100) || 0;
        return (
          <div className="flex flex-col gap-1 min-w-[120px]">
            <div className="flex justify-between items-center text-[10px] font-bold text-primary/70 uppercase tracking-tighter">
              <span>{percentage}%</span>
              <span>
                {item.status === 'uploaded'
                  ? 'Complete'
                  : activeUploadUid === item.batch_uid
                    ? 'Uploading'
                    : queuedBatchUids.includes(item.batch_uid)
                      ? 'Queued'
                      : 'Pending'}
              </span>
            </div>
            <Progress value={percentage} className="h-2 shadow-sm" />
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
        const isCurrentActive = activeUploadUid === item.batch_uid;
        const isActivelyUploading = isUploading && isCurrentActive && !isPaused;
        const isCurrentlyPaused = isUploading && isCurrentActive && isPaused;
        const isQueued = !isCurrentActive && queuedBatchUids.includes(item.batch_uid);

        // Disable logic: 
        // 1. Queue is full (5 Normal / 10 Re-upload)
        // 2. Type Mismatch (Normal vs Re-upload)
        const isQueueFull = queueCount >= (item.is_reupload ? 10 : 5);
        const isTypeMismatch = activeQueueIsReupload !== null && activeQueueIsReupload !== item.is_reupload;

        const isGlobalBlocked = (isQueueFull || isTypeMismatch) && !isQueued && !isCurrentActive;

        if (item.status === 'uploaded') {
          return (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-success text-sm font-medium">
                <CheckCircle className="h-4 w-4" />
                Uploaded
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/image-preview/${item.batch_uid}`)}
                className="h-8 w-8 p-0 hover:text-primary transition-colors"
                title="Preview Images"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          );
        }

        if (isQueued) {
          return (
            <Button
              size="sm"
              disabled
              className="h-8 gap-2 bg-muted text-muted-foreground border-dashed border-2"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              In Queue
            </Button>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditClick(item)}
              disabled={isActivelyUploading || isQueued || isGlobalBlocked}
              className="h-8 w-8 p-0 border-slate-200 hover:bg-slate-50 hover:text-primary transition-all shadow-sm"
              title="Edit Batch Info"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="sm"
              onClick={() => isCurrentActive && isUploading ? handlePauseResume() : handleUploadClick(item)}
              disabled={isGlobalBlocked}
              className={`h-8 gap-2 transition-all duration-300 min-w-[100px] ${isActivelyUploading
                ? 'bg-primary/40 cursor-not-allowed text-white'
                : isCurrentlyPaused
                  ? 'bg-amber-500 hover:bg-amber-600 animate-pulse text-white shadow-md'
                  : 'bg-primary hover:bg-primary/90 shadow-sm'
                }`}
            >
              {isActivelyUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="animate-pulse">Uploading...</span>
                </>
              ) : isCurrentlyPaused ? (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  Resume
                </>
              ) : (
                <>
                  <FolderOpen className="h-4 w-4" />
                  {item.completed_count > 0 ? 'Continue' : 'Upload'}
                </>
              )}
            </Button>
          </div>
        );
      }
    }
  ];


  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Active Uploads"
        description="View and manage batches currently pending or in progress"
      />

      {/* Hidden Folder Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as any)}
        multiple
        onChange={handleFolderSelect}
      />

      <Card className="border border-primary/20 bg-primary/5 shadow-none overflow-hidden">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10 shadow-inner">
              <UploadIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Image Upload Center</CardTitle>
              <p className="text-xs text-muted-foreground font-medium">Select a batch and pick the folder containing your scanned images.</p>
            </div>
          </div>

          <div className="flex items-center gap-6 px-4 py-2 bg-background/50 rounded-lg border border-primary/10">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              TIFF-Only Processing
            </div>
            <div className="w-px h-4 bg-primary/20" />
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Real-time Progress
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Syncing your batches...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">Pending Batches</h2>
              <Badge variant="secondary" className="px-2 py-0.5 text-xs font-bold bg-primary/10 text-primary border-primary/20">
                {activeBatches.length}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              {queueCount > 0 && (
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 animate-pulse">
                  <ListFilter className="h-3 w-3" />
                  Queue: {queueCount}/{activeQueueIsReupload ? 10 : 5}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border">
                <ListFilter className="h-3 w-3" />
                Active Only
              </div>
            </div>
          </div>

          <DataTable
            data={activeBatches}
            columns={columns}
            searchPlaceholder="Search by Batch ID, Book Or Project..."
            emptyMessage="No pending batches found."
          />
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <UploadIcon className="h-5 w-5 text-primary" />
                Upload Batch Images
              </DialogTitle>
              <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[10px] font-bold px-2 py-0.5 animate-pulse">
                TIFF ONLY (.tif, .tiff)
              </Badge>
            </div>
            <DialogDescription>
              Review batch details and select the folder containing your scanned TIFF images.
            </DialogDescription>
          </DialogHeader>

          {selectedBatch && (
            <div className="space-y-6 py-4">
              {/* Batch Info Grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm bg-muted/30 p-4 rounded-xl border border-border/50 text-left">
                <div className="space-y-1 col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Batch ID</p>
                  <p className="font-mono font-bold text-primary break-all">{selectedBatch.batch_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project</p>
                  <p className="font-medium text-foreground">{selectedBatch.project_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Book Name</p>
                  <p className="font-medium text-foreground">{selectedBatch.book_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Source</p>
                  <p className="font-medium text-foreground">{selectedBatch.source_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Location</p>
                  <p className="font-medium text-foreground">{selectedBatch.location_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Record Type</p>
                  <p className="font-medium text-foreground">{selectedBatch.record_type_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target Count</p>
                  <p className="font-bold flex items-center gap-1.5 text-foreground">
                    <Files className="h-3.5 w-3.5 text-primary" />
                    {selectedBatch.target_count} Images
                  </p>
                </div>
              </div>

              {/* Folder Selection Area */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    Select Source Folder
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBrowseClick}
                    className="h-8 gap-2"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Browse Folder
                  </Button>
                </div>

                {selectedFiles.length > 0 ? (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <CheckCircle className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-primary">TIFF Folder Selected</p>
                        <p className="text-xs text-muted-foreground">
                          Ready to upload <strong>{selectedFiles.length}</strong> TIFF images ({selectedBatch.target_count} required)
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={handleBrowseClick}
                    className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer group"
                  >
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                      <UploadIcon className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Click to browse your TIFF folder</p>
                      <p className="text-xs text-muted-foreground mt-1">Only .tif or .tiff files will be picked</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-[11px]">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <p><strong>Note:</strong> Only TIFF format images are accepted. JPEG, PNG, or other formats will be filtered out. Ensure the folder has exactly {selectedBatch.target_count} TIFF files.</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartUpload}
              disabled={selectedFiles.length === 0 || isSubmitting}
              className="min-w-[140px] shadow-lg shadow-primary/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : isUploading ? (
                <>
                  <ListFilter className="mr-2 h-4 w-4" />
                  Add to Queue
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 h-4 w-4" />
                  Start Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Info Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Edit Batch Configuration
            </DialogTitle>
            <DialogDescription>
              Update information for batch: <span className="font-mono font-bold text-foreground">{editingBatch?.batch_id}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit_book_name">Book Name</Label>
              <Input
                id="edit_book_name"
                value={editFields.book_name}
                onChange={(e) => setEditFields(prev => ({ ...prev, book_name: e.target.value.toUpperCase() }))}
                className="uppercase font-bold"
              />
            </div>

            {editingBatch?.status === 'pending' || editingBatch?.completed_count === 0 ? (
              <div className="grid gap-4">
                {editingBatch?.upload_type !== 'Complete' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit_total_count">Total Images (Book)</Label>
                      <Input
                        id="edit_total_count"
                        type="number"
                        value={editFields.total_count}
                        onChange={(e) => setEditFields(prev => ({ ...prev, total_count: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit_target_count">Batch Target</Label>
                      <Input
                        id="edit_target_count"
                        type="number"
                        value={editFields.uploading_count}
                        onChange={(e) => setEditFields(prev => ({ ...prev, uploading_count: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor="edit_master_count">Total Images to Upload</Label>
                    <Input
                      id="edit_master_count"
                      type="number"
                      value={editFields.uploading_count}
                      onChange={(e) => setEditFields(prev => ({
                        ...prev,
                        uploading_count: Number(e.target.value),
                        total_count: Number(e.target.value)
                      }))}
                    />
                    <p className="text-[10px] text-muted-foreground italic">For Complete batches, target and total are identical.</p>
                  </div>
                )}
              </div>
            ) : (
              <Alert className="bg-slate-50 border-slate-200">
                <Info className="h-4 w-4" />
                <AlertTitle className="text-xs font-bold uppercase">Counts Locked</AlertTitle>
                <AlertDescription className="text-xs">
                  Image counts cannot be modified once an upload has started.
                </AlertDescription>
              </Alert>
            )}

            {editingBatch?.is_reupload && (
              <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-xs font-bold uppercase">Lineage Note</AlertTitle>
                <AlertDescription className="text-xs opacity-90">
                  Total Images must be greater than Batch Target for Rework/Partial batches.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateBatch} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Upload;
