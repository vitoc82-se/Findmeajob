import type { Metadata } from "next";
import NotFoundView from "@/components/NotFoundView";
import { DICTS } from "@/lib/i18n";

export const metadata: Metadata = {
  title: DICTS.sv.nfTitle,
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
