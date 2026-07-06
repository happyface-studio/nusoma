"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronRight, Trash2 } from "lucide-react";

interface FolderSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  initialName: string;
}

export default function FolderSettingsDialog({
  isOpen,
  onClose,
  onRename,
  onDelete,
  initialName,
}: FolderSettingsDialogProps) {
  const [name, setName] = useState(initialName);
  const [showNameEdit, setShowNameEdit] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setShowNameEdit(false);
    }
  }, [isOpen, initialName]);

  const handleRename = () => {
    if (name.trim() && name !== initialName) {
      onRename(name.trim());
    }
    setShowNameEdit(false);
  };

  const handleDelete = () => {
    onClose();
    onDelete();
  };

  if (showNameEdit) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-base font-semibold">Name</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full"
              style={{ fontSize: "16px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                }
              }}
            />
          </div>

          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNameEdit(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-base font-semibold">
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="divide-y">
          {/* Name Section */}
          <button
            onClick={() => setShowNameEdit(true)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
          >
            <div>
              <div className="text-sm font-medium mb-1">Name</div>
              <div className="text-sm text-muted-foreground">{name}</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Move to Trash Section */}
          <button
            onClick={handleDelete}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
          >
            <div className="text-sm font-medium">Move to trash</div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
