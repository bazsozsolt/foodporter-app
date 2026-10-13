import { TrackingView } from "./TrackingView";

// Static export needs known ids; mock orders are numbered from 1040.
export function generateStaticParams() {
  return Array.from({ length: 60 }, (_, i) => ({ id: String(1040 + i) }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrackingView id={id} />;
}
