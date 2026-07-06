import { useCallback } from "react";

interface UseFileUploadOptions {
  onUpload: (files: FileList | null) => void;
  toast: any;
}

export function useFileUpload({ onUpload, toast }: UseFileUploadOptions) {
  const handleUploadClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;

    input.style.position = "fixed";
    input.style.top = "-1000px";
    input.style.left = "-1000px";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.style.width = "1px";
    input.style.height = "1px";

    input.onchange = (e) => {
      try {
        onUpload((e.target as HTMLInputElement).files);
      } catch (error) {
        console.error("File upload error:", error);
        toast({
          title: "Upload failed",
          description: "Failed to process selected files",
          variant: "destructive",
        });
      } finally {
        if (input.parentNode) {
          document.body.removeChild(input);
        }
      }
    };

    input.onerror = () => {
      console.error("File input error");
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    document.body.appendChild(input);

    // Small timeout to ensure DOM insertion
    setTimeout(() => {
      try {
        input.click();
      } catch (error) {
        console.error("Failed to trigger file dialog:", error);
        toast({
          title: "Upload unavailable",
          description:
            "File upload is not available. Try using drag & drop instead.",
          variant: "destructive",
        });
        if (input.parentNode) {
          document.body.removeChild(input);
        }
      }
    }, 10);

    // Cleanup timeout
    setTimeout(() => {
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    }, 30000);
  }, [onUpload, toast]);

  return { handleUploadClick };
}
