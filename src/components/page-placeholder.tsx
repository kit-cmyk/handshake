import { Card, CardContent } from "@/components/ui/card";

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
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
