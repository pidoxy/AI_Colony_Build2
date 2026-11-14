import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

const queryClient = new QueryClient();

// Dev SSO (A1): in production this comes from the university IdP redirect.
// Here we mint a dev token when absent. The API never accepts a student id
// from the request body — only from this bearer token.
if (!localStorage.getItem("crs_token")) {
  const sub = prompt("Student id (dev login)", "s12345") ?? "s12345";
  localStorage.setItem("crs_token", JSON.stringify({ student: { sub } }));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
