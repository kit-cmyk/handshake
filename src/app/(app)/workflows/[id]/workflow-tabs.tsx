"use client";

import * as React from "react";
import { LayoutList, BarChart3 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Client tab shell for the workflow detail page. The server renders the
 * Overview (summary + steps) and Performance (run report) content and passes
 * them in, so data fetching stays on the server while the report is viewable in
 * place. Mirrors the campaign detail tabs.
 */
export function WorkflowTabs({
  overview,
  performance,
}: {
  overview: React.ReactNode;
  performance: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">
          <LayoutList /> Overview
        </TabsTrigger>
        <TabsTrigger value="performance">
          <BarChart3 /> Performance
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-6">
        {overview}
      </TabsContent>
      <TabsContent value="performance">{performance}</TabsContent>
    </Tabs>
  );
}
