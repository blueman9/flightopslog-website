import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import PrivacyPolicy from './pages/PrivacyPolicy.tsx'
import Support from './pages/Support.tsx'
import ImportTemplate from './pages/ImportTemplate.tsx'
import TestFlight from './pages/TestFlight.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/support" element={<Support />} />
        <Route path="/import-template" element={<ImportTemplate />} />
        <Route path="/testflight" element={<TestFlight />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
