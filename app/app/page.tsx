"use client";
import { AppFlow } from "@/components/app-flow";
import { useShell } from "@/components/shell";

export default function AppPage() {
  const { go, pushToast, blueprint, showCoach, dismissCoach } = useShell();
  return (
    <AppFlow
      go={go}
      initialBlueprint={blueprint}
      pushToast={pushToast}
      showCoach={showCoach}
      onCoachDismiss={dismissCoach}
    />
  );
}
