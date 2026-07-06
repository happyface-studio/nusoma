import React from "react";
import { Dialog, DottedDialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PromptAction, PromptActionCategory } from "@/lib/prompt-actions";

interface SlashMenuItem {
  id: string;
  title: string;
  subtitle: string;
  previewImage?: string;
  category: string;
  icon: React.ReactNode;
  action: () => void;
}

interface SlashMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupedItems: Record<string, SlashMenuItem[]>;
  filteredItems: SlashMenuItem[];
  selectedIndex: number;
}

export const SlashMenu = ({
  open,
  onOpenChange,
  groupedItems,
  filteredItems,
  selectedIndex,
}: SlashMenuProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DottedDialogContent
        className="overflow-hidden p-0 w-full max-w-[95vw] sm:max-w-[90vw] lg:max-w-4xl"
        showCloseButton={false}
      >
        <div className="overflow-y-auto max-h-[80vh]">
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category}>
              <div className="px-4 py-3 text-sm font-semibold text-muted-foreground bg-muted/50 backdrop-blur-2xl sticky top-0 z-10">
                {category}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
                {items.map((item) => {
                  const globalIndex = filteredItems.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        item.action();
                      }}
                      className={cn(
                        "text-left p-4 rounded-lg border hover:bg-accent transition-colors flex items-start gap-3",
                        globalIndex === selectedIndex &&
                          "bg-accent border-primary",
                      )}
                    >
                      <div className="mt-1 text-muted-foreground shrink-0">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-1">
                          {item.title}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DottedDialogContent>
    </Dialog>
  );
};
