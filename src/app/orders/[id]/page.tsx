import { TrackingView } from "./TrackingView";

// Static export needs known ids; order ids start at 1040 (also in the DB, see migration).
export function generateStaticParams() {
  return Array.from({ length: 960 }, (_, i) => ({ id: String(1040 + i) }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrackingView id={id} />;
}
