import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <AlertTriangle
                size={32}
                className="text-destructive flex-shrink-0"
              />
            </div>

            <h2 className="text-xl font-semibold mb-2 text-foreground">Something went wrong</h2>
            <p className="text-muted-foreground mb-8">
              We hit an unexpected issue. Try reloading the page, or head back to the home screen.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = "/"}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg",
                  "bg-muted text-foreground",
                  "hover:bg-muted/80 cursor-pointer transition-colors"
                )}
              >
                <Home size={16} />
                Go Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer transition-colors"
                )}
              >
                <RotateCcw size={16} />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
