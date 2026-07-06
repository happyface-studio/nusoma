import { Footer } from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="size-full">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
