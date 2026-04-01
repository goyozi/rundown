import { useState, useMemo } from 'react'
import { icons } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { searchIcons } from '@/lib/shortcut-icons'

interface IconPickerProps {
  value: string
  onChange: (iconName: string) => void
}

export function IconPicker({ value, onChange }: IconPickerProps): React.JSX.Element {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const searched = searchIcons(query)
    // Always include the currently selected icon so the user can see their selection
    if (value && !searched.includes(value)) {
      return [value, ...searched]
    }
    return searched
  }, [query, value])

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons..."
        className="h-8 text-xs"
      />
      <div className="grid grid-cols-8 gap-1 max-h-[180px] overflow-y-auto">
        {results.map((name) => {
          const IconComponent = icons[name as keyof typeof icons]
          if (!IconComponent) return null
          return (
            <button
              key={name}
              type="button"
              title={name}
              data-testid={`shortcut-icon-option-${name}`}
              className={`size-9 flex items-center justify-center rounded-md transition-colors ${
                value === name
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
              onClick={() => onChange(name)}
            >
              <IconComponent className="size-4" />
            </button>
          )
        })}
        {results.length === 0 && (
          <div className="col-span-8 py-4 text-center text-xs text-muted-foreground">
            No icons found
          </div>
        )}
      </div>
    </div>
  )
}
