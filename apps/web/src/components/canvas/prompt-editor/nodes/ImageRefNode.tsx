import React from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { PromptPill } from "@/components/canvas/prompt-editor/ui/PromptPill";

// Image reference node component for @ mentions
const ImageRefNodeView = ({ node, deleteNode, selected }: any) => {
  const { label, src } = node.attrs;

  return (
    <PromptPill
      label={label}
      imageSrc={src}
      onDelete={deleteNode}
      selected={selected}
      className="text-cyan-600 dark:text-cyan-400"
    />
  );
};

// Define the ImageRef custom node for @ image references
export const ImageRefNode = Node.create({
  name: "imageRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      imageId: {
        default: "",
      },
      label: {
        default: "",
      },
      src: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-image-ref]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-image-ref": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageRefNodeView);
  },
});
