import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Check, 
  X, 
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCw
} from 'lucide-react';
import { mockQCImages, mockBatches, rejectionReasons } from '@/lib/mock-data';
import { QCImage, QCStatus } from '@/types';
import { useToast } from '@/hooks/use-toast';

const QCPanel: React.FC = () => {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const batch = mockBatches.find(b => b.id === batchId);
  const [images, setImages] = useState<QCImage[]>(mockQCImages);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [zoom, setZoom] = useState(1);

  const currentImage = images[currentIndex];
  const pendingCount = images.filter(img => img.qcStatus === 'pending').length;
  const acceptedCount = images.filter(img => img.qcStatus === 'accepted').length;
  const rejectedCount = images.filter(img => img.qcStatus === 'rejected').length;
  const allReviewed = pendingCount === 0;

  const handleAccept = () => {
    setImages(images.map((img, i) => 
      i === currentIndex 
        ? { ...img, qcStatus: 'accepted' as QCStatus, qcAt: new Date().toISOString() }
        : img
    ));
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    toast({ title: 'Image accepted' });
  };

  const handleReject = () => {
    if (!rejectionReason) {
      toast({ title: 'Please select a rejection reason', variant: 'destructive' });
      return;
    }

    setImages(images.map((img, i) => 
      i === currentIndex 
        ? { 
            ...img, 
            qcStatus: 'rejected' as QCStatus, 
            rejectionReason,
            rejectionNote: rejectionReason === 'Other' ? rejectionNote : undefined,
            qcAt: new Date().toISOString() 
          }
        : img
    ));
    
    setShowRejectForm(false);
    setRejectionReason('');
    setRejectionNote('');
    
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    toast({ title: 'Image rejected' });
  };

  const handleComplete = () => {
    toast({ 
      title: 'QC Completed', 
      description: `Accepted: ${acceptedCount}, Rejected: ${rejectedCount}` 
    });
    navigate('/tasks');
  };

  const getStatusColor = (status: QCStatus) => {
    switch (status) {
      case 'accepted': return 'bg-success/10 text-success border-success/20';
      case 'rejected': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tasks')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">QC Panel - {batch?.batchCode}</h1>
            <p className="text-sm text-muted-foreground">
              {batch?.sourceName} • {batch?.recordTypeName}
            </p>
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-muted">
              Pending: {pendingCount}
            </Badge>
            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
              Accepted: {acceptedCount}
            </Badge>
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
              Rejected: {rejectedCount}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Image Viewer */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <div className="bg-muted/30 p-2 flex items-center justify-between border-b">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {currentImage?.imageName}
                </span>
                <Badge variant="outline" className={getStatusColor(currentImage?.qcStatus || 'pending')}>
                  {currentImage?.qcStatus || 'Pending'}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon">
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardContent className="p-0 h-[500px] overflow-auto bg-muted/50 flex items-center justify-center">
              <img
                src={currentImage?.imageUrl}
                alt={currentImage?.imageName}
                className="max-w-full max-h-full object-contain transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            
            <span className="text-sm text-muted-foreground">
              Image {currentIndex + 1} of {images.length}
            </span>
            
            <Button
              variant="outline"
              onClick={() => setCurrentIndex(Math.min(images.length - 1, currentIndex + 1))}
              disabled={currentIndex === images.length - 1}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Actions Panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold">Actions</h3>
              
              {!showRejectForm ? (
                <div className="space-y-3">
                  <Button 
                    className="w-full gap-2 bg-success hover:bg-success/90" 
                    onClick={handleAccept}
                    disabled={currentImage?.qcStatus !== 'pending'}
                  >
                    <Check className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="w-full gap-2" 
                    onClick={() => setShowRejectForm(true)}
                    disabled={currentImage?.qcStatus !== 'pending'}
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Select value={rejectionReason} onValueChange={setRejectionReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {rejectionReasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {rejectionReason === 'Other' && (
                    <Textarea
                      placeholder="Enter rejection note..."
                      value={rejectionNote}
                      onChange={(e) => setRejectionNote(e.target.value)}
                    />
                  )}
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectionReason('');
                        setRejectionNote('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="flex-1"
                      onClick={handleReject}
                    >
                      Confirm
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image Thumbnails */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">Images</h3>
              <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setCurrentIndex(i)}
                    className={`relative aspect-square rounded overflow-hidden border-2 transition-all ${
                      i === currentIndex 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.imageName}
                      className="w-full h-full object-cover"
                    />
                    {img.qcStatus !== 'pending' && (
                      <div className={`absolute inset-0 flex items-center justify-center ${
                        img.qcStatus === 'accepted' ? 'bg-success/30' : 'bg-destructive/30'
                      }`}>
                        {img.qcStatus === 'accepted' ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <X className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Complete Button */}
          {allReviewed && (
            <Button className="w-full" size="lg" onClick={handleComplete}>
              Mark as Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QCPanel;
