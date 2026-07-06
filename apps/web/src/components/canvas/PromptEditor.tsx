import React, {
  useEffect,
  useState,
  useCallback,
  memo,
  useDeferredValue,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { EditorContent } from "@tiptap/react";
import "@/app/styles/prompt-editor.css";
import {
  PlayIcon,
  Wand2,
  Upload,
  RectangleHorizontal,
  RectangleVertical,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  styleActions,
  templateActions,
  getCategoryIcon,
  type PromptActionCategory,
} from "@/lib/prompt-actions";
import {
  type GenerationType,
  generationTypeConfigs,
  getSelectableGenerationTypes,
  getGenerationTypeColor,
} from "@/lib/generation-types";
import { getModelSizeOptions } from "@/lib/models-config";
import { checkOS } from "@/utils/os-utils";
import { ShortcutBadge } from "@/components/canvas/ShortcutBadge";
import type {
  GenerationSettings,
  PlacedImage,
  PlacedVideo,
  GenerationState,
} from "@/types/canvas";
import {
  TooltipTrigger,
  TooltipContent,
  Tooltip,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/components/canvas/prompt-editor/hooks/useFileUpload";

// Imported extracted components
import {
  TactileButtonGroup,
  TactileMomentaryButton,
  type GenerationTypeOption,
} from "@/components/canvas/prompt-editor/ui/TactileButton";
import { MatrixToolbar } from "@/components/canvas/prompt-editor/ui/MatrixToolbar";
import { SlashMenu } from "@/components/canvas/prompt-editor/ui/SlashMenu";
import { AssetRefMenu } from "@/components/canvas/prompt-editor/ui/AssetRefMenu";
import { AssetPreview } from "@/components/canvas/prompt-editor/ui/AssetPreview";

// Imported hooks
import { useMenuInteractions } from "@/components/canvas/prompt-editor/hooks/useMenuInteractions";
import { usePromptEditor } from "@/components/canvas/prompt-editor/hooks/usePromptEditor";

interface PromptEditorProps {
  generationSettings: GenerationSettings;
  setGenerationSettings: (settings: GenerationSettings) => void;
  selectedIds: string[];
  images: PlacedImage[];
  videos?: PlacedVideo[];
  isGenerating: boolean;
  generationState?: GenerationState;
  handleRun: () => void;
  handleFileUpload: (files: FileList | null) => void;
  toast: any;
  onAssetReferencesChange?: (assetIds: string[]) => void;
}

export interface PromptEditorHandle {
  insertAssetReference: (asset: PlacedImage | PlacedVideo) => void;
  removeAssetReference: (assetId: string) => void;
  getReferencedAssetIds: () => string[];
}

const renderCategoryIcon = (category: PromptActionCategory) => {
  const IconComponent = getCategoryIcon(category);
  return <IconComponent className="h-4 w-4" />;
};

// Build generation type options from global config
const selectableGenerationTypes = getSelectableGenerationTypes();

// Build options from the global config
const generationTypeOptions: GenerationTypeOption[] = Object.values(
  generationTypeConfigs,
).map((config) => {
  const IconComponent = config.icon;
  const isEnabled = selectableGenerationTypes.some((t) => t.id === config.id);
  return {
    id: config.id,
    label: config.label,
    icon: <IconComponent />,
    color: getGenerationTypeColor(config.id),
    disabled: !isEnabled,
  };
});

export const PromptEditor = memo(
  forwardRef<PromptEditorHandle, PromptEditorProps>(function PromptEditor(
    {
      generationSettings,
      setGenerationSettings,
      selectedIds,
      images,
      videos = [],
      isGenerating,
      generationState = "running",
      handleRun,
      handleFileUpload,
      toast,
      onAssetReferencesChange,
    },
    ref,
  ) {
    // Menu State Management (Hoisted from useMenuInteractions)
    const [showMenu, setShowMenu] = useState(false);
    const [showImageMenu, setShowImageMenu] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [imageMenuSelectedIndex, setImageMenuSelectedIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [imageSearchQuery, setImageSearchQuery] = useState("");

    // Position refs are shared between hooks
    const slashPositionRef = useRef<number | null>(null);
    const atPositionRef = useRef<number | null>(null);

    const [generationType, setGenerationType] =
      useState<GenerationType>("image");

    // Defer the generation state for non-critical updates
    const deferredGenerationState = useDeferredValue(generationState);

    // Memoize whether we're in image mode
    const isImageMode = selectedIds.length > 0;

    // Derived state for expanded UI
    const isExpanded = isGenerating || generationSettings.prompt.length > 0;

    // Ensure we have a valid image size on mount
    useEffect(() => {
      if (!generationSettings.imageSize) {
        const defaultOptions = getModelSizeOptions(generationSettings.modelId);
        if (defaultOptions.length > 0) {
          setGenerationSettings({
            ...generationSettings,
            imageSize: defaultOptions[0].id as any,
          });
        }
      }
    }, [generationSettings.modelId]); // Depend on modelId to refresh defaults if needed

    // Derived state for asset size options
    const assetSizeOptions = getModelSizeOptions(generationSettings.modelId);

    // Find current size option or default to first one
    const currentSizeId = generationSettings.imageSize;
    const currentSizeIndex = Math.max(
      0,
      assetSizeOptions.findIndex((opt) => opt.id === currentSizeId),
    );
    const currentSizeOption =
      assetSizeOptions[currentSizeIndex] || assetSizeOptions[0];

    // Cycle through available asset sizes
    const handleCycleAssetSize = useCallback(() => {
      if (assetSizeOptions.length <= 1) return;

      const newIndex = (currentSizeIndex + 1) % assetSizeOptions.length;
      const newOption = assetSizeOptions[newIndex];

      setGenerationSettings({
        ...generationSettings,
        imageSize: newOption.id as any,
      });
    }, [
      currentSizeIndex,
      assetSizeOptions,
      generationSettings,
      setGenerationSettings,
    ]);

    // Handle upload button click
    const { handleUploadClick } = useFileUpload({
      onUpload: handleFileUpload,
      toast,
    });

    // Initialize Prompt Editor Logic
    const {
      editor,
      insertStyleChip,
      insertTemplateChip,
      insertAssetRefChip,
      getNextAssetLabel,
      getReferencedAssetIds,
    } = usePromptEditor({
      generationSettings,
      setGenerationSettings,
      onAssetReferencesChange,
      images,
      toast,
      setShowMenu,
      setShowImageMenu,
      setSearchQuery,
      setImageSearchQuery,
      setSelectedIndex,
      setImageMenuSelectedIndex,
      slashPositionRef,
      atPositionRef,
    });

    // Construct Menu Items (Derived)
    const menuItems = useMemo(
      () => [
        ...styleActions.map((action) => ({
          id: `style-${action.id}`,
          title: action.name,
          subtitle: action.description,
          previewImage: action.previewImage,
          category: "🎨 Styles",
          icon: <Wand2 className="h-4 w-4" />,
          action: () => {
            insertStyleChip(action);
            // Assuming insertStyleChip handles menu closing logic or we rely on logic inside it
          },
        })),
        ...templateActions.map((action) => ({
          id: `template-${action.id}`,
          title: action.name,
          subtitle: action.description,
          category: `✨ Templates: ${action.category.charAt(0).toUpperCase() + action.category.slice(1)}`,
          icon: renderCategoryIcon(action.category),
          action: () => {
            insertTemplateChip(action);
          },
        })),
      ],
      [insertStyleChip, insertTemplateChip],
    );

    const filteredItems = menuItems.filter((item) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        item.subtitle.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    });

    // Group items by category for the menu
    const groupedItems = useMemo(() => {
      return filteredItems.reduce(
        (acc, item) => {
          if (!acc[item.category]) acc[item.category] = [];
          acc[item.category].push(item);
          return acc;
        },
        {} as Record<string, typeof menuItems>,
      );
    }, [filteredItems]);

    // Get assets available for @ referencing (exclude already referenced ones)
    const referencedAssetIds = getReferencedAssetIds();

    // Combine images and videos for selection
    const availableAssets = [
      ...images.map((img) => ({ ...img, type: "image" as const })),
      ...(videos || []).map((vid) => ({ ...vid, type: "video" as const })),
    ].filter((asset) => !referencedAssetIds.includes(asset.id));

    const filteredAssets = availableAssets.filter((asset) => {
      if (!imageSearchQuery) return true;
      // Allow searching by index
      const index = availableAssets.indexOf(asset) + 1;
      const type = asset.type;
      return (
        imageSearchQuery === String(index) ||
        `${type}${index}`.includes(imageSearchQuery.toLowerCase())
      );
    });

    // Handle Menu Interactions (Keyboard navigation)
    useMenuInteractions({
      editor,
      showMenu,
      setShowMenu,
      showImageMenu,
      setShowImageMenu,
      selectedIndex,
      setSelectedIndex,
      imageMenuSelectedIndex,
      setImageMenuSelectedIndex,
      setSearchQuery,
      setImageSearchQuery,
      slashPositionRef, // Shared ref
      atPositionRef, // Shared ref
      filteredItems,
      filteredAssets,
      isGenerating,
      generationSettings,
      handleRun,
      insertStyleChip,
      insertAssetRefChip,
    });

    // Expose imperative methods via ref
    useImperativeHandle(
      ref,
      () => ({
        insertAssetReference: (asset) => {
          // Re-implement or expose internal logic?
          // We have insertAssetRefChip, but `insertAssetReferenceImperative` in original was slightly different (inserted at end).
          // Let's implement it here using editor instance.
          if (!editor) return;
          const isVideo = (asset as any).isVideo;
          const nextLabel = getNextAssetLabel(isVideo ? "video" : "image");
          if (!nextLabel) {
            toast({
              title: "Maximum assets reached",
              description: "You can reference up to 3 assets of each type",
              variant: "destructive",
            });
            return;
          }
          editor
            .chain()
            .focus()
            .insertContent({
              type: "imageRef",
              attrs: {
                imageId: asset.id,
                label: nextLabel,
                src: asset.src,
                isVideo: isVideo,
              },
            })
            .insertContent(" ")
            .run();
        },
        removeAssetReference: (assetId) => {
          if (!editor) return;
          const json = editor.getJSON();
          let nodeToRemove: { pos: number; size: number } | null = null;
          editor.state.doc.descendants((node: any, pos: number) => {
            if (
              node.type.name === "imageRef" &&
              node.attrs.imageId === assetId
            ) {
              nodeToRemove = { pos, size: node.nodeSize };
              return false;
            }
          });
          if (nodeToRemove !== null) {
            const { pos, size } = nodeToRemove;
            editor
              .chain()
              .deleteRange({ from: pos, to: pos + size })
              .run();
          }
        },
        getReferencedAssetIds: getReferencedAssetIds,
      }),
      [editor, getNextAssetLabel, getReferencedAssetIds, toast],
    );

    if (!editor) {
      return null;
    }

    return (
      <>
        <div className="fixed bottom-0 left-0 right-0 md:absolute md:bottom-1 md:left-1/2 md:transform md:-translate-x-1/2 z-20 p-2 md:p-0 md:pb-0 md:max-w-[648px]">
          <div
            className="p-4 transition-all ease-in-out duration-100"
            style={{
              filter: "url(#gooey)",
              backgroundColor: `color-mix(in srgb, ${getGenerationTypeColor(generationType)} 8%, transparent)`,
            }}
          >
            {/* Editor section */}
            <div
              className={cn(
                "bg-background rounded-3xl",
                "shadow-[0_0_0_1px_rgba(50,50,50,0.16),0_4px_8px_-0.5px_rgba(50,50,50,0.08),0_8px_16px_-2px_rgba(50,50,50,0.04)]",
              )}
            >
              <div className="relative px-3 py-2">
                <EditorContent editor={editor} />
                {/* <AssetPreview
                  selectedIds={selectedIds}
                  images={images}
                  videos={videos}
                /> */}
              </div>
            </div>

            <div className="tactile-group shadow-inner rounded-[22px] border border-border p-2 flex items-center gap-2">
              <div
                className="flex items-center gap-2 w-full"
                style={{ isolation: "isolate" }} // Isolate buttons from gooey filter
              >
                {/* Left: Generation type selector */}
                <TactileButtonGroup
                  options={generationTypeOptions}
                  activeId={generationType}
                  onChange={setGenerationType}
                  generationSettings={generationSettings}
                  setGenerationSettings={setGenerationSettings}
                />

                <div
                  className={cn(
                    "relative flex-1 rounded-xl overflow-hidden",
                    "flex items-center justify-center",
                    "bg-background border border-border/80 shadow-inner box-shadow-xs",
                  )}
                >
                  <MatrixToolbar
                    isGenerating={isGenerating}
                    state={deferredGenerationState}
                    generationType={generationType}
                    hasInputAsset={isImageMode}
                    sizeOption={currentSizeOption}
                  />
                </div>

                {/* Right: Action buttons */}
                <div className="flex items-center gap-1.5">
                  {/* Right: Asset Size Selector */}
                  <div
                    className={cn(
                      "flex items-center gap-1 transition-opacity duration-200",
                      isExpanded
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none",
                    )}
                  >
                    {(() => {
                      if (!currentSizeOption) return null;

                      return (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <TactileMomentaryButton
                                onClick={handleCycleAssetSize}
                                icon={
                                  currentSizeOption.ratio === "1:1" ? (
                                    <Square />
                                  ) : currentSizeOption.ratio.startsWith(
                                      "9:",
                                    ) ||
                                    currentSizeOption.ratio.startsWith(
                                      "3:4",
                                    ) ? (
                                    <RectangleVertical />
                                  ) : (
                                    <RectangleHorizontal />
                                  )
                                }
                              />
                            }
                          />
                          <TooltipContent>
                            <span>{currentSizeOption.label}</span>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </div>{" "}
                  {/* Upload button */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="tactileSecondary"
                          size="icon"
                          onClick={handleUploadClick}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <TooltipContent>
                      <span>Upload images</span>
                    </TooltipContent>
                  </Tooltip>
                  {/* Run button */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="tactilePrimary"
                          size="icon"
                          onClick={handleRun}
                          disabled={
                            isGenerating || !generationSettings.prompt.trim()
                          }
                        >
                          {isGenerating ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <PlayIcon
                              className="h-4 w-4"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          )}
                          {/* <span>Run</span> */}
                        </Button>
                      }
                    />
                    <TooltipContent>
                      <div className="flex items-center gap-2">
                        <ShortcutBadge
                          variant="default"
                          size="xs"
                          shortcut={
                            checkOS("Win") || checkOS("Linux")
                              ? "ctrl+enter"
                              : "meta+enter"
                          }
                        />
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Slash Command Dialog */}
        <SlashMenu
          open={showMenu}
          onOpenChange={setShowMenu}
          groupedItems={groupedItems}
          filteredItems={filteredItems}
          selectedIndex={selectedIndex}
        />

        {/* Asset Reference Dialog */}
        <AssetRefMenu
          open={showImageMenu}
          onOpenChange={setShowImageMenu}
          filteredAssets={filteredAssets}
          referencedAssetIds={referencedAssetIds}
          selectedIndex={imageMenuSelectedIndex}
          onSelect={insertAssetRefChip}
        />

        {/* SVG Gooey Filter for liquid melting effect */}
        <svg style={{ width: 0, height: 0, position: "absolute" }}>
          <defs>
            <filter id="gooey" x="-50%" y="-50%" width="250%" height="250%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur">
                <animate
                  attributeName="stdDeviation"
                  values="1.5;2;3.5;2;1.5"
                  dur="3s"
                  timing-function="linear"
                  repeatCount="indefinite"
                />
              </feGaussianBlur>
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 54 -10"
                result="gooey"
              />
              <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
            </filter>
          </defs>
        </svg>
      </>
    );
  }),
);
