'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AudioMessagePlayerProps {
  mediaId: string
  mimeType?: string | null
  messageId: number
  className?: string
}

export function AudioMessagePlayer({ mediaId, mimeType, messageId, className }: AudioMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Fetch audio URL from API
  useEffect(() => {
    async function fetchAudioUrl() {
      if (!mediaId) return
      
      setIsLoading(true)
      setError(null)
      
      try {
        const res = await fetch(`/api/whatsapp/media/${encodeURIComponent(mediaId)}?messageId=${messageId}`)
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to fetch audio: ${res.status}`)
        }
        const blob = await res.blob()
        if (blob.size === 0) {
          throw new Error('Audio file is empty')
        }
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
      } catch (err: any) {
        console.error('Failed to fetch audio:', err)
        setError(err.message || 'Failed to load audio. Media may have expired or be unavailable.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAudioUrl()

    // Cleanup
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [mediaId, messageId])

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => setIsPlaying(false)
    const handleError = () => {
      setError('Failed to play audio')
      setIsPlaying(false)
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [audioUrl])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleDownload = () => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `audio-message-${messageId}.${mimeType?.includes('ogg') ? 'ogg' : 'mp3'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (error) {
    return (
      <div className={cn('p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800', className)}>
        <p className="text-sm text-red-700 dark:text-red-300">⚠️ {error}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg', className)}>
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />
      
      <Button
        variant="ghost"
        size="sm"
        onClick={togglePlay}
        disabled={isLoading || !audioUrl}
        className="h-10 w-10 rounded-full p-0"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {audioUrl && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          className="h-8 w-8 p-0"
          title="Download audio"
        >
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

