import { PassportShell } from "@/components/passport/shell";

export default async function PassportLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PassportShell id={decodeURIComponent(id)}>{children}</PassportShell>;
}
