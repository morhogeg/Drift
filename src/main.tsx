import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { isCloudEnabled } from './lib/cloudConfig.ts'

// Optional cloud accounts: with blank VITE_FIREBASE_* env (the default) this
// is false and the dynamic import below never happens — no Firebase code is
// fetched, no listeners registered, app behavior unchanged.
if (isCloudEnabled()) {
  import('./services/cloudSync').then((m) => m.initCloudSync())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
