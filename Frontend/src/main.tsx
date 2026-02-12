import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { syncManager } from "./utils/syncManager";

// Initialize SyncManager to start listening for online events
syncManager.processQueue();

// Failsafe: Unregister any existing service workers in development to prevent 
// the "Database connection is closing" error during reloads.
if (import.meta.env.DEV || window.location.hostname === 'localhost') {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
                console.log('🗑️ Development Failsafe: Service Worker unregistered');
            }
        });

        // Clear Workbox caches if they exist
        if ('caches' in window) {
            caches.keys().then((names) => {
                for (const name of names) {
                    if (name.includes('workbox') || name.includes('api-cache') || name.includes('images-cache')) {
                        caches.delete(name);
                        console.log(`🧹 Development Failsafe: Cache ${name} deleted`);
                    }
                }
            });
        }
    }
}

createRoot(document.getElementById("root")!).render(<App />);
