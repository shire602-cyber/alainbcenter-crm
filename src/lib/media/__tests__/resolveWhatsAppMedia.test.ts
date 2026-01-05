/**
 * Unit tests for resolveWhatsAppMedia
 * Tests both envelope and message payload shapes
 */

import { resolveWhatsAppMedia, ResolvedWhatsAppMedia } from '../resolveWhatsAppMedia'

describe('resolveWhatsAppMedia', () => {
  describe('ProviderMediaId Priority Rules', () => {
    it('should use PRIORITY A: dbMessage.providerMediaId', () => {
      const dbMessage = {
        type: 'image',
        providerMediaId: '1234567890123456',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBe('1234567890123456')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('image')
      expect(result.debug?.source).toBe('dbMessage.providerMediaId')
    })

    it('should use PRIORITY B: numeric dbMessage.mediaUrl', () => {
      const dbMessage = {
        type: 'image',
        mediaUrl: '9876543210987654',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBe('9876543210987654')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('image')
      expect(result.debug?.source).toBe('dbMessage.mediaUrl')
    })

    it('should use PRIORITY C: dbMessage.rawPayload parsed', () => {
      const dbMessage = {
        type: 'image',
        rawPayload: JSON.stringify({
          image: {
            id: '1112223334445556',
            mime_type: 'image/jpeg',
          },
        }),
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBe('1112223334445556')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('image')
      expect(result.debug?.source).toBe('dbMessage.rawPayload')
      expect(result.mediaMimeType).toBe('image/jpeg')
    })

    it('should use PRIORITY D: dbMessage.payload parsed', () => {
      const dbMessage = {
        type: 'audio',
        payload: JSON.stringify({
          audio: {
            id: '2223334445556667',
            mime_type: 'audio/ogg',
          },
        }),
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBe('2223334445556667')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('audio')
      expect(result.debug?.source).toBe('dbMessage.payload')
    })

    it('should use PRIORITY E: whatsappMessage.{finalType}.id', () => {
      const whatsappMessage = {
        type: 'image',
        image: {
          id: '3334445556667778',
          mime_type: 'image/png',
          caption: 'Test image',
        },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.providerMediaId).toBe('3334445556667778')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('image')
      expect(result.debug?.source).toBe('whatsappMessage.image')
      expect(result.mediaMimeType).toBe('image/png')
      expect(result.caption).toBe('Test image')
    })

    it('should use PRIORITY E: scan all media objects in whatsappMessage', () => {
      // Message has type='text' but contains audio object
      const whatsappMessage = {
        type: 'text',
        audio: {
          id: '4445556667778889',
          mime_type: 'audio/ogg',
        },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.providerMediaId).toBe('4445556667778889')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('audio')
      expect(result.debug?.source).toBe('whatsappMessage.audio')
    })

    it('should use PRIORITY F: externalEventPayload (message shape)', () => {
      const externalEventPayload = {
        type: 'video',
        video: {
          id: '5556667778889990',
          mime_type: 'video/mp4',
          caption: 'Test video',
        },
      }
      
      const result = resolveWhatsAppMedia(undefined, undefined, externalEventPayload)
      
      expect(result.providerMediaId).toBe('5556667778889990')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('video')
      expect(result.debug?.source).toBe('externalEventPayload.video')
    })

    it('should use PRIORITY F: externalEventPayload (envelope shape)', () => {
      const externalEventPayload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      type: 'document',
                      document: {
                        id: '6667778889990001',
                        mime_type: 'application/pdf',
                        filename: 'invoice.pdf',
                        file_size: 1024,
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      
      const result = resolveWhatsAppMedia(undefined, undefined, externalEventPayload)
      
      expect(result.providerMediaId).toBe('6667778889990001')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('document')
      expect(result.debug?.source).toBe('externalEventPayload.document')
      expect(result.filename).toBe('invoice.pdf')
      expect(result.size).toBe(1024)
    })

    it('should respect priority order (A beats B, B beats C, etc.)', () => {
      const dbMessage = {
        type: 'image',
        providerMediaId: 'PRIORITY_A', // Should win
        mediaUrl: 'PRIORITY_B',
        rawPayload: JSON.stringify({
          image: { id: 'PRIORITY_C' },
        }),
      }
      
      const whatsappMessage = {
        type: 'image',
        image: { id: 'PRIORITY_E' },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage, dbMessage)
      
      expect(result.providerMediaId).toBe('PRIORITY_A')
      expect(result.debug?.source).toBe('dbMessage.providerMediaId')
    })
  })

  describe('FinalType Priority Rules', () => {
    it('should prefer explicit dbMessage.type if in MEDIA_TYPES', () => {
      const dbMessage = {
        type: 'audio',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.finalType).toBe('audio')
      expect(result.isMedia).toBe(true)
      expect(result.debug?.typeSource).toBe('dbMessage.type')
    })

    it('should infer from whatsappMessage.type or media objects', () => {
      const whatsappMessage = {
        type: 'image',
        image: { id: '123' },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.finalType).toBe('image')
      expect(result.isMedia).toBe(true)
      expect(result.debug?.typeSource).toBe('whatsappMessage')
    })

    it('should infer from dbMessage.mediaMimeType', () => {
      const dbMessage = {
        type: 'text', // Not a media type
        mediaMimeType: 'audio/ogg',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.finalType).toBe('audio')
      expect(result.isMedia).toBe(true)
      expect(result.debug?.typeSource).toBe('mediaMimeType')
    })

    it('should infer from dbMessage.body placeholders', () => {
      const dbMessage = {
        type: 'text',
        body: '[image]',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.finalType).toBe('image')
      expect(result.isMedia).toBe(true)
      expect(result.debug?.typeSource).toBe('body.placeholder')
    })

    it('should handle various body placeholder formats', () => {
      const testCases = [
        { body: '[image]', expected: 'image' },
        { body: '[Image]', expected: 'image' },
        { body: '[IMAGE]', expected: 'image' },
        { body: '[video]', expected: 'video' },
        { body: '[audio]', expected: 'audio' },
        { body: '[document]', expected: 'document' },
        { body: '[sticker]', expected: 'sticker' },
        { body: '[image received]', expected: 'image' },
        { body: '[video received]', expected: 'video' },
      ]
      
      for (const testCase of testCases) {
        const result = resolveWhatsAppMedia(undefined, {
          type: 'text',
          body: testCase.body,
        })
        
        expect(result.finalType).toBe(testCase.expected)
        expect(result.isMedia).toBe(true)
      }
    })

    it('should infer from payload if other sources fail', () => {
      const dbMessage = {
        type: 'text',
        rawPayload: JSON.stringify({
          video: { id: '123' },
        }),
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.finalType).toBe('video')
      expect(result.isMedia).toBe(true)
      expect(result.debug?.typeSource).toBe('payload')
    })

    it('should default to text if no media detected', () => {
      const dbMessage = {
        type: 'text',
        body: 'Hello world',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.finalType).toBe('text')
      expect(result.isMedia).toBe(false)
      expect(result.providerMediaId).toBeNull()
    })
  })

  describe('Metadata Extraction', () => {
    it('should extract mime/filename/size/sha/caption from media object', () => {
      const whatsappMessage = {
        type: 'document',
        document: {
          id: '123456789',
          mime_type: 'application/pdf',
          filename: 'invoice.pdf',
          file_size: 2048,
          sha256: 'abc123def456',
        },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.mediaMimeType).toBe('application/pdf')
      expect(result.filename).toBe('invoice.pdf')
      expect(result.size).toBe(2048)
      expect(result.sha256).toBe('abc123def456')
    })

    it('should use dbMessage.mediaMimeType if available', () => {
      const dbMessage = {
        type: 'image',
        providerMediaId: '123',
        mediaMimeType: 'image/png',
      }
      
      const whatsappMessage = {
        type: 'image',
        image: {
          id: '123',
          mime_type: 'image/jpeg', // Should be overridden by dbMessage
        },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage, dbMessage)
      
      expect(result.mediaMimeType).toBe('image/png')
    })

    it('should use default MIME type if not provided', () => {
      const whatsappMessage = {
        type: 'audio',
        audio: {
          id: '123',
          // No mime_type
        },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.mediaMimeType).toBe('audio/ogg')
    })

    it('should extract caption from video', () => {
      const whatsappMessage = {
        type: 'video',
        video: {
          id: '123',
          caption: 'Test video caption',
        },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.caption).toBe('Test video caption')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null/undefined inputs gracefully', () => {
      const result = resolveWhatsAppMedia()
      
      expect(result.isMedia).toBe(false)
      expect(result.finalType).toBe('text')
      expect(result.providerMediaId).toBeNull()
    })

    it('should handle invalid providerMediaId formats', () => {
      const dbMessage = {
        type: 'image',
        providerMediaId: 'invalid id with spaces',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      // Should not use invalid ID
      expect(result.providerMediaId).toBeNull()
    })

    it('should handle non-numeric mediaUrl', () => {
      const dbMessage = {
        type: 'image',
        mediaUrl: 'https://example.com/image.jpg', // Not numeric
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBeNull()
    })

    it('should handle invalid JSON in rawPayload', () => {
      const dbMessage = {
        type: 'image',
        rawPayload: 'invalid json',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      // Should not crash, but providerMediaId should be null
      expect(result.providerMediaId).toBeNull()
    })

    it('should handle payload with media_id field instead of id', () => {
      const dbMessage = {
        type: 'image',
        rawPayload: JSON.stringify({
          image: {
            media_id: '1234567890123456',
          },
        }),
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBe('1234567890123456')
    })

    it('should handle payload with mediaId field instead of id', () => {
      const whatsappMessage = {
        type: 'image',
        image: {
          mediaId: '9876543210987654',
        },
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.providerMediaId).toBe('9876543210987654')
    })

    it('should handle file_size and fileSize fields', () => {
      const whatsappMessage = {
        type: 'document',
        document: {
          id: '123',
          fileSize: 1024, // camelCase
        },
      }
      
      const result1 = resolveWhatsAppMedia(whatsappMessage)
      expect(result1.size).toBe(1024)
      
      const whatsappMessage2 = {
        type: 'document',
        document: {
          id: '123',
          file_size: 2048, // snake_case
        },
      }
      
      const result2 = resolveWhatsAppMedia(whatsappMessage2)
      expect(result2.size).toBe(2048)
    })

    it('should handle sha256 and sha_256 fields', () => {
      const whatsappMessage = {
        type: 'image',
        image: {
          id: '123',
          sha_256: 'abc123', // snake_case
        },
      }
      
      const result1 = resolveWhatsAppMedia(whatsappMessage)
      expect(result1.sha256).toBe('abc123')
      
      const whatsappMessage2 = {
        type: 'image',
        image: {
          id: '123',
          sha256: 'def456', // camelCase
        },
      }
      
      const result2 = resolveWhatsAppMedia(whatsappMessage2)
      expect(result2.sha256).toBe('def456')
    })

    it('should handle mimeType and mime_type fields', () => {
      const whatsappMessage = {
        type: 'image',
        image: {
          id: '123',
          mimeType: 'image/png', // camelCase
        },
      }
      
      const result1 = resolveWhatsAppMedia(whatsappMessage)
      expect(result1.mediaMimeType).toBe('image/png')
      
      const whatsappMessage2 = {
        type: 'image',
        image: {
          id: '123',
          mime_type: 'image/jpeg', // snake_case
        },
      }
      
      const result2 = resolveWhatsAppMedia(whatsappMessage2)
      expect(result2.mediaMimeType).toBe('image/jpeg')
    })
  })

  describe('Realistic WhatsApp Webhook Scenarios', () => {
    it('should handle complete image webhook payload', () => {
      const whatsappMessage = {
        id: 'wamid.ABC123',
        type: 'image',
        image: {
          id: '1234567890123456',
          mime_type: 'image/jpeg',
          sha256: 'abc123def456',
          caption: 'Photo caption',
        },
        timestamp: '1234567890',
        from: '971501234567',
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('image')
      expect(result.providerMediaId).toBe('1234567890123456')
      expect(result.mediaMimeType).toBe('image/jpeg')
      expect(result.sha256).toBe('abc123def456')
      expect(result.caption).toBe('Photo caption')
    })

    it('should handle document webhook with filename and size', () => {
      const whatsappMessage = {
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
        from: '971501234567',
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('document')
      expect(result.providerMediaId).toBe('9876543210987654')
      expect(result.filename).toBe('invoice.pdf')
      expect(result.size).toBe(245760)
    })

    it('should handle audio webhook with voice flag', () => {
      const whatsappMessage = {
        id: 'wamid.AUDIO123',
        type: 'audio',
        audio: {
          id: '5556667778889999',
          mime_type: 'audio/ogg; codecs=opus',
          sha256: 'ghi789jkl012',
          voice: true,
        },
        timestamp: '1234567892',
        from: '971501234567',
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('audio')
      expect(result.providerMediaId).toBe('5556667778889999')
      expect(result.mediaMimeType).toBe('audio/ogg; codecs=opus')
    })

    it('should handle video webhook with caption', () => {
      const whatsappMessage = {
        id: 'wamid.VIDEO123',
        type: 'video',
        video: {
          id: '1112223334445556',
          mime_type: 'video/mp4',
          sha256: 'jkl012mno345',
          caption: 'Video caption',
          file_size: 5120000,
        },
        timestamp: '1234567893',
        from: '971501234567',
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('video')
      expect(result.providerMediaId).toBe('1112223334445556')
      expect(result.caption).toBe('Video caption')
      expect(result.size).toBe(5120000)
    })

    it('should handle sticker webhook', () => {
      const whatsappMessage = {
        id: 'wamid.STICKER123',
        type: 'sticker',
        sticker: {
          id: '7778889990001112',
          mime_type: 'image/webp',
          sha256: 'mno345pqr678',
          animated: true,
        },
        timestamp: '1234567894',
        from: '971501234567',
      }
      
      const result = resolveWhatsAppMedia(whatsappMessage)
      
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('sticker')
      expect(result.providerMediaId).toBe('7778889990001112')
      expect(result.mediaMimeType).toBe('image/webp')
    })
  })

  describe('Database Message Recovery Scenarios', () => {
    it('should recover from dbMessage with only providerMediaId', () => {
      const dbMessage = {
        type: 'image',
        providerMediaId: '1234567890123456',
        body: '[image]',
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBe('1234567890123456')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('image')
    })

    it('should recover from dbMessage with rawPayload', () => {
      const dbMessage = {
        type: 'text', // Missing type, but has rawPayload
        body: '[audio]',
        rawPayload: JSON.stringify({
          audio: {
            id: '9876543210987654',
            mime_type: 'audio/ogg',
          },
        }),
      }
      
      const result = resolveWhatsAppMedia(undefined, dbMessage)
      
      expect(result.providerMediaId).toBe('9876543210987654')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('audio')
      expect(result.mediaMimeType).toBe('audio/ogg')
    })

    it('should recover from externalEventPayload envelope shape', () => {
      const externalEventPayload = {
        entry: [
          {
            id: 'ENTRY_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: '123456789',
                  },
                  messages: [
                    {
                      id: 'wamid.XXX',
                      type: 'image',
                      image: {
                        id: '1234567890123456',
                        mime_type: 'image/jpeg',
                      },
                      timestamp: '1234567890',
                      from: '971501234567',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      
      const result = resolveWhatsAppMedia(undefined, undefined, externalEventPayload)
      
      expect(result.providerMediaId).toBe('1234567890123456')
      expect(result.isMedia).toBe(true)
      expect(result.finalType).toBe('image')
    })
  })
})

