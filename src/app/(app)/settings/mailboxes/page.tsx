import { requireContext } from "@/lib/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Mailboxes } from "../mailboxes";
import { isEmailDeliveryConfigured } from "@/lib/email/provider";
import type { Mailbox } from "@/lib/types";

export default async function MailboxesSettingsPage() {
  const { supabase, org } = await requireContext();

  const { data: mailboxes } = await supabase
    .from("mailboxes")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mailboxes</CardTitle>
        <CardDescription>
          Sending identities used by your campaigns and workflows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Mailboxes
          mailboxes={(mailboxes ?? []) as Mailbox[]}
          deliveryConfigured={isEmailDeliveryConfigured()}
        />
      </CardContent>
    </Card>
  );
}
