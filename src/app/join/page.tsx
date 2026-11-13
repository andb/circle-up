import { JoinPage } from "@/components/join-page";
import { nameSearchEnabled } from "@/lib/name-search";

export const instant = false;

export default async function Join({ searchParams }: PageProps<"/join">) {
  const q = await searchParams;
  const as = typeof q.as === "string" ? q.as : undefined;
  const key = typeof q.key === "string" ? q.key : undefined;
  return <JoinPage as={as} asKey={key} nameSearch={nameSearchEnabled()} />;
}
