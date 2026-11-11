import { MessageSquare, MoreHorizontal } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import type { Conversation } from '@/types/chat'
import { cn, groupConversationsByDay } from '@/utils'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
  const groups = groupConversationsByDay(conversations)

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-1 px-2 pb-4">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">还没有对话</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="flex flex-col">
              <p className="px-2 pt-4 pb-1 text-xs text-muted-foreground/80">{group.label}</p>
              {group.items.map((conversation) => {
                const isActive = conversation.id === activeId
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <MessageSquare className="size-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                    <MoreHorizontal className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  )
}
