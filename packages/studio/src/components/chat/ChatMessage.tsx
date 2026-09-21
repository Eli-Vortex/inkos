import { memo } from "react";
import type { Theme } from "../../hooks/use-theme";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../ai-elements/message";
import { XCircle } from "lucide-react";

export interface ChatMessageProps {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: number;
  readonly theme: Theme;
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
}: ChatMessageProps) {
  const isUser = role === "user";
  const isError = content.startsWith("\u2717");

  return (
    <Message from={role} className={isUser ? "mb-5" : "mb-7"}>
      <MessageContent>
        {isUser ? (
          <div className="text-[14.5px] leading-relaxed select-text font-normal">{content}</div>
        ) : isError ? (
          <div className="flex items-center gap-2.5 text-sm leading-relaxed text-destructive bg-destructive/10 border border-destructive/25 p-3.5 rounded-xl">
            <XCircle size={15} className="shrink-0" />
            <span>{content.replace(/^\u2717\s*/, "")}</span>
          </div>
        ) : (
          <div className="w-full">
            <MessageResponse>{content}</MessageResponse>
          </div>
        )}
      </MessageContent>
    </Message>
  );
});

ChatMessage.displayName = "ChatMessage";
