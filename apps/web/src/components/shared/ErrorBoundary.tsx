import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI section crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-5">
        <p className="text-sm font-black text-rose-800">{this.props.title ?? 'This section could not be displayed'}</p>
        <p className="mt-1 break-all text-xs font-bold text-rose-700">{this.state.error.message}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    )
  }
}
