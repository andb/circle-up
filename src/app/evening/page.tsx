import { EveningPage } from "@/components/evening-page";

export const instant = false;

export default async function Evening({ searchParams }: PageProps<"/evening">) {
  const q = await searchParams;
  const as = typeof q.as === "string" ? q.as : undefined;
  const key = typeof q.key === "string" ? q.key : undefined;
  return <EveningPage as={as} asKey={key} />;
}
