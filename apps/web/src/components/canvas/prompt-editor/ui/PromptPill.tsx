import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeViewWrapper } from "@tiptap/react";

interface PromptPillProps {
  label: string;
  onDelete: () => void;
  icon?: React.ReactNode;
  imageSrc?: string;
  color?: string;
  className?: string;
  selected?: boolean;
}

export const PromptPill: React.FC<PromptPillProps> = ({
  label,
  onDelete,
  icon,
  imageSrc,
  color,
  className,
  selected,
}) => {
  return (
    <NodeViewWrapper as="span" className="group inline-flex align-middle mx-1">
      <span
        className={cn(
          "inline-flex items-center gap-2 px-1 py-0.5 rounded-md text-sm font-semibold transition-all cursor-default select-none",
          "bg-muted/50 hover:bg-muted outline outline-border/80",
          selected && "outline outline-primary/80 ring-2 ring-primary/50",
          className,
        )}
        contentEditable={false}
      >
        {imageSrc && (
          <img
            src={imageSrc}
            alt={label}
            className="h-6 w-6 rounded object-cover shrink-0"
          />
        )}
        {color && (
          <span
            className="h-3 w-3 rounded-full shadow-xs shrink-0 ml-1"
            style={{ backgroundColor: color }}
          />
        )}

        {icon && (
          <span className="shrink-0 opacity-70 inline-flex">{icon}</span>
        )}

        <span className="font-medium text-foreground">{label}</span>

        <button
          onClick={onDelete}
          className="shrink rounded-full p-0.5 transition-color ease-in duration-100"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </NodeViewWrapper>
  );
};
