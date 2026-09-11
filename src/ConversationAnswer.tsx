import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";

// Completed answers must not be parsed again when the composer changes.
const ConversationAnswer = memo(function ConversationAnswer({
  text,
  legacy,
  onOpenLink,
}: {
  text: string;
  legacy: boolean;
  onOpenLink: (href: string) => void;
}) {
  if (legacy)
    return (
      <div className="legacy-answer">
        <p className="legacy-answer-note">
          이전 버전의 답변·실행 기록
          {text.length > 4000 && " · 마지막 4,000자 미리보기"}
          <br />
          전체 내용은 아래 실행 로그에서 확인할 수 있어요.
        </p>
        <pre className="legacy-log-preview">{text.slice(-4000)}</pre>
      </div>
    );
  // Very long generated text can make Markdown parsing block keyboard input.
  // Keep the complete answer readable and copyable without an expensive parse.
  if (text.length > 32000)
    return (
      <div className="answer-markdown">
        <p className="legacy-answer-note">
          긴 답변은 원문 텍스트로 표시합니다.
        </p>
        <pre className="plain-answer">{text}</pre>
      </div>
    );
  return (
    <div className="answer-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) onOpenLink(href);
              }}
            >
              {children}
            </a>
          ),
          img: ({ alt, src }) => (
            <button
              className="text-button"
              onClick={() => src && onOpenLink(src)}
            >
              <FileText size={14} />
              {alt || "이미지 열기"}
            </button>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
});

export default ConversationAnswer;
