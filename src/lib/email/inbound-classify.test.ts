import { describe, it, expect } from "vitest";
import { classifyInbound } from "./inbound-classify";

describe("classifyInbound", () => {
  it("treats an ordinary reply as a reply", () => {
    expect(
      classifyInbound({
        from: "Jane Doe <jane@acme.com>",
        subject: "Re: quick question",
      }),
    ).toBe("reply");
  });

  it("detects a DSN by its multipart/report content type", () => {
    expect(
      classifyInbound({
        from: "Mail Delivery Subsystem <noreply@acme.com>",
        subject: "Re: quick question",
        content_type: 'multipart/report; report-type=delivery-status; boundary="x"',
      }),
    ).toBe("bounce");
  });

  it("detects a bounce from a mailer-daemon sender", () => {
    expect(
      classifyInbound({ from: "MAILER-DAEMON@googlemail.com", subject: "Re: hello" }),
    ).toBe("bounce");
  });

  it("detects a bounce from postmaster", () => {
    expect(classifyInbound({ from: "postmaster@acme.com" })).toBe("bounce");
  });

  it("detects a bounce by subject when headers are absent", () => {
    for (const subject of [
      "Undeliverable: quick question",
      "Undelivered Mail Returned to Sender",
      "Delivery Status Notification (Failure)",
      "Address not found",
      "failure notice",
    ]) {
      expect(classifyInbound({ from: "x@y.com", subject })).toBe("bounce");
    }
  });

  it("detects a bounce from the X-Failed-Recipients header", () => {
    expect(
      classifyInbound({
        from: "someone@acme.com",
        subject: "Re: hello",
        headers: { "X-Failed-Recipients": "dead@acme.com" },
      }),
    ).toBe("bounce");
  });

  it("detects an out-of-office by its Auto-Submitted header", () => {
    expect(
      classifyInbound({
        from: "jane@acme.com",
        subject: "Re: quick question",
        auto_submitted: "auto-replied",
      }),
    ).toBe("auto_reply");
  });

  it("honors Auto-Submitted: no as a genuine reply", () => {
    expect(
      classifyInbound({
        from: "jane@acme.com",
        subject: "Re: quick question",
        auto_submitted: "no",
      }),
    ).toBe("reply");
  });

  it("detects an out-of-office by subject", () => {
    for (const subject of [
      "Out of Office",
      "Out of the office until Monday",
      "Automatic reply: quick question",
      "Auto-Reply: quick question",
      "Auto: quick question",
      "Away from my desk",
    ]) {
      expect(classifyInbound({ from: "jane@acme.com", subject })).toBe("auto_reply");
    }
  });

  it("reads headers case-insensitively", () => {
    expect(
      classifyInbound({
        from: "jane@acme.com",
        headers: { "AUTO-SUBMITTED": "auto-generated" },
      }),
    ).toBe("auto_reply");
  });

  it("prefers bounce over auto-reply when a DSN carries both signals", () => {
    expect(
      classifyInbound({
        from: "mailer-daemon@acme.com",
        subject: "Undeliverable: quick question",
        auto_submitted: "auto-replied",
      }),
    ).toBe("bounce");
  });

  it("falls back to reply on an empty payload", () => {
    expect(classifyInbound({})).toBe("reply");
  });

  it("does not mistake a human subject that merely mentions the words", () => {
    expect(
      classifyInbound({
        from: "jane@acme.com",
        subject: "Re: are you out of office next week?",
      }),
    ).toBe("reply");
  });
});
