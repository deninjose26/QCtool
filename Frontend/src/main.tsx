import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { syncManager } from "./utils/syncManager";
import { registerSW } from 'virtual:pwa-register';

// Initialize SyncManager to start listening for online events
syncManager.processQueue();

// Register PWA Service Worker
const updateSW = registerSW({
    onNeedRefresh() {
        // Show a prompt to the user when a new version is available
        if (confirm('New version available! Click OK to update.')) {
            updateSW(true);
        }
    },
    onOfflineReady() {
        console.log('✅ App ready to work offline');
    },
    onRegistered(registration) {
        console.log('✅ Service Worker registered');
        // Check for updates every hour
        if (registration) {
            setInterval(() => {
                registration.update();
            }, 60 * 60 * 1000);
        }
    },
    onRegisterError(error) {
        console.error('❌ Service Worker registration failed:', error);
    }
});

createRoot(document.getElementById("root")!).render(<App />);
