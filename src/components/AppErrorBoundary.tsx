import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

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
        <main className="m-auto max-w-700 px-40 py-80 select-text" role="alert">
          <h1 className="mb-12 text-[20px] font-semibold">
            Comtec Studio couldn't open the workspace
          </h1>
          <p className="mb-16 text-muted-foreground">
            Your recordings are unchanged. Reload the workspace to try again.
          </p>
          <Button onClick={() => location.reload()}>Reload workspace</Button>
          <details className="mt-20 text-[12px]">
            <summary className="rounded-[4px] focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none">
              Error details
            </summary>
            <pre id="startup-error" className="mt-8 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          </details>
        </main>
      );
    return this.props.children;
  }
}
