"use client";

//import Logo from "../Logo";
import {
  PlusIcon,
  MoonStarsIcon,
  SunIcon,
  SignOutIcon,
  SignInIcon,
  DiamondsFourIcon,
  GithubLogoIcon,
  FolderIcon,
  FolderPlusIcon,
  GridFourIcon,
  FileDashedIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { useAuth } from "@/providers/auth-provider";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import hotkeys from "hotkeys-js";
import { AppSchema } from "@/instant.schema";
import { InstaQLEntity, id } from "@instantdb/react";
import NumberFlow from "@number-flow/react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import PlansDialog from "../plans-dialog";
import FolderDialog from "./FolderDialog";
import UserProfileDialog from "../user-profile-dialog";
import { Reorder, useDragControls } from "motion/react";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { ThemeToggle } from "../theme-toggle";
import { Logo, LogoIcon } from "@/components/icons";

type Project = InstaQLEntity<AppSchema, "canvasProjects", { folder: {} }>;
type Folder = InstaQLEntity<AppSchema, "folders", { projects: {} }>;

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile, db, sessionId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const currentProjectId = pathname.startsWith("/canvas/")
    ? pathname.split("/")[2]
    : null;
  const currentFolderId = pathname.startsWith("/dashboard/folder/")
    ? pathname.split("/")[3]
    : null;

  // State for folder management
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "rename">(
    "create",
  );
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [isFoldersExpanded, setIsFoldersExpanded] = useState(true);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

  // Query folders and projects
  const {
    data: foldersData,
    isLoading: foldersLoading,
    error: foldersError,
  } = db.useQuery(
    user
      ? {
          folders: {
            $: {
              where: { "user.id": user.id },
              order: { order: "asc" },
            },
            projects: {},
          },
        }
      : (null as any),
  );

  const { data: projectsData } = db.useQuery(
    user || sessionId
      ? {
          canvasProjects: {
            $: {
              where: user ? { "user.id": user.id } : { sessionId: sessionId! },
              order: { lastModified: "desc" },
            },
            folder: {},
          },
        }
      : (null as any),
  );

  // Query user credits from Polar
  const trpc = useTRPC();
  const { data: creditsData } = useQuery(
    trpc.getUserCredits.queryOptions(
      { userId: user?.id || "" },
      { enabled: !!user?.id },
    ),
  );
  const userCredits = creditsData?.credits ?? 0;

  const folders = (foldersData?.folders || []) as Folder[];
  const allProjects = (projectsData?.canvasProjects || []) as Project[];

  // Separate projects into those with folders and those without
  const projectsWithoutFolder = allProjects.filter((p) => !p.folder);

  // Use folders directly for display, only track reorder state separately
  const [isReordering, setIsReordering] = useState(false);
  const [tempOrderedFolders, setTempOrderedFolders] = useState<Folder[]>([]);

  // Use the actual folders from the query, unless we're actively reordering
  const displayFolders = isReordering ? tempOrderedFolders : folders;

  // Folder operations
  const createFolder = async (name: string) => {
    if (!user) return;

    const folderId = id();
    await db.transact([
      db.tx.folders[folderId]
        .update({
          name,
          order: folders.length,
          createdAt: new Date(),
        })
        .link({ user: user.id }),
    ]);
  };

  const renameFolder = async (name: string) => {
    if (!editingFolder) return;

    await db.transact([db.tx.folders[editingFolder.id].update({ name })]);
  };

  const deleteFolder = async (folderId: string) => {
    if (!confirm("Delete this folder? Projects will be moved to the root.")) {
      return;
    }

    // Get projects in this folder and unlink them
    const folder = folders.find((f) => f.id === folderId);
    if (folder?.projects) {
      const unlinkTxs = folder.projects.map((project: any) =>
        db.tx.canvasProjects[project.id].unlink({ folder: folderId }),
      );
      await db.transact(unlinkTxs);
    }

    // Delete the folder
    await db.transact([db.tx.folders[folderId].delete()]);
  };

  const moveProjectToFolder = async (
    projectId: string,
    folderId: string | null,
  ) => {
    const project = allProjects.find((p) => p.id === projectId);
    if (!project) return;

    const txs = [];

    // Unlink from current folder if exists
    if (project.folder) {
      txs.push(
        db.tx.canvasProjects[projectId].unlink({ folder: project.folder.id }),
      );
    }

    // Link to new folder if provided
    if (folderId) {
      txs.push(db.tx.canvasProjects[projectId].link({ folder: folderId }));
    }

    if (txs.length > 0) {
      await db.transact(txs);
    }
  };

  const handleReorderFolders = (newOrder: Folder[]) => {
    setIsReordering(true);
    setTempOrderedFolders(newOrder);
  };

  const handleReorderComplete = async () => {
    if (!isReordering) return;

    // Update order in database
    const txs = tempOrderedFolders.map((folder, index) =>
      db.tx.folders[folder.id].update({ order: index }),
    );
    await db.transact(txs);

    setIsReordering(false);
  };

  // Drag and drop state
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // Drag and drop handlers for projects from dashboard
  const handleDrop = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolder(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (projectId) {
      await moveProjectToFolder(projectId, folderId);
    }
  };

  // Drive the highlight from dragOver: it fires continuously on the element
  // actually under the pointer, so it can't flicker off when moving across
  // child nodes the way dragEnter/dragLeave (which bubble) do.
  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolder(folderId === null ? "drafts" : folderId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear when the pointer leaves the drop target for real, not when it
    // crosses into a child element (relatedTarget still inside currentTarget).
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverFolder(null);
  };

  // Set up keyboard shortcuts
  useEffect(() => {
    // Shortcut 'n' to create a new conversation
    hotkeys("n", (event) => {
      // Prevent triggering shortcut if focus is inside an input or textarea
      if (!(
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLInputElement
      )) {
        event.preventDefault();
        router.push("/");
      }
    });

    return () => {
      hotkeys.unbind("n");
    };
  }, [router]);

  const signOut = () => {
    db.auth.signOut();
  };

  // Get page title based on current route
  const getPageTitle = () => {
    if (pathname.startsWith("/canvas/")) {
      const project = allProjects.find((p) => p.id === currentProjectId);
      return project?.name || "Canvas";
    }
    if (pathname.startsWith("/dashboard/folder/")) {
      const folder = folders.find((f) => f.id === currentFolderId);
      return folder?.name || "Folder";
    }
    if (pathname === "/dashboard/drafts") {
      return "Drafts";
    }
    if (pathname === "/dashboard") {
      return "All Projects";
    }
    return "nusoma";
  };

  const url = db.auth.createAuthorizationURL({
    clientName: "google-web",
    redirectURL: window.location.href,
  });

  return (
    <div
      className={`flex flex-col md:flex-row h-dvh w-full overflow-hidden border-y border-border bg-background`}
    >
      {/* Sidebar */}
      <div className="flex-col p-2 items-start w-full max-w-64 overflow-hidden hidden md:flex border-r border-border">
        <div className="flex flex-row gap-2 justify-between w-full items-center pt-1 px-2">
          <Logo className="h-5 w-auto shrink-0 text-foreground" />
          <ThemeToggle />
        </div>

        {/* Folder List */}
        <div className="w-full flex flex-col h-full relative pt-4 gap-4">
          <div className="flex flex-col w-full overflow-y-auto gap-1 relative">
            {/* All Projects Link */}
            <AllProjectsLink />

            {/* Virtual Drafts Folder */}
            <div
              onDrop={(e) => handleDrop(e, null)}
              onDragOver={(e) => handleDragOver(e, null)}
              onDragLeave={handleDragLeave}
              className={`transition-colors duration-150 rounded-md ring-inset ${
                dragOverFolder === "drafts"
                  ? "bg-blue-500/10 ring-2 ring-blue-500 dark:ring-blue-400"
                  : "ring-0 ring-transparent"
              }`}
            >
              <DraftsFolder
                projects={projectsWithoutFolder}
                currentProjectId={currentProjectId}
              />
            </div>
          </div>
          <Separator />
          <div>
            <div className="flex flex-row items-center justify-between gap-2">
              <button
                onClick={() => setIsFoldersExpanded(!isFoldersExpanded)}
                className="flex items-center gap-1 group hover:bg-muted/50 rounded-md px-1 py-0.5 transition-colors"
              >
                <CaretDownIcon
                  size={12}
                  weight="bold"
                  className={`text-muted-foreground group-hover:text-foreground transition-transform duration-200 ${
                    isFoldersExpanded ? "" : "-rotate-90"
                  }`}
                />
                <p className="text-xs font-mono tracking-tight font-medium">
                  Folders
                </p>
              </button>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFolderDialogMode("create");
                    setEditingFolder(null);
                    setIsFolderDialogOpen(true);
                  }}
                  title="New Folder"
                >
                  <FolderPlusIcon size={12} />
                </Button>
              </div>
            </div>
            {isFoldersExpanded && (
              <div className="flex flex-col w-full overflow-y-auto gap-1 relative pl-2 pr-1">
                {/* User Folders */}
                {displayFolders.length > 0 && (
                  <Reorder.Group
                    axis="y"
                    values={displayFolders}
                    onReorder={handleReorderFolders}
                    className="flex flex-col gap-1"
                  >
                    {displayFolders.map((folder) => (
                      <div
                        key={folder.id}
                        onDrop={(e) => handleDrop(e, folder.id)}
                        onDragOver={(e) => handleDragOver(e, folder.id)}
                        onDragLeave={handleDragLeave}
                        className={`transition-colors duration-150 rounded-md ring-inset ${
                          dragOverFolder === folder.id
                            ? "bg-blue-500/10 ring-2 ring-blue-500 dark:ring-blue-400"
                            : "ring-0 ring-transparent"
                        }`}
                      >
                        <FolderItem
                          folder={folder}
                          isActive={folder.id === currentFolderId}
                          onDragEnd={handleReorderComplete}
                          onRename={() => {
                            setEditingFolder(folder);
                            setFolderDialogMode("rename");
                            setIsFolderDialogOpen(true);
                          }}
                          onDelete={() => deleteFolder(folder.id)}
                        />
                      </div>
                    ))}
                  </Reorder.Group>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Credits section */}
        <div className="flex flex-col gap-2 border border-border bg-muted/50 rounded-md p-2 w-full mt-1 divide-y divide-border">
          <div className="flex flex-row gap-2 items-center justify-between pb-2">
            <div className="flex flex-row gap-1.5 items-center">
              <DiamondsFourIcon
                size={14}
                weight="fill"
                className="text-teal-9"
              />
              <div className="flex items-baseline gap-1">
                <NumberFlow
                  value={userCredits}
                  className="text-sm font-semibold text-sage-12"
                />
                <span className="text-xs text-sage-10">credits</span>
              </div>
            </div>
            {user && <PlansDialog />}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-sage-10 dark:text-sage-10">
              nusoma is a open source project by{" "}
              <Link
                href="https://x.com/simonweniger"
                target="_blank"
                className="font-medium text-sage-11 hover:text-sage-12 transition-colors duration-300"
              >
                Simon Weniger
              </Link>
              .
            </p>
            <div className="flex flex-wrap w-full gap-2">
              <Link
                href="https://github.com/simonweniger/nusoma"
                target="_blank"
                className="flex flex-row items-center gap-1 group bg-sage-2 dark:bg-sage-4 hover:bg-sage-5 hover:border-sage-6 transition-colors duration-300 border border-sage-5 rounded-md p-1 px-2"
              >
                <GithubLogoIcon
                  size={12}
                  weight="bold"
                  className="text-sage-11 dark:text-sage-11 group-hover:text-sage-12 transition-colors duration-300"
                />
                <p className="text-xs text-sage-11 dark:text-sage-11 hover:text-sage-12 transition-colors duration-300">
                  Github
                </p>
              </Link>
              {/* <Link href="https://github.com/simonweniger/nusoma" target="_blank" className="flex flex-row items-center gap-1 group bg-sage-2 dark:bg-sage-4 hover:bg-sage-5 hover:border-sage-6 transition-colors duration-300 border border-sage-5 rounded-md p-1 px-2">
                <Book size={12} weight="bold" className="text-sage-11 dark:text-sage-11 group-hover:text-sage-12 transition-colors duration-300" />
                <p className="text-xs text-sage-11 dark:text-sage-11 hover:text-sage-12 transition-colors duration-300">Docs</p>
              </Link> */}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-row items-center justify-center mt-2 overflow-hidden md:hidden">
        <div className="flex flex-row items-center gap-2">
          {/* <Logo style="small" className="my-2 ml-1" /> */}
          <Logo className="h-4 w-auto shrink-0 text-foreground" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="md:w-full overflow-hidden">
        <nav className="w-full py-2 border-b border-sage-5">
          <div className="max-w-7xl flex justify-between items-center mx-auto gap-2 px-4">
            <div className="flex items-center gap-0">
              <Button
                variant="ghost"
                size="icon"
                className="group"
                onClick={() => router.back()}
                aria-label="Go back"
              >
                <CaretLeftIcon
                  size={14}
                  weight="bold"
                  className="text-muted-foreground  group-hover:text-foreground transition-colors duration-200"
                />
              </Button>
              <Button
                onClick={() => router.forward()}
                variant="ghost"
                size="icon"
                className="group"
                aria-label="Go forward"
              >
                <CaretRightIcon
                  size={14}
                  weight="bold"
                  className="text-muted-foreground group-hover:text-foreground transition-colors duration-200"
                />
              </Button>
              <h1 className="text-sm font-medium ml-2">{getPageTitle()}</h1>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <button
                  onClick={() => setIsProfileDialogOpen(true)}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 rounded-md transition-colors group"
                  aria-label="Open profile settings"
                >
                  <div className="w-7 h-7 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                    {profile?.name?.[0]?.toUpperCase() ||
                      user?.email?.[0]?.toUpperCase() ||
                      "U"}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">
                    {profile?.name ||
                      profile?.username ||
                      user?.email?.split("@")[0]}
                  </span>
                </button>
              ) : (
                <Link
                  href={url}
                  className="p-1 hover:bg-sage-3 dark:hover:bg-sage-4 rounded-md group transition-colors duration-300"
                  aria-label="Sign in"
                >
                  <SignInIcon
                    size={18}
                    weight="bold"
                    className="text-sage-10 group-hover:text-sage-12 dark:text-sage-9 dark:group-hover:text-sage-11 transition-colors duration-300"
                  />
                </Link>
              )}
            </div>
          </div>
        </nav>
        {children}
      </div>

      {/* Folder Dialog */}
      <FolderDialog
        isOpen={isFolderDialogOpen}
        onClose={() => {
          setIsFolderDialogOpen(false);
          setEditingFolder(null);
        }}
        onSubmit={folderDialogMode === "create" ? createFolder : renameFolder}
        initialName={editingFolder?.name || ""}
        mode={folderDialogMode}
      />

      {/* User Profile Dialog */}
      <UserProfileDialog
        isOpen={isProfileDialogOpen}
        onClose={() => setIsProfileDialogOpen(false)}
      />
    </div>
  );
}

// Reusable NavItem component
function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  badge,
  onPointerDown,
}: {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
  isActive: boolean;
  badge?: string | number;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors duration-200 ${isActive ? "bg-muted/50" : "hover:bg-muted/80"}`}
      onPointerDown={onPointerDown}
    >
      <Icon size={14} weight="fill" />
      <span className={`text-sm truncate flex-1 ${isActive && "font-medium"}`}>
        {label}
      </span>
      {badge !== undefined && (
        <span className="text-xs text-sage-10 dark:text-sage-10">
          ({badge})
        </span>
      )}
    </Link>
  );
}

// AllProjectsLink component
function AllProjectsLink() {
  const pathname = usePathname();
  const isActive = pathname === "/dashboard";

  return (
    <NavItem
      href="/dashboard"
      icon={GridFourIcon as any}
      label="All Projects"
      isActive={isActive}
    />
  );
}

// DraftsFolder component (virtual folder for projects without a folder - now a link)
function DraftsFolder({
  projects,
  currentProjectId,
}: {
  projects: Project[];
  currentProjectId: string | null;
}) {
  const pathname = usePathname();
  const isActive = pathname === "/dashboard/drafts";

  return (
    <NavItem
      href="/dashboard/drafts"
      icon={FileDashedIcon as any}
      label="Drafts"
      isActive={isActive}
      badge={projects.length}
    />
  );
}

// FolderItem component with drag and drop
function FolderItem({
  folder,
  isActive,
  onDragEnd,
  onRename,
  onDelete,
}: {
  folder: Folder;
  isActive: boolean;
  onDragEnd?: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const dragControls = useDragControls();
  const folderProjects = folder.projects || [];

  return (
    <Reorder.Item
      value={folder}
      dragListener={false}
      dragControls={dragControls}
      className="relative"
      onDragEnd={onDragEnd}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <NavItem
            href={`/dashboard/folder/${folder.id}`}
            icon={FolderIcon as any}
            label={folder.name}
            isActive={isActive}
            badge={folderProjects.length}
            onPointerDown={(e) => dragControls.start(e)}
          />
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onRename}>Rename Folder</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onDelete} variant="destructive">
            Delete Folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </Reorder.Item>
  );
}
