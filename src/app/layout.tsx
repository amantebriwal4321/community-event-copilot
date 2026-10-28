import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Community Event Copilot", description: "GenAI planner for weddings, birthdays and community events: budgets, timelines, vendor checklists and ideas." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
