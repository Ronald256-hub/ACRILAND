import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";
import "./styles-v2.css";
import "./styles-v2-ops.css";
import "./styles-v3.css";
import "./styles-v4.css";
import "./styles-v5.css";
import "./styles-v6.css";
import "./styles-v6-secure.css";
import "./styles-v7.css";
import "./styles-v8.css";
import "./styles-v9.css";
import "./styles-v10.css";
import "./styles-v11.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // App functionality remains available when service workers are unsupported or blocked.
    });
  });
}
