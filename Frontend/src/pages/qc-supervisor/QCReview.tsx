import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Check,
    X,
    ArrowLeft,
    ZoomIn,
    ZoomOut,
    RotateCw,
    Search,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Save,
    Eye,
    Filter,
    RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface QCImage {
    qc_id: string;
    image_id: string;
    image_name: string;
    qc_s3_path: string | null;
    original_s3_path: string;
    qc_status: 'Pending' | 'Approved' | 'Rejected';
    orientation_error: boolean;
    remarks: string | null;
    qc_date: string;
}

const REJECTION_REASONS = [
    'Readability',
    'Cropped',
    'Obscurant',
    'Poor Lighting',
    'Duplicate',
    'Other'
];

const QCReview: React.FC = () => {
    const { batchId } = useParams<{ batchId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { apiFetch } = useAuth();

    const [images, setImages] = useState<QCImage[]>([]);
    const [filteredImages, setFilteredImages] = useState<QCImage[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [rotation, setRotation] = useState(0);

    // Filter states
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Edit dialog states
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editStatus, setEditStatus] = useState<'Approved' | 'Rejected'>('Approved');
    const [editOrientationError, setEditOrientationError] = useState(false);
    const [editRemarks, setEditRemarks] = useState('');
    const [imageError, setImageError] = useState(false);

    const currentImage = filteredImages[currentIndex];

    // Reset image error when changing images
    useEffect(() => {
        setImageError(false);
    }, [currentIndex]);

    const fetchImages = async () => {
        if (!batchId) return;

        try {
            setIsLoading(true);
            const res = await apiFetch(`${API_BASE_URL}/qc-sup/batch-images/${batchId}`);

            if (!res.ok) throw new Error('Failed to fetch images');

            const data = await res.json();
            console.log('QC Review - Fetched images:', data);
            console.log('First image details:', data[0]);
            setImages(data);
            setFilteredImages(data);
        } catch (error) {
            console.error(error);
            toast({
                title: 'Error',
                description: 'Failed to load batch images',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchImages();
    }, [batchId]);

    // Apply filters
    useEffect(() => {
        let result = [...images];

        if (statusFilter !== 'all') {
            result = result.filter(img => img.qc_status === statusFilter);
        }

        setFilteredImages(result);
        setCurrentIndex(0); // Reset to first image when filter changes
    }, [statusFilter, images]);

    const handleOpenEditDialog = () => {
        if (!currentImage) return;

        setEditStatus(currentImage.qc_status === 'Rejected' ? 'Rejected' : 'Approved');
        setEditOrientationError(currentImage.orientation_error);
        setEditRemarks(currentImage.remarks || '');
        setIsEditDialogOpen(true);
    };

    const handleSaveChanges = async () => {
        if (!currentImage) return;

        if (editStatus === 'Rejected' && !editRemarks.trim()) {
            toast({
                title: 'Remarks Required',
                description: 'Please provide a reason for rejection',
                variant: 'destructive'
            });
            return;
        }

        try {
            setIsSaving(true);

            const res = await apiFetch(`${API_BASE_URL}/qc-sup/update-qc-status/${currentImage.qc_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qc_status: editStatus,
                    orientation_error: editOrientationError,
                    remarks: editStatus === 'Approved' ? null : (editRemarks || null)
                })
            });

            if (!res.ok) throw new Error('Failed to update QC status');

            toast({
                title: 'Success',
                description: 'QC status updated successfully'
            });

            // Refresh images
            await fetchImages();
            setIsEditDialogOpen(false);
        } catch (error) {
            console.error(error);
            toast({
                title: 'Error',
                description: 'Failed to update QC status',
                variant: 'destructive'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleNext = () => {
        if (currentIndex < filteredImages.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setZoom(100);
            setRotation(0);
        }
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setZoom(100);
            setRotation(0);
        }
    };

    const handleKeyPress = useCallback((e: KeyboardEvent) => {
        if (isEditDialogOpen) return; // Don't handle shortcuts when dialog is open

        switch (e.key) {
            case 'ArrowRight':
                handleNext();
                break;
            case 'ArrowLeft':
                handlePrevious();
                break;
            case 'e':
            case 'E':
                handleOpenEditDialog();
                break;
        }
    }, [currentIndex, filteredImages.length, isEditDialogOpen]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [handleKeyPress]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Approved':
                return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
            case 'Rejected':
                return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
            default:
                return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Pending</Badge>;
        }
    };

    const stats = {
        total: images.length,
        approved: images.filter(img => img.qc_status === 'Approved').length,
        rejected: images.filter(img => img.qc_status === 'Rejected').length,
        pending: images.filter(img => img.qc_status === 'Pending').length
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-slate-600">Loading batch images...</p>
                </div>
            </div>
        );
    }


    return (
        <div className="h-screen flex flex-col bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/qc-review-queue')}
                            className="gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">QC Review</h1>
                            <p className="text-sm text-slate-500">Batch: {batchId}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Stats */}
                        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg border">
                            <div className="text-center">
                                <div className="text-xs text-slate-500">Total</div>
                                <div className="text-lg font-bold">{stats.total}</div>
                            </div>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="text-center">
                                <div className="text-xs text-green-600">Approved</div>
                                <div className="text-lg font-bold text-green-600">{stats.approved}</div>
                            </div>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="text-center">
                                <div className="text-xs text-red-600">Rejected</div>
                                <div className="text-lg font-bold text-red-600">{stats.rejected}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Thumbnail Strip */}
                <div className="w-48 bg-slate-800 border-r border-slate-700 flex flex-col">
                    <div className="p-3 border-b border-slate-700">
                        <h3 className="text-sm font-bold text-white mb-2">Images</h3>
                        <p className="text-xs text-slate-400 mb-3">{filteredImages.length} of {images.length}</p>

                        {/* Filter */}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full h-8 text-xs bg-slate-700 border-slate-600 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Images</SelectItem>
                                <SelectItem value="Approved">Approved</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {filteredImages.length > 0 ? (
                            filteredImages.map((img, idx) => (
                                <button
                                    key={img.qc_id}
                                    onClick={() => {
                                        setCurrentIndex(idx);
                                        setZoom(100);
                                        setRotation(0);
                                        setImageError(false);
                                    }}
                                    className={cn(
                                        "w-full aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all relative group",
                                        currentIndex === idx
                                            ? "border-indigo-500 ring-2 ring-indigo-500/50"
                                            : img.qc_status === 'Approved'
                                                ? "border-emerald-500/50 hover:border-emerald-500"
                                                : img.qc_status === 'Rejected'
                                                    ? "border-red-500/50 hover:border-red-500"
                                                    : "border-slate-600 hover:border-slate-500"
                                    )}
                                >
                                    <img
                                        src={img.qc_s3_path || img.original_s3_path}
                                        alt={img.image_name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                    {/* Thumbnail overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="absolute bottom-1 left-1 right-1">
                                            <p className="text-[10px] text-white font-medium truncate">{img.image_name}</p>
                                        </div>
                                    </div>
                                    {/* Status indicator */}
                                    <div className="absolute top-1 right-1">
                                        {img.qc_status === 'Approved' && (
                                            <div className="bg-emerald-500 rounded-full p-1">
                                                <Check className="h-3 w-3 text-white" />
                                            </div>
                                        )}
                                        {img.qc_status === 'Rejected' && (
                                            <div className="bg-red-500 rounded-full p-1">
                                                <X className="h-3 w-3 text-white" />
                                            </div>
                                        )}
                                    </div>
                                    {/* Current indicator */}
                                    {currentIndex === idx && (
                                        <div className="absolute top-1 left-1 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                            NOW
                                        </div>
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="py-8 px-4 text-center">
                                <Filter className="h-8 w-8 text-slate-600 mx-auto mb-2 opacity-20" />
                                <p className="text-[10px] text-slate-500 font-medium">No images match this filter</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Image Viewer */}
                <div className="flex-1 flex flex-col bg-slate-100 relative">
                    {/* Image Controls */}
                    <div className="absolute top-4 right-4 z-10 flex gap-2">
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setZoom(Math.max(50, zoom - 10))}
                            className="bg-white/90 hover:bg-white"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setZoom(Math.min(200, zoom + 10))}
                            className="bg-white/90 hover:bg-white"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setRotation((rotation + 90) % 360)}
                            className="bg-white/90 hover:bg-white"
                        >
                            <RotateCw className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Image */}
                    <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
                        {currentImage ? (
                            <>
                                {!imageError ? (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <img
                                            src={currentImage.qc_s3_path || currentImage.original_s3_path}
                                            alt={currentImage.image_name}
                                            className="max-w-full max-h-full object-contain transition-transform shadow-2xl bg-white"
                                            style={{
                                                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`
                                            }}
                                            onError={(e) => {
                                                console.error('Image load error:', currentImage.image_name);
                                                const img = e.currentTarget;
                                                if (img.src !== currentImage.original_s3_path && currentImage.original_s3_path) {
                                                    img.src = currentImage.original_s3_path;
                                                } else {
                                                    setImageError(true);
                                                }
                                            }}
                                        />

                                        {/* Status Watermark Overlay */}
                                        {currentImage.qc_status === 'Approved' && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="text-8xl font-black text-emerald-500/20 transform -rotate-12">
                                                    APPROVED
                                                </div>
                                            </div>
                                        )}
                                        {currentImage.qc_status === 'Rejected' && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="text-8xl font-black text-red-500/20 transform -rotate-12">
                                                    REJECTED
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-4">
                                        <AlertCircle className="h-16 w-16 text-amber-500" />
                                        <div className="text-center max-w-md">
                                            <h3 className="text-lg font-bold mb-2 text-slate-900">Image Not Available</h3>
                                            <p className="text-sm text-slate-700 mb-2">
                                                Failed to load <code className="bg-slate-200 px-2 py-1 rounded text-amber-600">{currentImage.image_name}</code>
                                            </p>
                                            <p className="text-xs text-slate-600">
                                                The converted JPEG image may not exist in S3 yet. The conversion process might still be running, or the original TIFF file may not have been converted successfully.
                                            </p>
                                            <p className="text-xs text-slate-500 mt-2">
                                                Please check the conversion status or wait for the conversion to complete.
                                            </p>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setImageError(false)}
                                            className="mt-2"
                                        >
                                            <RotateCw className="h-4 w-4 mr-2" />
                                            Retry Loading
                                        </Button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center p-12 animate-fade-in">
                                <div className="mx-auto w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                                    <Search className="h-8 w-8 text-slate-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">
                                    {images.length === 0 ? "No Images in Batch" : "No Results Found"}
                                </h3>
                                <p className="text-slate-500 max-w-sm mx-auto mb-8 text-sm">
                                    {images.length === 0
                                        ? 'This batch contains no images for review.'
                                        : `No images currently match the "${statusFilter}" status filter.`}
                                </p>
                                {statusFilter !== 'all' && images.length > 0 && (
                                    <Button
                                        onClick={() => setStatusFilter('all')}
                                        className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                                    >
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Show All Images
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                        <Button
                            variant="secondary"
                            onClick={handlePrevious}
                            disabled={filteredImages.length === 0 || currentIndex === 0}
                            className="gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Previous
                        </Button>

                        <div className="text-slate-700 text-sm font-medium">
                            {filteredImages.length > 0 ? (
                                `Image ${currentIndex + 1} of ${filteredImages.length}`
                            ) : (
                                "No images to display"
                            )}
                        </div>

                        <Button
                            variant="secondary"
                            onClick={handleNext}
                            disabled={filteredImages.length === 0 || currentIndex === filteredImages.length - 1}
                            className="gap-2"
                        >
                            Next
                            <ArrowLeft className="h-4 w-4 rotate-180" />
                        </Button>
                    </div>
                </div>

                {/* Side Panel */}
                <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-bold mb-1">Image Details</h2>
                        <p className="text-sm text-slate-500">{currentImage?.image_name}</p>
                    </div>

                    <div className="flex-1 overflow-auto p-6 space-y-6">
                        {/* Current Status */}
                        <div>
                            <Label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Current Status</Label>
                            {currentImage && getStatusBadge(currentImage.qc_status)}
                        </div>

                        {/* Orientation Error */}
                        {currentImage?.orientation_error && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                                    <AlertCircle className="h-4 w-4" />
                                    Orientation Error Flagged
                                </div>
                            </div>
                        )}

                        {/* Remarks */}
                        {currentImage?.remarks && (
                            <div>
                                <Label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Remarks</Label>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <p className="text-sm text-slate-700">{currentImage.remarks}</p>
                                </div>
                            </div>
                        )}

                        {/* QC Date */}
                        <div>
                            <Label className="text-xs font-bold text-slate-500 uppercase mb-2 block">QC Date</Label>
                            <p className="text-sm text-slate-700">
                                {new Date(currentImage?.qc_date || '').toLocaleString()}
                            </p>
                        </div>

                        {/* Edit Button */}
                        <Button
                            onClick={handleOpenEditDialog}
                            className="w-full gap-2"
                            variant="outline"
                            disabled={!currentImage}
                        >
                            <Eye className="h-4 w-4" />
                            Review & Edit
                        </Button>

                        {/* Keyboard Shortcuts */}
                        <div className="pt-4 border-t border-slate-200">
                            <Label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Keyboard Shortcuts</Label>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Next Image</span>
                                    <kbd className="px-2 py-1 bg-slate-100 rounded border">→</kbd>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Previous Image</span>
                                    <kbd className="px-2 py-1 bg-slate-100 rounded border">←</kbd>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Edit Status</span>
                                    <kbd className="px-2 py-1 bg-slate-100 rounded border">E</kbd>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Review & Edit QC Status</DialogTitle>
                        <DialogDescription>
                            Modify the QC decision and remarks for this image.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Status Selection */}
                        <div className="space-y-2">
                            <Label>QC Status</Label>
                            <Select
                                value={editStatus}
                                onValueChange={(val: 'Approved' | 'Rejected') => {
                                    setEditStatus(val);
                                    if (val === 'Approved') {
                                        setEditRemarks('');
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Approved">
                                        <div className="flex items-center gap-2">
                                            <Check className="h-4 w-4 text-green-600" />
                                            Approve
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="Rejected">
                                        <div className="flex items-center gap-2">
                                            <X className="h-4 w-4 text-red-600" />
                                            Reject
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Orientation Error */}
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="orientation"
                                checked={editOrientationError}
                                onCheckedChange={(checked) => setEditOrientationError(checked as boolean)}
                            />
                            <Label htmlFor="orientation" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Flag orientation error
                            </Label>
                        </div>

                        {/* Remarks - Only shown for Rejected status */}
                        {editStatus === 'Rejected' && (
                            <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="space-y-2">
                                    <Label htmlFor="rejection-reason" className="text-sm font-semibold text-slate-700">
                                        Rejection Reason <span className="text-red-500">*</span>
                                    </Label>
                                    <Select
                                        value={REJECTION_REASONS.includes(editRemarks) ? editRemarks : (editRemarks ? 'Other' : '')}
                                        onValueChange={(val) => {
                                            if (val !== 'Other') setEditRemarks(val);
                                        }}
                                    >
                                        <SelectTrigger className="h-10 border-slate-200">
                                            <SelectValue placeholder="Select rejection reason..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {REJECTION_REASONS.map(reason => (
                                                <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="remarks" className="text-sm font-semibold text-slate-700">
                                        Additional Remarks
                                    </Label>
                                    <Textarea
                                        id="remarks"
                                        placeholder="Add details about why this image was rejected..."
                                        value={editRemarks}
                                        onChange={(e) => setEditRemarks(e.target.value)}
                                        rows={3}
                                        className="resize-none border-slate-200 focus:ring-red-500"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveChanges} disabled={isSaving} className="gap-2">
                            {isSaving ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4" />
                                    Save Changes
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default QCReview;
