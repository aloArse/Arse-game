import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// The Three.js engine owns an imperative WebGL lifecycle. React StrictMode
// intentionally mounts effects twice in development, which can exhaust the
// WebGL context/memory budget on mobile devices.
createRoot(document.getElementById("root")!).render(<App />);
