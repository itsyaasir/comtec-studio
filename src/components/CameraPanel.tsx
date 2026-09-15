import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /**
   * Renders display:none rather than unmounting. CameraView's Lens owns a
   * WebGL context and the current pan/zoom/roll; unmounting would discard it.
   */
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}

export function CameraPanel({
  title,
  actions,
  footer,
  hidden,
  className,
  children,
}: Props) {
  return (
    <article
      className={cn(
        "flex min-h-0 min-w-0 flex-col bg-zinc-950 text-zinc-100",
        hidden && "hidden",
        className,
      )}
    >
      <header className="flex h-30 shrink-0 items-center justify-between bg-zinc-900 px-10 text-[10px]">
        <span className="flex items-center gap-8">{title}</span>
        {actions && <div className="flex gap-2">{actions}</div>}
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
      {footer && (
        <div className="flex h-26 shrink-0 items-center justify-end px-10 text-[9px] text-zinc-400">
          {footer}
        </div>
      )}
    </article>
  );
}
