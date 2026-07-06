import React, { memo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GenerationSettings } from "@/types/canvas";
import {
  type GenerationType,
  getGenerationTypeColor,
} from "@/lib/generation-types";
import { getDefaultVideoModel } from "@/lib/models-config";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export interface GenerationTypeOption {
  id: GenerationType;
  label: string;
  icon: React.ReactNode;
  color: string;
  disabled?: boolean;
}

// Tactile 3D Button Component
export const TactileButton = memo(function TactileButton({
  isActive,
  onClick,
  icon,
  color,
  disabled,
}: {
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  color: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "tactile-btn relative",
        "size-9 rounded-md", // Match button.tsx icon size
        "transition-all duration-150 ease-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        disabled && "opacity-40 cursor-not-allowed",
        isActive ? "tactile-btn--active" : "tactile-btn--inactive",
      )}
      style={
        isActive
          ? ({ "--tactile-glow-color": color } as React.CSSProperties)
          : undefined
      }
    >
      <span className="tactile-btn__icon absolute inset-0 flex items-center justify-center [&_svg]:size-4">
        {icon}
      </span>
    </button>
  );
});

// Tactile Button Group Container
export const TactileButtonGroup = memo(function TactileButtonGroup({
  options,
  activeId,
  onChange,
  generationSettings,
  setGenerationSettings,
}: {
  options: GenerationTypeOption[];
  activeId: GenerationType;
  onChange: (id: GenerationType) => void;
  generationSettings: GenerationSettings;
  setGenerationSettings: (settings: GenerationSettings) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <Tooltip key={option.id}>
          <TooltipTrigger
            render={
              <TactileButton
                isActive={activeId === option.id}
                onClick={() => {
                  if (option.disabled) return;

                  onChange(option.id);

                  // Update generation settings based on type
                  if (option.id === "video") {
                    const defaultModel = getDefaultVideoModel();
                    // @ts-ignore - accessing outer scope prop
                    setGenerationSettings({
                      ...generationSettings,
                      modelId: defaultModel?.id,
                      // Use whatever size is currently set or default logic handled elsewhere
                    });
                  } else if (option.id === "image") {
                    // Clear model ID for image generation (falls back to default flux)
                    // @ts-ignore - accessing outer scope prop
                    const { modelId, ...rest } = generationSettings;
                    setGenerationSettings(rest);
                  }
                }}
                icon={option.icon}
                color={option.color}
                disabled={option.disabled}
              />
            }
          />
          <TooltipContent>
            <span>
              {option.label}
              {option.disabled && " (coming soon)"}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
});

// Tactile Momentary Button - shows active style only while pressed
export const TactileMomentaryButton = memo(function TactileMomentaryButton({
  onClick,
  icon,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onBlur={() => setIsPressed(false)}
      disabled={disabled}
      className={cn(
        "tactile-btn relative",
        "size-9 rounded-md",
        "transition-all duration-150 ease-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        disabled && "opacity-40 cursor-not-allowed",
        isPressed ? "tactile-btn--pressed" : "tactile-btn--inactive",
      )}
    >
      <span className="tactile-btn__icon absolute inset-0 flex items-center justify-center [&_svg]:size-4">
        {icon}
      </span>
    </button>
  );
});
