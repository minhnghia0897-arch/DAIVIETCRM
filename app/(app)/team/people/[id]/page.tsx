import type { Metadata } from "next";

import { PersonView } from "@/components/views/person";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Hiệu suất · Đại Việt CRM" };

export default async function Page({ params }: PageProps<"/team/people/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  return <PersonView user={user} id={id} />;
}
