import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export function PagePlaceholder({
  title,
  description,
  epic,
}: {
  title: string;
  description: string;
  epic: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm font-medium">Coming soon</p>
          <p className="max-w-md text-sm text-muted-foreground">
            This module ships in <span className="font-medium">{epic}</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
