import { restaurants } from "@/lib/mock-data";
import { MenuView } from "./MenuView";

export function generateStaticParams() {
  return restaurants.map((r) => ({ id: r.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MenuView id={id} />;
}
