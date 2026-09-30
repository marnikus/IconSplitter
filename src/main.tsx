import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Workbench from "./ui/Workbench";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Workbench />
  </StrictMode>
);
