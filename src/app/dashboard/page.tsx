import type { Metadata } from "next";

import { DashboardApp } from "@/components/dashboard/DashboardApp";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Benchmark Dashboard",
  description:
    "Describe a workload, run controlled benchmarks against local and cloud providers, and read the readiness score with its evidence and assumptions.",
};

/** /dashboard — module owner: Kareem Ehab (Product UI & Benchmark Dashboard). */
export default function DashboardPage() {
  return <DashboardApp />;
}
