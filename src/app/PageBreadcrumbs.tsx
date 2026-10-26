"use client";

import { BreadcrumbItem, Breadcrumbs } from "@heroui/react";

export interface Crumb {
  label: string;
  href?: string;
}

// Client component on purpose: HeroUI collection items (BreadcrumbItem) must
// be created on the client — see SheetsTable.tsx for why.
export default function PageBreadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <Breadcrumbs>
      {trail.map((c) =>
        c.href ? (
          <BreadcrumbItem key={c.label} href={c.href}>
            {c.label}
          </BreadcrumbItem>
        ) : (
          <BreadcrumbItem key={c.label}>{c.label}</BreadcrumbItem>
        )
      )}
    </Breadcrumbs>
  );
}
