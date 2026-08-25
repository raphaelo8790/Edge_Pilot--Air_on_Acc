import type { Metadata } from "next";

import { DashboardApp } from "@/components/dashboard/DashboardApp";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Benchmark Dashboard · EdgePilot AI",
  description:
    "Describe a workload, run controlled benchmarks against local and cloud providers, and read the readiness score with its evidence and assumptions.",
};

/** /dashboard — work package: product UI & benchmark dashboard. */
export default function DashboardPage() {
  return <DashboardApp />;
}
