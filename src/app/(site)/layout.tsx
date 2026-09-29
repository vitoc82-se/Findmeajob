import SiteHeader from "@/components/SiteHeader";

// Public pages: pre-rendered and free of the sign-in SDK.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
