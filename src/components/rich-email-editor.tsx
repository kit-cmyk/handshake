"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MergeTokenMenu } from "@/components/merge-token-menu";
import { cn } from "@/lib/utils";

/** Matches a `{{token}}` shortcode anywhere in the text. */
const TOKEN_RE = /\{\{\s*[\w.]+\s*\}\}/g;

/**
 * Paints every `{{token}}` in the body as a chip, so shortcodes read as
 * placeholders-to-be-filled rather than literal braces the reader will see.
 * A decoration (not a mark) — the document still stores plain text, which is
 * what renderTemplate expects at send time.
 */
const ShortcodeHighlight = Extension.create({
  name: "shortcodeHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const found: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const m of node.text.matchAll(TOKEN_RE)) {
                if (m.index === undefined) continue;
                found.push(
                  Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
                    class: "merge-token",
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, found);
          },
        },
      }),
    ];
  },
});

/** A reusable email snippet the editor can insert. */
export type EmailSnippet = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

async function uploadImage(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to upload images.");
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  // Upload into the uploader's own folder so the storage policy can scope
  // writes/deletes per user (email-assets/<user_id>/...).
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("email-assets")
    .upload(path, file, { contentType: file.type || "image/png" });
  if (error) throw error;
  return supabase.storage.from("email-assets").getPublicUrl(path).data.publicUrl;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        active && "bg-secondary text-secondary-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function RichEmailEditor({
  value,
  onChange,
  placeholder = "Write your email… use {{first_name}}, {{company}} for merge tags.",
  emailTemplates,
  onApplyTemplate,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** When provided (and non-empty), shows an "Insert template" toolbar menu. */
  emailTemplates?: EmailSnippet[];
  /**
   * Called when a template is picked. Use it to apply subject + body together.
   * When omitted, only the body is inserted at the cursor.
   */
  onApplyTemplate?: (snippet: EmailSnippet) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const onChangeRef = React.useRef(onChange);
  // Keep the ref current without writing to it during render.
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Upload dropped/pasted image files, then insert at the current selection.
  const insertFiles = React.useCallback(
    (view: EditorView, files: FileList | File[]): boolean => {
      const images = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (images.length === 0) return false;
      setUploading(true);
      (async () => {
        for (const file of images) {
          try {
            const url = await uploadImage(file);
            const { schema } = view.state;
            const node = schema.nodes.image.create({ src: url });
            view.dispatch(view.state.tr.replaceSelectionWith(node));
          } catch {
            // ignore individual failures; keep going
          }
        }
        setUploading(false);
      })();
      return true;
    },
    []
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      ShortcodeHighlight,
    ],
    content: value,
    editorProps: {
      attributes: { class: "min-h-[220px] focus:outline-none" },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length) return insertFiles(view, files);
        return false;
      },
      handleDrop: (view, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (files && files.length) {
          event.preventDefault();
          return insertFiles(view, files);
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
  });

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      // swallow — surfaced via lack of image
    } finally {
      setUploading(false);
    }
  }

  function applyTemplate(snippet: EmailSnippet) {
    // Apply the body through the editor so it flows out via the normal onChange
    // path (the editor doesn't re-read `value` after mount). The callback lets
    // the parent apply the subject alongside it.
    editor?.chain().focus().setContent(snippet.body).run();
    onApplyTemplate?.(snippet);
  }

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="email-editor rounded-md border">
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
        <Btn e={editor} label="Bold" cmd={(c) => c.toggleBold()} active="bold">
          <Bold className="size-4" />
        </Btn>
        <Btn e={editor} label="Italic" cmd={(c) => c.toggleItalic()} active="italic">
          <Italic className="size-4" />
        </Btn>
        <Btn
          e={editor}
          label="Underline"
          cmd={(c) => c.toggleUnderline()}
          active="underline"
        >
          <UnderlineIcon className="size-4" />
        </Btn>
        <div className="mx-1 h-5 w-px bg-border" />
        <Btn
          e={editor}
          label="Heading"
          cmd={(c) => c.toggleHeading({ level: 2 })}
          active={{ name: "heading", attrs: { level: 2 } }}
        >
          <Heading2 className="size-4" />
        </Btn>
        <Btn
          e={editor}
          label="Bullet list"
          cmd={(c) => c.toggleBulletList()}
          active="bulletList"
        >
          <List className="size-4" />
        </Btn>
        <Btn
          e={editor}
          label="Numbered list"
          cmd={(c) => c.toggleOrderedList()}
          active="orderedList"
        >
          <ListOrdered className="size-4" />
        </Btn>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          label="Add link"
          active={editor?.isActive("link")}
          onClick={setLink}
        >
          <Link2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Insert image" onClick={() => fileRef.current?.click()}>
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageIcon className="size-4" />
          )}
        </ToolbarButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
        <div className="mx-1 h-5 w-px bg-border" />
        <MergeTokenMenu
          variant="toolbar"
          label="Shortcode"
          align="start"
          onInsert={(token) =>
            editor?.chain().focus().insertContent(`{{${token}}}`).run()
          }
        />
        {emailTemplates && emailTemplates.length > 0 && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Insert template"
                  className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Sparkles className="size-4" /> Insert template
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>Email templates</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {emailTemplates.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onSelect={() => applyTemplate(t)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.subject}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      <div className="px-3 py-2 text-sm">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** Toolbar toggle bound to an editor command + active state. */
function Btn({
  e,
  label,
  cmd,
  active,
  children,
}: {
  e: Editor | null;
  label: string;
  cmd: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>;
  active: string | { name: string; attrs: Record<string, unknown> };
  children: React.ReactNode;
}) {
  const isActive =
    typeof active === "string"
      ? e?.isActive(active)
      : e?.isActive(active.name, active.attrs);
  return (
    <ToolbarButton
      label={label}
      active={isActive}
      disabled={!e}
      onClick={() => {
        if (e) cmd(e.chain().focus()).run();
      }}
    >
      {children}
    </ToolbarButton>
  );
}
