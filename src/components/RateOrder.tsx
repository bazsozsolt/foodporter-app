"use client";
import { useEffect, useState } from "react";
import { act } from "@/lib/act";
import { actions } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { Button, Card } from "./ui";

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)}
            className={`px-0.5 text-2xl ${n <= value ? "text-[#ffb400]" : "text-[#ddd]"}`}>★</button>
        ))}
      </div>
    </div>
  );
}

export function RateOrder({ orderId, hasRider }: { orderId: string; hasRider: boolean }) {
  const [done, setDone] = useState<null | boolean>(null);
  const [food, setFood] = useState(0);
  const [rider, setRider] = useState(0);
  const [comment, setComment] = useState("");
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void sb.from("ratings").select("order_id").eq("order_id", Number(orderId)).maybeSingle().then(({ data }) => setDone(Boolean(data)));
  }, [orderId]);
  if (done === null) return null;
  if (done) return <Card className="text-center text-sm text-muted">⭐ Thanks for rating this order!</Card>;
  return (
    <Card>
      <b>How was it?</b>
      <div className="mt-2">
        <Stars label="Food" value={food} onChange={setFood} />
        {hasRider && <Stars label="Delivery" value={rider} onChange={setRider} />}
        <textarea className="mt-1 w-full rounded-xl border-[1.5px] border-[#e2ded8] p-2.5 text-sm" rows={2} maxLength={500}
          placeholder="Anything we should know? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <Button disabled={!food} onClick={async () => { if (await act(actions.rate(orderId, food, rider || null, comment), "Thanks for your feedback!")) setDone(true); }}>Send rating</Button>
      </div>
    </Card>
  );
}
