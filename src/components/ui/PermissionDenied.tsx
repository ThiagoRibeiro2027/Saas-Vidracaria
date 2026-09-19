import { Card } from "./Card";

export function PermissionDenied({ message }: { message: string }) {
  return (
    <Card padding="sm" className="border-danger/30 bg-danger/5">
      <p className="text-sm text-danger">{message}</p>
    </Card>
  );
}
