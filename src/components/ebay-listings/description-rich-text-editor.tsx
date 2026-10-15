"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type DescriptionRichTextEditorProps = {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

function frameDocument(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:16px;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;background:#fff;}
    body{min-height:320px;outline:none;}
    img{max-width:100%;height:auto;}
    a{color:#c2410c;}
  </style></head><body>${body}</body></html>`;
}

export function DescriptionRichTextEditor({
  id,
  value,
  onChange,
  disabled = false,
}: DescriptionRichTextEditorProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const emitted = useRef<string | null>(null);
  const reloadFrame = useRef(false);
  const [showHtml, setShowHtml] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || showHtml) return;
    if (!reloadFrame.current && emitted.current === value) return;
    reloadFrame.current = false;
    emitted.current = value;
    frame.srcdoc = frameDocument(value);
  }, [showHtml, value]);

  function publish() {
    const html = frameRef.current?.contentDocument?.body.innerHTML ?? "";
    emitted.current = html;
    onChange(html);
  }

  function readyFrame() {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return null;
    doc.body.contentEditable = disabled ? "false" : "true";
    return doc;
  }

  function run(command: string, argument?: string) {
    const doc = readyFrame();
    if (!doc || disabled) return;
    doc.body.focus();
    doc.execCommand(command, false, argument);
    publish();
  }

  return (
    <div id={id} className="overflow-hidden rounded-lg border border-input bg-background">
      <div className="flex flex-wrap gap-1 border-b border-border/70 bg-muted/30 p-1.5">
        <EditorButton label="Bold" disabled={disabled} onClick={() => run("bold")}>
          <Bold />
        </EditorButton>
        <EditorButton label="Italic" disabled={disabled} onClick={() => run("italic")}>
          <Italic />
        </EditorButton>
        <EditorButton label="Underline" disabled={disabled} onClick={() => run("underline")}>
          <Underline />
        </EditorButton>
        <EditorButton label="Bullet list" disabled={disabled} onClick={() => run("insertUnorderedList")}>
          <List />
        </EditorButton>
        <EditorButton label="Numbered list" disabled={disabled} onClick={() => run("insertOrderedList")}>
          <ListOrdered />
        </EditorButton>
        <EditorButton
          label="Link"
          disabled={disabled}
          onClick={() => {
            const href = window.prompt("Link address", "https://");
            if (!href?.trim()) return;
            run("createLink", href.trim());
          }}
        >
          <Link />
        </EditorButton>
        <EditorButton label="Undo" disabled={disabled} onClick={() => run("undo")}>
          <Undo2 />
        </EditorButton>
        <EditorButton label="Redo" disabled={disabled} onClick={() => run("redo")}>
          <Redo2 />
        </EditorButton>
        <span className="mx-1 w-px self-stretch bg-border" />
        <EditorButton label="Align left" disabled={disabled || showHtml} onClick={() => run("justifyLeft")}>
          <AlignLeft />
        </EditorButton>
        <EditorButton label="Align center" disabled={disabled || showHtml} onClick={() => run("justifyCenter")}>
          <AlignCenter />
        </EditorButton>
        <EditorButton label="Align right" disabled={disabled || showHtml} onClick={() => run("justifyRight")}>
          <AlignRight />
        </EditorButton>
        <Button
          type="button"
          variant={showHtml ? "secondary" : "ghost"}
          size="sm"
          className="ml-auto"
          aria-pressed={showHtml}
          disabled={disabled}
          onClick={() => {
            if (!showHtml) {
              const html = frameRef.current?.contentDocument?.body.innerHTML;
              if (html != null) {
                emitted.current = html;
                onChange(html);
              }
              setShowHtml(true);
              return;
            }
            reloadFrame.current = true;
            setShowHtml(false);
          }}
        >
          <Code />
          {showHtml ? "Hide HTML" : "Show HTML"}
        </Button>
      </div>
      <textarea
        aria-label="Description HTML"
        value={value}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => {
          emitted.current = event.target.value;
          onChange(event.target.value);
        }}
        className={
          showHtml
            ? "h-[420px] w-full resize-y bg-transparent px-3 py-2 font-mono text-xs outline-none"
            : "hidden"
        }
      />
      <iframe
        title="Description editor"
        ref={frameRef}
        className={showHtml ? "hidden" : "h-[420px] w-full bg-white"}
        sandbox="allow-same-origin"
        onLoad={() => {
          const doc = readyFrame();
          if (!doc) return;
          doc.body.oninput = () => {
            if (disabled) return;
            publish();
          };
        }}
      />
    </div>
  );
}

function EditorButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
