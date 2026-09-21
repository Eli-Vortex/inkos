import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useWorkbench } from "../state/store";
import { Dialog, Btn } from "../ui";

/**
 * Confirmation for a navigation that would discard unsaved prose.
 *
 * Rendered by the shell rather than by the workspace, because the transition can
 * be triggered from anywhere — the chapter tree, the book selector, the inner
 * rail, or the host's own sidebar — and all of them must produce the same
 * choice: save and continue, stay, or deliberately discard.
 */
export function TransitionDialog() {
  const pending = useWorkbench((state) => state.pendingTransition);
  const resolveTransition = useWorkbench((state) => state.resolveTransition);
  const [busy, setBusy] = useState(false);

  if (!pending) return null;

  const choose = async (choice: "save" | "discard" | "cancel") => {
    setBusy(true);
    try {
      await resolveTransition(choice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => void choose("cancel")}
      title="有未保存的正文"
      footer={
        <>
          <Btn onClick={() => void choose("cancel")} disabled={busy}>留在当前页</Btn>
          <Btn variant="danger" onClick={() => void choose("discard")} disabled={busy}>
            放弃改动并继续
          </Btn>
          <Btn variant="primary" onClick={() => void choose("save")} disabled={busy}>
            {busy ? "保存中…" : "保存并继续"}
          </Btn>
        </>
      }
    >
      <div className="nc-stack" style={{ gap: 8 }}>
        <div className="nc-row" style={{ padding: 0, gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            即将{pending.description}，但当前章节还有未保存的改动。请选择如何处理。
          </span>
        </div>
        <p className="nc-meta" style={{ margin: 0 }}>
          选择「保存并继续」会在保存成功后切换；保存失败时你会留在当前页，正文不会丢失。
        </p>
      </div>
    </Dialog>
  );
}
