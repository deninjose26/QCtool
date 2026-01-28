import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Search,
  CheckCircle2,
  RefreshCw,
  Maximize,
  Minimize
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config';
import { cn } from '@/lib/utils';

interface QCImage {
  qc_id: string;
  image_id: string;
  image_name: string;
  qc_s3_path: string | null;
  original_s3_path: string;
  qc_status: 'Pending' | 'Approved' | 'Rejected';
  orientation_error: boolean;
  remarks: string | null;
}

const REJECTION_REASONS = [
  'Readability',
  'Cropped',
  'Obscurant',
  'Poor Lighting',
  'Duplicate',
  'Other'
];

const QCPanel: React.FC = () => {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = localStorage.getItem('qc_token');
  const viewerRef = useRef<HTMLDivElement>(null);

  const [images, setImages] = useState<QCImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<QCImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // QC Decision State
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [orientationIssue, setOrientationIssue] = useState(false);

  // Filter State
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Keyboard shortcuts enabled
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);
  const [batchInfo, setBatchInfo] = useState<{ batch_id: string; project_name: string; source_name: string } | null>(null);

  // Pagination state
  const [totalImages, setTotalImages] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [allocationId, setAllocationId] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const currentImage = filteredImages[currentIndex];

  // Fetch images
  useEffect(() => {
    const fetchBatchInfo = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/qc/my-tasks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const tasks = await res.json();
          const currentTask = tasks.find((t: any) => t.batch_uid === batchId);
          if (currentTask) {
            setBatchInfo({
              batch_id: currentTask.batch_id,
              project_name: currentTask.project_name,
              source_name: currentTask.source_name
            });
            setAllocationId(currentTask.qc_allocation_id);
          }
        }
      } catch (error) {
      }
    };

    const fetchImages = async () => {
      try {
        setIsLoading(true);
        const filterParam = statusFilter !== 'all' ? `filter_status=${statusFilter}&` : '';
        const res = await fetch(`${API_BASE_URL}/qc/batch-images/${batchId}?${filterParam}limit=100&offset=0`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to fetch images');
        }

        const data = await res.json();

        setTotalImages(data.total);
        setHasMore(data.has_more);
        setImages(data.images);
        setFilteredImages(data.images);

        // Auto-resume: find first pending image ONLY in 'all' view
        if (statusFilter === 'all') {
          const firstPendingIdx = data.images.findIndex((img: any) => img.qc_status === 'Pending');
          if (firstPendingIdx !== -1) {
            setCurrentIndex(firstPendingIdx);
          } else {
            setCurrentIndex(0);
          }
        } else {
          // For specific filters, always start from beginning
          setCurrentIndex(0);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Could not load images',
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (batchId) {
      fetchBatchInfo();
      fetchImages();
    }
  }, [batchId, statusFilter, token, toast]);

  const loadMoreImages = () => {
    if (batchId && hasMore && !isLoadingMore) {
      const fetchMore = async () => {
        try {
          setIsLoadingMore(true);
          const offset = images.length;
          const filterParam = statusFilter !== 'all' ? `filter_status=${statusFilter}&` : '';
          const res = await fetch(`${API_BASE_URL}/qc/batch-images/${batchId}?${filterParam}limit=100&offset=${offset}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (res.ok) {
            const data = await res.json();
            setTotalImages(data.total);
            setHasMore(data.has_more);
            setImages(prev => [...prev, ...data.images]);
            setFilteredImages(prev => [...prev, ...data.images]);
          }
        } catch (error) {
          toast({ title: 'Error loading more images', variant: 'destructive' });
        } finally {
          setIsLoadingMore(false);
        }
      };
      fetchMore();
    }
  };

  // Apply search filter
  useEffect(() => {
    if (searchTerm) {
      setFilteredImages(images.filter(img =>
        img.image_name.toLowerCase().includes(searchTerm.toLowerCase())
      ));
    } else {
      setFilteredImages(images);
    }
  }, [searchTerm, images]);

  // Reset index when search term or filter changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [searchTerm, statusFilter]);

  // Reset scroll on image change
  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.scrollTop = 0;
    }
  }, [currentIndex]);

  // Submit QC Decision
  const submitDecision = async (status: 'Approved' | 'Rejected', remarks?: string) => {
    if (!currentImage) return;

    try {
      const res = await fetch(`${API_BASE_URL}/qc/decision/${currentImage.qc_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          qc_status: status,
          orientation_error: orientationIssue,
          remarks: remarks || null
        })
      });

      if (!res.ok) throw new Error('Failed to submit decision');

      // Update local state
      setImages(images.map(img =>
        img.qc_id === currentImage.qc_id
          ? { ...img, qc_status: status, orientation_error: orientationIssue, remarks: remarks || null }
          : img
      ));

      toast({ title: `Image ${status.toLowerCase()}` });

      // Move to next image if viewing all or still matches specific filter
      if (currentIndex < filteredImages.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }

      // Reset form
      setShowRejectForm(false);
      setRejectionReason('');
      setCustomReason('');
      setOrientationIssue(false);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Could not submit decision', variant: 'destructive' });
    }
  };

  const handleMarkComplete = async () => {
    if (!allocationId) return;

    if (!confirm("Are you sure you want to mark this task as complete? It will be moved to QC History.")) {
      return;
    }

    setIsFinalizing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/qc/complete-task/${allocationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('Failed to complete task');

      toast({
        title: 'Task Completed',
        description: 'Batch has been moved to QC History.',
      });

      navigate('/tasks');
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'Could not finalize task',
        variant: 'destructive'
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleAccept = () => {
    submitDecision('Approved');
  };

  const handleReject = () => {
    if (!rejectionReason) {
      toast({ title: 'Please select a rejection reason', variant: 'destructive' });
      return;
    }

    const finalReason = rejectionReason === 'Other' ? customReason : rejectionReason;
    submitDecision('Rejected', finalReason);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!keyboardEnabled) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (showRejectForm) {
        const isDetailsBox = e.target instanceof HTMLTextAreaElement;

        if (e.key === 'Enter') {
          if (rejectionReason === 'Other' && !isDetailsBox) {
            const textArea = document.querySelector('textarea');
            if (textArea) textArea.focus();
            return;
          }
          handleReject();
          return;
        }

        if (e.key === 'Escape') {
          setShowRejectForm(false);
          setRejectionReason('');
          setCustomReason('');
          return;
        }

        if (!isDetailsBox) {
          const curIdx = REJECTION_REASONS.indexOf(rejectionReason);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIdx = (curIdx + 1) % REJECTION_REASONS.length;
            setRejectionReason(REJECTION_REASONS[nextIdx]);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIdx = (curIdx - 1 + REJECTION_REASONS.length) % REJECTION_REASONS.length;
            setRejectionReason(REJECTION_REASONS[prevIdx]);
          }
        }
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'a': handleAccept(); break;
        case 'r':
          setShowRejectForm(true);
          setRejectionReason(REJECTION_REASONS[0]);
          break;
        case 'o': setOrientationIssue(!orientationIssue); break;
        case 'f': toggleFullscreen(); break;
        case 'arrowleft':
          if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
          break;
        case 'arrowright':
          if (currentIndex < filteredImages.length - 1) setCurrentIndex(currentIndex + 1);
          break;
        case 'arrowup':
          if (viewerRef.current && !isFullscreen) {
            e.preventDefault();
            viewerRef.current.scrollBy({ top: -60, behavior: 'smooth' });
          }
          break;
        case 'arrowdown':
          if (viewerRef.current && !isFullscreen) {
            e.preventDefault();
            viewerRef.current.scrollBy({ top: 60, behavior: 'smooth' });
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [keyboardEnabled, currentImage, currentIndex, filteredImages.length, orientationIssue, showRejectForm, isFullscreen, rejectionReason, customReason]);

  const toggleFullscreen = () => {
    const viewerElement = document.getElementById('qc-image-viewer');
    if (!viewerElement) return;

    if (!document.fullscreenElement) {
      viewerElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
        setZoom(1);
      }).catch(console.error);
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
        setZoom(1);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const stats = {
    pending: images.filter(img => img.qc_status === 'Pending').length,
    accepted: images.filter(img => img.qc_status === 'Approved').length,
    rejected: images.filter(img => img.qc_status === 'Rejected').length,
  };

  const allReviewed = stats.pending === 0 && images.length > 0 && !hasMore;

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tasks')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">QC Workbench</h1>
            <p className="text-sm text-slate-500">
              {batchInfo ? (
                <>
                  <span className="font-semibold">Batch: {batchInfo.batch_id}</span>
                  <span className="mx-2">•</span>
                  <span>{batchInfo.project_name} / {batchInfo.source_name}</span>
                </>
              ) : (
                `Batch: ${batchId}`
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm mr-2">
            <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200 font-bold px-2 h-5">
              P: {stats.pending}
            </Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold px-2 h-5">
              A: {stats.accepted}
            </Badge>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 font-bold px-2 h-5">
              R: {stats.rejected}
            </Badge>
          </div>

          {allocationId && (
            <Button
              onClick={handleMarkComplete}
              disabled={isFinalizing || !allReviewed}
              className={cn(
                "gap-2 h-9 px-4 font-black text-[10px] uppercase tracking-widest transition-all duration-500 shadow-lg",
                allReviewed
                  ? "bg-green-600 hover:bg-green-700 shadow-green-200 text-white cursor-pointer"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none border-slate-200"
              )}
            >
              {isFinalizing ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Finalize Batch
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search images..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {filteredImages.length > 0 && (
          <div className="ml-auto text-sm text-slate-500 font-semibold bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
            {currentIndex + 1} / {filteredImages.length}
          </div>
        )}
      </div>

      <div
        className={cn(
          "grid lg:grid-cols-4 gap-4",
          isFullscreen && "h-screen bg-white p-4 overflow-hidden"
        )}
        id="qc-image-viewer"
      >
        <div className={cn("lg:col-span-3 space-y-4 relative flex flex-col", isFullscreen && "h-full")}>
          {isLoading ? (
            <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              <div className="text-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-slate-500 font-medium">Loading images...</p>
              </div>
            </div>
          ) : (filteredImages.length === 0 || totalImages === 0) ? (
            <Card className="border-2 border-dashed border-slate-200 h-[600px] flex items-center justify-center">
              <CardContent className="p-12 text-center">
                <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <Search className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {totalImages === 0 ? "No Images Allocated" : "No Results Found"}
                </h3>
                <p className="text-slate-500 max-w-sm mx-auto mb-8 text-sm">
                  {totalImages === 0
                    ? 'This batch has no images allocated for QC. Please contact your supervisor.'
                    : searchTerm
                      ? `No images match your search for "${searchTerm}".`
                      : `You have no images with the "${statusFilter}" status here.`}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {(statusFilter !== 'all' || searchTerm !== '') && (
                    <Button
                      variant="default"
                      onClick={() => { setStatusFilter('all'); setSearchTerm(''); }}
                      className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Show All Images
                    </Button>
                  )}
                  {totalImages === 0 && (
                    <Button variant="outline" onClick={() => navigate('/tasks')} className="border-slate-300">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to My Tasks
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className={cn("overflow-hidden border-slate-200", isFullscreen && "flex-1 flex flex-col")}>
                <div className="bg-slate-50 p-3 flex items-center justify-between border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {currentImage?.image_name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        currentImage?.qc_status === 'Approved' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        currentImage?.qc_status === 'Rejected' && 'bg-red-50 text-red-700 border-red-200',
                        currentImage?.qc_status === 'Pending' && 'bg-slate-50 text-slate-600 border-slate-200'
                      )}
                    >
                      {currentImage?.qc_status || 'Pending'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isFullscreen && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-sm w-16 text-center font-medium">{Math.round(zoom * 100)}%</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRotation((rotation + 90) % 360)}>
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-6 bg-slate-300 mx-1"></div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={toggleFullscreen}
                      title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                    >
                      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <CardContent
                  ref={viewerRef}
                  className={cn(
                    "p-0 overflow-auto bg-slate-200 relative custom-scrollbar",
                    isFullscreen ? "flex-1 min-h-0" : "h-[600px]"
                  )}
                >
                  {currentImage && (
                    <div className={cn(
                      "min-h-full min-w-full flex transition-all duration-300 relative",
                      zoom > 1 ? "items-start justify-center pt-8" : "items-center justify-center"
                    )}>
                      <div
                        className={cn(
                          "relative transition-all duration-300 flex flex-shrink-0 items-center justify-center",
                          zoom > 1 ? "p-12" : ""
                        )}
                        style={{
                          width: zoom > 1 ? 'fit-content' : '100%',
                          height: zoom > 1 ? 'fit-content' : '100%',
                          margin: '0 auto'
                        }}
                      >
                        <img
                          src={currentImage.qc_s3_path || currentImage.original_s3_path}
                          alt={currentImage.image_name}
                          className="transition-all duration-300 shadow-lg bg-white"
                          style={{
                            transform: `rotate(${rotation}deg)`,
                            maxHeight: isFullscreen ? `calc(${zoom} * (100vh - 120px))` : `${zoom * 600}px`,
                            maxWidth: zoom > 1 ? 'none' : '100%',
                            width: 'auto',
                            height: 'auto',
                            display: 'block'
                          }}
                        />
                      </div>

                      {currentImage.qc_status === 'Approved' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-8xl font-black text-emerald-500/30 transform -rotate-12">
                            ACCEPTED
                          </div>
                        </div>
                      )}
                      {currentImage.qc_status === 'Rejected' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-8xl font-black text-red-500/30 transform -rotate-12">
                            REJECTED
                          </div>
                        </div>
                      )}

                      {isFullscreen && showRejectForm && (
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                          <Card className="w-full max-w-[400px] border-white/10 bg-slate-900 shadow-2xl overflow-hidden ring-1 ring-white/20">
                            <div className="bg-red-600/10 px-6 py-4 border-b border-white/5 flex items-center gap-3">
                              <div className="bg-red-500 p-1.5 rounded-lg">
                                <X className="h-5 w-5 text-white" />
                              </div>
                              <h3 className="text-lg font-bold text-white">Reject Image</h3>
                            </div>
                            <CardContent className="p-6 space-y-4">
                              <div>
                                <Label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 block font-mono">
                                  Select Reason
                                </Label>
                                <div className="space-y-1.5">
                                  {REJECTION_REASONS.map((reason) => (
                                    <button
                                      key={reason}
                                      type="button"
                                      onClick={() => setRejectionReason(reason)}
                                      className={cn(
                                        "w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200",
                                        rejectionReason === reason
                                          ? "bg-indigo-600 border-indigo-500 text-white"
                                          : "bg-slate-800 border-white/5 text-slate-400 hover:bg-slate-800/80"
                                      )}
                                    >
                                      <span className="text-sm font-bold">{reason}</span>
                                      {rejectionReason === reason && <Check className="h-3 w-3" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {rejectionReason === 'Other' && (
                                <Textarea
                                  placeholder="Details..."
                                  value={customReason}
                                  onChange={(e) => setCustomReason(e.target.value)}
                                  className="bg-slate-800 text-white border-white/10"
                                />
                              )}
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="fs-orientation"
                                  checked={orientationIssue}
                                  onCheckedChange={(c) => setOrientationIssue(c as boolean)}
                                />
                                <label htmlFor="fs-orientation" className="text-sm font-medium text-white/70">
                                  Orientation Issue (O)
                                </label>
                              </div>
                              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                                <Button variant="ghost" className="text-white hover:bg-white/5" onClick={() => setShowRejectForm(false)}>
                                  Cancel
                                </Button>
                                <Button className="bg-red-600 hover:bg-red-700" onClick={handleReject}>
                                  Confirm
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {!isFullscreen && hasMore && (
                <div className="text-center py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMoreImages}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? "Loading..." : `Load More (${totalImages - images.length} remaining)`}
                  </Button>
                </div>
              )}

              {isFullscreen ? (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
                  <div className="flex items-center bg-slate-900/95 backdrop-blur-xl px-2 py-1.5 rounded-2xl shadow-2xl border border-white/10">
                    <Button variant="ghost" size="icon" className="text-white/70 hover:text-white" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <div className="px-6 text-xl font-bold text-white tabular-nums min-w-[100px] text-center">
                      {currentIndex + 1} / {filteredImages.length}
                    </div>
                    <Button variant="ghost" size="icon" className="text-white/70 hover:text-white" onClick={() => setCurrentIndex(Math.min(filteredImages.length - 1, currentIndex + 1))} disabled={currentIndex === filteredImages.length - 1}>
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
                  <div className="flex items-center gap-1 bg-white/90 backdrop-blur-md px-1 py-1 rounded-xl shadow-lg border border-slate-200">
                    <Button variant="ghost" size="sm" className="h-9 px-2 text-slate-600" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
                      <ChevronLeft className="h-4 w-4" />
                      <span className="text-xs">Prev</span>
                    </Button>
                    <div className="h-4 w-px bg-slate-200 mx-1" />
                    <div className="px-3 text-xs font-bold tabular-nums">
                      {currentIndex + 1} / {filteredImages.length}
                    </div>
                    <div className="h-4 w-px bg-slate-200 mx-1" />
                    <Button variant="ghost" size="sm" className="h-9 px-2 text-slate-600" onClick={() => setCurrentIndex(Math.min(filteredImages.length - 1, currentIndex + 1))} disabled={currentIndex === filteredImages.length - 1}>
                      <span className="text-xs">Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className={cn("space-y-4", isFullscreen && "h-full overflow-y-auto")}>
          <Card className="border-slate-200">
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-slate-900">QC Actions</h3>
              {!showRejectForm ? (
                <div className="space-y-3">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleAccept}
                    disabled={!currentImage}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Accept (A)
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowRejectForm(true)}
                    disabled={!currentImage}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject (R)
                  </Button>
                  <div className="pt-3 border-t">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="orientation"
                        checked={orientationIssue}
                        onCheckedChange={(c) => setOrientationIssue(c as boolean)}
                        disabled={!currentImage}
                      />
                      <label htmlFor="orientation" className="text-sm font-medium">
                        Orientation Issue (O)
                      </label>
                    </div>
                  </div>
                </div>
              ) : !isFullscreen ? (
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase mb-2 block">Reason:</Label>
                  {REJECTION_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => setRejectionReason(reason)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded border text-xs",
                        rejectionReason === reason ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-slate-200"
                      )}
                    >
                      {reason}
                    </button>
                  ))}
                  {rejectionReason === 'Other' && (
                    <Textarea
                      placeholder="Custom reason..."
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      className="min-h-[80px]"
                    />
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowRejectForm(false)}>Cancel</Button>
                    <Button variant="destructive" className="flex-1" onClick={handleReject}>Confirm</Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 text-center rounded border border-dashed">
                  <p className="text-[10px] uppercase font-bold text-slate-400">HUD Active</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">View Filter</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['all', 'pending', 'accepted', 'rejected'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={statusFilter === f ? 'default' : 'outline'}
                    size="sm"
                    className="capitalize text-xs h-10"
                    onClick={() => setStatusFilter(f)}
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-50/50 text-[10px]">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-bold uppercase text-slate-400">Shortcuts</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-slate-500">Accept:</span> <kbd className="font-mono font-bold">A</kbd>
                <span className="text-slate-500">Reject:</span> <kbd className="font-mono font-bold">R</kbd>
                <span className="text-slate-500">Orientation:</span> <kbd className="font-mono font-bold">O</kbd>
                <span className="text-slate-500">Fullscreen:</span> <kbd className="font-mono font-bold">F</kbd>
                <span className="text-slate-500">Prev/Next:</span> <kbd className="font-mono font-bold">← →</kbd>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default QCPanel;
