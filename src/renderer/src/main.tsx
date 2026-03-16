import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// Forward uncaught errors to the main process for logging
window.onerror = (_message, _source, _lineno, _colno, error) => {
  window.api.logError(error?.message ?? String(_message), error?.stack)
}

window.onunhandledrejection = (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  window.api.logError(`Unhandled rejection: ${message}`, stack)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
