import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = { children: ReactNode }
type State = { error: Error | null }

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route render error:", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This page crashed while rendering. Try another route or reload.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-xs text-danger">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="mt-4 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
