import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root")!;
if (/^\/(?:signin|member|portal|apps)(?:\/|$)/.test(location.pathname)) {
  let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.append(robots); }
  robots.content = "noindex, nofollow";
}
// Build-time HTML is a complete crawler snapshot. The interactive application
// deliberately replaces it once JavaScript is available.
root.replaceChildren();
createRoot(root).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
