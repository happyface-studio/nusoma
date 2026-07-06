import React from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Wand2 } from "lucide-react";
import {
  getCategoryIcon,
  type PromptActionCategory,
} from "@/lib/prompt-actions";
import { PromptPill } from "@/components/canvas/prompt-editor/ui/PromptPill";

const renderCategoryIcon = (category: PromptActionCategory) => {
  const IconComponent = getCategoryIcon(category);
  return <IconComponent className="h-4 w-4" />;
};

// Custom chip node component
const ChipNodeView = ({ node, deleteNode, selected }: any) => {
  const { chipType, title, icon } = node.attrs;

  const iconElement =
    chipType === "style" ? (
      <Wand2 className="h-4 w-4" />
    ) : (
      renderCategoryIcon(icon as PromptActionCategory)
    );

  return (
    <PromptPill
      label={title}
      icon={iconElement}
      onDelete={deleteNode}
      selected={selected}
      className={
        chipType === "style"
          ? "text-purple-600 dark:text-purple-400"
          : "text-blue-600 dark:text-blue-400"
      }
    />
  );
};

// Define the Chip custom node
export const ChipNode = Node.create({
  name: "chip",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      chipType: {
        default: "template",
      },
      title: {
        default: "",
      },
      value: {
        default: "",
      },
      styleId: {
        default: null,
      },
      loraUrl: {
        default: null,
      },
      icon: {
        default: "camera",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-chip]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-chip": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChipNodeView);
  },
});
