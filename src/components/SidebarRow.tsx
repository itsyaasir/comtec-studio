import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const sidebarRowVariants = cva(
  "flex w-full items-center rounded-[6px] text-left transition-colors hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
  {
    variants: {
      variant: {
        folder: "h-30 gap-6 pr-8 pl-5",
        clip: "h-28 scroll-mt-32 justify-between gap-8 px-8 aria-[current=true]:bg-(--selection) aria-[current=true]:text-(--selection-text)",
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
