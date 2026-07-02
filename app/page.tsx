"use client";
import { Landing } from "@/components/landing";
import { useShell } from "@/components/shell";

export default function LandingPage() {
  const { go } = useShell();
  return <Landing go={go} />;
}
