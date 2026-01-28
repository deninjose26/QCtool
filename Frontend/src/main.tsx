import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { syncManager } from "./utils/syncManager";

// Initialize SyncManager to start listening for online events
syncManager.processQueue();

createRoot(document.getElementById("root")!).render(<App />);
