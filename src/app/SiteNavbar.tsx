"use client";

import { Badge, Link, Navbar, NavbarBrand, NavbarContent, NavbarItem } from "@heroui/react";
import { usePathname } from "next/navigation";
import ThemeSwitch from "./ThemeSwitch";

function LogoMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4.5 12.5l5 5 10-11"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function SiteNavbar({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();
  const onReview = pathname === "/review";
  const onDashboard = pathname === "/dashboard";
  const onUpload = pathname === "/upload";

  return (
    <Navbar maxWidth="xl" isBordered>
      <NavbarBrand>
        <Link href="/" color="foreground" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-lg font-extrabold tracking-tight">Practice Sheets</span>
        </Link>
      </NavbarBrand>
      <NavbarContent justify="end">
        <NavbarItem isActive={onDashboard}>
          <Link href="/dashboard" color={onDashboard ? "primary" : "foreground"} className="text-[15px]">
            Dashboard
          </Link>
        </NavbarItem>
        <NavbarItem isActive={onUpload}>
          <Link href="/upload" color={onUpload ? "primary" : "foreground"} className="text-[15px]">
            Upload
          </Link>
        </NavbarItem>
        <NavbarItem isActive={onReview}>
          <Badge
            content={dueCount}
            color="danger"
            size="sm"
            isInvisible={dueCount === 0}
            shape="circle"
          >
            <Link href="/review" color={onReview ? "primary" : "foreground"} className="text-[15px]">
              Review queue
            </Link>
          </Badge>
        </NavbarItem>
        <NavbarItem>
          <ThemeSwitch />
        </NavbarItem>
      </NavbarContent>
    </Navbar>
  );
}
