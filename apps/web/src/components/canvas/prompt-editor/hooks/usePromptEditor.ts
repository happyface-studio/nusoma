import {
  useCallback,
  useRef,
  useEffect,
  MutableRefObject,
  Dispatch,
  SetStateAction,
} from "react";
import { useEditor, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ChipNode } from "@/components/canvas/prompt-editor/nodes/ChipNode";
import { ImageRefNode } from "@/components/canvas/prompt-editor/nodes/ImageRefNode";
import { ColorRefNode } from "@/components/canvas/prompt-editor/nodes/ColorRefNode";
import { checkOS } from "@/utils/os-utils";
import { type PromptAction } from "@/lib/prompt-actions";
import type {
  PlacedImage,
  PlacedVideo,
  GenerationSettings,
} from "@/types/canvas";

interface UsePromptEditorProps {
  generationSettings: GenerationSettings;
  setGenerationSettings: (settings: GenerationSettings) => void;
  onAssetReferencesChange?: (assetIds: string[]) => void;
  images: PlacedImage[];
  toast: any;
  // Menu state setters needed for onUpdate
  setShowMenu: Dispatch<SetStateAction<boolean>>;
  setShowImageMenu: Dispatch<SetStateAction<boolean>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setImageSearchQuery: Dispatch<SetStateAction<string>>;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setImageMenuSelectedIndex: Dispatch<SetStateAction<number>>;
  slashPositionRef: MutableRefObject<number | null>;
  atPositionRef: MutableRefObject<number | null>;
}

export function usePromptEditor({
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
}: UsePromptEditorProps) {
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const handleEditorUpdate = useCallback(
    (editor: Editor) => {
      // Extract text, chip values, and image references
      const json = editor.getJSON();
      const parts: string[] = [];
      const imageRefs: string[] = [];

      const extractContent = (node: any) => {
        if (node.type === "chip") {
          parts.push(node.attrs.value);
        } else if (node.type === "imageRef") {
          // Keep @label in prompt for fal.ai, also track the assetId
          parts.push(`@${node.attrs.label}`);
          imageRefs.push(node.attrs.imageId);
        } else if (node.type === "colorRef") {
          // Keep hex code in prompt
          parts.push(node.attrs.color);
        } else if (node.type === "text") {
          // Add text content (trim to avoid extra spaces)
          const text = node.text?.trim();
          if (text) parts.push(text);
        } else if (node.content) {
          node.content.forEach(extractContent);
        }
      };

      json.content?.forEach(extractContent);

      const combinedPrompt = parts.filter(Boolean).join(", ");

      // Debounce the settings update to avoid excessive re-renders
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        setGenerationSettings({
          ...generationSettings,
          prompt: combinedPrompt,
          referencedAssetIds: imageRefs, // Store for generation
        });
        // Notify parent of asset reference changes
        onAssetReferencesChange?.(imageRefs);
      }, 16); // ~1 frame at 60fps

      // Detect slash command at cursor position
      const { from } = editor.state.selection;
      const textBeforeCursor = editor.state.doc.textBetween(0, from, "\n");

      // We need to access the CURRENT state of showMenu etc.
      // Since this is a callback, we trust the refs or we need to pass the values.
      // However, onUpdate doesn't give us the react state.
      // We can use the refs for position to infer state or just update blind?
      // Actually the original code used `showMenu` in dependency array.
      // We will assume `slashPositionRef.current !== null` implies menu is open or trying to open.

      if (slashPositionRef.current !== null) {
        const textAfterSlash = textBeforeCursor.substring(
          slashPositionRef.current + 1,
        );

        // Close menu if user typed space or moved cursor away from slash
        if (textAfterSlash.includes(" ") || from < slashPositionRef.current) {
          setShowMenu(false);
          slashPositionRef.current = null;
          setSearchQuery("");
        } else {
          setSearchQuery(textAfterSlash);
        }
      }

      if (atPositionRef.current !== null) {
        const textAfterAt = textBeforeCursor.substring(
          atPositionRef.current + 1,
        );

        // Close menu if user typed space or moved cursor away from @
        if (textAfterAt.includes(" ") || from < atPositionRef.current) {
          setShowImageMenu(false);
          atPositionRef.current = null;
          setImageSearchQuery("");
        } else {
          setImageSearchQuery(textAfterAt);
        }
      }

      // Look for new slash command IS NOT TRIVIAL here because we need to know if we are ALREADY open.
      // In the original code, `showMenu` was in scope.
      // Here, we don't have `showMenu` easily unless we pass it.
      // But we passed the Setters.
      // We can use the Refs as truth for "is tracking".

      if (slashPositionRef.current === null) {
        const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
        // Check if we should open...
        if (lastSlashIndex !== -1) {
          const textAfterSlash = textBeforeCursor.substring(lastSlashIndex + 1);
          const charBeforeSlash = textBeforeCursor[lastSlashIndex - 1];
          const shouldShow =
            (!charBeforeSlash ||
              charBeforeSlash === " " ||
              charBeforeSlash === "," ||
              charBeforeSlash === "\n") &&
            !textAfterSlash.includes(" ") &&
            from > lastSlashIndex;

          if (shouldShow) {
            slashPositionRef.current = lastSlashIndex;
            setSearchQuery(textAfterSlash);
            setShowMenu(true);
            setSelectedIndex(0);
          }
        }
      }

      if (atPositionRef.current === null) {
        const lastAtIndex = textBeforeCursor.lastIndexOf("@");
        if (lastAtIndex !== -1) {
          const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
          const charBeforeAt = textBeforeCursor[lastAtIndex - 1];

          const shouldShow =
            (!charBeforeAt ||
              charBeforeAt === " " ||
              charBeforeAt === "," ||
              charBeforeAt === "\n") &&
            !textAfterAt.includes(" ") &&
            from > lastAtIndex;

          if (shouldShow && images.length > 0) {
            atPositionRef.current = lastAtIndex;
            setImageSearchQuery(textAfterAt);
            setShowImageMenu(true);
            setImageMenuSelectedIndex(0);
          }
        }
      }
    },
    [
      generationSettings,
      setGenerationSettings,
      onAssetReferencesChange,
      images.length,
      setShowMenu,
      setSearchQuery,
      setSelectedIndex,
      setShowImageMenu,
      setImageSearchQuery,
      setImageMenuSelectedIndex,
      slashPositionRef, // Ref dependency is stable but good to list
      atPositionRef,
    ],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      ChipNode,
      ImageRefNode,
      ColorRefNode,
      Placeholder.configure({
        placeholder: `Type / for commands, @ for images... (${checkOS("Win") || checkOS("Linux") ? "Ctrl" : "⌘"}+Enter to run)`,
      }),
    ],
    editorProps: {
      attributes: {
        class: "outline-none min-h-20 p-2",
        style: "font-size: 16px",
      },
    },
    onUpdate: ({ editor }) => {
      handleEditorUpdate(editor);
    },
  });

  const insertStyleChip = (action: PromptAction) => {
    if (!editor || slashPositionRef.current === null) return;

    // Remove any existing style chips
    editor.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === "chip" && node.attrs.chipType === "style") {
        editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
      }
    });

    const { from } = editor.state.selection;
    editor
      .chain()
      .deleteRange({ from: slashPositionRef.current, to: from })
      .insertContent({
        type: "chip",
        attrs: {
          chipType: "style",
          title: action.name,
          value: action.prompt,
          styleId: action.id,
          loraUrl: action.loraUrl || "",
        },
      })
      .insertContent(" ")
      .focus()
      .run();

    setGenerationSettings({
      ...generationSettings,
      styleId: action.id,
      loraUrl: action.loraUrl || "",
    });

    slashPositionRef.current = null;
    setShowMenu(false);
    setSearchQuery("");
  };

  const insertTemplateChip = (action: PromptAction) => {
    if (!editor || slashPositionRef.current === null) return;

    const { from } = editor.state.selection;
    editor
      .chain()
      .deleteRange({ from: slashPositionRef.current, to: from })
      .insertContent({
        type: "chip",
        attrs: {
          chipType: "template",
          title: action.name,
          value: action.prompt,
          icon: action.category,
        },
      })
      .insertContent(" ")
      .focus()
      .run();

    slashPositionRef.current = null;
    setShowMenu(false);
    setSearchQuery("");
  };

  const getNextAssetLabel = useCallback(
    (type: "image" | "video" = "image") => {
      if (!editor) return `${type}1`;

      const json = editor.getJSON();
      const usedLabels = new Set<string>();

      const findLabels = (node: any) => {
        if (node.type === "imageRef") {
          usedLabels.add(node.attrs.label);
        }
        if (node.content) {
          node.content.forEach(findLabels);
        }
      };

      json.content?.forEach(findLabels);

      for (let i = 1; i <= 3; i++) {
        const label = `${type}${i}`;
        if (!usedLabels.has(label)) {
          return label;
        }
      }
      return null;
    },
    [editor],
  );

  const getReferencedAssetIds = useCallback(() => {
    if (!editor) return [];

    const json = editor.getJSON();
    const assetIds: string[] = [];

    const findAssetRefs = (node: any) => {
      if (node.type === "imageRef") {
        assetIds.push(node.attrs.imageId);
      }
      if (node.content) {
        node.content.forEach(findAssetRefs);
      }
    };

    json.content?.forEach(findAssetRefs);
    return assetIds;
  }, [editor]);

  const insertAssetRefChip = (asset: PlacedImage | PlacedVideo) => {
    if (!editor || atPositionRef.current === null) return;

    const isVideo = (asset as any).isVideo;
    const nextLabel = getNextAssetLabel(isVideo ? "video" : "image");

    if (!nextLabel) {
      toast({
        title: "Maximum assets reached",
        description: "You can reference up to 3 assets of each type",
        variant: "destructive",
      });
      setShowImageMenu(false);
      atPositionRef.current = null;
      setImageSearchQuery("");
      return;
    }

    const { from } = editor.state.selection;
    editor
      .chain()
      .deleteRange({ from: atPositionRef.current, to: from })
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
      .focus()
      .run();

    atPositionRef.current = null;
    setShowImageMenu(false);
    setImageSearchQuery("");
  };

  return {
    editor,
    insertStyleChip,
    insertTemplateChip,
    insertAssetRefChip,
    getNextAssetLabel,
    getReferencedAssetIds,
  };
}
