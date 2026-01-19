import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload as UploadIcon, FolderOpen, CheckCircle, Loader2, ListFilter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

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
}

const Upload: React.FC = () => {
  const [batches, setBatches] = useState<OperatorBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = localStorage.getItem('qc_token');
  const headers = { 'Authorization': `Bearer ${token}` };

  const fetchBatches = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('http://localhost:8000/operator/batches', { headers });
      if (!res.ok) throw new Error('Failed to fetch batches');
      const data = await res.json();
      const mappedData = data.map((item: any) => ({
        ...item,
        id: item.batch_uid
      }));
      setBatches(mappedData);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to load batches', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleUploadClick = (batchId: string) => {
    setActiveBatchId(batchId);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeBatchId) return;

    // Filter for images only
    const imageFiles = Array.from(files).filter(file =>
      ['image/jpeg', 'image/png', 'image/tiff', 'image/jpg'].includes(file.type) ||
      file.name.toLowerCase().endsWith('.jpg') ||
      file.name.toLowerCase().endsWith('.jpeg') ||
      file.name.toLowerCase().endsWith('.png') ||
      file.name.toLowerCase().endsWith('.tif') ||
      file.name.toLowerCase().endsWith('.tiff')
    );

    if (imageFiles.length === 0) {
      toast({ title: 'Invalid Folder', description: 'No valid images found in the selected folder.', variant: 'destructive' });
      return;
    }

    const currentBatch = batches.find(b => b.batch_id === activeBatchId);
    if (currentBatch && imageFiles.length > currentBatch.target_count) {
      toast({
        title: 'Validation Error',
        description: `Selected folder has ${imageFiles.length} images, which exceeds the required ${currentBatch.target_count} images for this batch.`,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Folder Selected',
      description: `Found ${imageFiles.length} images. Starting upload process...`,
    });

    // TODO: Implement actual multipart upload to backend
    console.log('Images to upload:', imageFiles);

    // UI Simulation for now
    setBatches(prev => prev.map(b =>
      b.batch_id === activeBatchId
        ? { ...b, completed_count: imageFiles.length, status: 'uploaded' as const }
        : b
    ));

    setActiveBatchId(null);
    // Clear input
    e.target.value = '';
  };

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
              <span>{item.completed_count === item.target_count ? 'Complete' : 'Uploading'}</span>
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
      render: (_: any, item: OperatorBatch) => (
        item.completed_count < item.target_count ? (
          <Button
            size="sm"
            onClick={() => handleUploadClick(item.batch_id)}
            className="h-8 gap-2 bg-primary hover:bg-primary/90"
          >
            <FolderOpen className="h-4 w-4" />
            {(item.completed_count > 0) ? 'Continue' : 'Upload'}
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-success text-sm font-medium">
            <CheckCircle className="h-4 w-4" />
            Uploaded
          </span>
        )
      )
    }
  ];

  const filteredByStatus = batches.filter(batch => {
    if (activeTab === 'all') return true;
    return batch.status === activeTab;
  });

  const getCountByStatus = (status: string) => {
    if (status === 'all') return batches.length;
    return batches.filter(b => b.status === status).length;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Uploads"
        description="Select a batch and upload scanned document images"
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
              Multi-Format Support
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex items-center justify-between border-b pb-1">
                <TabsList className="bg-transparent border-none p-0 h-auto gap-6">
                  <TabsTrigger
                    value="all"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 h-auto flex gap-2"
                  >
                    All Batches <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{getCountByStatus('all')}</Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 h-auto flex gap-2"
                  >
                    Pending <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-yellow-100/50 text-yellow-700 border-yellow-200">{getCountByStatus('pending')}</Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="uploaded"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 h-auto flex gap-2"
                  >
                    Uploaded <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-green-100/50 text-green-700 border-green-200">{getCountByStatus('uploaded')}</Badge>
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border">
                  <ListFilter className="h-3 w-3" />
                  Filter Active
                </div>
              </div>
            </Tabs>
          </div>

          <DataTable
            data={filteredByStatus}
            columns={columns}
            searchPlaceholder="Search by Batch ID, Book Or Project..."
            emptyMessage={`No ${activeTab !== 'all' ? activeTab : ''} batches found.`}
          />
        </div>
      )}
    </div>
  );
};

export default Upload;
