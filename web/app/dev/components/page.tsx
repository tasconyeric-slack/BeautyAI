import { notFound } from "next/navigation";
import { ComponentGallery } from "./preview";

export default function ComponentsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ComponentGallery />;
}
