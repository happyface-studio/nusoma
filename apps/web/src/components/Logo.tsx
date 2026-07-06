import Image from "next/image";
import Link from "next/link";

export default function Logo({
  style = "default",
  className,
}: {
  style?: "small" | "default";
  className?: string;
}) {
  if (style === "small") {
    return (
      <Link
        href="/"
        className={`flex flex-row items-center justify-center space-x-2 ${className}`}
      >
        <Image src="/logo.svg" alt="Logo" width={24} height={24} />
        <h1 className={`text-sm font-medium text-sage-12`}>nusoma</h1>
      </Link>
    );
  }

  return (
    <Link
      href="/"
      className={`flex flex-row items-center justify-center space-x-2 ${className}`}
    >
      <Image src="/logo.svg" alt="Logo" width={32} height={32} />
      <h1 className={`text-xl font-medium text-sage-12`}>nusoma</h1>
    </Link>
  );
}
