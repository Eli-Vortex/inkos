import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught rendering error:", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleGoHome = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.hash = "#/dashboard";
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] w-full flex-col items-center justify-center p-8 text-center">
          <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-sm">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {this.props.fallbackTitle ?? "页面组件渲染异常 / Rendering Error"}
            </h2>
            <p className="mt-2 text-xs font-mono text-muted-foreground break-all bg-background/80 p-3 rounded-lg border border-border/50 text-left max-h-32 overflow-y-auto">
              {this.state.error?.message || "未知渲染错误"}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={this.handleGoHome} className="gap-1.5">
                <Home size={14} />
                <span>返回首页</span>
              </Button>
              <Button size="sm" onClick={this.handleRetry} className="gap-1.5">
                <RotateCcw size={14} />
                <span>重试刷新</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
