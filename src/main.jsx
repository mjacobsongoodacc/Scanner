import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <>
    <div className="app-bg" aria-hidden="true" />
    <div className="app-scroll-root">
      <StrictMode>
        <App />
      </StrictMode>
    </div>
  </>
);
