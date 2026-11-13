"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RatingPeer = { ref: number; name: string };
export type MyRating = { worth: number; peers: { ref: number; again: 0 | 1 }[] } | null;

const WORTH = [
  { value: 2, label: "Yes" },
  { value: 1, label: "Somewhat" },
  { value: 0, label: "No" },
];

// Self-contained so it can move to its own screen: needs only the round, the other members, the saved rating and who is rating.
export function RatingForm({ round, peers, myRating, identity, onSaved }: { round: number; peers: RatingPeer[]; myRating: MyRating; identity: object; onSaved?: () => void }) {
  const [worth, setWorth] = useState<number | null>(myRating?.worth ?? null);
  const [again, setAgain] = useState<Record<number, 0 | 1>>(() => Object.fromEntries((myRating?.peers ?? []).map((p) => [p.ref, p.again])));
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    const res = await fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...identity, round, worth, peers: Object.entries(again).map(([ref, a]) => ({ ref: Number(ref), again: a })) }),
    });
    setMsg(res.ok ? "Saved. Thank you." : (await res.json()).error);
    onSaved?.();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-base font-bold text-primary">
        <Lock className="size-[18px]" aria-hidden />
        Private: nobody sees how you rated them, except that if you both say you'd talk again, you both see it.
      </div>
      <div className="flex flex-col gap-3.5 rounded-2xl bg-secondary p-4">
        <p className="text-xl leading-snug font-bold">Was this group worth your time?</p>
        <div className="grid grid-cols-3 gap-2">
          {WORTH.map((w) => (
            <Choice key={w.value} label={w.label} selected={worth === w.value} faded={worth !== null && worth !== w.value} onClick={() => setWorth(w.value)} />
          ))}
        </div>
      </div>
      {peers.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xl font-bold">Would you talk to them again?</p>
          {peers.map((m) => (
            <div key={m.ref} className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex items-center gap-2.5">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary font-heading text-xl text-primary" aria-hidden>{m.name.charAt(0)}</span>
                <span className="flex-1 text-xl font-bold">{m.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([1, 0] as const).map((a) => (
                  <Choice key={a} small label={a ? "Yes" : "No"} selected={again[m.ref] === a} faded={again[m.ref] !== undefined && again[m.ref] !== a} onClick={() => setAgain({ ...again, [m.ref]: a })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3 border-t pt-4">
        <Button className="h-14 rounded-2xl text-xl font-bold" disabled={worth === null} onClick={save}>{myRating ? "Update my rating" : "Save my rating"}</Button>
        {msg && <p className="text-base">{msg}</p>}
      </div>
    </div>
  );
}

function Choice({ label, selected, faded, small, onClick }: { label: string; selected: boolean; faded: boolean; small?: boolean; onClick: () => void }) {
  return (
    <Button
      aria-pressed={selected}
      variant={selected ? "default" : "outline"}
      className={cn("rounded-xl border-2 text-lg font-bold", small ? "h-[52px]" : "h-14", faded && "border-transparent bg-transparent text-muted-foreground")}
      onClick={onClick}
    >
      {selected && <Check className="size-[18px]" strokeWidth={3} aria-hidden />}
      {label}
    </Button>
  );
}
