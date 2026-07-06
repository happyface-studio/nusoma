import React from "react";
import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { PromptPill } from "@/components/canvas/prompt-editor/ui/PromptPill";

// Color Badge Node View
const ColorRefNodeView = ({ node, deleteNode, selected }: any) => {
  const { color } = node.attrs;

  return (
    <PromptPill
      label={color}
      color={color}
      onDelete={deleteNode}
      selected={selected}
      className="text-foreground"
    />
  );
};

// Color Reference Node
export const ColorRefNode = Node.create({
  name: "colorRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      color: {
        default: "#000000",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-color-ref]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-color-ref": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColorRefNodeView);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}))\s$/,
        handler: ({ state, range, match }) => {
          const attributes = { color: match[1] };
          const { tr } = state;
          const start = range.from;
          const end = range.to;

          tr.replaceWith(start, end, this.type.create(attributes));
          tr.insertText(" "); // Add a space after the node
        },
      }),
    ];
  },
});
