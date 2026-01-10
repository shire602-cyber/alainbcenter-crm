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

  // STEP 3: ALWAYS use proxy URL - mediaId should be /api/media/messages/:id
  // OPTIMIZED: Set URL directly without HEAD check - browser will handle validation
  useEffect(() => {
    if (!mediaId) {
      setError('Audio unavailable - no media ID')
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    // STEP 3: mediaId should already be a proxy URL from the API
    // If it's not, construct it (backward compatibility)
    const proxyUrl = mediaId.startsWith('http') || mediaId.startsWith('/')
      ? mediaId
      : `/api/media/messages/${messageId}`
    
    // OPTIMIZED: Set URL directly - audio element will validate on load
    // This eliminates the unnecessary HEAD request
    setAudioUrl(proxyUrl)
    setIsLoading(false)
  }, [mediaId, messageId])

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    }
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)
    const handleError = async (e: any) => {
      // Better error handling - check proxy response and parse JSON error
      const audio = audioRef.current
      if (audio && audioUrl) {
        try {
          // OPTIMIZED: Only check HEAD if we don't have error details from audio element
          // The audio element's error event may already have enough info
          const response = await fetch(audioUrl, { method: 'HEAD' })
          
          // Try to parse JSON error response (consistent with API format: { error, reason })
          let errorMessage = `Audio unavailable - server error (${response.status})`
          try {
            const contentType = response.headers.get('content-type')
            if (contentType?.includes('application/json')) {
              const errorData = await response.json()
              // FIX: Use consistent error format (error + reason)
              errorMessage = errorData.reason || 
                           (errorData.error ? `Audio unavailable: ${errorData.error}` : null) || 
                           errorMessage
            }
          } catch (e) {
            // Not JSON, use status-based message
          }
          
          // Map status codes to user-friendly messages (consistent with API error format)
          if (response.status === 424) {
            errorMessage = 'This media was received before metadata capture was enabled. Ask customer to resend or upload to Documents.'
          } else if (response.status === 410) {
            errorMessage = 'Media URL expired and not cached. Ask customer to resend.'
          } else if (response.status === 422) {
            errorMessage = 'Audio unavailable - not a media message'
          } else if (response.status === 502) {
            errorMessage = 'Audio unavailable - provider error'
          } else if (response.status === 500) {
            errorMessage = 'Audio unavailable - server configuration error'
          } else if (response.status === 404) {
            errorMessage = 'Audio unavailable - media not found'
          }
          
          setError(errorMessage)
          console.log('[AUDIO-DEBUG] Proxy returned', response.status, 'for message', messageId, ':', errorMessage)
        } catch (fetchError: any) {
          // Network error or CORS issue
          setError('Audio unavailable - could not load media')
          console.error('[AUDIO-DEBUG] Fetch error:', fetchError.message)
        }
      } else {
        setError('Audio unavailable - no media URL')
        console.error('[AUDIO-DEBUG] No audio element or URL')
      }
      setIsPlaying(false)
      setIsLoading(false)
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('canplay', updateDuration)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    // PHASE E: Only load audio if URL is valid and not null
    // This prevents "Failed to load because no supported source was found" error
    if (audioUrl && audioUrl !== '') {
      // Set src only if URL is valid
      audio.src = audioUrl
      try {
        audio.load()
      } catch (err: any) {
        console.error('[AUDIO-DEBUG] Failed to load audio:', err)
        setError('Failed to load audio')
        setIsLoading(false)
      }
    } else {
      // No valid URL - don't try to load
      setError('Audio unavailable - no media URL')
      setIsLoading(false)
    }

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('canplay', updateDuration)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [audioUrl])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    try {
      if (isPlaying) {
        // Pause immediately - don't wait
        audio.pause()
        setIsPlaying(false)
      } else {
        // CRITICAL FIX: Handle play() promise properly to avoid "interrupted by pause()" error
        // If play() is called and then pause() is called before play() resolves, we get this error
        // Solution: Don't set isPlaying until play() actually resolves
        const playPromise = audio.play()
        
        // If play() returns a promise, wait for it
        if (playPromise !== undefined) {
          await playPromise
          // Only set playing state after play() successfully resolves
          setIsPlaying(true)
        } else {
          // Fallback for browsers that don't return a promise
          setIsPlaying(true)
        }
      }
    } catch (error: any) {
      // Handle AbortError (play() interrupted by pause()) gracefully
      if (error.name === 'AbortError' || error.message?.includes('interrupted')) {
        // This is expected when user clicks pause quickly after play
        console.log('[AUDIO] Play interrupted by pause (expected)')
        setIsPlaying(false)
        return
      }
      
      console.error('Error toggling audio playback:', error)
      setError('Failed to play audio. Please try again.')
      setIsPlaying(false)
    }
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
      <div className={cn('p-3 bg-red-50 rounded-lg border border-red-200', className)}>
        <p className="text-sm text-red-700">⚠️ {error}</p>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 p-3 bg-slate-50 rounded-lg', className)}>
      {/* PART B FIX: Use proxy URL directly for Range support */}
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" crossOrigin="anonymous" />
      
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
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-600">
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

