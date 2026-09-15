import { Component, type ReactNode } from "react";

/** Keep an unexpected render failure recoverable in a standalone desktop window. */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <main className="startup-error" role="alert">
          <h1>COMTEC Studio couldn't open the workspace</h1>
          <p>
            Your recordings are unchanged. Reload the workspace to try again.
          </p>
          <button onClick={() => location.reload()}>Reload workspace</button>
          <details>
            <summary>Error details</summary>
            <pre id="startup-error">{this.state.error.message}</pre>
          </details>
        </main>
      );
    return this.props.children;
  }
}
