import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload as UploadIcon, FolderOpen, CheckCircle, Loader2, ListFilter, Files, Info, Wifi, WifiOff, Pause, Play, Eye, Edit, Settings2, AlertCircle, Moon, Lock, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL } from '@/config';
import { db, storeFilesInQueue, getPendingFiles, clearBatch, getBatchStats, addToBatchQueue, getQueueCount, getActiveBatch, getNextBatchInQueue, updateBatchStatus, getBatchesWithPendingUploads } from '@/utils/uploadDB';
import { UploadManager, syncWithServer } from '@/utils/uploadManager';
import { useAuth } from '@/contexts/AuthContext';
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
import { Database, HardDrive, Trash2 } from 'lucide-react';
import { getDeviceInfo, getDeviceId } from '@/utils/deviceUtils';

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
  is_locked?: boolean;
  locked_device?: string;
  locked_device_id?: string;
  locked_at?: string;
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
  const [rejectedNames, setRejectedNames] = useState<string[]>([]);
  const [isLoadingRejected, setIsLoadingRejected] = useState(false);
  const [invalidFileNames, setInvalidFileNames] = useState<string[]>([]);
  const [preparationProgress, setPreparationProgress] = useState(0);
  const [duplicateFileNames, setDuplicateFileNames] = useState<{ name: string; count: number }[]>([]);
  const [corruptedFileNames, setCorruptedFileNames] = useState<{ name: string; size: number }[]>([]);

  // Upload Progress State
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [filesCompleted, setFilesCompleted] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [queuedBatchUids, setQueuedBatchUids] = useState<string[]>([]);
  const [activeUploadUid, setActiveUploadUid] = useState<string | null>(null);
  const [permissionNeededUid, setPermissionNeededUid] = useState<string | null>(null);
  const [locallyCompletedUids, setLocallyCompletedUids] = useState<Set<string>>(new Set());

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<OperatorBatch | null>(null);
  const [editFields, setEditFields] = useState({
    book_name: '',
    total_count: 0,
    uploading_count: 0
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBrowsingFolder, setIsBrowsingFolder] = useState(false);
  const [manualLockReleaseEnabled, setManualLockReleaseEnabled] = useState(false);
  const [isReleasingLock, setIsReleasingLock] = useState<string | null>(null);

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadManagerRef = useRef<UploadManager | null>(null);

  const token = localStorage.getItem('qc_token');
  const headers = { 'Authorization': `Bearer ${token}` };
  const { isOnline, wasOffline, reportNetworkFailure } = useNetworkStatus();

  // Store file references for on-demand upload
  const fileMapRef = useRef<Map<string, { files: File[], handle?: any }>>(new Map());

  // Wake Lock for overnight uploads
  const wakeLockRef = useRef<any>(null);
  const [showSleepWarning, setShowSleepWarning] = useState(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const alertSoundIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleReleaseLock = async (batchUid: string) => {
    try {
      setIsReleasingLock(batchUid);
      const res = await fetch(`${API_BASE_URL}/operator/batches/${batchUid}/release-lock`, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) throw new Error('Failed to release lock');

      toast({
        title: 'Lock Released',
        description: 'You can now start the upload for this batch.'
      });
      fetchBatches();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Release Failed',
        description: 'Unable to release manual lock',
        variant: 'destructive'
      });
    } finally {
      setIsReleasingLock(null);
    }
  };

  const fetchBatches = async () => {
    if (!isMounted.current) return;
    try {
      setIsLoading(true);

      // Check for manual lock release setting
      try {
        const configRes = await fetch(`${API_BASE_URL}/admin/settings/enable_manual_lock_release`, { headers });
        if (configRes.ok) {
          const configData = await configRes.json();
          setManualLockReleaseEnabled(configData.setting_value === 'true');
        }
      } catch (e) {
        console.error('Failed to fetch lock release setting:', e);
      }

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

      // Perform automated storage cleanup for old data
      await performDeepCleanup();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to load batches', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Automatically removes any IndexedDB data that shouldn't be there
   */
  const performDeepCleanup = async () => {
    try {
      // Delete any files belonging to batches that are already marked 'completed'
      const activeBatches = await db.batch_queue.where('status').equals('completed').toArray();
      for (const batch of activeBatches) {
        await db.upload_queue.where('batch_uid').equals(batch.batch_uid).delete();
        await db.batch_queue.delete(batch.batch_uid);
      }
      console.log('🧹 Deep cleanup: Removed stale upload data.');
    } catch (e) {
      console.error('Cleanup failed:', e);
    }
  };

  const [storageInfo, setStorageInfo] = useState({ used: '0', quota: '0', percent: 0 });

  useEffect(() => {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(estimate => {
        const used = (estimate.usage || 0) / (1024 * 1024);
        const quota = (estimate.quota || 0) / (1024 * 1024 * 1024);
        setStorageInfo({
          used: used.toFixed(1),
          quota: quota.toFixed(1),
          percent: Math.round(((estimate.usage || 0) / (estimate.quota || 1)) * 100)
        });
      });
    }
  }, [isUploading]);

  // Cleanup Wake Lock on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (alertSoundIntervalRef.current) {
        clearInterval(alertSoundIntervalRef.current);
      }
    };
  }, []);

  // Prevent upload pausing when switching tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('📱 Tab hidden - uploads continue in background');
        // XHR uploads continue automatically (not affected by visibility)
      } else {
        console.log('👁️ Tab visible - refreshing UI state');
        // Refresh UI state when tab becomes visible again
        if (isUploading) {
          updateQueueStatus();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isUploading]);

  // Listen for logout event and pause uploads gracefully
  useEffect(() => {
    const handleLogoutPause = async () => {
      console.log('🔐 Logout pause event received');

      if (isUploading && uploadManagerRef.current) {
        console.log('⏸️ Pausing active upload...');

        // Pause the upload manager IMMEDIATELY
        uploadManagerRef.current.pause();
        setIsPaused(true);

        // CRITICAL: Stop the upload process completely
        setIsUploading(false);
        setActiveUploadUid(null);

        // Release device lock on the server
        if (activeUploadUid) {
          try {
            await fetch(`${API_BASE_URL}/operator/batches/${activeUploadUid}/release-lock`, {
              method: 'DELETE',
              headers
            });
            console.log('🔓 Device lock released');
          } catch (error) {
            console.error('Failed to release device lock:', error);
          }

          // Update batch status to 'queued' so it can auto-resume
          await updateBatchStatus(activeUploadUid, 'queued');
        }

        // Release wake lock
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }

        // Stop heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        console.log('✅ Uploads paused successfully');
      } else {
        console.log('ℹ️ No active uploads to pause');
      }

      // Always dispatch completion event
      const completeEvent = new CustomEvent('uploads-paused-complete');
      window.dispatchEvent(completeEvent);
      console.log('📤 Pause completion event dispatched');
    };

    window.addEventListener('pause-uploads-before-logout', handleLogoutPause);

    return () => {
      window.removeEventListener('pause-uploads-before-logout', handleLogoutPause);
    };
  }, [isUploading, activeUploadUid]);

  // CRITICAL: Cleanup // Track component mount status for async safety
  useEffect(() => {
    // 🔓 Reset global stop when component mounts
    import('@/utils/uploadManager').then(m => m.UploadManager.resetGlobalStop());

    isMounted.current = true;
    return () => {
      isMounted.current = false;
      console.log('Sweep: Upload component unmounting - Cleaning up...');

      // 🛑 TRIGGER GLOBAL STOP
      import('@/utils/uploadManager').then(m => m.UploadManager.stopAllInstances());

      // DESTROY uploads permanently (not just pause)
      if (uploadManagerRef.current) {
        uploadManagerRef.current.destroy();
        uploadManagerRef.current = null;
        console.log('💀 Upload manager destroyed');
      }

      // Release wake lock
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => { });
        wakeLockRef.current = null;
        console.log('💤 Wake lock released');
      }

      // Stop heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
        console.log('💓 Heartbeat stopped');
      }

      // Stop alert sound
      if (alertSoundIntervalRef.current) {
        clearInterval(alertSoundIntervalRef.current);
        alertSoundIntervalRef.current = null;
        console.log('🔇 Alert sound stopped');
      }

      console.log('✅ Upload component cleanup complete');
    };
  }, []); // Empty deps = runs only on unmount


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
      if (!user?.id) return;
      const count = await getQueueCount(user.id);
      const uids = await getBatchesWithPendingUploads(user.id);
      setQueueCount(count);
      setQueuedBatchUids(uids);
    } catch (error) {
      console.error('Error updating queue status:', error);
    }
  };

  // Check for pending uploads on page load and auto-resume multi-batch queue
  const checkAndResumePendingUploads = async () => {
    try {
      if (!isMounted.current || !user?.id) return;
      if (!token || isUploading) return;

      // 1. Check if there's an active (interrupted) batch
      let activeBatchInfo = await getActiveBatch(user.id);
      if (!isMounted.current) return;

      // 2. If no active but there are queued, get the next one
      if (!activeBatchInfo) {
        activeBatchInfo = await getNextBatchInQueue(user.id) as any;
        if (!isMounted.current) return;
      }

      if (!activeBatchInfo) return;

      // 3. Find the batch in our current list (for UI state)
      const batch = batches.find(b => b.batch_uid === activeBatchInfo?.batch_uid);
      if (!batch) return;

      if (!isMounted.current) return;
      processNextBatchInQueue();

    } catch (error) {
      console.error('Error checking pending uploads:', error);
    }
  };

  /**
   * Master Queue Controller: Processes batches one-by-one
   */

  /**
   * Request Wake Lock to prevent computer from sleeping during uploads
   */
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('🔒 Wake Lock activated - Computer will not sleep during upload');

        toast({
          title: '🌙 Overnight Mode Active',
          description: 'Computer will stay awake until uploads complete',
        });

        // Listen for wake lock release
        wakeLockRef.current.addEventListener('release', () => {
          console.log('✅ Wake Lock released');
        });

        setShowSleepWarning(false);
      } else {
        // Wake Lock not supported - show manual warning
        console.warn('⚠️ Wake Lock API not supported');
        setShowSleepWarning(true);
      }
    } catch (err) {
      console.error('Wake Lock request failed:', err);
      setShowSleepWarning(true);
    }
  };

  /**
   * Release Wake Lock when uploads complete
   */
  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('✅ Wake Lock released - Computer can sleep normally');

        toast({
          title: '✅ Uploads Complete',
          description: 'Computer sleep mode restored to normal',
        });
      } catch (err) {
        console.error('Wake Lock release failed:', err);
      }
    }
  };

  /**
   * Start heartbeat to keep connection alive
   */
  const startHeartbeat = () => {
    if (heartbeatIntervalRef.current) return;

    heartbeatIntervalRef.current = setInterval(async () => {
      if (isUploading && navigator.onLine) {
        try {
          // Tiny ping to keep connection alive
          await fetch(`${API_BASE_URL}/health`, {
            method: 'HEAD',
            headers
          });
        } catch (err) {
          // Silent fail - heartbeat is just a safety net
        }
      }
    }, 30000); // Every 30 seconds
  };

  /**
   * Stop heartbeat when uploads complete
   */
  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  // Audio context for alerts (shared)
  const audioContextRef = useRef<AudioContext | null>(null);

  /**
   * Play a single beep sound
   */
  const playBeep = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.2);
    } catch (err) {
      console.error('Failed to play alert sound:', err);
    }
  };

  /**
   * Play triple beep alert (BEEP-BEEP-BEEP)
   */
  const playTripleBeep = async () => {
    for (let i = 0; i < 3; i++) {
      await playBeep();
      if (i < 2) { // Don't wait after the last beep
        await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second pause
      }
    }
  };

  /**
   * Speak voice alert
   */
  const speakAlert = (message: string) => {
    try {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 0.9; // Slightly slower for clarity
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error('Failed to speak alert:', err);
    }
  };

  /**
   * Play combined alert: triple beep + voice
   */
  const playNetworkLostAlert = async () => {
    // Play triple beep first
    await playTripleBeep();

    // Wait a moment, then speak
    await new Promise(resolve => setTimeout(resolve, 500));
    speakAlert('Please connect to internet. Do not switch tabs during offline.');
  };

  /**
   * Start repeating alert sound for network loss
   * Plays triple beep + voice message every 10 seconds
   */
  const startNetworkLostAlert = () => {
    if (alertSoundIntervalRef.current) return;

    // Play immediate alert (beep + voice)
    playNetworkLostAlert();

    // Repeat alert every 10 seconds
    alertSoundIntervalRef.current = setInterval(() => {
      if (!navigator.onLine) {
        playNetworkLostAlert();
      }
    }, 10000);
  };

  /**
   * Stop repeating alert sound
   */
  const stopNetworkLostAlert = () => {
    if (alertSoundIntervalRef.current) {
      clearInterval(alertSoundIntervalRef.current);
      alertSoundIntervalRef.current = null;
    }
  };

  const processNextBatchInQueue = async (manualRestart: boolean = false) => {
    // 🛡️ Kill switch check
    if (!isMounted.current) return;

    // Don't start a new upload if one is already running (unless it's paused and we're resuming)
    if (isUploading && !isPaused && !manualRestart) {
      console.log('📤 Upload already in progress, skipping queue check');
      return;
    }

    // 🛡️ CLEANUP: ensure any old manager or sync interval is dead before starting NEW
    if (uploadManagerRef.current) {
      console.log('🧹 Cleaning up old manager before restart...');
      uploadManagerRef.current.destroy();
    }
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (!token) {
      console.log('❌ No token, cannot process queue');
      return;
    }

    const { getActiveBatch, getNextBatchInQueue, updateBatchStatus, getPendingFiles, clearBatch, removeBatchFromQueue } = await import('@/utils/uploadDB');
    if (!isMounted.current) return;

    // 1. Get current or next batch
    let batchToProcess = await getActiveBatch(user!.id);
    if (!isMounted.current) return;

    if (!batchToProcess) {
      batchToProcess = await getNextBatchInQueue(user!.id);
      if (!isMounted.current) return;
    }

    if (!batchToProcess) {
      setIsUploading(false);
      setActiveUploadUid(null);
      return;
    }

    const batchUid = batchToProcess.batch_uid;
    const batchData = batches.find(b => b.batch_uid === batchUid);

    // 🔍 PROACTIVE PERMISSION CHECK: If we have a handle, check it BEFORE starting
    if (batchToProcess.directory_handle) {
      try {
        const permission = await (batchToProcess.directory_handle as any).queryPermission({ mode: 'read' });
        if (!isMounted.current) return;

        if (permission !== 'granted') {
          console.warn(`[Queue] Permission lost for batch ${batchUid}. Requesting reconnect.`);
          setPermissionNeededUid(batchUid);
          setIsUploading(false);
          setActiveUploadUid(null);
          return;
        }
      } catch (e) {
        console.error('Handle validation failed:', e);
      }
    }

    try {
      // 🔒 REQUEST DEVICE LOCK - Prevents multi-device corruption
      const lockRes = await fetch(`${API_BASE_URL}/operator/batches/${batchUid}/request-lock`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device_info: getDeviceInfo() })
      });
      if (!isMounted.current) return;

      const lockData = await lockRes.json();
      if (!isMounted.current) return;

      if (!lockData.success) {
        setIsUploading(false);
        setActiveUploadUid(null);

        toast({
          title: 'Upload Conflict',
          description: lockData.message || 'This batch is being uploaded by another system.',
          variant: 'destructive'
        });

        // Pause this batch locally so it doesn't keep trying and failing
        await updateBatchStatus(batchUid, 'interrupted');
        if (!isMounted.current) return;

        await updateQueueStatus();
        return;
      }

      setIsUploading(true);
      setActiveUploadUid(batchUid);
      await updateBatchStatus(batchUid, 'uploading');
      if (!isMounted.current) return;

      await updateQueueStatus();
      if (!isMounted.current) return;

      // Activate overnight protection on first upload
      if (!wakeLockRef.current) {
        await requestWakeLock();
        if (!isMounted.current) return;

        startHeartbeat();
      }

      // Sync with server
      // 🛡️ NETWORK CHECK: Don't even try to sync if we are offline
      if (!navigator.onLine) {
        console.log('📡 [RESUME-PROTECT] Offline, waiting for network to sync...');
        setIsPaused(true);
        return;
      }

      const uploadedFiles = await syncWithServer(batchUid, token!);
      if (!isMounted.current) {
        console.log('🚫 Component unmounted during sync, stopping before manager init');
        return;
      }

      const serverCount = uploadedFiles.length;
      // Case-insensitive set for safety
      const uploadedSet = new Set(uploadedFiles.map(f => f.toLowerCase()));

      // Update local UI immediately to match server count before continuing
      setFilesCompleted(serverCount);
      setBatches(prev => prev.map(b =>
        b.batch_uid === batchUid ? { ...b, completed_count: serverCount, status: 'uploading' } : b
      ));

      const pendingFiles = await getPendingFiles(batchUid);
      if (!isMounted.current) return;

      const filesToUpload = pendingFiles.filter(f => !uploadedSet.has(f.file_name.toLowerCase()));
      const fileNames = filesToUpload.map(f => f.file_name);

      if (fileNames.length === 0) {
        await clearBatch(batchUid);
        if (!isMounted.current) return;

        await removeBatchFromQueue(batchUid);
        if (!isMounted.current) return;

        await updateQueueStatus();
        if (!isMounted.current) return;

        fetchBatches();
        setIsUploading(false);
        processNextBatchInQueue(); // Move to next immediately
        return;
      }

      // Initialize upload manager
      // 🛡️ FINAL DEFENSIVE CHECK
      if (!isMounted.current || !token) {
        console.log('🚫 Component unmounted or token lost, aborting manager creation');
        return;
      }

      console.log('🔥 Initializing UploadManager...');
      const uploadManager = new UploadManager(token!, () => {
        // FAST OFFLINE DETECTION CALLBACK
        if (isUploading && !isPaused) {
          console.warn('⚡ [FAST-OFFLINE] Network failure detected by UploadManager. Triggering hook...');
          reportNetworkFailure(); // EXPLICITLY TELL THE HOOK WE ARE DOWN
        }
      });
      uploadManagerRef.current = uploadManager;

      // Start a Background Sync Poller to keep UI in lockstep with S3
      const syncInterval = setInterval(async () => {
        // 🔒 SAFETY CHECK: If offline or paused, skip sync to avoid terminal spam
        if (!navigator.onLine || isPaused || !isMounted.current) return;

        try {
          const currentUploaded = await syncWithServer(batchUid, token!);
          const currentCount = currentUploaded.length;

          setBatches(prev => prev.map(b => {
            if (b.batch_uid === batchUid) {
              return { ...b, completed_count: Math.max(b.completed_count, currentCount) };
            }
            return b;
          }));
          setFilesCompleted(prev => Math.max(prev, currentCount));
        } catch (e) {
          console.warn('Sync poller failed:', e);
        }
      }, 10000); // Sync every 10 seconds
      syncIntervalRef.current = syncInterval;

      // Get files from memory if available
      const fileData = fileMapRef.current.get(batchUid);

      uploadManager.processUploadQueue(
        batchUid,
        fileNames,
        // On file progress
        (fileProgress) => {
          setCurrentFileName(fileProgress.fileName);
          setUploadProgress(fileProgress.progress);
        },
        // On batch progress
        (batchProgress) => {
          // Use the latest serverCount + progress
          const progressCount = serverCount + batchProgress.completed;

          setBatches(prev => prev.map(b => {
            if (b.batch_uid === batchUid) {
              const safeCount = Math.max(b.completed_count, progressCount);
              return { ...b, completed_count: safeCount, status: 'uploading' };
            }
            return b;
          }));

          setFilesCompleted(prev => Math.max(prev, progressCount));

          if (batchProgress.currentFile) {
            setCurrentFileName(batchProgress.currentFile);
          }
        },
        // On complete
        async () => {
          if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
          }
          // Final verification check with server
          const { syncWithServer } = await import('@/utils/uploadManager');
          const { getPendingFiles, getQueuedFiles, updateFileStatus } = await import('@/utils/uploadDB');

          let uploadedOnServer = await syncWithServer(batchUid, token!);
          const serverSet = new Set(uploadedOnServer);
          const targetCount = batchData?.target_count || 0;

          if (targetCount > 0 && uploadedOnServer.length < targetCount) {
            // Find EXACTLY which files are missing
            const localFiles = await getQueuedFiles(batchUid);
            const missingFiles = localFiles.filter(f => !serverSet.has(f.file_name));

            console.warn(`Mismatch detected: server has ${uploadedOnServer.length}/${targetCount}.`);
            console.warn(`🔴 Missing files (${missingFiles.length}):`, missingFiles.map(f => f.file_name));

            // Re-sync local state: Any file not on server should be 'pending' or 'failed'
            for (const f of missingFiles) {
              await updateFileStatus(batchUid, f.file_name, 'failed', undefined, 'Server missing file after batch completion');
            }

            const currentPending = await getPendingFiles(batchUid);

            if (currentPending.length > 0) {
              console.log(`🔄 Recovery: Found ${currentPending.length} files to retry.`);
              processNextBatchInQueue();
              return;
            } else {
              toast({
                title: 'Sync Mismatch',
                description: `Server is missing ${targetCount - uploadedOnServer.length} files. Names: ${missingFiles.slice(0, 3).map(f => f.file_name).join(', ')}${missingFiles.length > 3 ? '...' : ''}. Please click "Continue" and re-select the folder.`,
                variant: 'destructive'
              });
            }
          } else {
            toast({ title: 'Batch Complete', description: `Batch ${batchData?.batch_id || batchUid} uploaded successfully!` });
          }

          await clearBatch(batchUid);
          await removeBatchFromQueue(batchUid);
          await updateQueueStatus();

          // Clear file references from memory
          fileMapRef.current.delete(batchUid);

          fetchBatches();
          setIsUploading(false);
          setActiveUploadUid(null);

          // 🔒 OPTIMISTIC HIDING: Mark as completed locally so it stays hidden during server lag
          setLocallyCompletedUids(prev => {
            const next = new Set(prev);
            next.add(batchUid);
            return next;
          });

          // Check if there are more batches in queue
          const { getQueueCount } = await import('@/utils/uploadDB');
          const remainingBatches = await getQueueCount(user!.id);

          if (remainingBatches === 0) {
            // All uploads complete - release Wake Lock
            await releaseWakeLock();
            stopHeartbeat();
          }

          processNextBatchInQueue();
        },
        // On error
        async (error: any) => {
          clearInterval(syncInterval);
          console.error('Upload error:', error);

          // 🛡️ NETWORK RESILIENCE: Detect if this "error" is just a network drop/pause
          const errorMsg = String(error?.message || error || "").toLowerCase();
          const isNetworkError = errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('disconnected');
          const isAbort = errorMsg.includes('aborted') || errorMsg.includes('cancelled');

          if (isNetworkError || isAbort) {
            console.log('📡 [RESUME-PROTECT] Keeping lock active during network interruption');
            // Ensure we are in a paused state so the auto-resume effect can trigger later
            setIsPaused(true);
            return;
          }

          if (error.message === 'PERMISSION_REQUIRED') {
            setPermissionNeededUid(batchUid);
            toast({
              title: 'Folder Access Required',
              description: 'Browser permission lost after refresh. Please click "Reconnect" to continue.',
              variant: 'destructive'
            });
            setIsUploading(false);
            // DO NOT release lock - we want to keep it while the user re-authorizes
            return;
          }

          // Request lock release if it was a critical error
          try {
            await fetch(`${API_BASE_URL}/operator/batches/${batchUid}/release-lock`, {
              method: 'DELETE',
              headers
            });
          } catch (e) { /* ignore */ }

          toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
          setIsUploading(false);
          setActiveUploadUid(null);
        },
        8, // MAX CONCURRENCY - Increased to 8 for faster uploads (safe balance for modern browsers)
        fileData?.files // Pass files array for instant access
      );

    } catch (error) {
      console.error('Master queue error:', error);
      setIsUploading(false);
    }
  };

  useEffect(() => {
    fetchBatches();

    // 🔋 PWA POWER MODE: Request persistent storage so OS never deletes our queue
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(persistent => {
        if (persistent) console.log("🔋 Storage will not be cleared except by explicit user action");
        else console.log("🪫 Storage may be cleared under heavy disk pressure");
      });
    }
  }, []);

  // Check for pending uploads after batches are loaded
  useEffect(() => {
    if (batches.length > 0 && !isUploading) {
      checkAndResumePendingUploads();
    }
  }, [batches]);

  const handleUploadClick = async (batch: OperatorBatch) => {
    setSelectedBatch(batch);
    setSelectedFiles([]);
    setRejectedNames([]);
    setInvalidFileNames([]);
    setDuplicateFileNames([]);
    setCorruptedFileNames([]);
    setIsDialogOpen(true);

    if (batch.is_reupload) {
      try {
        setIsLoadingRejected(true);
        const res = await fetch(`${API_BASE_URL}/operator/batches/${batch.batch_uid}/rejected-filenames`, { headers });
        if (res.ok) {
          const names = await res.json();
          setRejectedNames(names);
        }
      } catch (err) {
        console.error('Failed to fetch rejected names:', err);
      } finally {
        setIsLoadingRejected(false);
      }
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

    // Filter for TIFF images only
    const imageFiles = Array.from(files).filter(file =>
      file.name.toLowerCase().endsWith('.tif') ||
      file.name.toLowerCase().endsWith('.tiff')
    );

    // Duplicate Detection
    const nameCounts = new Map<string, number>();
    imageFiles.forEach(f => {
      nameCounts.set(f.name, (nameCounts.get(f.name) || 0) + 1);
    });
    const duplicates = Array.from(nameCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([name, count]) => ({ name, count }));

    if (duplicates.length > 0) {
      setDuplicateFileNames(duplicates);
      setSelectedFiles([]);
      return;
    }

    // 🛡️ Corruption Guard: Check for files < 10KB
    const corrupted = imageFiles
      .filter(f => f.size < 10 * 1024)
      .map(f => ({ name: f.name, size: f.size }));

    if (corrupted.length > 0) {
      setCorruptedFileNames(corrupted);
      setSelectedFiles([]);
      return;
    }

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

    // New Filename Validation for Rework
    if (selectedBatch?.is_reupload && rejectedNames.length > 0) {
      const rejectedSet = new Set(rejectedNames);
      const invalidFiles = imageFiles.filter(f => !rejectedSet.has(f.name));
      if (invalidFiles.length > 0) {
        setInvalidFileNames(invalidFiles.map(f => f.name));
        setSelectedFiles([]);
        return;
      }
    }

    setInvalidFileNames([]);
    setCorruptedFileNames([]);
    setSelectedFiles(imageFiles);
    // Clear input so same folder can be re-selected if needed
    e.target.value = '';
  };

  /**
   * modern File System Access API for Chrome/Brave/Edge
   * This allows persistent access to the folder
   */
  const handlePersistentFolderSelect = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        // Fallback to standard input
        handleBrowseClick();
        return;
      }

      setIsBrowsingFolder(true); // Show loading state

      const handle = await (window as any).showDirectoryPicker();
      const files: File[] = [];

      const scanDirectory = async (directoryHandle: any) => {
        for await (const entry of directoryHandle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            if (file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff')) {
              files.push(file);
            }
          } else if (entry.kind === 'directory') {
            await scanDirectory(entry);
          }
        }
      };

      await scanDirectory(handle);

      // Duplicate Detection
      const nameCounts = new Map<string, number>();
      files.forEach(f => {
        nameCounts.set(f.name, (nameCounts.get(f.name) || 0) + 1);
      });
      const duplicates = Array.from(nameCounts.entries())
        .filter(([_, count]) => count > 1)
        .map(([name, count]) => ({ name, count }));

      if (duplicates.length > 0) {
        setDuplicateFileNames(duplicates);
        setIsBrowsingFolder(false);
        setSelectedFiles([]);
        return;
      }

      // 🛡️ Corruption Guard: Check for files < 10KB
      const corrupted = files
        .filter(f => f.size < 10 * 1024)
        .map(f => ({ name: f.name, size: f.size }));

      if (corrupted.length > 0) {
        setCorruptedFileNames(corrupted);
        setIsBrowsingFolder(false);
        setSelectedFiles([]);
        return;
      }

      setIsBrowsingFolder(false); // Hide loading state

      if (files.length === 0) {
        toast({
          title: 'No TIFF Images',
          description: 'No valid TIFF (.tif, .tiff) images found. Only TIFF format is allowed.',
          variant: 'destructive'
        });
        return;
      }

      if (selectedBatch && files.length !== selectedBatch.target_count) {
        toast({
          title: 'Validation Error',
          description: `Selected folder has ${files.length} TIFF images, but exactly ${selectedBatch.target_count} images are required.`,
          variant: 'destructive',
        });
        return;
      }

      // Store handle for persistence
      (window as any)._lastHandle = handle;

      setInvalidFileNames([]);
      setDuplicateFileNames([]);
      setCorruptedFileNames([]);
      setSelectedFiles(files);
    } catch (err: any) {
      setIsBrowsingFolder(false); // Reset loading state
      if (err.name !== 'AbortError') {
        console.error('Directory picker error:', err);
        handleBrowseClick(); // Fallback
      }
    }
  };

  const handleStartUpload = async () => {
    if (!selectedBatch || selectedFiles.length === 0 || !token) return;

    try {
      setIsSubmitting(true);
      // Check max queue limit (5 for Normal, 10 for Re-upload)
      const currentQueueSize = await getQueueCount(user!.id);
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
        let referenceBatch = await getActiveBatch(user!.id);
        if (!referenceBatch) {
          referenceBatch = await getNextBatchInQueue(user!.id);
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

      // Store files in IndexedDB with progress tracking (INSTANT - metadata only)
      setPreparationProgress(0);

      // IMPROVED: isResume is true if preparation is active OR if the batch is already uploading/partially complete
      const isResume = (preparationProgress > 0 && preparationProgress < 100) ||
        (selectedBatch.completed_count > 0) ||
        (queuedBatchUids.includes(selectedBatch.batch_uid));

      // Store file references in memory for on-demand access
      fileMapRef.current.set(selectedBatch.batch_uid, {
        files: selectedFiles,
        handle: (window as any)._lastHandle
      });

      console.log('🏁 Step 1: Starting storage procedure...');
      await storeFilesInQueue(user.id, selectedBatch.batch_uid, selectedFiles, (progress) => {
        setPreparationProgress(progress);
      }, isResume);

      console.log('🏁 Step 2: Storage complete. Saving metadata...');

      // Add batch to metadata queue with persistent handle
      await addToBatchQueue(
        user.id,
        selectedBatch.batch_uid,
        selectedFiles.length,
        selectedBatch.is_reupload,
        (window as any)._lastHandle
      );

      console.log('🏁 Step 3: Metadata saved. Success.');

      toast({
        title: 'Batch Queued',
        description: `Added "${selectedBatch.batch_id}" to the upload queue.`,
      });

      // Close dialog immediately after queueing is successful
      console.log('🚪 Closing dialog...');
      setIsDialogOpen(false);
      setSelectedBatch(null);

      console.log('🔄 Refreshing batch list...');
      fetchBatches();

      // Trigger the queue processor if not already running
      if (!isUploading) {
        console.log('🚀 Triggering queue processor...');
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

  // Track last network toast to avoid storm
  const lastNetworkToastRef = useRef<number>(0);

  // Auto-pause on network loss
  useEffect(() => {
    if (!isOnline && isUploading && uploadManagerRef.current) {
      uploadManagerRef.current.pause();
      setIsPaused(true);

      // Start repeating alert sound
      startNetworkLostAlert();

      // Only show toast if it hasn't been shown in the last 15 seconds
      const now = Date.now();
      if (now - lastNetworkToastRef.current > 15000) {
        lastNetworkToastRef.current = now;
        toast({
          title: 'Network Lost',
          description: 'Upload paused. Will resume when connection is restored.',
          variant: 'destructive',
          duration: 10000
        });
      }
    }
  }, [isOnline, isUploading]);

  // Auto-resume on network restore
  useEffect(() => {
    // Don't auto-resume if user is not logged in
    if (!token) return;

    if (wasOffline && isOnline && isPaused && uploadManagerRef.current) {
      console.log('🔄 Network restored - Waiting for connection to stabilize...');

      // Wait 1 second for network to fully stabilize
      const resumeTimer = setTimeout(async () => {
        try {
          console.log('🔄 Network stable - Resuming uploads...');

          uploadManagerRef.current?.resume();
          setIsPaused(false);
          // Destroy the old instance if it exists before starting fresh via processNextBatch
          if (uploadManagerRef.current) {
            uploadManagerRef.current.destroy();
          }

          // Stop alert sound
          stopNetworkLostAlert();

          toast({
            title: 'Network Restored',
            description: 'Resuming upload...',
          });

          // CRITICAL: Restart the upload process
          await processNextBatchInQueue();
        } catch (error) {
          console.error('❌ Failed to resume upload:', error);
          toast({
            title: 'Resume Failed',
            description: 'Please click Continue to resume manually.',
            variant: 'destructive'
          });
        }
      }, 1000);

      return () => clearTimeout(resumeTimer);
    }
  }, [wasOffline, isOnline, isPaused, token, processNextBatchInQueue]);

  useEffect(() => {
    if (token && user?.id) {
      fetchBatches();
      checkAndResumePendingUploads();
    }
  }, [token, user?.id]);

  const activeBatches = batches.filter(batch =>
    batch.status !== 'uploaded' &&
    !batch.is_reupload &&
    !locallyCompletedUids.has(batch.batch_uid)
  );
  const activeQueueBatch = batches.find(b => queuedBatchUids.includes(b.batch_uid));
  const activeQueueIsReupload = activeQueueBatch ? activeQueueBatch.is_reupload : null;

  const columns = [
    {
      key: 'batch_id',
      header: 'Batch ID',
      sortable: true,
      render: (val: string) => <code className="text-xs font-bold text-primary">{val}</code>
    },
    {
      key: 'project_name',
      header: 'Project',
      render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
    },
    {
      key: 'book_name',
      header: 'Book Name',
      render: (val: string) => <span className="text-[10px] font-black text-slate-700 max-w-[120px] truncate block" title={val}>{val}</span>
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
      key: 'record_type_name',
      header: 'Record Type',
      render: (val: string) => <span className="text-[10px] text-slate-500 max-w-[100px] truncate block" title={val}>{val}</span>
    },
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

        // Lock Logic:
        const currentDeviceId = getDeviceId();
        const isLockedByAnotherDevice = item.is_locked && item.locked_device_id !== currentDeviceId;

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

        if (isLockedByAnotherDevice) {
          return (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-8 gap-1.5 border-amber-200 bg-amber-50 text-amber-700 font-bold px-3">
                <Settings2 className="h-3.5 w-3.5 animate-spin-slow" />
                Locked: {item.locked_device?.split(' ')[0] || 'Other Device'}
              </Badge>
              {manualLockReleaseEnabled ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                  onClick={() => handleReleaseLock(item.batch_uid)}
                  disabled={isReleasingLock === item.batch_uid}
                >
                  {isReleasingLock === item.batch_uid ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Release Lock
                </Button>
              ) : (
                <Button disabled size="sm" variant="ghost" className="h-8 w-8 p-0 opacity-50">
                  <Lock className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditClick(item)}
              // LOCK EDITING: Disable if uploading, queued, or if even ONE image is already on the server
              disabled={isActivelyUploading || isQueued || isGlobalBlocked || item.completed_count > 0}
              className="h-8 w-8 p-0 border-slate-200 hover:bg-slate-50 hover:text-primary transition-all shadow-sm disabled:opacity-30"
              title={item.completed_count > 0 ? "Cannot edit after upload has started" : "Edit Batch Info"}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="sm"
              onClick={() => {
                if (permissionNeededUid === item.batch_uid) {
                  setPermissionNeededUid(null);
                  handleUploadClick(item);
                } else if (isCurrentActive && isUploading) {
                  handlePauseResume();
                } else {
                  handleUploadClick(item);
                }
              }}
              // DISABLE BUTTON IF OFFLINE (unless already uploading/retrying)
              disabled={isGlobalBlocked || (!isOnline && !isActivelyUploading)}
              className={`h-8 gap-2 transition-all duration-300 min-w-[100px] ${isActivelyUploading
                ? 'bg-primary/40 cursor-not-allowed text-white'
                : (isCurrentlyPaused || permissionNeededUid === item.batch_uid)
                  ? 'bg-amber-500 hover:bg-amber-600 animate-pulse text-white shadow-md'
                  : 'bg-primary hover:bg-primary/90 shadow-sm'
                } ${!isOnline && !isActivelyUploading ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}
            >
              {isActivelyUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="animate-pulse">Uploading...</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="h-4 w-4 text-white/70" />
                  Offline
                </>
              ) : permissionNeededUid === item.batch_uid ? (
                <>
                  <FolderOpen className="h-4 w-4" />
                  Reconnect
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

      {/* Sleep Prevention Warning */}
      {showSleepWarning && isUploading && (
        <Alert className="bg-amber-50 border-amber-500 border-2 animate-in fade-in zoom-in duration-300">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="text-sm font-black uppercase tracking-tight text-amber-900">
            ⚠️ Action Required: Prevent Computer Sleep
          </AlertTitle>
          <AlertDescription className="text-xs font-medium leading-relaxed mt-2 text-amber-800">
            <p className="mb-3">
              Your browser doesn't support automatic sleep prevention. To ensure overnight uploads complete successfully:
            </p>
            <ol className="list-decimal list-inside space-y-1 mb-3 font-bold">
              <li>Press <kbd className="px-2 py-1 bg-white rounded border">Win + I</kbd> to open Windows Settings</li>
              <li>Go to <strong>System → Power & Sleep</strong></li>
              <li>Set <strong>"When plugged in, PC goes to sleep after"</strong> to <strong className="text-red-600">NEVER</strong></li>
            </ol>
            <p className="text-[10px] italic text-amber-700">
              ⚠️ IMPORTANT: Remember to change this back to normal after uploads complete!
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSleepWarning(false)}
              className="mt-3 border-amber-600 text-amber-900 hover:bg-amber-100"
            >
              I've Done This
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Wake Lock Active Indicator */}
      {wakeLockRef.current && isUploading && (
        <Alert className="bg-blue-50 border-blue-500 border-2">
          <Moon className="h-5 w-5 text-blue-600" />
          <AlertTitle className="text-sm font-black uppercase tracking-tight text-blue-900">
            🌙 Overnight Mode Active
          </AlertTitle>
          <AlertDescription className="text-xs font-medium text-blue-800">
            Computer will stay awake until all uploads complete. You can safely leave this running unattended.
          </AlertDescription>
        </Alert>
      )}

      {/* Network Loss Warning - Critical */}
      {!isOnline && isUploading && (
        <Alert className="bg-red-50 border-red-500 border-2 animate-pulse">
          <WifiOff className="h-5 w-5 text-red-600" />
          <AlertTitle className="text-sm font-black uppercase tracking-tight text-red-900">
            ⚠️ NETWORK LOST - Upload Paused
          </AlertTitle>
          <AlertDescription className="text-xs font-medium text-red-800">
            <p className="mb-2 font-bold">
              Upload has been automatically paused. Waiting for network reconnection...
            </p>
            <div className="bg-red-100 border-2 border-red-600 rounded p-3 mb-2">
              <p className="font-black text-red-900 mb-2">🚨 CRITICAL WARNING:</p>
              <p className="font-bold text-red-800">
                DO NOT SWITCH TABS OR CLOSE THIS WINDOW!
              </p>
              <p className="text-[11px] mt-2">
                Switching tabs during network loss may cause you to lose access to your files.
                Stay on this page until the network reconnects and uploads resume automatically.
              </p>
            </div>
            <p className="text-[10px] italic">
              ✓ Your progress is saved<br />
              ✓ Upload will resume automatically when network returns<br />
              ✓ Just stay on this tab and wait
            </p>
          </AlertDescription>
        </Alert>
      )}

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

          <div className="flex flex-col md:flex-row items-center gap-6 px-4 py-2 bg-background/50 rounded-lg border border-primary/10">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <HardDrive className={`h-3 w-3 ${storageInfo.percent > 80 ? 'text-red-500 animate-pulse' : 'text-primary'}`} />
              Storage: {storageInfo.quota}GB Available ({storageInfo.used}MB Used)
            </div>
            <div className="hidden md:block w-px h-4 bg-primary/20" />
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Real-time Sync
            </div>
            <div className="hidden md:block w-px h-4 bg-primary/20" />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (confirm("🚨 WARNING: This will clear all local upload progress and reset the queue. Use this only if your upload is STUCK or showing the wrong count. Proceed?")) {
                  const { factoryResetDatabase } = await import('@/utils/uploadDB');
                  await factoryResetDatabase();
                }
              }}
              className="h-7 px-2 gap-1.5 text-[9px] font-black text-red-500 hover:text-red-600 hover:bg-red-50 border border-red-200/50"
              title="Factory Reset Local Database"
            >
              <Trash2 className="h-3 w-3" />
              MASTER CLEANUP
            </Button>
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
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        // Only allow closing via buttons, not outside click
        if (!open && !isSubmitting && !isBrowsingFolder) {
          setIsDialogOpen(false);
        }
      }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[90vh]" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader className="p-6 pb-2 border-b bg-background z-10">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base">
                <UploadIcon className="h-4 w-4 text-primary" />
                Upload Batch Images
              </DialogTitle>
              <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[9px] font-bold px-1.5 py-0.5 animate-pulse">
                TIFF ONLY
              </Badge>
            </div>
            <DialogDescription className="text-xs">
              {isSubmitting
                ? "Please wait while we prepare your images for upload..."
                : isBrowsingFolder
                  ? "Loading folder contents, please wait..."
                  : "Review batch details and select the folder containing your scanned TIFF images."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isSubmitting ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3 animate-in fade-in zoom-in duration-300">
                <div className="relative flex items-center justify-center">
                  <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-black text-primary">{preparationProgress}%</span>
                  </div>
                </div>
                <div className="w-full max-w-xs space-y-2">
                  <Progress value={preparationProgress} className="h-2 shadow-inner" />
                  <p className="text-[10px] text-center font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                    Preparing Local Cache...
                  </p>
                </div>
              </div>
            ) : selectedBatch && (
              <div className="space-y-4 py-3">
                {/* Batch Info Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm bg-muted/30 p-3 rounded-lg border border-border/50 text-left">
                  <div className="space-y-0.5 col-span-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Batch ID</p>
                    <p className="font-mono font-bold text-sm text-primary break-all">{selectedBatch.batch_id}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Project</p>
                    <p className="font-medium text-xs text-foreground">{selectedBatch.project_name}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Book Name</p>
                    <p className="font-medium text-xs text-foreground">{selectedBatch.book_name}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Source</p>
                    <p className="font-medium text-xs text-foreground">{selectedBatch.source_name}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Location</p>
                    <p className="font-medium text-xs text-foreground">{selectedBatch.location_name}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Record Type</p>
                    <p className="font-medium text-xs text-foreground">{selectedBatch.record_type_name}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Target Count</p>
                    <p className="font-bold flex items-center gap-1.5 text-xs text-foreground">
                      <Files className="h-3.5 w-3.5 text-primary" />
                      {selectedBatch.target_count} Images
                    </p>
                  </div>
                </div>

                {/* Rework Guidance */}
                {selectedBatch.is_reupload && (
                  <div className="space-y-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[10px] uppercase tracking-wider">
                      <Info className="h-3.5 w-3.5" />
                      Rework Guidance
                    </div>
                    <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                      This is a re-upload batch. You must upload images with the <strong>EXACT same names</strong> as the rejected ones listed below to ensure they correctly replace the old versions.
                    </p>
                    {isLoadingRejected ? (
                      <div className="flex items-center gap-2 text-[11px] text-amber-600 animate-pulse">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading rejected filenames...
                      </div>
                    ) : rejectedNames.length > 0 ? (
                      <div className="bg-white/50 rounded-lg p-2 max-h-[100px] overflow-y-auto border border-amber-100">
                        <ul className="text-[10px] font-mono text-amber-900 space-y-0.5">
                          {rejectedNames.map(name => (
                            <li key={name} className="flex items-center gap-1.5">
                              <Files className="h-2.5 w-2.5 opacity-50" />
                              {name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-[9px] text-amber-600 italic">No rejected filenames found. Please contact supervisor.</p>
                    )}
                  </div>
                )}

                {/* Validation Warning Inline */}
                {invalidFileNames.length > 0 && (
                  <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 animate-in fade-in zoom-in duration-300">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-black uppercase tracking-tight flex items-center justify-between">
                      <span>{invalidFileNames.length} Naming Conflicts Found</span>
                      <Badge variant="destructive" className="text-[9px] font-black h-4">INVALID DATA</Badge>
                    </AlertTitle>
                    <AlertDescription className="text-[11px] font-medium leading-relaxed mt-2 text-destructive">
                      <p className="mb-2">The following files do not match the original rejected filenames:</p>
                      <div className="max-h-[100px] overflow-y-auto px-3 py-2 bg-white rounded-lg border border-destructive/20 flex flex-col gap-1.5 shadow-inner">
                        {invalidFileNames.slice(0, 10).map((name, idx) => (
                          <div key={idx} className="flex items-center gap-2 group">
                            <AlertCircle className="h-2.5 w-2.5 opacity-40" />
                            <code className="text-destructive font-bold break-all">{name}</code>
                          </div>
                        ))}
                        {invalidFileNames.length > 10 && (
                          <p className="text-[9px] font-black pt-1.5 border-t border-destructive/10 text-destructive/60 italic">
                            + {invalidFileNames.length - 10} additional naming issues detected
                          </p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Duplicate Files Warning */}
                {duplicateFileNames.length > 0 && (
                  <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 animate-in fade-in zoom-in duration-300">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-black uppercase tracking-tight flex items-center justify-between">
                      <span>{duplicateFileNames.length} Duplicate Files Detected</span>
                      <Badge variant="destructive" className="text-[9px] font-black h-4">DUPLICATE DATA</Badge>
                    </AlertTitle>
                    <AlertDescription className="text-[11px] font-medium leading-relaxed mt-2 text-destructive">
                      <p className="mb-2">The following filenames appear multiple times in the selected folder structure. Please ensure all file names are unique before uploading:</p>
                      <div className="max-h-[100px] overflow-y-auto px-3 py-2 bg-white rounded-lg border border-destructive/20 flex flex-col gap-1.5 shadow-inner">
                        {duplicateFileNames.slice(0, 10).map((dup, idx) => (
                          <div key={idx} className="flex items-center gap-2 group">
                            <Files className="h-2.5 w-2.5 opacity-40 text-destructive" />
                            <code className="text-destructive font-bold break-all">
                              {dup.name} {dup.count >= 3 && <span className="text-[10px] bg-destructive/10 px-1 rounded ml-1">({dup.count})</span>}
                            </code>
                          </div>
                        ))}
                        {duplicateFileNames.length > 10 && (
                          <p className="text-[9px] font-black pt-1.5 border-t border-destructive/10 text-destructive/60 italic">
                            + {duplicateFileNames.length - 10} additional duplicates detected
                          </p>
                        )}
                      </div>
                      <p className="mt-3 text-[10px] font-bold text-destructive/80 italic text-center">
                        ⚠️ S3 requires unique filenames per batch to prevent overwriting images.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

                {/* 🛡️ Corrupted/Tiny Files Warning */}
                {corruptedFileNames.length > 0 && (
                  <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 animate-in fade-in zoom-in duration-300">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-black uppercase tracking-tight flex items-center justify-between">
                      <span>{corruptedFileNames.length} Corrupted/Empty Files Detected</span>
                      <Badge variant="destructive" className="text-[9px] font-black h-4">CORRUPTION GUARD</Badge>
                    </AlertTitle>
                    <AlertDescription className="text-[11px] font-medium leading-relaxed mt-2 text-destructive">
                      <div className="p-3 bg-red-600/10 rounded-lg border border-red-200 mb-3">
                        <p className="font-bold text-red-900">⚠️ Data Quality Issue Detected</p>
                        <p className="text-red-700">The following files are extremely small (<strong>under 10 KB</strong>), which indicates they are corrupted, empty, or not valid TIFF images.</p>
                      </div>
                      <div className="max-h-[100px] overflow-y-auto px-3 py-2 bg-white rounded-lg border border-destructive/20 flex flex-col gap-1.5 shadow-inner">
                        {corruptedFileNames.slice(0, 10).map((corrupt, idx) => (
                          <div key={idx} className="flex items-center gap-2 group">
                            <AlertCircle className="h-2.5 w-2.5 opacity-40 text-destructive" />
                            <code className="text-destructive font-bold break-all">
                              {corrupt.name} <span className="text-[9px] opacity-70">({(corrupt.size / 1024).toFixed(2)} KB)</span>
                            </code>
                          </div>
                        ))}
                        {corruptedFileNames.length > 10 && (
                          <p className="text-[9px] font-black pt-1.5 border-t border-destructive/10 text-destructive/60 italic">
                            + {corruptedFileNames.length - 10} additional corrupted files detected
                          </p>
                        )}
                      </div>
                      <p className="mt-4 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 p-2 rounded text-center">
                        🛑 Please re-scan or replace these files before attempting to upload.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

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
                      onClick={handlePersistentFolderSelect}
                      className="h-8 gap-2"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Quick Selection
                    </Button>
                  </div>

                  {isBrowsingFolder ? (
                    <div className="p-6 rounded-lg bg-blue-50 border border-blue-200 animate-in fade-in slide-in-from-top-1">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        <div className="text-center">
                          <p className="text-sm font-bold text-blue-900">Loading Folder Contents...</p>
                          <p className="text-xs text-blue-700 mt-1">Please wait while we scan for TIFF files</p>
                        </div>
                      </div>
                    </div>
                  ) : selectedFiles.length > 0 ? (
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-1">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <CheckCircle className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-primary">TIFF Folder Linked</p>
                          <p className="text-xs text-muted-foreground">
                            Ready to upload <strong>{selectedFiles.length}</strong> TIFF images ({selectedBatch.target_count} required)
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={handlePersistentFolderSelect}
                      className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer group"
                    >
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FolderOpen className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold">Click to Link TIFF Folder</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Brave/Chrome users: Access will be remembered for auto-resume</p>
                      </div>
                    </div>
                  )}
                </div>

                {preparationProgress > 0 && preparationProgress < 100 && (
                  <Alert className="bg-primary/5 border-primary/20 animate-in fade-in zoom-in duration-300">
                    <Info className="h-4 w-4 text-primary" />
                    <AlertTitle className="text-xs font-black uppercase tracking-tight flex items-center justify-between">
                      <span>Preparation Interrupted</span>
                      <Badge variant="secondary" className="text-[9px] font-black h-4 bg-primary/10 text-primary">RESUME</Badge>
                    </AlertTitle>
                    <AlertDescription className="text-[11px] font-medium leading-relaxed mt-2 text-primary">
                      It looks like the previous preparation was interrupted. Click "Start Upload" to resume from {preparationProgress}%.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-[11px]">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p><strong>Note:</strong> Only TIFF format images are accepted. JPEG, PNG, or other formats will be filtered out. Ensure the folder has exactly {selectedBatch.target_count} TIFF files.</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-6 pt-2 border-t bg-muted/20 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartUpload}
              disabled={selectedFiles.length === 0 || isSubmitting || duplicateFileNames.length > 0}
              className="min-w-[140px] shadow-lg shadow-primary/20"
            >
              {isSubmitting ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-wider">Processing {preparationProgress}%</span>
                  </div>
                  <Progress value={preparationProgress} className="h-1 w-24 bg-primary/20" />
                </div>
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
