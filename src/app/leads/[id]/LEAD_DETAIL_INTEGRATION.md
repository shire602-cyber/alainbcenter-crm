# Lead Detail Page - Premium Integration Guide

## Quick Integration Steps

### 1. Update Imports (Top of file)

Add these imports:
```typescript
import { AIScoreCircleAnimated } from '@/components/leads/AIScoreCircleAnimated'
import { AIScoreBadgePremium } from '@/components/leads/AIScoreBadgePremium'
import { QuickActionsMenu } from '@/components/leads/QuickActionsMenu'
import { MessageComposerEnhanced } from '@/components/leads/MessageComposerEnhanced'
import { AutomationInspector } from '@/components/leads/AutomationInspector'
import { RevenueWidget } from '@/components/leads/RevenueWidget'
import { DarkModeToggle } from '@/components/layout/DarkModeToggle'
```

### 2. Update Header Bar (Around line 480)

**Replace:**
```typescript
<AIScoreBadge score={lead.aiScore} />
```

**With:**
```typescript
<AIScoreBadgePremium score={lead.aiScore} />
```

**Add dark mode toggle to header:**
```typescript
<div className="flex items-center gap-2 flex-shrink-0">
  <DarkModeToggle />
  {/* ... existing buttons ... */}
</div>
```

### 3. Update Contact Card - Add Quick Actions (Around line 550)

**For Phone field:**
```typescript
{lead.contact?.phone && (
  <div className="group">
    <Label className="text-xs text-muted-foreground">Phone</Label>
    <div className="flex items-center gap-2 mt-1">
      <span className="text-sm flex-1">{lead.contact.phone}</span>
      <QuickActionsMenu 
        type="phone" 
        value={lead.contact.phone}
        phone={lead.contact.phone}
      />
    </div>
  </div>
)}
```

**For Email field:**
```typescript
{lead.contact?.email && (
  <div className="group">
    <Label className="text-xs text-muted-foreground">Email</Label>
    <div className="flex items-center gap-2 mt-1">
      <a href={`mailto:${lead.contact.email}`} className="text-sm flex-1 hover:underline">
        {lead.contact.email}
      </a>
      <QuickActionsMenu 
        type="email" 
        value={lead.contact.email}
        email={lead.contact.email}
      />
    </div>
  </div>
)}
```

### 4. Update AI Insight Card (Around line 620)

**Replace:**
```typescript
<div className="flex justify-center">
  <AIScoreCircle score={lead.aiScore} size={100} />
</div>
```

**With:**
```typescript
<div className="flex justify-center">
  <AIScoreCircleAnimated 
    score={lead.aiScore} 
    size={100}
    animateOnUpdate={true}
  />
</div>
```

### 5. Update Message Composer (Around line 780)

**Replace the entire message composer section with:**
```typescript
<MessageComposerEnhanced
  value={messageText}
  onChange={setMessageText}
  onSend={handleSendMessage}
  sending={sending}
  onAIDraft={handleGenerateAIDraft}
  generatingAI={generatingAI}
  leadName={lead.contact?.fullName}
  expiryDate={lead.expiryItems?.[0]?.expiryDate}
  serviceType={lead.serviceType?.name}
  className="mt-4"
/>
```

### 6. Update Card Classes for Glassmorphism

**Conversation Card (highest shadow):**
```typescript
<Card className="rounded-2xl glass-medium shadow-conversation flex-1 flex flex-col overflow-hidden">
```

**Snapshot Cards (medium shadow):**
```typescript
<Card className="rounded-2xl glass-soft shadow-snapshot">
```

**Sidebar Cards (lower shadow):**
```typescript
<Card className="rounded-2xl glass-soft shadow-sidebar">
```

### 7. Add Sticky Tab Header (Around line 750)

Wrap the TabsList:
```typescript
<div className="sticky top-16 z-20 bg-card/95 backdrop-blur border-b -mx-6 px-6 py-3">
  <Tabs value={activeChannel} onValueChange={setActiveChannel}>
    <TabsList>...</TabsList>
  </Tabs>
</div>
```

### 8. Add New Widgets to Right Column (After Documents Card, around line 1000)

```typescript
{/* Automation Inspector */}
<AutomationInspector leadId={leadId} />

{/* Revenue Widget */}
<RevenueWidget 
  leadId={leadId}
  expiryItems={lead.expiryItems}
  serviceType={lead.serviceType?.name}
/>
```

### 9. Update WhatsApp Button in Header (Around line 500)

**Make it more prominent:**
```typescript
{lead.contact?.phone && (
  <Button
    onClick={() => openWhatsApp(lead.contact.phone, messageText || undefined)}
    className="bg-green-600 hover:bg-green-700 text-white shadow-lg"
    size="lg"
  >
    <MessageSquare className="h-5 w-5 mr-2" />
    WhatsApp
  </Button>
)}
```

**Make other buttons secondary:**
```typescript
<Button variant="outline" size="sm" onClick={() => setShowTaskModal(true)}>
  <Plus className="h-4 w-4 mr-2" />
  Task
</Button>
```

### 10. Enhance Pipeline Progress (Use existing component but add animation class)

The PipelineProgress component already exists. Just ensure the wrapper has:
```typescript
<div className="pipeline-highlight">
  <PipelineProgress
    currentStage={lead.stage || lead.pipelineStage || 'NEW'}
    onStageClick={handleStageChange}
  />
</div>
```

## CSS Classes Available

- `.glass` - Base glassmorphism
- `.glass-soft` - Softer glass effect
- `.glass-medium` - Medium glass effect
- `.shadow-conversation` - Highest shadow (conversation cards)
- `.shadow-snapshot` - Medium shadow (snapshot cards)
- `.shadow-sidebar` - Lower shadow (sidebar cards)
- `.text-section-header` - Section header typography
- `.text-gradient` - Gradient text effect
- `.animate-pulse-glow` - Pulse animation for AI score
- `.pipeline-highlight` - Pipeline transition animation
- `.animate-message-send` - Message send animation

## Testing Checklist

- [ ] Dark mode toggle works
- [ ] AI score animates on update
- [ ] Quick actions appear on hover
- [ ] Message composer shows autofill tokens
- [ ] Automation inspector displays rules
- [ ] Revenue widget shows renewal data
- [ ] All animations work smoothly
- [ ] Glassmorphism effects visible
- [ ] Shadow hierarchy is correct


















