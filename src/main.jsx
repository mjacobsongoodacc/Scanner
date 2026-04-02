import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App.jsx";
import DarkVeil from "./components/DarkVeil.jsx";

createRoot(document.getElementById("root")).render(
  <>
    <div className="app-bg" aria-hidden="true">
      <div className="app-bg__veil">
        <DarkVeil
          hueShift={137}
          noiseIntensity={0}
          scanlineIntensity={0}
          speed={0.5}
          scanlineFrequency={0}
          warpAmount={0}
        />
      </div>
    </div>
    <div className="app-scroll-root">
      <StrictMode>
        <App />
      </StrictMode>
    </div>
  </>
);
