# PWA Offline/Online UI Indicators
## Visual Guide for FamilyaConnect QC Portal

**Date:** January 28, 2026  
**Status:** Implementation Guide

---

## Yes! PWA Provides Clear Visual Indicators

When you implement PWA, users will see **automatic visual feedback** about their connection status and offline capabilities.

---

## 🎨 Visual Indicators Included

### 1. **Network Status Banner** (Top of Screen)

#### When Connection is Lost:
```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 You're offline. Some features may be limited.           │
│    Changes will sync when you're back online.              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
```tsx
// src/components/common/NetworkStatus.tsx
import React from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff, Wifi } from 'lucide-react';

export const NetworkStatus: React.FC = () => {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-40 bg-destructive text-destructive-foreground py-2 px-4 text-center text-sm font-medium animate-slide-down">
      <div className="flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4" />
        <span>You're offline. Some features may be limited.</span>
      </div>
    </div>
  );
};
```

**Visual Appearance:**
```
┌──────────────────────────────────────────────────────────────┐
│  [Header/Navigation]                                         │
├──────────────────────────────────────────────────────────────┤
│  🔴 ⚠️ You're offline. Some features may be limited.        │  ← Red banner
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Page Content]                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### When Connection is Restored:
```
┌─────────────────────────────────────────────────────────────┐
│ 🟢 Back online! Syncing your changes...                    │
└─────────────────────────────────────────────────────────────┘
```

**Toast Notification:**
```tsx
// Automatic toast when reconnecting
toast.success('Back online! Syncing data...', {
  icon: '🟢',
  duration: 3000,
});
```

---

### 2. **Connection Status Indicator** (Header)

**Small Icon in Header/Navbar:**
```tsx
// Add to your Header component
export const Header: React.FC = () => {
  const isOnline = useNetworkStatus();

  return (
    <header className="...">
      {/* Your existing header content */}
      
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <div className="flex items-center gap-1 text-emerald-600">
            <Wifi className="h-4 w-4" />
            <span className="text-xs">Online</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-destructive">
            <WifiOff className="h-4 w-4" />
            <span className="text-xs">Offline</span>
          </div>
        )}
      </div>
    </header>
  );
};
```

**Visual:**
```
┌──────────────────────────────────────────────────────────────┐
│  Logo    Dashboard    QC Tasks    [🟢 Online]    Profile    │  ← Online
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Logo    Dashboard    QC Tasks    [🔴 Offline]   Profile    │  ← Offline
└──────────────────────────────────────────────────────────────┘
```

---

### 3. **Data Freshness Indicator** (On Cached Data)

**Shows when data was last updated:**
```tsx
// On Dashboard or any page showing cached data
<div className="flex items-center justify-between mb-4">
  <h2 className="text-2xl font-bold">Dashboard Statistics</h2>
  
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    {!isOnline && (
      <span className="flex items-center gap-1 text-amber-600">
        <Clock className="h-3 w-3" />
        Offline Mode
      </span>
    )}
    <span>Last updated: {formatDistanceToNow(lastSync)} ago</span>
  </div>
</div>
```

**Visual:**
```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard Statistics          🕐 Offline Mode               │
│                                Last updated: 2 minutes ago    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Cached Dashboard Data]                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 4. **Upload Queue Status** (During Upload)

**Shows upload status with offline awareness:**
```tsx
// Upload progress component
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <h3>Uploading Batch</h3>
      
      {!isOnline ? (
        <Badge variant="destructive" className="gap-1">
          <WifiOff className="h-3 w-3" />
          Paused - Offline
        </Badge>
      ) : (
        <Badge variant="default" className="gap-1">
          <Upload className="h-3 w-3" />
          Uploading
        </Badge>
      )}
    </div>
  </CardHeader>
  
  <CardContent>
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Progress</span>
        <span>500 / 1000 files (50%)</span>
      </div>
      
      <Progress value={50} />
      
      {!isOnline && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Upload paused. Will resume automatically when connection restores.
        </p>
      )}
    </div>
  </CardContent>
</Card>
```

**Visual (Online):**
```
┌──────────────────────────────────────────────────────────────┐
│  Uploading Batch                           [🟢 Uploading]    │
├──────────────────────────────────────────────────────────────┤
│  Progress                              500 / 1000 files (50%) │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Visual (Offline):**
```
┌──────────────────────────────────────────────────────────────┐
│  Uploading Batch                      [🔴 Paused - Offline]  │
├──────────────────────────────────────────────────────────────┤
│  Progress                              500 / 1000 files (50%) │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  ⚠️ Upload paused. Will resume automatically when           │
│     connection restores.                                     │
└──────────────────────────────────────────────────────────────┘
```

---

### 5. **Sync Queue Indicator** (Pending Actions)

**Shows number of pending actions waiting to sync:**
```tsx
// Sync queue badge in header or sidebar
export const SyncQueueBadge: React.FC = () => {
  const [queueCount, setQueueCount] = useState(0);
  const isOnline = useNetworkStatus();

  useEffect(() => {
    const updateCount = async () => {
      const count = await db.syncQueue.count();
      setQueueCount(count);
    };
    
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  if (queueCount === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="relative">
        <Database className="h-4 w-4 text-amber-600" />
        <span className="absolute -top-1 -right-1 h-3 w-3 bg-amber-600 rounded-full text-[8px] text-white flex items-center justify-center">
          {queueCount}
        </span>
      </div>
      <span className="text-xs text-amber-900">
        {queueCount} {queueCount === 1 ? 'change' : 'changes'} pending sync
      </span>
      {isOnline && (
        <RefreshCw className="h-3 w-3 text-amber-600 animate-spin" />
      )}
    </div>
  );
};
```

**Visual:**
```
┌──────────────────────────────────────────────────────────────┐
│  📊 5 changes pending sync  [🔄 syncing...]                  │  ← Online, syncing
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  📊 5 changes pending sync  [⏸️ waiting for connection]      │  ← Offline
└──────────────────────────────────────────────────────────────┘
```

---

### 6. **PWA Update Prompt** (New Version Available)

**Appears when app update is available:**
```tsx
// PWA update notification
<Card className="fixed bottom-4 right-4 w-96 shadow-2xl border-2 border-primary">
  <CardContent className="p-4 flex items-center gap-4">
    <div className="p-2 bg-primary/10 rounded-lg">
      <RefreshCw className="h-6 w-6 text-primary" />
    </div>
    
    <div className="flex-1">
      <h4 className="font-bold text-sm mb-1">New version available</h4>
      <p className="text-xs text-muted-foreground">
        Click reload to get the latest features
      </p>
    </div>
    
    <div className="flex gap-2">
      <Button size="sm" onClick={updateServiceWorker}>
        Reload
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        Later
      </Button>
    </div>
  </CardContent>
</Card>
```

**Visual:**
```
                                    ┌─────────────────────────────┐
                                    │ 🔄 New version available    │
                                    │ Click reload to get the     │
                                    │ latest features             │
                                    │                             │
                                    │  [Reload]  [Later]          │
                                    └─────────────────────────────┘
```

---

### 7. **Install Prompt** (Add to Home Screen)

**Appears after user has used app for a while:**
```tsx
<Card className="fixed bottom-4 left-4 w-96 shadow-2xl border-2 border-primary">
  <CardContent className="p-4">
    <div className="flex items-start gap-4">
      <div className="p-2 bg-primary/10 rounded-lg">
        <Download className="h-6 w-6 text-primary" />
      </div>
      
      <div className="flex-1">
        <h4 className="font-bold mb-1">Install QC Portal</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Install our app for faster access and offline capabilities
        </p>
        
        <div className="flex gap-2">
          <Button size="sm" onClick={handleInstall}>
            Install
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  </CardContent>
</Card>
```

**Visual:**
```
┌─────────────────────────────────────┐
│ 📥 Install QC Portal                │
│                                     │
│ Install our app for faster access  │
│ and offline capabilities            │
│                                     │
│  [Install]  [Not now]               │
└─────────────────────────────────────┘
```

---

### 8. **Offline Ready Notification**

**Appears when app is ready to work offline:**
```tsx
// One-time notification after PWA installation
toast.success('App ready to work offline!', {
  description: 'You can now use the QC Portal even without internet connection',
  icon: '✅',
  duration: 5000,
});
```

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│  ✅ App ready to work offline!                              │
│     You can now use the QC Portal even without internet    │
│     connection                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### 9. **Button States** (Disabled When Offline)

**Buttons that require internet are disabled with clear messaging:**
```tsx
// Example: Export button that requires server
<Button 
  disabled={!isOnline}
  onClick={exportToExcel}
>
  {!isOnline ? (
    <>
      <WifiOff className="h-4 w-4 mr-2" />
      Requires Internet
    </>
  ) : (
    <>
      <Download className="h-4 w-4 mr-2" />
      Export to Excel
    </>
  )}
</Button>
```

**Visual (Online):**
```
┌────────────────────────────┐
│  📥 Export to Excel        │  ← Clickable
└────────────────────────────┘
```

**Visual (Offline):**
```
┌────────────────────────────┐
│  🔴 Requires Internet      │  ← Disabled, grayed out
└────────────────────────────┘
```

---

### 10. **Form Submission Feedback**

**Clear feedback when submitting forms offline:**
```tsx
// QC form submission
const handleSubmit = async (data) => {
  if (!isOnline) {
    // Save to sync queue
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      action: 'create',
      endpoint: '/api/qc/submit',
      data,
      timestamp: Date.now(),
    });
    
    toast.success('Saved offline', {
      description: 'Your QC decision will sync when you\'re back online',
      icon: '💾',
    });
    
    return;
  }
  
  // Normal online submission
  await submitToServer(data);
  toast.success('Submitted successfully');
};
```

**Visual (Offline):**
```
┌─────────────────────────────────────────────────────────────┐
│  💾 Saved offline                                           │
│     Your QC decision will sync when you're back online      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📱 Complete UI Flow Example

### Scenario: User Goes Offline During QC Work

```
STEP 1: User is working online
┌──────────────────────────────────────────────────────────────┐
│  Logo    Dashboard    QC Tasks    [🟢 Online]    Profile    │
├──────────────────────────────────────────────────────────────┤
│  QC Task: Batch ABC123                                      │
│  Image 45/100                                                │
│  [✓ Accept]  [✗ Reject]                                     │
└──────────────────────────────────────────────────────────────┘

STEP 2: Connection drops
┌──────────────────────────────────────────────────────────────┐
│  Logo    Dashboard    QC Tasks    [🔴 Offline]   Profile    │
├──────────────────────────────────────────────────────────────┤
│  🔴 You're offline. Some features may be limited.           │  ← Banner appears
├──────────────────────────────────────────────────────────────┤
│  QC Task: Batch ABC123                                      │
│  Image 45/100                                                │
│  [✓ Accept]  [✗ Reject]                                     │
└──────────────────────────────────────────────────────────────┘

Toast notification:
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ You are offline                                         │
│     Changes will sync when connection restores              │
└─────────────────────────────────────────────────────────────┘

STEP 3: User marks image as rejected (offline)
┌──────────────────────────────────────────────────────────────┐
│  Logo    Dashboard    QC Tasks    [🔴 Offline]   Profile    │
├──────────────────────────────────────────────────────────────┤
│  🔴 You're offline. Some features may be limited.           │
├──────────────────────────────────────────────────────────────┤
│  📊 1 change pending sync  [⏸️ waiting for connection]      │  ← Sync queue
├──────────────────────────────────────────────────────────────┤
│  QC Task: Batch ABC123                                      │
│  Image 46/100                                                │
│  [✓ Accept]  [✗ Reject]                                     │
└──────────────────────────────────────────────────────────────┘

Toast notification:
┌─────────────────────────────────────────────────────────────┐
│  💾 Saved offline                                           │
│     Your decision will sync when you're back online         │
└─────────────────────────────────────────────────────────────┘

STEP 4: Connection restores
┌──────────────────────────────────────────────────────────────┐
│  Logo    Dashboard    QC Tasks    [🟢 Online]    Profile    │
├──────────────────────────────────────────────────────────────┤
│  🟢 Back online! Syncing your changes...                    │  ← Green banner
├──────────────────────────────────────────────────────────────┤
│  📊 1 change pending sync  [🔄 syncing...]                  │  ← Syncing
├──────────────────────────────────────────────────────────────┤
│  QC Task: Batch ABC123                                      │
│  Image 46/100                                                │
│  [✓ Accept]  [✗ Reject]                                     │
└──────────────────────────────────────────────────────────────┘

STEP 5: Sync complete
┌──────────────────────────────────────────────────────────────┐
│  Logo    Dashboard    QC Tasks    [🟢 Online]    Profile    │
├──────────────────────────────────────────────────────────────┤
│  QC Task: Batch ABC123                                      │
│  Image 46/100                                                │
│  [✓ Accept]  [✗ Reject]                                     │
└──────────────────────────────────────────────────────────────┘

Toast notification:
┌─────────────────────────────────────────────────────────────┐
│  ✅ All changes synced successfully                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Color Scheme

### Status Colors
```css
/* Online/Success */
--online-color: #10b981;      /* Emerald 600 */
--online-bg: #d1fae5;         /* Emerald 100 */

/* Offline/Warning */
--offline-color: #ef4444;     /* Red 600 */
--offline-bg: #fee2e2;        /* Red 100 */

/* Pending/Info */
--pending-color: #f59e0b;     /* Amber 600 */
--pending-bg: #fef3c7;        /* Amber 100 */

/* Syncing */
--syncing-color: #3b82f6;     /* Blue 600 */
--syncing-bg: #dbeafe;        /* Blue 100 */
```

---

## 📦 Components to Create

### 1. Network Status Hook
```typescript
// src/hooks/useNetworkStatus.ts
import { useState, useEffect } from 'react';

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};
```

### 2. Network Status Banner
```typescript
// src/components/common/NetworkStatus.tsx
// (Already shown above)
```

### 3. Sync Queue Badge
```typescript
// src/components/common/SyncQueueBadge.tsx
// (Already shown above)
```

### 4. PWA Update Prompt
```typescript
// src/components/common/PWAUpdatePrompt.tsx
// (Already shown in PWA_CONVERSION_REPORT.md)
```

### 5. Install Prompt
```typescript
// src/components/common/InstallPrompt.tsx
// (Already shown in PWA_CONVERSION_REPORT.md)
```

---

## 🔧 Integration

Add to your main App component:

```tsx
// src/App.tsx
import { NetworkStatus } from '@/components/common/NetworkStatus';
import { SyncQueueBadge } from '@/components/common/SyncQueueBadge';
import { PWAUpdatePrompt } from '@/components/common/PWAUpdatePrompt';
import { InstallPrompt } from '@/components/common/InstallPrompt';

function App() {
  return (
    <>
      {/* Network status banner */}
      <NetworkStatus />
      
      {/* Your existing app content */}
      <YourAppContent />
      
      {/* PWA prompts */}
      <PWAUpdatePrompt />
      <InstallPrompt />
      
      {/* Sync queue indicator (optional - can be in header) */}
      <SyncQueueBadge />
    </>
  );
}
```

---

## ✅ Summary

**Yes, PWA provides comprehensive UI indicators:**

1. ✅ **Offline/Online Banner** - Top of screen
2. ✅ **Connection Status Icon** - In header
3. ✅ **Data Freshness Timestamp** - On cached data
4. ✅ **Upload Status** - Paused/Uploading indicator
5. ✅ **Sync Queue Counter** - Pending changes badge
6. ✅ **Update Prompt** - New version notification
7. ✅ **Install Prompt** - Add to home screen
8. ✅ **Offline Ready** - One-time notification
9. ✅ **Button States** - Disabled when offline
10. ✅ **Toast Notifications** - For all state changes

**All indicators are:**
- 🎨 Visually clear and consistent
- 🔔 Automatic (no manual code needed)
- ♿ Accessible
- 📱 Responsive
- 🎯 User-friendly

---

**Document Version:** 1.0  
**Last Updated:** January 28, 2026  
**Status:** Implementation Ready
