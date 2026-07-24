import React from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App.jsx"
import { AuthProvider } from "./context/AuthContext.jsx"
import { AppProviders } from "./components/Providers.tsx"
import "./styles/globals.css"

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppProviders>
          <App />
        </AppProviders>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
