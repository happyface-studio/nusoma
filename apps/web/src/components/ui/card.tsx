import * as React from "react";

import { cn } from "@/lib/utils";

export type CardProps = React.ComponentPropsWithoutRef<"div">;
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }
>(({ className, compact, ...props }, ref) => (
  <div
    ref={ref}
    data-layout={compact ? "compact" : "default"}
    className={cn(
      "flex flex-col rounded-xl border border-stroke-light bg-surface",
      "group",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

export type CardHeaderProps = React.ComponentPropsWithoutRef<"div">;
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col p-6", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export type CardTitleProps = React.ComponentPropsWithoutRef<"h3">;
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-base font-heading text-lg leading-none tracking-tight text-content-base lg:text-xl",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export type CardDescriptionProps = React.ComponentPropsWithoutRef<"p">;
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-content-light", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export type CardContentProps = React.ComponentPropsWithoutRef<"div">;
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex-1 p-6 pt-0",
      "group-data-[layout=compact]:m-0 group-data-[layout=compact]:p-0",
      "group-data-[layout=compact]:rounded-xl group-data-[layout=compact]:border-none",
      className,
    )}
    {...props}
  />
));
CardContent.displayName = "CardContent";

export type CardFooterProps = React.ComponentPropsWithoutRef<"div">;
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
