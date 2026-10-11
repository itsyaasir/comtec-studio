import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const sidebarRowVariants = cva(
  "focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none flex w-full items-center gap-7 rounded-[6px] text-left transition-colors hover:bg-muted aria-[current=true]:bg-secondary",
  {
    variants: {
      variant: {
        folder: "mb-3 px-5 py-10",
        clip: "relative mb-2 px-7 py-11",
      },
    },
    defaultVariants: {
      variant: "clip",
    },
  },
);

export function SidebarRow({
  variant,
  className,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof sidebarRowVariants>) {
  return (
    <button
      className={cn(sidebarRowVariants({ variant }), className)}
      {...props}
    />
  );
}
