import MarketingLayout from "@/components/landing/marketing-layout";

export default function UnauthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingLayout>{children}</MarketingLayout>;
}
