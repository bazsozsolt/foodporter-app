import { Card, Header } from "@/components/ui";

export default function Offline() {
  return (
    <>
      <Header />
      <main className="p-4"><Card className="text-center"><div className="text-4xl">📡</div><h2 className="text-lg font-bold">You’re offline</h2><p className="text-sm text-muted">Food Porter needs a connection to show live orders. We’ll be right here when you’re back.</p></Card></main>
    </>
  );
}
