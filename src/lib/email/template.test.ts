import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  MERGE_TOKENS,
  MERGE_TOKEN_GROUPS,
  SAMPLE_MERGE,
} from "./template";

describe("renderTemplate shortcodes", () => {
  const c = {
    first_name: "Sam",
    last_name: "Lee",
    email: "sam@acme.com",
    phone: "555-0100",
    title: "CTO",
    lifecycle_stage: "qualified",
    company: "Acme",
  };

  it("fills contact + company tokens", () => {
    expect(renderTemplate("Hi {{first_name}} at {{company}}", c)).toBe(
      "Hi Sam at Acme"
    );
    expect(renderTemplate("{{title}} · {{phone}}", c)).toBe("CTO · 555-0100");
    expect(renderTemplate("{{lifecycle_stage}}", c)).toBe("qualified");
  });

  it("derives full_name", () => {
    expect(renderTemplate("{{full_name}}", c)).toBe("Sam Lee");
  });

  it("fills sender + booking tokens", () => {
    const withSender = {
      ...c,
      sender_name: "Jordan Blake",
      sender_email: "jordan@yourco.com",
      booking_link: "https://cal.com/jordan/30min",
    };
    expect(renderTemplate("{{sender_name}}", withSender)).toBe("Jordan Blake");
    expect(renderTemplate('<a href="mailto:{{sender_email}}">x</a>', withSender)).toBe(
      '<a href="mailto:jordan@yourco.com">x</a>'
    );
    expect(renderTemplate('<a href="{{booking_link}}">book</a>', withSender)).toBe(
      '<a href="https://cal.com/jordan/30min">book</a>'
    );
  });

  it("renders sender + booking tokens empty when unset", () => {
    expect(renderTemplate("[{{sender_name}}]", c)).toBe("[]");
    expect(renderTemplate("[{{booking_link}}]", c)).toBe("[]");
  });

  it("renders missing fields and unknown tokens as empty", () => {
    expect(renderTemplate("[{{phone}}]", { first_name: "A" })).toBe("[]");
    expect(renderTemplate("[{{nope}}]", c)).toBe("[]");
  });

  it("tolerates whitespace inside braces", () => {
    expect(renderTemplate("{{  first_name  }}", c)).toBe("Sam");
  });

  it("every advertised token resolves for the sample contact", () => {
    for (const t of MERGE_TOKENS) {
      const out = renderTemplate(`{{${t.token}}}`, SAMPLE_MERGE);
      expect(out.length, `token ${t.token} should render`).toBeGreaterThan(0);
    }
  });

  it("flat token list matches the grouped definition", () => {
    const grouped = MERGE_TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => t.token));
    expect(MERGE_TOKENS.map((t) => t.token)).toEqual(grouped);
  });
});
