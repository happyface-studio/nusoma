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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

interface UserProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type EditView = "main" | "name" | "username" | "bio" | "language";

const languages = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

export default function UserProfileDialog({
  isOpen,
  onClose,
}: UserProfileDialogProps) {
  const { user, profile, db } = useAuth();
  const [currentView, setCurrentView] = useState<EditView>("main");
  const [formData, setFormData] = useState({
    name: profile?.name || "",
    username: profile?.username || "",
    bio: profile?.bio || "",
    language: profile?.language || "en",
  });

  useEffect(() => {
    if (isOpen) {
      setCurrentView("main");
      setFormData({
        name: profile?.name || "",
        username: profile?.username || "",
        bio: profile?.bio || "",
        language: profile?.language || "en",
      });
    }
  }, [isOpen, profile]);

  const handleSave = async (field: string, value: string) => {
    if (!profile?.id) return;

    await db.transact(
      db.tx.userProfiles[profile.id].update({ [field]: value }),
    );
    setCurrentView("main");
  };

  const handleSignOut = () => {
    db.auth.signOut();
    onClose();
  };

  if (currentView === "main") {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-base font-semibold">
              Account Settings
            </DialogTitle>
          </DialogHeader>

          <div className="divide-y max-h-[70vh] overflow-y-auto">
            <div className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
                  {profile?.name?.[0]?.toUpperCase() ||
                    user?.email?.[0]?.toUpperCase() ||
                    "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {profile?.name || "User"}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {user?.email}
                  </div>
                </div>
              </div>
            </div>

            {/* Name */}
            <button
              onClick={() => setCurrentView("name")}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
            >
              <div>
                <div className="text-sm font-medium mb-1">Name</div>
                <div className="text-sm text-muted-foreground">
                  {formData.name || "Not set"}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Username */}
            <button
              onClick={() => setCurrentView("username")}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
            >
              <div>
                <div className="text-sm font-medium mb-1">Username</div>
                <div className="text-sm text-muted-foreground">
                  {formData.username || "Not set"}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Bio */}
            <button
              onClick={() => setCurrentView("bio")}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-1">Bio</div>
                <div className="text-sm text-muted-foreground truncate">
                  {formData.bio || "Not set"}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </button>

            {/* Language */}
            <button
              onClick={() => setCurrentView("language")}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
            >
              <div>
                <div className="text-sm font-medium mb-1">Language</div>
                <div className="text-sm text-muted-foreground">
                  {languages.find((l) => l.value === formData.language)
                    ?.label || "English"}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left text-destructive"
            >
              <div className="text-sm font-medium">Sign Out</div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Name edit view
  if (currentView === "name") {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-base font-semibold">Name</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            <Input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Enter your name"
              autoFocus
              className="w-full"
              style={{ fontSize: "16px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSave("name", formData.name);
                }
              }}
            />
          </div>

          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCurrentView("main")}
            >
              Cancel
            </Button>
            <Button onClick={() => handleSave("name", formData.name)}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Username edit view
  if (currentView === "username") {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-base font-semibold">
              Username
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            <Input
              type="text"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              placeholder="Enter your username"
              autoFocus
              className="w-full"
              style={{ fontSize: "16px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSave("username", formData.username);
                }
              }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Your unique username for your profile
            </p>
          </div>

          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCurrentView("main")}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleSave("username", formData.username)}
              disabled={!formData.username.trim()}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Bio edit view
  if (currentView === "bio") {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-base font-semibold">Bio</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            <Textarea
              value={formData.bio}
              onChange={(e) =>
                setFormData({ ...formData, bio: e.target.value })
              }
              placeholder="Tell us about yourself..."
              autoFocus
              className="w-full min-h-[100px] resize-none"
              style={{ fontSize: "16px" }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              {formData.bio.length}/200 characters
            </p>
          </div>

          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCurrentView("main")}
            >
              Cancel
            </Button>
            <Button onClick={() => handleSave("bio", formData.bio)}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Language edit view
  if (currentView === "language") {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-base font-semibold">
              Language
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4">
            <Select
              value={formData.language}
              onValueChange={(value) =>
                setFormData({ ...formData, language: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>Select a language</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCurrentView("main")}
            >
              Cancel
            </Button>
            <Button onClick={() => handleSave("language", formData.language)}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
