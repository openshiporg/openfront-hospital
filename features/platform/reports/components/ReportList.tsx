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
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="divide-y">
          {items.map((item) => (
            <div key={item.id} className="px-5 py-4">
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
