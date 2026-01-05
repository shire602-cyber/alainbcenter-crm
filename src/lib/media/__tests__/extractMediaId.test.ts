/**
 * Unit tests for media ID extraction
 */

import { detectMediaType, extractMediaId, extractMediaInfo, MEDIA_TYPES } from '../extractMediaId'

describe('extractMediaId', () => {
  describe('detectMediaType', () => {
    it('should detect image from image object', () => {
      const message = { image: { id: '123' } }
      expect(detectMediaType(message)).toBe('image')
    })

    it('should detect audio from audio object', () => {
      const message = { audio: { id: '123' } }
      expect(detectMediaType(message)).toBe('audio')
    })

    it('should detect document from document object', () => {
      const message = { document: { id: '123' } }
      expect(detectMediaType(message)).toBe('document')
    })

    it('should detect video from video object', () => {
      const message = { video: { id: '123' } }
      expect(detectMediaType(message)).toBe('video')
    })

    it('should detect sticker from sticker object', () => {
      const message = { sticker: { id: '123' } }
      expect(detectMediaType(message)).toBe('sticker')
    })

    it('should detect location from location object', () => {
      const message = { location: { latitude: 0, longitude: 0 } }
      expect(detectMediaType(message)).toBe('location')
    })

    it('should prefer message.type over media objects', () => {
      const message = { type: 'image', audio: { id: '123' } }
      // Should prefer type='image' even though audio object exists
      expect(detectMediaType(message)).toBe('image')
    })

    it('should fall back to message.type when no media objects', () => {
      const message = { type: 'image' }
      expect(detectMediaType(message)).toBe('image')
    })
    
    it('should fall back to media objects when type is missing', () => {
      const message = { image: { id: '123' } }
      expect(detectMediaType(message)).toBe('image')
    })
    
    it('should fall back to media objects when type is invalid', () => {
      const message = { type: 'invalid_type', image: { id: '123' } }
      expect(detectMediaType(message)).toBe('image')
    })

    it('should return text for interactive/button/reaction', () => {
      const message = { interactive: {} }
      expect(detectMediaType(message)).toBe('text')
    })

    it('should return text as default', () => {
      const message = {}
      expect(detectMediaType(message)).toBe('text')
    })
  })

  describe('extractMediaId', () => {
    it('should extract id from image object', () => {
      const message = { image: { id: '123456789' } }
      expect(extractMediaId(message, 'image')).toBe('123456789')
    })

    it('should extract id from audio object', () => {
      const message = { audio: { id: '987654321' } }
      expect(extractMediaId(message, 'audio')).toBe('987654321')
    })

    it('should extract media_id as fallback', () => {
      const message = { image: { media_id: '111222333' } }
      expect(extractMediaId(message, 'image')).toBe('111222333')
    })

    it('should extract mediaId as fallback', () => {
      const message = { document: { mediaId: '444555666' } }
      expect(extractMediaId(message, 'document')).toBe('444555666')
    })

    it('should return null for non-media types', () => {
      const message = { text: { body: 'hello' } }
      expect(extractMediaId(message, 'text')).toBeNull()
    })

    it('should return null if media object missing', () => {
      const message = {}
      expect(extractMediaId(message, 'image')).toBeNull()
    })

    it('should reject invalid IDs (spaces, undefined, null)', () => {
      const message1 = { image: { id: ' ' } }
      const message2 = { image: { id: 'undefined' } }
      const message3 = { image: { id: 'null' } }
      expect(extractMediaId(message1, 'image')).toBeNull()
      expect(extractMediaId(message2, 'image')).toBeNull()
      expect(extractMediaId(message3, 'image')).toBeNull()
    })
  })

  describe('extractMediaInfo', () => {
    it('should extract full media info from image', () => {
      const message = {
        image: {
          id: '123456789',
          mime_type: 'image/jpeg',
          caption: 'Test image',
        },
      }
      const info = extractMediaInfo(message, 'image')
      expect(info.providerMediaId).toBe('123456789')
      expect(info.mediaMimeType).toBe('image/jpeg')
      expect(info.caption).toBe('Test image')
    })

    it('should extract full media info from document (PDF)', () => {
      const message = {
        document: {
          id: '987654321',
          mime_type: 'application/pdf',
          filename: 'invoice.pdf',
          file_size: 1024,
        },
      }
      const info = extractMediaInfo(message, 'document')
      expect(info.providerMediaId).toBe('987654321')
      expect(info.mediaMimeType).toBe('application/pdf')
      expect(info.filename).toBe('invoice.pdf')
      expect(info.mediaSize).toBe(1024)
    })

    it('should extract full media info from audio', () => {
      const message = {
        audio: {
          id: '555666777',
          mime_type: 'audio/ogg',
          file_size: 2048,
        },
      }
      const info = extractMediaInfo(message, 'audio')
      expect(info.providerMediaId).toBe('555666777')
      expect(info.mediaMimeType).toBe('audio/ogg')
      expect(info.mediaSize).toBe(2048)
    })

    it('should extract full media info from video', () => {
      const message = {
        video: {
          id: '888999000',
          mime_type: 'video/mp4',
          file_size: 5120,
          caption: 'Video caption',
        },
      }
      const info = extractMediaInfo(message, 'video')
      expect(info.providerMediaId).toBe('888999000')
      expect(info.mediaMimeType).toBe('video/mp4')
      expect(info.mediaSize).toBe(5120)
      expect(info.caption).toBe('Video caption')
    })

    it('should extract full media info from sticker', () => {
      const message = {
        sticker: {
          id: '111222333',
          mime_type: 'image/webp',
          animated: true,
        },
      }
      const info = extractMediaInfo(message, 'sticker')
      expect(info.providerMediaId).toBe('111222333')
      expect(info.mediaMimeType).toBe('image/webp')
    })

    // Realistic WhatsApp webhook fixtures
    it('should extract from realistic WhatsApp image webhook', () => {
      const message = {
        id: 'wamid.XXX',
        type: 'image',
        image: {
          id: '1234567890123456',
          mime_type: 'image/jpeg',
          sha256: 'abc123...',
          caption: 'Photo caption',
        },
        timestamp: '1234567890',
      }
      const info = extractMediaInfo(message, 'image')
      expect(info.providerMediaId).toBe('1234567890123456')
      expect(info.mediaMimeType).toBe('image/jpeg')
      expect(info.caption).toBe('Photo caption')
      expect(info.mediaSha256).toBe('abc123...')
    })

    it('should extract from realistic WhatsApp document webhook', () => {
      const message = {
        id: 'wamid.YYY',
        type: 'document',
        document: {
          id: '9876543210987654',
          mime_type: 'application/pdf',
          filename: 'invoice.pdf',
          sha256: 'def456...',
          file_size: 245760,
        },
        timestamp: '1234567891',
      }
      const info = extractMediaInfo(message, 'document')
      expect(info.providerMediaId).toBe('9876543210987654')
      expect(info.mediaMimeType).toBe('application/pdf')
      expect(info.filename).toBe('invoice.pdf')
      expect(info.mediaSize).toBe(245760)
      expect(info.mediaSha256).toBe('def456...')
    })

    it('should extract from realistic WhatsApp audio webhook', () => {
      const message = {
        id: 'wamid.ZZZ',
        type: 'audio',
        audio: {
          id: '5556667778889999',
          mime_type: 'audio/ogg; codecs=opus',
          sha256: 'ghi789...',
          voice: true,
          file_size: 8192,
        },
        timestamp: '1234567892',
      }
      const info = extractMediaInfo(message, 'audio')
      expect(info.providerMediaId).toBe('5556667778889999')
      expect(info.mediaMimeType).toBe('audio/ogg; codecs=opus')
      expect(info.mediaSize).toBe(8192)
      expect(info.mediaSha256).toBe('ghi789...')
    })

    it('should handle missing optional fields gracefully', () => {
      const message = {
        image: {
          id: '123456789',
          // No mime_type, filename, caption, etc.
        },
      }
      const info = extractMediaInfo(message, 'image')
      expect(info.providerMediaId).toBe('123456789')
      expect(info.mediaMimeType).toBeNull()
      expect(info.filename).toBeNull()
      expect(info.mediaSize).toBeNull()
      expect(info.caption).toBeNull()
    })

    it('should try all media objects if specified type not found', () => {
      const message = {
        type: 'text', // Incorrect type
        image: {
          id: '123456789',
          mime_type: 'image/jpeg',
        },
      }
      const info = extractMediaInfo(message, 'text')
      // Should try image object and find it
      expect(info.providerMediaId).toBe('123456789')
      expect(info.mediaMimeType).toBe('image/jpeg')
    })
  })

  describe('MEDIA_TYPES', () => {
    it('should contain all media types', () => {
      expect(MEDIA_TYPES.has('image')).toBe(true)
      expect(MEDIA_TYPES.has('audio')).toBe(true)
      expect(MEDIA_TYPES.has('document')).toBe(true)
      expect(MEDIA_TYPES.has('video')).toBe(true)
      expect(MEDIA_TYPES.has('sticker')).toBe(true)
      expect(MEDIA_TYPES.has('text')).toBe(false)
    })
  })

  describe('Test fixtures for each media type', () => {
    // Realistic WhatsApp webhook fixtures for each media type
    
    it('should extract from image fixture', () => {
      const fixture = {
        id: 'wamid.IMAGE123',
        type: 'image',
        image: {
          id: '1234567890123456',
          mime_type: 'image/jpeg',
          sha256: 'abc123def456',
          caption: 'Test image caption',
        },
        timestamp: '1234567890',
      }
      const detected = detectMediaType(fixture)
      expect(detected).toBe('image')
      const info = extractMediaInfo(fixture, detected)
      expect(info.providerMediaId).toBe('1234567890123456')
      expect(info.mediaMimeType).toBe('image/jpeg')
      expect(info.caption).toBe('Test image caption')
    })

    it('should extract from document fixture', () => {
      const fixture = {
        id: 'wamid.DOC123',
        type: 'document',
        document: {
          id: '9876543210987654',
          mime_type: 'application/pdf',
          filename: 'invoice.pdf',
          sha256: 'def456ghi789',
          file_size: 245760,
        },
        timestamp: '1234567891',
      }
      const detected = detectMediaType(fixture)
      expect(detected).toBe('document')
      const info = extractMediaInfo(fixture, detected)
      expect(info.providerMediaId).toBe('9876543210987654')
      expect(info.mediaMimeType).toBe('application/pdf')
      expect(info.filename).toBe('invoice.pdf')
      expect(info.mediaSize).toBe(245760)
    })

    it('should extract from audio fixture', () => {
      const fixture = {
        id: 'wamid.AUDIO123',
        type: 'audio',
        audio: {
          id: '5556667778889999',
          mime_type: 'audio/ogg; codecs=opus',
          sha256: 'ghi789jkl012',
          voice: true,
          file_size: 8192,
        },
        timestamp: '1234567892',
      }
      const detected = detectMediaType(fixture)
      expect(detected).toBe('audio')
      const info = extractMediaInfo(fixture, detected)
      expect(info.providerMediaId).toBe('5556667778889999')
      expect(info.mediaMimeType).toBe('audio/ogg; codecs=opus')
      expect(info.mediaSize).toBe(8192)
    })

    it('should extract from video fixture', () => {
      const fixture = {
        id: 'wamid.VIDEO123',
        type: 'video',
        video: {
          id: '1112223334445556',
          mime_type: 'video/mp4',
          sha256: 'jkl012mno345',
          caption: 'Test video caption',
          file_size: 5120000,
        },
        timestamp: '1234567893',
      }
      const detected = detectMediaType(fixture)
      expect(detected).toBe('video')
      const info = extractMediaInfo(fixture, detected)
      expect(info.providerMediaId).toBe('1112223334445556')
      expect(info.mediaMimeType).toBe('video/mp4')
      expect(info.caption).toBe('Test video caption')
      expect(info.mediaSize).toBe(5120000)
    })

    it('should extract from sticker fixture', () => {
      const fixture = {
        id: 'wamid.STICKER123',
        type: 'sticker',
        sticker: {
          id: '7778889990001112',
          mime_type: 'image/webp',
          sha256: 'mno345pqr678',
          animated: true,
        },
        timestamp: '1234567894',
      }
      const detected = detectMediaType(fixture)
      expect(detected).toBe('sticker')
      const info = extractMediaInfo(fixture, detected)
      expect(info.providerMediaId).toBe('7778889990001112')
      expect(info.mediaMimeType).toBe('image/webp')
    })
  })
})