import type { Metadata } from "next";

import { CompareApp } from "@/components/compare/CompareApp";
import "../dashboard/dashboard.css";

export const metadata: Metadata = {
  title: "Compare models",
  description:
    "Run 2–4 models head-to-head on the same prompt and read a per-dimension verdict that says when a difference is real and when it is just variance.",
};

export default function ComparePage() {
  return <CompareApp />;
}
