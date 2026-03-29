import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// App.css is imported inside App.jsx — no need to import it here too

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
