import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Shell from "./ui/Shell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell />
  </StrictMode>
);
