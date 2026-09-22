import "@peer-point/workshop-ui/styles.css";
import "./client/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./client/app.js";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
