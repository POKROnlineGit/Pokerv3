"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, LucideIcon } from "lucide-react";

interface QuickLinkCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export function QuickLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: QuickLinkCardProps) {
  return (
    <Link href={href} className="block group">
      <Card className="!bg-[hsl(222.2,84%,4.9%)] border-slate-700 group-hover:border-slate-600 group-hover:!bg-slate-800 group-hover:shadow-lg transition-all">
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-slate-800/50 flex items-center justify-center">
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
        </CardContent>
      </Card>
    </Link>
  );
}
