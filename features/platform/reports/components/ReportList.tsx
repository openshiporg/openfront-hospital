import { Board, EmptyBoard, WardSection } from '@/features/platform/components/ward'

export function ReportList({
  title,
  emptyText,
  items,
  renderItem,
}: {
  title: string
  emptyText: string
  items: any[]
  renderItem: (item: any) => React.ReactNode
}) {
  return (
    <WardSection title={title} count={items.length}>
      {items.length === 0 ? (
        <EmptyBoard title={emptyText} className="py-6" />
      ) : (
        <Board>
          {items.map((item) => (
            <div key={item.id} className="min-w-0 px-4 py-3 md:px-5">
              {renderItem(item)}
            </div>
          ))}
        </Board>
      )}
    </WardSection>
  )
}
