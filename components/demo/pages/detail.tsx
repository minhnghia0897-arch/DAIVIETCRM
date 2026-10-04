"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { CustomerView } from "@/components/views/customers-detail";
import { OrderView } from "@/components/views/orders-detail";
import { PersonView } from "@/components/views/person";
import { ProductView } from "@/components/views/products-detail";

const VIEWS = {
  customer: { view: CustomerView, anyOf: undefined },
  order: { view: OrderView, anyOf: undefined },
  product: { view: ProductView, anyOf: ["product.view"] },
  person: { view: PersonView, anyOf: ["kpi.own", "kpi.team"] },
} as const;

export function DemoDetail({ kind, id }: { kind: keyof typeof VIEWS; id: string }) {
  const { view: View, anyOf } = VIEWS[kind];
  return <DemoPage anyOf={anyOf ? [...anyOf] : undefined}>{(user) => <View user={user} id={id} />}</DemoPage>;
}
