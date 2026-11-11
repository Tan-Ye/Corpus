import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import type { ChatMessage, Citation } from '@/types/chat'

interface MessageListProps {
  messages: ChatMessage[]
  suggestions: string[]
  onPickSuggestion: (text: string) => void
}

export function MessageList({ messages, suggestions, onPickSuggestion }: MessageListProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-6">
        {messages.length === 0 ? (
          <EmptyState suggestions={suggestions} onPickSuggestion={onPickSuggestion} />
        ) : (
          <div className="flex flex-col gap-8">
            {messages.map((message) =>
              message.role === 'user' ? (
                <UserMessage key={message.id} message={message} />
              ) : (
                <AssistantMessage key={message.id} message={message} />
              ),
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

interface EmptyStateProps {
  suggestions: string[]
  onPickSuggestion: (text: string) => void
}

function EmptyState({ suggestions, onPickSuggestion }: EmptyStateProps) {
  return (
    <div className="flex flex-col gap-10 pt-16">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">有什么可以帮你？</h2>
        <p className="text-sm text-muted-foreground">你的资料，一个有据可查的整体。</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {suggestions.map((text) => (
          <Button
            key={text}
            variant="outline"
            className="h-auto justify-start rounded-xl px-3.5 py-3 text-left text-sm font-normal whitespace-normal"
            onClick={() => onPickSuggestion(text)}
          >
            {text}
          </Button>
        ))}
      </div>
    </div>
  )
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-xl rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
        {message.content}
      </p>
    </div>
  )
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const citations = message.citations ?? []

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">CORPUS</p>

      <div className="flex flex-col gap-3 text-base leading-7">
        {message.content.split('\n\n').map((paragraph) => (
          <p key={paragraph}>{renderParagraph(paragraph, citations)}</p>
        ))}
      </div>

      {/* 出处栏在小屏隐藏，这里给一份紧凑版 */}
      {citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 xl:hidden">
          {citations.map((citation, index) => (
            <span
              key={citation.id}
              className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4"
            >
              {index + 1} · {citation.title} {citation.locator}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** 把正文里的 [1] [2] 变成上标编号，对应右侧出处栏的顺序 */
function renderParagraph(paragraph: string, citations: Citation[]) {
  return paragraph.split(/(\[\d+\])/g).map((fragment) => {
    const matched = /^\[(\d+)\]$/.exec(fragment)
    if (!matched) return fragment

    const citation = citations[Number(matched[1]) - 1]
    if (!citation) return fragment

    return (
      <sup key={fragment} className="px-0.5 text-xs font-medium text-brand">
        {matched[1]}
      </sup>
    )
  })
}
