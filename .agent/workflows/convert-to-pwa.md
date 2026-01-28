---
description: Convert QCtool to Progressive Web App (PWA)
---

# Convert QCtool to Progressive Web App (PWA)

## 🎯 Goal
Transform QCtool into a fully functional Progressive Web App that can be installed on mobile devices and desktops, work offline, and provide a native app-like experience.

## 📋 Prerequisites
- Vite-based React application (already in place)
- HTTPS deployment (required for PWA)
- Service Worker support in target browsers

## 🔧 Implementation Steps

### 1. Install PWA Plugin for Vite
```bash
npm install vite-plugin-pwa -D
npm install workbox-window
```

### 2. Configure Vite for PWA (`vite.config.ts`)
Add the PWA plugin configuration:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'QCtool - Quality Control Management',
        short_name: 'QCtool',
        description: 'Quality Control and Upload Management System',
        theme_color: '#4f46e5', // Indigo-600
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.qctool\.com\/.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true // Enable PWA in development mode
      }
    })
  ]
})
```

### 3. Create PWA Icons
Generate icons in the following sizes and place them in `public/` folder:
- `pwa-192x192.png` (192x192)
- `pwa-512x512.png` (512x512)
- `apple-touch-icon.png` (180x180)
- `favicon.ico` (32x32)
- `masked-icon.svg` (SVG for Safari)

**Tool to generate icons:** https://realfavicongenerator.net/

### 4. Add PWA Install Prompt Component
Create `src/components/PWAInstallPrompt.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setShowPrompt(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            setShowPrompt(false);
        }
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white border-2 border-indigo-500 rounded-xl shadow-2xl p-4 z-50 animate-slide-up">
            <button
                onClick={() => setShowPrompt(false)}
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
            >
                <X className="h-4 w-4" />
            </button>
            
            <div className="flex items-start gap-3">
                <div className="h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                    <Download className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-slate-900 mb-1">Install QCtool</h3>
                    <p className="text-xs text-slate-600 mb-3">
                        Install our app for quick access and offline support
                    </p>
                    <Button
                        onClick={handleInstall}
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                        size="sm"
                    >
                        Install App
                    </Button>
                </div>
            </div>
        </div>
    );
};
```

### 5. Add Update Notification Component
Create `src/components/PWAUpdatePrompt.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const PWAUpdatePrompt = () => {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r);
        },
        onRegisterError(error) {
            console.log('SW registration error', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    if (!offlineReady && !needRefresh) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white border-2 border-green-500 rounded-xl shadow-2xl p-4 z-50">
            <div className="flex items-start gap-3">
                <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <RefreshCw className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-slate-900 mb-1">
                        {offlineReady ? 'App ready to work offline' : 'New update available'}
                    </h3>
                    <p className="text-xs text-slate-600 mb-3">
                        {offlineReady
                            ? 'You can now use QCtool offline'
                            : 'Click reload to update to the latest version'}
                    </p>
                    <div className="flex gap-2">
                        {needRefresh && (
                            <Button
                                onClick={() => updateServiceWorker(true)}
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                size="sm"
                            >
                                Reload
                            </Button>
                        )}
                        <Button
                            onClick={close}
                            variant="outline"
                            size="sm"
                            className="flex-1"
                        >
                            Close
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
```

### 6. Update `src/App.tsx`
Add PWA components to the main app:

```typescript
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { PWAUpdatePrompt } from '@/components/PWAUpdatePrompt';

function App() {
    return (
        <>
            {/* Existing app content */}
            <YourAppRoutes />
            
            {/* PWA Components */}
            <PWAInstallPrompt />
            <PWAUpdatePrompt />
        </>
    );
}
```

### 7. Add Offline Fallback Page
Create `public/offline.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QCtool - Offline</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 20px;
        }
        .container {
            max-width: 400px;
        }
        h1 { font-size: 2rem; margin-bottom: 1rem; }
        p { opacity: 0.9; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📡 You're Offline</h1>
        <p>QCtool requires an internet connection to work properly.</p>
        <p>Please check your connection and try again.</p>
    </div>
</body>
</html>
```

### 8. Update `index.html`
Add PWA meta tags:

```html
<head>
    <!-- Existing meta tags -->
    
    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#4f46e5">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="QCtool">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="mask-icon" href="/masked-icon.svg" color="#4f46e5">
</head>
```

### 9. Build and Test PWA

// turbo
```bash
npm run build
```

// turbo
```bash
npm run preview
```

Test PWA features:
1. Open Chrome DevTools → Application → Service Workers
2. Check "Offline" to test offline functionality
3. Application → Manifest to verify manifest.json
4. Lighthouse → Run PWA audit

### 10. Deploy with HTTPS
PWAs require HTTPS. Deploy to:
- **Vercel** (recommended for Vite apps)
- **Netlify**
- **AWS Amplify**
- **Your own server with SSL certificate**

## 📱 PWA Features Enabled

### ✅ Installable
- Users can install QCtool on their home screen (mobile/desktop)
- Standalone app experience without browser UI

### ✅ Offline Support
- Service Worker caches critical assets
- API responses cached with NetworkFirst strategy
- Images cached with CacheFirst strategy
- Offline fallback page

### ✅ Auto-Updates
- Service Worker automatically updates in background
- User prompted to reload when new version available
- Seamless update experience

### ✅ Native-Like Experience
- Full-screen mode (no browser chrome)
- Custom splash screen
- App icon on home screen
- Push notifications (can be added later)

## 🎨 Advanced Features (Optional)

### Push Notifications
Add web push notifications for:
- New batch assignments
- Approval requests
- Upload completion alerts

### Background Sync
Queue API requests when offline and sync when connection restored

### Share Target API
Allow sharing files directly to QCtool from other apps

### Shortcuts
Add app shortcuts for quick actions (e.g., "New Upload", "View Queue")

## 🧪 Testing Checklist

- [ ] Install prompt appears on desktop
- [ ] Install prompt appears on mobile
- [ ] App installs successfully
- [ ] App works offline (cached pages)
- [ ] Update notification appears when new version deployed
- [ ] Icons display correctly on all platforms
- [ ] Splash screen shows on app launch
- [ ] Service Worker registers successfully
- [ ] Lighthouse PWA score > 90

## 📚 Resources

- [Vite PWA Plugin Docs](https://vite-pwa-org.netlify.app/)
- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [PWA Checklist](https://web.dev/pwa-checklist/)
- [Icon Generator](https://realfavicongenerator.net/)

## 🚀 Deployment

Once implemented, deploy to production with HTTPS enabled. Users will see an install prompt in their browser and can add QCtool to their home screen like a native app!
