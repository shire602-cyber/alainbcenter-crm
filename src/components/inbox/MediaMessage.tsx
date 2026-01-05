'use client'

import { useState, useEffect, useRef } from 'react'
import { AudioMessagePlayer } from './AudioMessagePlayer'

interface MediaMessageProps {
  message: {
    id: number
    type: string
    mediaProxyUrl?: string | null
    mediaMimeType?: string | null
    mediaFilename?: string | null
    mediaSize?: number | null // FIX: Include mediaSize for file size display
    body?: string | null
  }
  className?: string
}

/**
 * MediaMessage Component
 * 
 * Handles rendering of all media types (image, audio, document, video)
 * with loading states, error handling, and retry functionality
 */
export function MediaMessage({ message, className = '' }: MediaMessageProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const hasFetchedRef = useRef(false)

  // CRITICAL: Always use proxy URL - construct if not provided
  const mediaUrl = message.mediaProxyUrl || `/api/media/messages/${message.id}`
  // Normalize message type - handle uppercase, lowercase, and mixed case
  // CRITICAL: If type is 'text' but we have a media placeholder in body, try to infer type
  let messageType = (message.type?.toLowerCase() || 'text').trim()
  if (messageType === 'text' && message.body) {
    const bodyLower = message.body.toLowerCase()
    if (bodyLower.includes('[image]')) {
      messageType = 'image'
    } else if (bodyLower.includes('[audio]') || bodyLower.includes('audio received')) {
      messageType = 'audio'
    } else if (bodyLower.includes('[video]')) {
      messageType = 'video'
    } else if (bodyLower.includes('[document')) {
      messageType = 'document'
    }
  }
  
  // Debug logging (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[MediaMessage] Rendering media message', {
        messageId: message.id,
        type: message.type,
        normalizedType: messageType,
        mediaProxyUrl: message.mediaProxyUrl,
        mediaMimeType: message.mediaMimeType,
        mediaFilename: message.mediaFilename,
      })
    }
  }, [message.id, message.type, messageType, message.mediaProxyUrl, message.mediaMimeType, mediaUrl])

  // Reset loading state when retry count changes
  useEffect(() => {
    if (retryCount > 0) {
      setLoading(true)
      setError(null)
    }
  }, [retryCount])

  const handleLoad = () => {
    setLoading(false)
    setError(null)
    setImageLoaded(true)
  }

  const handleError = async (e?: any) => {
    setLoading(false)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaMessage.tsx:60',message:'UI_MEDIA_ERROR',data:{messageId:message.id,mediaUrl,errorType:e?.type||'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    // Try to get more specific error from the API
    try {
      const response = await fetch(mediaUrl, { method: 'HEAD' })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaMessage.tsx:66',message:'UI_ERROR_CHECK_RESPONSE',data:{messageId:message.id,mediaUrl,status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const errorData = await response.json()
          setError(errorData.reason || errorData.error || 'Failed to load media. Click to retry.')
          return
        }
        
        // Map status codes to user-friendly messages (matching proxy error codes)
        if (response.status === 404) {
          setError('Media not found.')
        } else if (response.status === 422) {
          setError('Not a media message.')
        } else if (response.status === 424) {
          setError('Media metadata missing. This message was received before metadata capture was enabled.')
        } else if (response.status === 410) {
          setError('Media expired. Please ask the customer to resend.')
        } else if (response.status === 429) {
          setError('Rate limited by provider. Please try again later.')
        } else if (response.status === 502) {
          setError('Failed to fetch media from provider. Please try again later.')
        } else {
          setError(`Failed to load media (${response.status}). Click to retry.`)
        }
        return
      }
    } catch (fetchError) {
      // Network error
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaMessage.tsx:87',message:'UI_ERROR_NETWORK',data:{messageId:message.id,mediaUrl,error:(fetchError as any)?.message||'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
    }
    
    setError('Failed to load media. Click to retry.')
  }

  const handleRetry = () => {
    setError(null)
    setLoading(true)
    setRetryCount(prev => prev + 1)
  }

  // Audio messages use AudioMessagePlayer component
  // Handle both 'audio' and 'AUDIO' and any case variation
  if (messageType === 'audio' || message.mediaMimeType?.startsWith('audio/')) {
    return (
      <div className={`media-message audio ${className}`}>
        <AudioMessagePlayer
          mediaId={mediaUrl}
          mimeType={message.mediaMimeType || null}
          messageId={message.id}
          className={className}
        />
      </div>
    )
  }

  // Image messages
  // Handle both 'image' and 'IMAGE' and any case variation, or check MIME type
  if (messageType === 'image' || message.mediaMimeType?.startsWith('image/')) {
    return (
      <div className={`media-message image ${className} relative group rounded-xl overflow-hidden`}>
        {loading && !imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
            <div className="text-sm text-gray-500">Loading image...</div>
          </div>
        )}
        {error ? (
          <div className="media-error p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRetry}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Retry
              </button>
              <a
                href={`${mediaUrl}?download=true`}
                download={message.mediaFilename || (messageType === 'image' ? 'image.jpg' : messageType === 'video' ? 'video.mp4' : messageType === 'audio' ? 'audio.ogg' : 'file')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Download
              </a>
            </div>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.01]">
            <img
              src={`${mediaUrl}${retryCount > 0 ? `?retry=${retryCount}` : ''}`}
              alt={message.body || 'Message image'}
              crossOrigin="anonymous"
              onLoad={handleLoad}
              onError={handleError}
              className={`rounded-xl max-w-full h-auto ${loading && !imageLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center rounded-xl">
              <div className="text-white text-sm font-medium">View / Download</div>
            </div>
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0"
              aria-label="View image"
            />
          </div>
        )}
      </div>
    )
  }

  // Video messages
  // Handle both 'video' and 'VIDEO' and any case variation, or check MIME type
  if (messageType === 'video' || message.mediaMimeType?.startsWith('video/')) {
    return (
      <div className={`media-message video ${className} group relative rounded-xl overflow-hidden`}>
        {error ? (
          <div className="media-error p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRetry}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Retry
              </button>
              <a
                href={`${mediaUrl}?download=true`}
                download={message.mediaFilename || 'video.mp4'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Download
              </a>
            </div>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.01]">
            <video
              src={`${mediaUrl}${retryCount > 0 ? `?retry=${retryCount}` : ''}`}
              controls
              crossOrigin="anonymous"
              onLoadedData={handleLoad}
              onError={handleError}
              className="rounded-xl max-w-full"
            >
              Your browser does not support the video tag.
            </video>
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center rounded-xl pointer-events-none">
              <div className="text-white text-sm font-medium">View / Download</div>
            </div>
          </div>
        )}
        {loading && (
          <div className="text-sm text-gray-500 mt-2">Loading video...</div>
        )}
      </div>
    )
  }

  // Document messages
  // Handle both 'document' and 'DOCUMENT' and any case variation, or check MIME type for PDFs
  if (messageType === 'document' || 
      message.mediaMimeType?.includes('pdf') || 
      message.mediaMimeType?.includes('document') ||
      message.mediaMimeType?.startsWith('application/')) {
    const filename = message.mediaFilename || 'document'
    const isPdf = message.mediaMimeType?.includes('pdf')
    
    return (
      <div className={`media-message document ${className}`}>
        {error ? (
          <div className="media-error p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRetry}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Retry
              </button>
              <a
                href={`${mediaUrl}?download=true`}
                download={filename}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Download
              </a>
            </div>
          </div>
        ) : (
          <a
            href={`${mediaUrl}${retryCount > 0 ? `?retry=${retryCount}` : ''}`}
            download={filename}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            onError={handleError}
          >
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm font-medium text-blue-600">
              {filename}
            </span>
            {isPdf && (
              <span className="text-xs text-blue-500">(PDF)</span>
            )}
          </a>
        )}
        {loading && !error && (
          <div className="text-sm text-gray-500 mt-2">Preparing download...</div>
        )}
      </div>
    )
  }

  // Fallback: Try to infer type from MIME type if type is unknown
  if (message.mediaMimeType) {
    if (message.mediaMimeType.startsWith('image/')) {
      // Render as image
      return (
        <div className={`media-message image ${className} relative`}>
          {loading && !imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
              <div className="text-sm text-gray-500">Loading image...</div>
            </div>
          )}
          {error ? (
            <div className="media-error p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600 mb-2">{error}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleRetry}
                  className="text-sm text-red-600 hover:text-red-800 underline"
                >
                  Retry
                </button>
                <a
                  href={mediaUrl}
                  download={message.mediaFilename || 'image'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Download
                </a>
              </div>
            </div>
          ) : (
            <img
              src={`${mediaUrl}${retryCount > 0 ? `?retry=${retryCount}` : ''}`}
              alt={message.body || 'Message image'}
              crossOrigin="anonymous"
              onLoad={handleLoad}
              onError={handleError}
              className={`rounded-lg max-w-full h-auto ${loading && !imageLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
              loading="lazy"
            />
          )}
        </div>
      )
    } else if (message.mediaMimeType.startsWith('audio/')) {
      // Render as audio
      return (
        <div className={`media-message audio ${className}`}>
          <AudioMessagePlayer
            mediaId={mediaUrl}
            mimeType={message.mediaMimeType || null}
            messageId={message.id}
            className={className}
          />
        </div>
      )
    } else if (message.mediaMimeType.startsWith('video/')) {
      // Render as video
      return (
        <div className={`media-message video ${className}`}>
          {error ? (
            <div className="media-error p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600 mb-2">{error}</p>
              <button
                onClick={handleRetry}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <video
              src={`${mediaUrl}${retryCount > 0 ? `?retry=${retryCount}` : ''}`}
              controls
              crossOrigin="anonymous"
              onLoadedData={handleLoad}
              onError={handleError}
              className="rounded-lg max-w-full"
            >
              Your browser does not support the video tag.
            </video>
          )}
          {loading && (
            <div className="text-sm text-gray-500 mt-2">Loading video...</div>
          )}
        </div>
      )
    } else if (message.mediaMimeType.includes('pdf') || message.mediaMimeType.includes('document')) {
      // Render as document
      const filename = message.mediaFilename || 'document'
      const isPdf = message.mediaMimeType.includes('pdf')
      
      return (
        <div className={`media-message document ${className}`}>
          {error ? (
            <div className="media-error p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600 mb-2">{error}</p>
              <button
                onClick={handleRetry}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <a
              href={`${mediaUrl}?retry=${retryCount}`}
              download={filename}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              onError={handleError}
            >
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm font-medium text-blue-600">
                {filename}
              </span>
              {isPdf && (
                <span className="text-xs text-blue-500">(PDF)</span>
              )}
            </a>
          )}
          {loading && !error && (
            <div className="text-sm text-gray-500 mt-2">Preparing download...</div>
          )}
        </div>
      )
    }
  }

  // Fallback for unknown media types - try to fetch and show error if it fails
  // This handles cases where type is 'text' but it's actually a media message
  useEffect(() => {
    // Only fetch if type is 'text' and we haven't fetched yet
    if (messageType === 'text' && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      // Try to fetch to get the actual error from the proxy
      fetch(mediaUrl, { method: 'HEAD' })
        .then(response => {
          if (!response.ok) {
            if (response.status === 424) {
              setError('Media metadata missing. This message was received before metadata capture was enabled.')
            } else if (response.status === 422) {
              setError('Not a media message.')
            } else {
              setError(`Failed to load media (${response.status}).`)
            }
            setLoading(false)
          } else {
            setLoading(false)
          }
        })
        .catch(() => {
          setError('Failed to load media.')
          setLoading(false)
        })
    }
  }, [messageType, mediaUrl]) // Only run when messageType or mediaUrl changes

  // Fallback for unknown media types - always show download link
  if (error) {
    return (
      <div className={`media-message unknown ${className}`}>
        <div className="media-error p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 mb-2">{error}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleRetry}
              className="text-sm text-red-600 hover:text-red-800 underline"
            >
              Retry
            </button>
          {mediaUrl && (
            <a
              href={`${mediaUrl}?download=true`}
              download={message.mediaFilename || (messageType === 'image' ? 'image.jpg' : messageType === 'video' ? 'video.mp4' : messageType === 'audio' ? 'audio.ogg' : 'file')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Download Media
            </a>
          )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`media-message unknown ${className}`}>
      {loading ? (
        <div className="text-sm text-gray-500">Loading media...</div>
      ) : (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-500 mb-2">Unsupported media type: {messageType}</p>
          {mediaUrl && (
            <a
              href={`${mediaUrl}?download=true`}
              download={message.mediaFilename || (messageType === 'image' ? 'image.jpg' : messageType === 'video' ? 'video.mp4' : messageType === 'audio' ? 'audio.ogg' : 'file')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Media
            </a>
          )}
        </div>
      )}
    </div>
  )
}

