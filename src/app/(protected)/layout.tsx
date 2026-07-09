import { TopNav, Dock, LeftRail } from "@/components/scrb/shell";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      <TopNav />
      <LeftRail />
      <main className="mx-auto max-w-[1400px] px-4 pt-24 pb-28 sm:px-6 md:pl-24 lg:pl-24">
        {children}
      </main>
      <Dock />
    </div>
  );
}
