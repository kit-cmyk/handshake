import { describe, it, expect } from "vitest";
import { stripHtml, makeSnippet, buildInboundMessage } from "./inbound";

describe("stripHtml", () => {
  it("removes tags, styles, scripts and collapses whitespace", () => {
    const html =
      "<style>.a{color:red}</style><p>Hello&nbsp;<b>there</b></p><script>evil()</script>";
    expect(stripHtml(html)).toBe("Hello there");
  });
});

describe("makeSnippet", () => {
  it("prefers plain text over html", () => {
    expect(makeSnippet({ text: "plain body", html: "<p>html body</p>" })).toBe(
      "plain body"
    );
  });

  it("falls back to stripped html when text is missing", () => {
    expect(makeSnippet({ text: null, html: "<p>from html</p>" })).toBe("from html");
  });

  it("truncates long content with an ellipsis", () => {
    const long = "x".repeat(200);
    const s = makeSnippet({ text: long }, 140);
    expect(s.length).toBe(140);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("buildInboundMessage", () => {
  it("builds an inbound message row from a parsed email + context", () => {
    const row = buildInboundMessage(
      {
        from: "Jane <jane@acme.com>",
        to: "reply+tok@reply.handshake.local",
        subject: "Re: Following up",
        text: "Sounds good, let's talk Tuesday.",
        html: "<p>Sounds good, let's talk Tuesday.</p>",
        messageId: "prov_123",
      },
      { orgId: "o1", contactId: "c1", campaignId: "camp1" }
    );

    expect(row).toMatchObject({
      org_id: "o1",
      contact_id: "c1",
      direction: "inbound",
      channel: "email",
      from_address: "Jane <jane@acme.com>",
      subject: "Re: Following up",
      body_text: "Sounds good, let's talk Tuesday.",
      provider_message_id: "prov_123",
      campaign_id: "camp1",
    });
    expect(row.snippet).toBe("Sounds good, let's talk Tuesday.");
    // conversation_id is assigned by the caller after upserting the conversation.
    expect("conversation_id" in row).toBe(false);
  });

  it("defaults optional fields to null", () => {
    const row = buildInboundMessage(
      { text: "hi" },
      { orgId: "o1", contactId: "c1" }
    );
    expect(row.from_address).toBeNull();
    expect(row.subject).toBeNull();
    expect(row.campaign_id).toBeNull();
    expect(row.body_html).toBeNull();
  });
});
