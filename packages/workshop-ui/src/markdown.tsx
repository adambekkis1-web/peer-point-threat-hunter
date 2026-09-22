import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      components={{
        a: ({ children: linkText, href }) => (
          <a href={href} rel="noreferrer" target="_blank">
            {linkText}
          </a>
        ),
      }}
      remarkPlugins={[remarkGfm]}
    >
      {children}
    </Markdown>
  );
}
