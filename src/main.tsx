import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Workbench from "./ui/Workbench";
import { bootStores } from "./state/boot";

bootStores(); // restore the last session before anything renders

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Workbench />
  </StrictMode>
);
