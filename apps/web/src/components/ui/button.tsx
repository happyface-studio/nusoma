import * as React from "react";
import { mergeProps } from "@base-ui-components/react";
import { useRender } from "@base-ui-components/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 shadow-xs",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs",
        ghost:
          "text-foreground hover:bg-accent dark:hover:bg-accent/50 hover:text-accent-foreground",
        outline:
          "border bg-transparent text-foreground hover:bg-accent dark:hover:bg-accent/50 hover:text-accent-foreground shadow-xs",
        link: "text-foreground hover:underline",
        destructive:
          "bg-destructive hover:bg-destructive/80 dark:bg-destructive/80 text-destructive-foreground dark:hover:bg-destructive/60 dark:focus-visible:ring-destructive/40 focus-visible:ring-destructive/50 shadow-xs",
        tactilePrimary: [
          "text-primary-foreground",
          "border border-primary/30",
          "bg-primary",
          "hover:bg-primary/90",
          "shadow-[0_2px_4px_rgba(0,0,0,0.2),0_4px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.15)]",
          "active:translate-y-px",
          "active:bg-primary/80",
          "active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_2px_rgba(0,0,0,0.2),0_1px_1px_rgba(0,0,0,0.15)]",
          "active:border-primary/50",
        ].join(" "),
        tactileSecondary: [
          "text-white/60 hover:text-white/80",
          "border border-white/[0.08]",
          "[background:linear-gradient(180deg,#3a3a42_0%,#2a2a32_100%)]",
          "hover:[background:linear-gradient(180deg,#424249_0%,#32323a_100%)]",
          "shadow-[0_2px_4px_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]",
          "active:translate-y-px",
          "active:[background:linear-gradient(180deg,#28282e_0%,#1e1e24_100%)]",
          "active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(0,0,0,0.3),0_1px_1px_rgba(0,0,0,0.2)]",
          "active:border-black/20",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 gap-1",
        md: "h-9 px-4",
        lg: "h-10 px-5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3",
        icon: "size-9",
        "icon-lg": "size-10 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    VariantProps<typeof buttonVariants>,
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    useRender.ComponentProps<"button"> {}

function Button({
  className,
  variant,
  size,
  render = <button />,
  ...props
}: ButtonProps) {
  const defaultProps = {
    "data-slot": "button",
    className: cn(buttonVariants({ variant, size, className })),
  } as const;

  const element = useRender({
    render,
    props: mergeProps<"button">(defaultProps, props),
  });

  return element;
}

export { Button, buttonVariants };
