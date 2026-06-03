import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** When provided, render this instead of the full-page crash screen on error
   *  (used to scope a failure to a sub-tree, e.g. the Drift Map). */
  fallback?: ReactNode
  /** Called once when an error is caught — e.g. to close the offending panel. */
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.props.onError?.(error)
  }

  public render() {
    // Scoped boundary: swallow the error, render the fallback, and let the
    // parent recover (it stays mounted, so reopening works) instead of nuking
    // the whole app to a reload screen.
    if (this.state.hasError && this.props.fallback !== undefined) {
      return this.props.fallback
    }

    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
          <div className="bg-dark-surface border border-dark-border rounded-xl p-8 max-w-lg text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-4">Something went wrong</h1>
            <p className="text-text-secondary mb-6">
              An error occurred in the application. Please refresh the page to continue.
            </p>
            <details className="text-left mb-6">
              <summary className="cursor-pointer text-accent-violet hover:text-accent-pink transition-colors">
                Error details
              </summary>
              <pre className="mt-2 p-3 bg-dark-bg rounded text-xs text-text-muted overflow-auto">
                {this.state.error?.toString()}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-gradient-to-r from-accent-pink to-accent-violet text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
