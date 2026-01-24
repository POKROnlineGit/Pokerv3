import { ReactNode } from "react";

interface DashboardSectionProps {
  title: string;
  children: ReactNode;
}

export function DashboardSection({ title, children }: DashboardSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </section>
  );
}
