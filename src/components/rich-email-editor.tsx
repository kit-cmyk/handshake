"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import type { EditorView } from "@tiptap/pm/view";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

async function uploadImage(file: File): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
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
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

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
