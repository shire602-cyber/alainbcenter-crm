'use client'

import * as React from 'react'
import { DayPicker, DateRange } from 'react-day-picker'
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { CalendarIcon, X } from 'lucide-react'
import 'react-day-picker/dist/style.css'

export interface DateRangePickerProps {
  value?: { from: Date | undefined; to: Date | undefined }
  onChange?: (range: { from: Date | undefined; to: Date | undefined }) => void
  placeholder?: string
  className?: string
  presets?: boolean
}

const PRESETS = [
  { label: 'Today', getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: 'Last 7 days', getValue: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { label: 'Last 30 days', getValue: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
  { label: 'This week', getValue: () => ({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) }) },
  { label: 'This month', getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'This year', getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
]

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Select date range',
  className,
  presets = true,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [range, setRange] = React.useState<DateRange | undefined>(
    value ? { from: value.from, to: value.to } : undefined
  )

  React.useEffect(() => {
    if (value) {
      setRange({ from: value.from, to: value.to })
    }
  }, [value])

  const handleSelect = (selectedRange: DateRange | undefined) => {
    setRange(selectedRange)
    if (selectedRange?.from && selectedRange?.to) {
      onChange?.({
        from: selectedRange.from,
        to: selectedRange.to,
      })
      setOpen(false)
    }
  }

  const handlePreset = (preset: typeof PRESETS[0]) => {
    const presetRange = preset.getValue()
    setRange({ from: presetRange.from, to: presetRange.to })
    onChange?.(presetRange)
    setOpen(false)
  }

  const handleClear = () => {
    setRange(undefined)
    onChange?.({ from: undefined, to: undefined })
  }

  const displayValue = range?.from
    ? range.to
      ? `${format(range.from, 'MMM d, yyyy')} - ${format(range.to, 'MMM d, yyyy')}`
      : format(range.from, 'MMM d, yyyy')
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-start text-left font-normal', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue}
          {range?.from && (
            <X
              className="ml-auto h-4 w-4 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                handleClear()
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {presets && (
            <div className="border-r p-3 space-y-1">
              <p className="text-caption font-semibold mb-2">Presets</p>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset)}
                  className="block w-full text-left px-2 py-1.5 text-caption hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={2}
            className="p-3"
            classNames={{
              months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
              month: 'space-y-4',
              caption: 'flex justify-center pt-1 relative items-center',
              caption_label: 'text-body font-semibold',
              nav: 'space-x-1 flex items-center',
              nav_button: cn(
                'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-slate-100 rounded-lg'
              ),
              nav_button_previous: 'absolute left-1',
              nav_button_next: 'absolute right-1',
              table: 'w-full border-collapse space-y-1',
              head_row: 'flex',
              head_cell: 'text-slate-500 rounded-md w-9 font-normal text-caption',
              row: 'flex w-full mt-2',
              cell: 'h-9 w-9 text-center text-body p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-100/50 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
              day: cn('h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-100 rounded-lg'),
              day_range_end: 'day-range-end',
              day_selected: 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white focus:bg-slate-900 focus:text-white',
              day_today: 'bg-slate-100 text-slate-900',
              day_outside: 'day-outside text-slate-400 opacity-50 aria-selected:bg-slate-100/50 aria-selected:text-slate-400',
              day_disabled: 'text-slate-400 opacity-50',
              day_range_middle: 'aria-selected:bg-slate-100 aria-selected:text-slate-900',
              day_hidden: 'invisible',
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

