import Link from "next/link";
import { MailCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResendEmail } from "./resend";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="items-center px-0 text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="size-6" />
        </div>
        <CardTitle className="text-2xl">Check your inbox</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-0 text-center">
        <p className="text-sm text-muted-foreground">
          We sent a verification link to
          {email ? (
            <>
              {" "}
              <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            " your email."
          )}{" "}
          Click it to activate your account, then sign in.
        </p>
        <p className="text-xs text-muted-foreground">
          Can&apos;t find it? Check your spam folder, or resend below.
        </p>
        {email && <ResendEmail email={email} />}
      </CardContent>
      <CardFooter className="justify-center px-0">
        <Link href="/login" className="text-sm underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
