/**
 * AI ORCHESTRATOR - SINGLE SOURCE OF TRUTH FOR AI REPLIES
 * 
 * This is the ONLY module allowed to call the LLM.
 * All other AI modules must use this orchestrator.
 * 
 * Responsibilities:
 * 1. Load AI Rules + AI Training content from DB
 * 2. Build ONE system prompt (strict; no hallucinations; follow ruleEngine)
 * 3. Execute model call
 * 4. Validate output with strictQualification
 * 5. Return structured output
 */

import { prisma } from "../prisma";
import { generateCompletion } from "@/lib/llm";
import { validateQualificationRules } from "./strictQualification";
import { executeRuleEngine } from "./ruleEngine";
import type { LLMMessage } from "@/lib/llm/types";
import { createHash } from "crypto";
import {
  loadConversationState,
  updateConversationState,
  wasQuestionAsked,
  getNextBusinessSetupQuestion,
  extractFieldsToState,
  shouldStopAsking,
  type ConversationState,
} from "./stateMachine";

// BANNED QUESTION KEYS - These must NEVER be asked
const BANNED_QUESTION_KEYS = new Set([
  "new_or_renewal",
  "new_or_renew",
  "company_name",
  "companyName",
  "ASK_COMPANY",
  "ASK_NEW_OR_RENEW",
]);

/**
 * Build idempotency key for AI reply
 * Format: wa_ai:{conversationId}:{inboundMessageId}:{aiActionType}
 * OR: auto:{conversationId}:{inboundProviderMessageId} (if providerMessageId provided)
 */
export function buildIdempotencyKey(
  conversationId: number,
  inboundMessageId: number,
  aiActionType: string = "auto_reply",
  inboundProviderMessageId?: string | null,
): string {
  // Use provider message ID if available (better for webhook replay deduplication)
  if (inboundProviderMessageId) {
    return `auto:${conversationId}:${inboundProviderMessageId}`;
  }
  // Fallback to internal message ID
  return `wa_ai:${conversationId}:${inboundMessageId}:${aiActionType}`;
}

/**
 * Combine multiple AI segments into ONE WhatsApp message
 * Ensures greeting + question + instructions are in a single message
 */
export function buildSingleAutoReplyText(parts: string | string[]): string {
  if (typeof parts === 'string') {
    // Already a single string - ensure it's clean
    return parts.trim();
  }
  
  // Combine multiple parts with line breaks
  const combined = parts
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .join('\n\n'); // Double line break between segments
  
  return combined.trim();
}

/**
 * Check and acquire per-conversation lock
 * Returns true if lock acquired, false if already locked
 */
async function acquireConversationLock(
  conversationId: number,
  lockDurationSeconds: number = 30,
): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + lockDurationSeconds * 1000);

  try {
    // Try to acquire lock (only if not locked or lock expired)
    const updated = await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [
          { aiLockUntil: null },
          { aiLockUntil: { lt: now } }, // Lock expired
        ],
      },
      data: {
        aiLockUntil: lockUntil,
      },
    });

    if (updated.count > 0) {
      console.log(
        `[ORCHESTRATOR] Lock acquired for conversation ${conversationId} until ${lockUntil.toISOString()}`,
      );
      return true;
    } else {
      // Check if lock exists
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { aiLockUntil: true },
      });

      if (conversation?.aiLockUntil && conversation.aiLockUntil > now) {
        console.log(
          `[ORCHESTRATOR] AI_LOCKED_SKIP conversation ${conversationId} - lock until ${conversation.aiLockUntil.toISOString()}`,
        );
        return false;
      }

      // Lock expired but update failed (race condition) - try again
      return false;
    }
  } catch (error: any) {
    console.error(
      `[ORCHESTRATOR] Failed to acquire lock for conversation ${conversationId}:`,
      error.message,
    );
    return false;
  }
}

/**
 * Release conversation lock
 */
async function releaseConversationLock(conversationId: number): Promise<void> {
  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiLockUntil: null },
    });
    console.log(
      `[ORCHESTRATOR] Lock released for conversation ${conversationId}`,
    );
  } catch (error: any) {
    console.warn(
      `[ORCHESTRATOR] Failed to release lock for conversation ${conversationId}:`,
      error.message,
    );
  }
}

/**
 * Check idempotency before sending AI reply
 * Returns existing dedup record if found, null if can proceed
 */
async function checkIdempotency(
  idempotencyKey: string,
): Promise<{ exists: boolean; record?: any }> {
  try {
    const existing = await prisma.aiReplyDedup.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      console.log(
        `[ORCHESTRATOR] AI_DEDUP_HIT idempotencyKey=${idempotencyKey.substring(0, 32)}... status=${existing.status}`,
      );
      return { exists: true, record: existing };
    }

    return { exists: false };
  } catch (error: any) {
    console.error(`[ORCHESTRATOR] Failed to check idempotency:`, error.message);
    // Fail open - allow send if check fails
    return { exists: false };
  }
}

/**
 * Create idempotency record BEFORE sending
 */
async function createIdempotencyRecord(
  conversationId: number,
  inboundMessageId: number,
  aiActionType: string,
  idempotencyKey: string,
): Promise<{ success: boolean; recordId?: number }> {
  try {
    const record = await prisma.aiReplyDedup.create({
      data: {
        conversationId,
        inboundMessageId,
        aiActionType,
        idempotencyKey,
        status: "PENDING",
      },
    });

    console.log(
      `[ORCHESTRATOR] Idempotency record created id=${record.id} key=${idempotencyKey.substring(0, 32)}...`,
    );
    return { success: true, recordId: record.id };
  } catch (error: any) {
    // Unique constraint violation = duplicate
    if (error.code === "P2002") {
      console.log(
        `[ORCHESTRATOR] AI_DEDUP_HIT (DB constraint) idempotencyKey=${idempotencyKey.substring(0, 32)}...`,
      );
      return { success: false };
    }

    console.error(
      `[ORCHESTRATOR] Failed to create idempotency record:`,
      error.message,
    );
    // Fail open - allow send if record creation fails
    return { success: true };
  }
}

/**
 * Update idempotency record after send
 */
async function updateIdempotencyRecord(
  recordId: number,
  status: "SENT" | "FAILED",
  outboundMessageId?: number,
  providerMessageId?: string,
  error?: string,
): Promise<void> {
  try {
    await prisma.aiReplyDedup.update({
      where: { id: recordId },
      data: {
        status,
        outboundMessageId,
        providerMessageId,
        error,
        sentAt: status === "SENT" ? new Date() : undefined,
        failedAt: status === "FAILED" ? new Date() : undefined,
      },
    });
    console.log(
      `[ORCHESTRATOR] Idempotency record updated id=${recordId} status=${status}`,
    );
  } catch (error: any) {
    console.warn(
      `[ORCHESTRATOR] Failed to update idempotency record:`,
      error.message,
    );
  }
}

export interface OrchestratorInput {
  conversationId: number;
  leadId?: number;
  contactId: number;
  inboundText: string;
  inboundMessageId: number;
  channel: string;
  language?: "en" | "ar";
  agentProfileId?: number;
}

export interface OrchestratorOutput {
  replyText: string;
  extractedFields: {
    service?: string;
    nationality?: string;
    name?: string;
    expiryDate?: string;
    businessActivity?: string;
    partnersCount?: number;
    visasCount?: number;
    [key: string]: any;
  };
  confidence: number; // 0-100
  nextStepKey?: string;
  tasksToCreate: Array<{
    type: string;
    title: string;
    dueAt?: Date;
  }>;
  shouldEscalate: boolean;
  handoverReason?: string;
}

/**
 * Load AI Training Documents from database
 */
async function loadTrainingDocuments(agentProfileId?: number): Promise<string> {
  try {
    let documentIds: number[] = [];
    
    // If agent profile specified, get its training document IDs
    if (agentProfileId) {
      const agent = await prisma.aIAgentProfile.findUnique({
        where: { id: agentProfileId },
        select: { trainingDocumentIds: true },
      });
      
      if (agent?.trainingDocumentIds) {
        try {
          documentIds = JSON.parse(agent.trainingDocumentIds);
        } catch {
          // If not JSON, treat as comma-separated
          documentIds = agent.trainingDocumentIds
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        }
      }
    }
    
    // If no agent profile or no documents specified, load all active documents
    if (documentIds.length === 0) {
      const allDocs = await prisma.aITrainingDocument.findMany({
        orderBy: { updatedAt: "desc" },
        take: 50, // Limit to most recent 50
      });
      documentIds = allDocs.map((doc) => doc.id);
    }
    
    // Load documents
    const documents = await prisma.aITrainingDocument.findMany({
      where: { id: { in: documentIds } },
      orderBy: { updatedAt: "desc" },
    });
    
    // Combine into training text
    const trainingText = documents
      .map((doc) => `[${doc.type.toUpperCase()}] ${doc.title}\n${doc.content}`)
      .join("\n\n---\n\n");
    
    return trainingText;
  } catch (error: any) {
    console.warn(
      `[ORCHESTRATOR] Failed to load training documents:`,
      error.message,
    );
    return "";
  }
}

/**
 * Build system prompt from AI Rules + Training Documents
 */
async function buildSystemPrompt(
  agentProfileId?: number,
  language: "en" | "ar" = "en",
): Promise<string> {
  // Load training documents
  const trainingContent = await loadTrainingDocuments(agentProfileId);
  
  // Get agent profile if specified
  let agentPrompt = "";
  if (agentProfileId) {
    const agent = await prisma.aIAgentProfile.findUnique({
      where: { id: agentProfileId },
      select: { systemPrompt: true, tone: true, maxMessageLength: true },
    });
    
    if (agent?.systemPrompt) {
      agentPrompt = agent.systemPrompt;
    }
  }
  
  // Build base system prompt
  const basePrompt =
    agentPrompt ||
    `You are a helpful assistant for Al Ain Business Center in UAE.
Your role is to qualify leads, answer questions, and guide customers through our services.
You must follow the rules and training documents exactly.`;

  // Add training content
  const trainingSection = trainingContent
    ? `\n\n## TRAINING DOCUMENTS (FOLLOW THESE EXACTLY):\n${trainingContent}`
    : "";
  
  // Add rule engine constraints
  const rulesSection = `\n\n## CRITICAL RULES (MUST FOLLOW):
1. NEVER promise approvals, guarantees, or 100% success rates
2. NEVER ask "are you in UAE" or location questions for business setup
3. NEVER ask more than 1 question per message
4. NEVER ask more than 5 questions total for business setup
5. NEVER repeat a question already asked
6. Keep messages short (max 300 characters for WhatsApp)
7. Use friendly, professional tone
8. If user says "cheapest", offer: "Professional Mainland License + Investor Visa for AED 12,999"
9. If user says "marketing license", accept it and log as business activity (don't interrogate)
10. If confused or validation fails, use fallback: "Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation."

${language === "ar" ? "CRITICAL: You MUST respond in Arabic (Modern Standard Arabic). All replies must be in Arabic." : "CRITICAL: You MUST respond in English. All replies must be in English."}
If the user's message is in a different language, detect it and respond in that language. If language is unknown, default to ${language === "ar" ? "Arabic" : "English"}.`;

  return basePrompt + trainingSection + rulesSection;
}

/**
 * Extract fields from reply text (deterministic)
 */
function extractFieldsFromReply(
  replyText: string,
  inboundText: string,
): OrchestratorOutput["extractedFields"] {
  const {
    extractService,
    extractNationality,
    extractIdentity,
  } = require("../inbound/fieldExtractors");

  const combinedText = `${inboundText} ${replyText}`.toLowerCase();
  
  return {
    service: extractService(combinedText),
    nationality: extractNationality(combinedText),
    name: extractIdentity(combinedText).name,
  };
}

/**
 * Main orchestrator function - ONLY entry point for AI replies
 */
export async function generateAIReply(
  input: OrchestratorInput,
): Promise<OrchestratorOutput> {
  // DIAGNOSTIC LOG: orchestrator entry
  console.log(
    `[ORCHESTRATOR] ENTRY`,
    JSON.stringify({
    conversationId: input.conversationId,
    leadId: input.leadId,
    contactId: input.contactId,
    channel: input.channel,
    inboundMessageId: input.inboundMessageId,
    inboundTextLength: input.inboundText.length,
    }),
  );
  
  try {
    // Step 0: Load conversation state (with optimistic locking)
    const conversationState = await loadConversationState(input.conversationId);
    let expectedStateVersion = conversationState.stateVersion; // Use actual state version for optimistic locking
    
    // DIAGNOSTIC LOG: state loaded
    console.log(
      `[ORCHESTRATOR] STATE-LOADED`,
      JSON.stringify({
      conversationId: input.conversationId,
      stateVersion: expectedStateVersion,
      qualificationStage: conversationState.qualificationStage,
      questionsAskedCount: conversationState.questionsAskedCount,
      lastQuestionKey: conversationState.lastQuestionKey,
      serviceKey: conversationState.serviceKey,
      knownFields: Object.keys(conversationState.knownFields),
      }),
    );
    
    // Step 1: Load conversation and lead context
    let conversation
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        include: {
          lead: {
            include: {
              contact: true,
              serviceType: true,
              aiAgentProfile: true, // CRITICAL FIX 4: Load agent profile for language settings
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 10, // Last 10 messages for context
          },
        },
      });
    } catch (error: any) {
      // Gracefully handle missing lastProcessedInboundMessageId column
      if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('[DB] lastProcessedInboundMessageId column not found, querying with select (this is OK if migration not yet applied)')
        // Use select to explicitly exclude the problematic column but include relations
        conversation = await prisma.conversation.findUnique({
          where: { id: input.conversationId },
          select: {
            id: true,
            contactId: true,
            leadId: true,
            channel: true,
            status: true,
            lastMessageAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            unreadCount: true,
            priorityScore: true,
            createdAt: true,
            updatedAt: true,
            aiState: true,
            aiLockUntil: true,
            lastAiOutboundAt: true,
            ruleEngineMemory: true,
            deletedAt: true,
            lead: {
              include: {
                contact: true,
                serviceType: true,
                aiAgentProfile: true,
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        }) as any
      } else {
        throw error
      }
    }
    
    if (!conversation) {
      throw new Error(`Conversation ${input.conversationId} not found`);
    }
    
    const lead = conversation.lead;
    if (!lead) {
      throw new Error(
        `Lead not found for conversation ${input.conversationId}`,
      );
    }
    
    // CRITICAL FIX A: Extract fields from inbound message BEFORE gating
    // This ensures we don't ask for information that was just provided
    const stateExtractedFields = extractFieldsToState(
      input.inboundText,
      conversationState,
    );
    const updatedKnownFields = {
      ...conversationState.knownFields,
      ...stateExtractedFields,
    };
    
    // Detect service if not already known
    if (!updatedKnownFields.service) {
      const { extractService } = require("../inbound/fieldExtractors");
      const detectedService = extractService(input.inboundText);
      if (detectedService) {
        updatedKnownFields.service = detectedService;
      }
    }
    
    // Detect "cheapest" keyword
    const lowerText = input.inboundText.toLowerCase();
    if (lowerText.includes("cheapest") || lowerText.includes("cheap")) {
      updatedKnownFields.priceSensitive = true;
      updatedKnownFields.recommendedOffer =
        "Professional Mainland License + Investor Visa for AED 12,999";
    }
    
    // Detect "marketing license"
    if (
      lowerText.includes("marketing license") ||
      lowerText.includes("marketing")
    ) {
      updatedKnownFields.businessActivity = "Marketing License";
      updatedKnownFields.customServiceLabel = "Marketing License";
    }
    
    // Write extracted fields to DB immediately (before gating)
    if (
      Object.keys(stateExtractedFields).length > 0 ||
      updatedKnownFields.service !== conversationState.knownFields.service
    ) {
      await updateConversationState(
        input.conversationId,
        {
          knownFields: updatedKnownFields,
        },
        expectedStateVersion,
      );
      // Reload state to get updated version
      const reloadedState = await loadConversationState(input.conversationId);
      conversationState.knownFields = reloadedState.knownFields;
      expectedStateVersion = reloadedState.stateVersion || expectedStateVersion;
    }
    
    // Structured log: extracted fields
    console.log(
      `[ORCH] extracted fields`,
      JSON.stringify({
      conversationId: input.conversationId,
      extractedKeys: Object.keys(stateExtractedFields),
      extractedValues: Object.fromEntries(
          Object.entries(stateExtractedFields).map(([k, v]) => [
            k,
            typeof v === "string" ? v.substring(0, 50) : v,
          ]),
      ),
      updatedKnownFieldsKeys: Object.keys(updatedKnownFields),
      }),
    );
    
    // Step 1.5: Check question budget (max 6 questions)
    if (conversationState.questionsAskedCount >= 6) {
      console.log(
        `[ORCHESTRATOR] Question budget reached (${conversationState.questionsAskedCount} questions) - triggering handoff`,
      );
      
      // Check if handoff was already triggered
      const handoffTriggered = conversationState.knownFields.handoffTriggeredAt;
      if (!handoffTriggered) {
        // Send handoff message (greeting will be added globally)
        const handoffMessage = `Perfect ✅ I have enough to proceed.
Please share your email for the quotation and the best time for our consultant to call you (today or tomorrow).`;
        
        // Mark handoff as triggered
        await updateConversationState(
          input.conversationId,
          {
            knownFields: {
              ...conversationState.knownFields,
              handoffTriggeredAt: new Date().toISOString(),
            },
          },
          expectedStateVersion,
        );
        
        return {
          replyText: handoffMessage,
          extractedFields: {},
          confidence: 100,
          nextStepKey: "HANDOFF",
          tasksToCreate: [
            {
              type: "FOLLOW_UP",
              title: "Follow up with customer for email and call time",
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
          ],
          shouldEscalate: false,
        };
      } else {
        // Handoff already triggered - don't send again
        return {
          replyText: "",
          extractedFields: {},
          confidence: 0,
          tasksToCreate: [],
          shouldEscalate: true,
          handoverReason:
            "Question budget exceeded, waiting for customer response",
        };
      }
    }
    
    // Step 1.6: Check for qualification complete (name + service + nationality)
    // CRITICAL FIX B: Use state flag only, no substring matching
    const hasCoreQualification = 
      updatedKnownFields.name && 
      updatedKnownFields.service && 
      updatedKnownFields.nationality;
    
    if (hasCoreQualification && !updatedKnownFields.qualificationConfirmedAt) {
      // CRITICAL FIX B: Use qualificationConfirmedAt flag only (no substring check)
      // If flag exists, confirmation already sent
      if (!updatedKnownFields.qualificationConfirmedAt) {
        const name =
          updatedKnownFields.name || lead.contact.fullName || "there";
        const service =
          updatedKnownFields.service || lead.serviceType?.name || "service";
        const nationality =
          updatedKnownFields.nationality ||
          lead.contact.nationality ||
          "nationality";
        
        // Confirmation message (greeting will be added globally)
        const confirmationMessage = `Perfect, ${name}! ✅ I've noted:
• Service: ${service}
• Nationality: ${nationality}

Please share your email so I can send you the quotation,
and let me know the best time for our consultant to call you.`;
        
        // Mark confirmation as sent using state flag
        const confirmedFields = {
          ...updatedKnownFields,
          qualificationConfirmedAt: new Date().toISOString(),
        };
        await updateConversationState(
          input.conversationId,
          {
            knownFields: confirmedFields,
          },
          expectedStateVersion,
        );
        
        return {
          replyText: confirmationMessage,
          extractedFields: {
            name: updatedKnownFields.name,
            service: updatedKnownFields.service,
            nationality: updatedKnownFields.nationality,
          },
          confidence: 100,
          nextStepKey: "QUALIFICATION_COMPLETE",
          tasksToCreate: [],
          shouldEscalate: false,
        };
      }
    }
    
    // Step 1.7: STAGE 1 QUALIFICATION GATE
    // CRITICAL FIX A: Use updatedKnownFields (after extraction) for gate check
    // Priority order: 1) service, 2) name, 3) nationality
    const hasCoreQualificationCheck = 
      updatedKnownFields.name && 
      updatedKnownFields.service && 
      updatedKnownFields.nationality;
    
    // Structured log: gate decision
    const missingFields: string[] = [];
    if (!updatedKnownFields.service) missingFields.push("service");
    if (!updatedKnownFields.name) missingFields.push("name");
    if (!updatedKnownFields.nationality) missingFields.push("nationality");

    console.log(
      `[ORCH] gate decision`,
      JSON.stringify({
      conversationId: input.conversationId,
      missing: missingFields,
      asked: conversationState.lastQuestionKey,
      questionsAskedCount: conversationState.questionsAskedCount,
      hasCoreQualification: hasCoreQualificationCheck,
      }),
    );
    
    // If Stage 1 not complete, enforce strict gate with NEW priority order
    if (!hasCoreQualificationCheck) {
      // Determine which core field to ask for (NEW priority order: service first)
      let nextCoreQuestion: { questionKey: string; question: string } | null =
        null;
      
      // 1) SERVICE FIRST (unless user already stated service in first message)
      if (!updatedKnownFields.service) {
        // First question: "How can I help you today?" (no service list, no examples)
        nextCoreQuestion = {
          questionKey: "ASK_SERVICE",
          question: "How can I help you today?",
        };
      } 
      // 2) NAME SECOND (only after service is known)
      else if (!updatedKnownFields.name) {
        nextCoreQuestion = {
          questionKey: "ASK_NAME",
          question: "May I know your full name, please?",
        };
      } 
      // 3) NATIONALITY THIRD (only after service and name are known)
      else if (!updatedKnownFields.nationality) {
        nextCoreQuestion = {
          questionKey: "ASK_NATIONALITY",
          question: "What is your nationality?",
        };
      }
      
      // If we have a core question to ask, check no-repeat guard
      if (nextCoreQuestion) {
        // Check if this question was asked recently
        const wasAsked = wasQuestionAsked(
          conversationState,
          nextCoreQuestion.questionKey,
        );
        
        if (
          !wasAsked &&
          !BANNED_QUESTION_KEYS.has(nextCoreQuestion.questionKey)
        ) {
          // Record question asked
          const { recordQuestionAsked } =
            await import("../conversation/flowState");
          await recordQuestionAsked(
            input.conversationId,
            nextCoreQuestion.questionKey,
            `WAIT_${nextCoreQuestion.questionKey}`,
          );
          
          // Increment question count
          const newQuestionsCount = conversationState.questionsAskedCount + 1;
          await updateConversationState(
            input.conversationId,
            {
              questionsAskedCount: newQuestionsCount,
              lastQuestionKey: nextCoreQuestion.questionKey,
              knownFields: updatedKnownFields, // Use updated fields
            },
            expectedStateVersion,
          );
          
          return {
            replyText: nextCoreQuestion.question,
            extractedFields: {},
            confidence: 100,
            nextStepKey: nextCoreQuestion.questionKey,
            tasksToCreate: [],
            shouldEscalate: false,
          };
        }
      }
    }
    
    // Step 2: Check if this is first message (CRITICAL: First message bypasses retriever)
    // Note: Field extraction already done above (Step 1.4)
    const outboundCount = conversation.messages.filter(
      (m: any) => m.direction === "OUTBOUND",
    ).length;
    const isFirstMessage = outboundCount === 0;
    
    // CRITICAL FIX: First message ALWAYS gets a reply - bypass retriever/training checks
    // This ensures first inbound message never gets blocked by training document checks
    if (isFirstMessage) {
      console.log(
        `[ORCHESTRATOR] First message detected - bypassing retriever/training checks`,
      );
    }
    
    // Step 3: Try rule engine first (deterministic, no LLM)
    try {
      // Load conversation memory
      const { loadConversationMemory } = await import("./ruleEngine");
      const memory = await loadConversationMemory(input.conversationId);
      
      const ruleEngineResult = await executeRuleEngine({
        conversationId: input.conversationId,
        leadId: lead.id,
        contactId: lead.contact.id,
        currentMessage: input.inboundText,
        conversationHistory: conversation.messages.map((m: any) => ({
          direction: m.direction,
          body: m.body || "",
          createdAt: m.createdAt,
        })),
        isFirstMessage,
        memory,
      });
      
      // CRITICAL FIX C: Handle structured rule engine output
      if (ruleEngineResult.kind === "QUESTION") {
        console.log(
          `[ORCHESTRATOR] Rule engine generated QUESTION: ${ruleEngineResult.questionKey}`,
        );
        
        // Step 3.1: HARD BAN - Check if questionKey is banned (NOT substring matching)
        if (BANNED_QUESTION_KEYS.has(ruleEngineResult.questionKey)) {
          console.error(
            `[ORCHESTRATOR] BANNED QUESTION KEY: ${ruleEngineResult.questionKey} - blocking`,
          );
          // Fall through to LLM or next allowed question
        } else {
          // Step 3.2: Check no-repeat guard (prevent asking same questionKey in last 3 outbound)
          const wasAsked = wasQuestionAsked(
            conversationState,
            ruleEngineResult.questionKey,
          );
          if (wasAsked) {
            console.log(
              `[ORCHESTRATOR] Question ${ruleEngineResult.questionKey} was asked recently - skipping`,
            );
            // Fall through to LLM
          } else {
            // Record question asked
            const { recordQuestionAsked } =
              await import("../conversation/flowState");
            await recordQuestionAsked(
              input.conversationId,
              ruleEngineResult.questionKey,
              `WAIT_${ruleEngineResult.questionKey}`,
            );
            
            // Increment question count
            const newQuestionsCount = conversationState.questionsAskedCount + 1;
            await updateConversationState(
              input.conversationId,
              {
                questionsAskedCount: newQuestionsCount,
                lastQuestionKey: ruleEngineResult.questionKey,
                knownFields: updatedKnownFields,
              },
              expectedStateVersion,
            );
            
            // Validate with strictQualification
            const validation = await validateQualificationRules(
              input.conversationId,
              ruleEngineResult.text,
            );
            
            if (validation.isValid && validation.sanitizedReply) {
              return {
                replyText: validation.sanitizedReply,
                extractedFields: extractFieldsFromReply(
                  ruleEngineResult.text,
                  input.inboundText,
                ),
                confidence: 90, // High confidence for rule engine
                nextStepKey: ruleEngineResult.questionKey,
                tasksToCreate: [],
                shouldEscalate: false,
              };
            }
          }
        }
      } else if (
        ruleEngineResult.kind === "REPLY" &&
        !ruleEngineResult.needsHuman
      ) {
        console.log(
          `[ORCHESTRATOR] Rule engine generated REPLY (deterministic)`,
        );
        
        // CRITICAL FIX C: For REPLY kind, banned question keys don't apply (only for QUESTION kind)
        // Validate with strictQualification
        const validation = await validateQualificationRules(
          input.conversationId,
          ruleEngineResult.text,
        );
        
        if (validation.isValid && validation.sanitizedReply) {
          // Update known fields
          await updateConversationState(
            input.conversationId,
            {
              knownFields: updatedKnownFields,
            },
            expectedStateVersion,
          );
          
          return {
            replyText: validation.sanitizedReply,
            extractedFields: extractFieldsFromReply(
              ruleEngineResult.text,
              input.inboundText,
            ),
            confidence: 90, // High confidence for rule engine
            nextStepKey: undefined,
            tasksToCreate: [],
            shouldEscalate: false,
          };
        }
      } else if (
        ruleEngineResult.kind === "REPLY" &&
        ruleEngineResult.needsHuman
      ) {
        console.log(
          `[ORCHESTRATOR] Rule engine escalated to human: ${ruleEngineResult.handoverReason}`,
        );
        // Fall through to LLM or return escalation
      } else if (ruleEngineResult.kind === "NO_MATCH") {
        console.log(
          `[ORCHESTRATOR] Rule engine no match - falling back to LLM`,
        );
        // Fall through to LLM
      }
    } catch (ruleEngineError: any) {
      console.warn(
        `[ORCHESTRATOR] Rule engine failed, falling back to LLM:`,
        ruleEngineError.message,
      );
    }
    
    // CRITICAL FIX 4: Determine reply language from conversation or agent profile
    let replyLanguage: "en" | "ar" = input.language || "en";
    if (!replyLanguage && (conversation as any).language) {
      // Use detected conversation language
      replyLanguage = (conversation as any).language === "ar" ? "ar" : "en";
    } else if (!replyLanguage && lead.aiAgentProfile?.defaultLanguage) {
      // Fall back to agent profile default language
      replyLanguage =
        lead.aiAgentProfile.defaultLanguage === "ar" ? "ar" : "en";
    } else if (!replyLanguage && lead.aiAgentProfile?.autoDetectLanguage) {
      // If auto-detect enabled but no language detected, try to detect from inbound text
      try {
        const { detectLanguage } = await import("./detectLanguage");
        const detected = await detectLanguage(input.inboundText);
        replyLanguage = detected === "ar" ? "ar" : "en";
        console.log(
          `🌐 [ORCHESTRATOR] Auto-detected language: ${detected} -> ${replyLanguage}`,
        );
      } catch (error: any) {
        console.warn(
          `⚠️ [ORCHESTRATOR] Language detection failed:`,
          error.message,
        );
      }
    }
    
    // Step 4: Build system prompt from rules + training
    // NOTE: For first messages, we still build the prompt but don't block if training is missing
    const systemPrompt = await buildSystemPrompt(
      input.agentProfileId || lead.aiAgentProfileId || undefined,
      replyLanguage, // CRITICAL FIX 4: Use determined language
    );
    
    // Step 4: Build conversation context
    const recentMessages = conversation.messages
      .slice()
      .reverse()
      .map(
        (m: any) =>
          `${m.direction === "INBOUND" ? "User" : "Assistant"}: ${m.body || ""}`,
      )
      .join("\n");
    
    const userPrompt = `Conversation context:
${recentMessages}

Current user message: ${input.inboundText}

Lead information:
- Service: ${lead.serviceType?.name || lead.serviceTypeEnum || updatedKnownFields.service || "Not specified"}
- Contact: ${updatedKnownFields.name || lead.contact.fullName || "Unknown"}
- Nationality: ${updatedKnownFields.nationality || lead.contact.nationality || "Not specified"}

Generate a short, helpful reply that:
1. Answers the user's question or asks ONE clarifying question
2. Follows all rules from training documents
3. Does NOT promise approvals or guarantees
4. Does NOT ask location questions for business setup
5. Keeps it under 300 characters

Reply:`;
    
    // Step 5: Call LLM
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    
    const llmResult = await generateCompletion(messages, {
      temperature: 0.7,
      maxTokens: 300,
    });
    
    let replyText = llmResult.text.trim();
    
    // Step 6: Validate with strictQualification
    const validation = await validateQualificationRules(
      input.conversationId,
      replyText,
    );
    
    if (!validation.isValid) {
      console.warn(
        `[ORCHESTRATOR] LLM output failed validation: ${validation.error}`,
      );
      
      if (validation.sanitizedReply) {
        replyText = validation.sanitizedReply;
      } else {
        // Use fallback
        replyText = `Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation.`;
      }
    }
    
    // Step 7: Extract fields
    const extractedFields = extractFieldsFromReply(
      replyText,
      input.inboundText,
    );
    
    // Step 8: Check for duplicate outbound (deduplication guard)
    const normalizedReply = replyText.trim().toLowerCase().replace(/\s+/g, " ");
    const replyHash = createHash("sha256")
      .update(`${input.conversationId}:${normalizedReply}`)
      .digest("hex");
    
    // Check if same reply was sent in last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentDuplicate = await prisma.message.findFirst({
      where: {
        conversationId: input.conversationId,
        direction: "OUTBOUND",
        createdAt: { gte: tenMinutesAgo },
        body: {
          equals: replyText,
          mode: "insensitive",
        },
      },
    });
    
    if (recentDuplicate) {
      console.warn(
        `[ORCHESTRATOR] Duplicate outbound detected - skipping send`,
      );
      return {
        replyText: "", // Empty reply = don't send
        extractedFields,
        confidence: 0,
        nextStepKey: undefined,
        tasksToCreate: [],
        shouldEscalate: false,
        handoverReason: "Duplicate outbound message detected",
      };
    }
    
    // Step 9: Update conversation state (update known fields, but don't increment question count for LLM replies)
    // LLM replies are less deterministic, so we only update known fields
    await updateConversationState(
      input.conversationId,
      {
        knownFields: updatedKnownFields,
      },
      expectedStateVersion,
    );
    
    // Step 10: Determine confidence and tasks
    const confidence = validation.isValid ? 75 : 50; // Lower confidence if validation failed
    const tasksToCreate: OrchestratorOutput["tasksToCreate"] = [];
    
    // Create task if validation failed
    if (!validation.isValid && validation.error) {
      tasksToCreate.push({
        type: "QUALIFICATION",
        title: `AI reply validation failed: ${validation.error}`,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
    }
    
    // CRITICAL FIX 2: Sanitize reply text to prevent JSON from being sent
    const { sanitizeReplyText } = await import("./sanitizeReplyText");
    const sanitized = sanitizeReplyText(replyText);
    if (sanitized.wasJson) {
      console.warn(
        `[ORCHESTRATOR] Sanitized JSON reply: ${replyText.substring(0, 100)} -> ${sanitized.text.substring(0, 100)}`,
      );
    }
    
    return {
      replyText: sanitized.text,
      extractedFields,
      confidence,
      nextStepKey: undefined,
      tasksToCreate,
      shouldEscalate: false,
      handoverReason: validation.isValid ? undefined : validation.error,
    };
  } catch (error: any) {
    console.error(`[ORCHESTRATOR] Error generating reply:`, error);
    
    // Fallback deterministic message
    return {
      replyText: `Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation.`,
      extractedFields: {},
      confidence: 0,
      tasksToCreate: [
        {
          type: "QUALIFICATION",
        title: `AI orchestrator error: ${error.message}`,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ],
      shouldEscalate: true,
      handoverReason: error.message,
    };
  }
}

/**
 * SEND AI REPLY - SINGLE ENTRY POINT FOR ALL AI OUTBOUND MESSAGES
 *
 * This function MUST be used for all AI-generated outbound messages.
 * It provides:
 * - Idempotency (hard guarantee: same inboundMessageId + aiActionType = at most one outbound)
 * - Per-conversation locking (prevents concurrent processing)
 * - State gating (conversation.aiState progression)
 * - DB-level deduplication (unique constraint on idempotencyKey)
 *
 * @param input - Orchestrator input (conversationId, inboundMessageId, etc.)
 * @param aiActionType - Type of AI action: 'auto_reply' | 'question' | 'handoff' | etc.
 * @returns Result with success flag and messageId if sent
 */
export async function sendAiReply(
  input: OrchestratorInput,
  aiActionType: string = "auto_reply",
): Promise<{
  success: boolean;
  messageId?: string;
  wasDuplicate?: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}> {
  const { conversationId, inboundMessageId } = input;

  // Step 0: Get inbound message to extract providerMessageId
  const inboundMessage = await prisma.message.findUnique({
    where: { id: inboundMessageId },
    select: { providerMessageId: true },
  });
  const inboundProviderMessageId = inboundMessage?.providerMessageId || null;

  // Step 1: Build idempotency key (use providerMessageId if available)
  const idempotencyKey = buildIdempotencyKey(
    conversationId,
    inboundMessageId,
    aiActionType,
    inboundProviderMessageId,
  );

  // Step 1.5: Check OutboundMessageDedup (provider-level deduplication)
  const dedupeKey = inboundProviderMessageId 
    ? `auto:${conversationId}:${inboundProviderMessageId}`
    : null;
  
  if (dedupeKey) {
    const existingDedup = await prisma.outboundMessageDedup.findUnique({
      where: { dedupeKey },
      select: { status: true, providerMessageId: true },
    });
    
    if (existingDedup) {
      if (existingDedup.status === "SENT") {
        console.log(
          `[ORCHESTRATOR] AI_OUTBOUND_BLOCKED_DUPLICATE conversationId=${conversationId} inboundProviderMessageId=${inboundProviderMessageId} dedupeKey=${dedupeKey.substring(0, 32)}...`,
        );
        return {
          success: true,
          wasDuplicate: true,
          messageId: existingDedup.providerMessageId || undefined,
          skipped: true,
          skipReason: "Already sent (OutboundMessageDedup)",
        };
      } else if (existingDedup.status === "PENDING") {
        console.log(
          `[ORCHESTRATOR] AI_OUTBOUND_BLOCKED_DUPLICATE conversationId=${conversationId} inboundProviderMessageId=${inboundProviderMessageId} dedupeKey=${dedupeKey.substring(0, 32)}... (PENDING)`,
        );
        return {
          success: false,
          wasDuplicate: true,
          skipped: true,
          skipReason: "Already processing (OutboundMessageDedup PENDING)",
        };
      }
    }
  }

  // Step 1.6: Check cooldown (90 seconds - AI-only throttling)
  // NOTE: This cooldown ONLY applies to AI auto-replies, not human-sent messages
  // Human messages go through different endpoints (e.g., /api/inbox/conversations/[id]/messages)
  // and do NOT call sendAiReply(), so they are not affected by this cooldown.
  let conversation: { lastAiOutboundAt: Date | null; lastProcessedInboundMessageId?: string | null } | null = null;
  try {
    conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { lastAiOutboundAt: true, lastProcessedInboundMessageId: true },
    });
  } catch (error: any) {
    // Gracefully handle missing lastProcessedInboundMessageId column
    if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
      console.warn('[DB] lastProcessedInboundMessageId column not found, querying without it (this is OK if migration not yet applied)');
      try {
        conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { lastAiOutboundAt: true },
        });
      } catch (retryError: any) {
        console.error('[DB] Failed to query conversation:', retryError);
        throw retryError;
      }
    } else {
      throw error;
    }
  }

  // CRITICAL FIX: Check inbound message idempotency (prevent duplicate webhook processing)
  // Only check if column exists (migration applied)
  if (inboundProviderMessageId && conversation && 'lastProcessedInboundMessageId' in conversation && conversation.lastProcessedInboundMessageId === inboundProviderMessageId) {
    console.log(
      `[ORCHESTRATOR] AI_OUTBOUND_BLOCKED_IDEMPOTENCY conversationId=${conversationId} inboundProviderMessageId=${inboundProviderMessageId} (already processed)`,
    );
    return {
      success: false,
      skipped: true,
      skipReason: "Inbound message already processed (idempotency)",
    };
  }

  if (conversation?.lastAiOutboundAt) {
    const cooldownSeconds = 90; // 90 seconds cooldown (60-120s range as per documentation)
    const cooldownMs = cooldownSeconds * 1000;
    const timeSinceLastOutbound = Date.now() - conversation.lastAiOutboundAt.getTime();
    
    if (timeSinceLastOutbound < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastOutbound) / 1000);
      console.log(
        `[ORCHESTRATOR] AI_OUTBOUND_BLOCKED_COOLDOWN conversationId=${conversationId} inboundProviderMessageId=${inboundProviderMessageId} remainingSeconds=${remainingSeconds}`,
      );
      return {
        success: false,
        skipped: true,
        skipReason: `Cooldown active (${remainingSeconds}s remaining)`,
      };
    }
  }

  console.log(
    `[ORCHESTRATOR] sendAiReply ENTRY`,
    JSON.stringify({
      conversationId,
      inboundMessageId,
      inboundProviderMessageId,
      aiActionType,
      idempotencyKey: idempotencyKey.substring(0, 32) + "...",
      dedupeKey: dedupeKey?.substring(0, 32) + "..." || null,
    }),
  );

  // Step 2: Check idempotency (DB-level check)
  const idempotencyCheck = await checkIdempotency(idempotencyKey);
  if (idempotencyCheck.exists) {
    const record = idempotencyCheck.record!;
    if (record.status === "SENT") {
      console.log(
        `[ORCHESTRATOR] AI_DEDUP_HIT - already sent idempotencyKey=${idempotencyKey.substring(0, 32)}...`,
      );
      return {
        success: true,
        wasDuplicate: true,
        messageId: record.providerMessageId || undefined,
        skipped: true,
        skipReason: "Already sent (idempotency)",
      };
    } else if (record.status === "PENDING") {
      // Another process is handling this - skip
      console.log(
        `[ORCHESTRATOR] AI_DEDUP_HIT - pending idempotencyKey=${idempotencyKey.substring(0, 32)}...`,
      );
      return {
        success: false,
        wasDuplicate: true,
        skipped: true,
        skipReason: "Already processing (idempotency)",
      };
    }
  }

  // Step 3: Acquire per-conversation lock
  const lockAcquired = await acquireConversationLock(conversationId, 30);
  if (!lockAcquired) {
    console.log(`[ORCHESTRATOR] AI_LOCKED_SKIP conversation ${conversationId}`);
    return {
      success: false,
      skipped: true,
      skipReason: "Conversation locked (concurrent processing)",
    };
  }

  let idempotencyRecordId: number | undefined = undefined;

  try {
    // Step 4: Create idempotency record BEFORE generating/sending (DB-level protection)
    const recordResult = await createIdempotencyRecord(
      conversationId,
      inboundMessageId,
      aiActionType,
      idempotencyKey,
    );

    if (!recordResult.success) {
      // Duplicate detected by DB constraint
      await releaseConversationLock(conversationId);
      return {
        success: false,
        wasDuplicate: true,
        skipped: true,
        skipReason: "Duplicate (DB constraint)",
      };
    }

    idempotencyRecordId = recordResult.recordId;

    // Step 5: Generate AI reply
    const orchestratorResult = await generateAIReply(input);

    // Step 5.5: Combine multiple segments into ONE message (ONE MESSAGE POLICY)
    let finalReplyText = buildSingleAutoReplyText(orchestratorResult.replyText);

    // Step 6: Check if reply is empty (deduplication or stop)
    if (!finalReplyText || finalReplyText.trim().length === 0) {
      await updateIdempotencyRecord(
        idempotencyRecordId!,
        "FAILED",
        undefined,
        undefined,
        orchestratorResult.handoverReason || "Empty reply",
      );
      await releaseConversationLock(conversationId);
      return {
        success: false,
        skipped: true,
        skipReason: orchestratorResult.handoverReason || "Empty reply",
      };
    }

    // Step 7: Load conversation and contact for sending
    let conversation
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          contact: true,
          lead: true,
        },
      });
    } catch (error: any) {
      // Gracefully handle missing lastProcessedInboundMessageId column
      if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('[DB] lastProcessedInboundMessageId column not found, querying with select (this is OK if migration not yet applied)')
        // Use select to explicitly exclude the problematic column
        conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            contactId: true,
            leadId: true,
            channel: true,
            status: true,
            lastMessageAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            unreadCount: true,
            priorityScore: true,
            createdAt: true,
            updatedAt: true,
            aiState: true,
            aiLockUntil: true,
            lastAiOutboundAt: true,
            ruleEngineMemory: true,
            deletedAt: true,
            contact: true,
            lead: true,
          },
        }) as any
      } else {
        throw error
      }
    }

    if (!conversation || !conversation.contact) {
      throw new Error(`Conversation ${conversationId} or contact not found`);
    }

    // For Instagram, phone is stored as "ig:USER_ID", which is valid
    // For WhatsApp, phone is a regular phone number
    const phone =
      conversation.contact.phoneNormalized || conversation.contact.phone;
    if (!phone) {
      throw new Error(`Contact ${conversation.contact.id} has no phone number or Instagram ID`);
    }
    
    // Step 7.5: Map conversation channel to provider format
    // Support both lowercase and uppercase channel names
    const channelToProvider: Record<string, 'whatsapp' | 'email' | 'instagram' | 'facebook'> = {
      'whatsapp': 'whatsapp',
      'email': 'email',
      'instagram': 'instagram',
      'facebook': 'facebook',
      // Also support uppercase variants
      'WHATSAPP': 'whatsapp',
      'EMAIL': 'email',
      'INSTAGRAM': 'instagram',
      'FACEBOOK': 'facebook',
    }
    
    const normalizedChannel = conversation.channel?.toLowerCase() || 'whatsapp'
    const provider = channelToProvider[normalizedChannel] || channelToProvider[conversation.channel || ''] || 'whatsapp'
    
    // SAFETY CHECK: Never fall back to WhatsApp for Instagram conversations
    if (normalizedChannel === 'instagram' && provider !== 'instagram') {
      throw new Error(`[ORCHESTRATOR] SAFETY CHECK FAILED: Instagram conversation mapped to ${provider} instead of instagram. This should never happen.`)
    }
    
    // Log phone/ID for debugging
    if (provider === 'instagram') {
      console.log(`[ORCHESTRATOR] Instagram inbound → orchestrator`, {
        conversationId: conversationId,
        instagramContactId: phone,
        leadId: conversation.leadId,
      })
      console.log(`[ORCHESTRATOR] Instagram contact ID: ${phone} (conversationId: ${conversationId})`)
    }
    
    console.log(`[ORCHESTRATOR] Channel mapping:`, {
      originalChannel: conversation.channel,
      normalizedChannel,
      mappedProvider: provider,
      conversationId: conversationId,
      contactId: conversation.contact.id,
      leadId: conversation.leadId,
    })

    // Step 7.5: Create OutboundMessageDedup record BEFORE sending (atomic protection)
    let outboundDedupId: number | undefined = undefined;
    if (dedupeKey) {
      try {
        const dedupRecord = await prisma.outboundMessageDedup.create({
          data: {
            conversationId,
            inboundProviderMessageId,
            dedupeKey,
            status: "PENDING",
          },
        });
        outboundDedupId = dedupRecord.id;
      } catch (error: any) {
        // Unique constraint violation = duplicate
        if (error.code === "P2002") {
          await releaseConversationLock(conversationId);
          console.log(
            `[ORCHESTRATOR] AI_OUTBOUND_BLOCKED_DUPLICATE conversationId=${conversationId} inboundProviderMessageId=${inboundProviderMessageId} dedupeKey=${dedupeKey.substring(0, 32)}... (DB constraint)`,
          );
          return {
            success: false,
            wasDuplicate: true,
            skipped: true,
            skipReason: "Duplicate (OutboundMessageDedup DB constraint)",
          };
        }
        throw error;
      }
    }

    // Step 8: Send via sendOutboundWithIdempotency (this has its own idempotency layer)
    const { sendOutboundWithIdempotency } =
      await import("@/lib/outbound/sendWithIdempotency");

    const sendResult = await sendOutboundWithIdempotency({
      conversationId,
      contactId: conversation.contact.id,
      leadId: conversation.leadId || null,
      phone,
      text: finalReplyText, // Use combined single message
      provider, // Use actual channel instead of hardcoded "whatsapp"
      triggerProviderMessageId: inboundProviderMessageId,
      replyType: orchestratorResult.nextStepKey ? "question" : "answer",
      lastQuestionKey: orchestratorResult.nextStepKey || null,
      flowStep: null,
    });

    // Step 9: Update idempotency records and conversation
    if (sendResult.success && sendResult.messageId) {
      // Update AiReplyDedup
      await updateIdempotencyRecord(
        idempotencyRecordId!,
        "SENT",
        undefined, // outboundMessageId will be found via providerMessageId
        sendResult.messageId,
      );

      // Update OutboundMessageDedup
      if (outboundDedupId) {
        await prisma.outboundMessageDedup.update({
          where: { id: outboundDedupId },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerMessageId: sendResult.messageId,
          },
        });
      }

      // Update conversation: lastAiOutboundAt (for cooldown), lastProcessedInboundMessageId (for idempotency), and aiState
      // Gracefully handle missing lastProcessedInboundMessageId column
      const updateData: any = {
        lastAiOutboundAt: new Date(),
        ...(orchestratorResult.nextStepKey && {
          aiState: `WAITING_FOR_${orchestratorResult.nextStepKey}`,
        }),
      };
      
      // Only include lastProcessedInboundMessageId if column exists (try-catch will handle if it doesn't)
      if (inboundProviderMessageId) {
        updateData.lastProcessedInboundMessageId = inboundProviderMessageId;
      }
      
      try {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: updateData,
        });
      } catch (error: any) {
        // If lastProcessedInboundMessageId column doesn't exist, retry without it
        if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
          console.warn('[DB] lastProcessedInboundMessageId column not found, updating without it (this is OK if migration not yet applied)');
          const fallbackData: any = {
            lastAiOutboundAt: new Date(),
            ...(orchestratorResult.nextStepKey && {
              aiState: `WAITING_FOR_${orchestratorResult.nextStepKey}`,
            }),
          };
          await prisma.conversation.update({
            where: { id: conversationId },
            data: fallbackData,
          });
        } else {
          throw error;
        }
      }

      console.log(
        `[ORCHESTRATOR] AI_OUTBOUND_SENT conversationId=${conversationId} inboundProviderMessageId=${inboundProviderMessageId} dedupeKey=${dedupeKey?.substring(0, 32) || 'N/A'}... messageId=${sendResult.messageId}`,
      );

      await releaseConversationLock(conversationId);
      return {
        success: true,
        messageId: sendResult.messageId,
      };
    } else {
      // Update both dedup records to FAILED
      await updateIdempotencyRecord(
        idempotencyRecordId!,
        "FAILED",
        undefined,
        undefined,
        sendResult.error || "Send failed",
      );
      
      if (outboundDedupId) {
        await prisma.outboundMessageDedup.update({
          where: { id: outboundDedupId },
          data: {
            status: "FAILED",
            lastError: sendResult.error || "Send failed",
          },
        });
      }
      await releaseConversationLock(conversationId);
      return {
        success: false,
        error: sendResult.error || "Send failed",
      };
    }
  } catch (error: any) {
    console.error(`[ORCHESTRATOR] sendAiReply error:`, error);

    // CRITICAL: Release lock in catch block to prevent conversation from being locked forever
    await releaseConversationLock(conversationId);

    // Update idempotency record on error
    if (idempotencyRecordId) {
      await updateIdempotencyRecord(
        idempotencyRecordId,
        "FAILED",
        undefined,
        undefined,
        error.message || "Unknown error",
      );
    }

    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}

/**
 * Send WhatsApp template message via Orchestrator
 * Checks idempotency BEFORE sending
 *
 * @param input - Template sending input
 * @returns Send result with messageId or error
 */
export async function sendTemplate(input: {
  conversationId: number;
  leadId: number;
  contactId: number;
  phone: string;
  templateName: string;
  templateParams: string[];
  language?: string;
  idempotencyKey: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  wasDuplicate?: boolean;
  error?: string;
}> {
  const {
    conversationId,
    leadId,
    contactId,
    phone,
    templateName,
    templateParams,
    language = "en_US",
    idempotencyKey,
  } = input;

  console.log(
    `[ORCHESTRATOR] sendTemplate ENTRY`,
    JSON.stringify({
      conversationId,
      templateName,
      idempotencyKey: idempotencyKey.substring(0, 32) + "...",
    }),
  );

  // Step 1: Check idempotency via RenewalNotification (if key starts with 'renewal:')
  // For renewal templates, use RenewalNotification table
  if (idempotencyKey.startsWith("renewal:")) {
    const existingNotification = await prisma.renewalNotification.findUnique({
      where: { idempotencyKey },
    });

    if (existingNotification) {
      if (
        existingNotification.status === "SENT" &&
        existingNotification.messageId
      ) {
        console.log(
          `[ORCHESTRATOR] sendTemplate DUPLICATE - already sent messageId=${existingNotification.messageId}`,
        );
        return {
          success: true,
          messageId: existingNotification.messageId,
          wasDuplicate: true,
        };
      }
      // If status is PENDING, another process is handling this
      if (existingNotification.status === "PENDING") {
        console.log(
          `[ORCHESTRATOR] sendTemplate DUPLICATE - already processing (PENDING)`,
        );
        return {
          success: false,
          wasDuplicate: true,
          error: 'Already processing (PENDING)',
        };
      }
      // If status is FAILED, we can retry (caller will update the record)
    }
  } else {
    // For non-renewal templates, use AiReplyDedup
    const idempotencyCheck = await checkIdempotency(idempotencyKey);
    if (idempotencyCheck.exists) {
      const record = idempotencyCheck.record!;
      if (record.status === "SENT" && record.providerMessageId) {
        console.log(
          `[ORCHESTRATOR] sendTemplate DUPLICATE - already sent messageId=${record.providerMessageId}`,
        );
        return {
          success: true,
          messageId: record.providerMessageId,
          wasDuplicate: true,
        };
      }
    }
  }

  try {
    // Step 3: Send template message
    const { sendTemplateMessage } = await import("@/lib/whatsapp");
    const sendResult = await sendTemplateMessage(
      phone,
      templateName,
      language,
      templateParams,
    );

    // Step 4: Update idempotency record with success
    // For renewal notifications, the record is created/updated by the caller (processReminders.ts)
    // We just return success - caller will update RenewalNotification record
    if (idempotencyKey.startsWith("renewal:")) {
      // Renewal notification record is managed by processReminders.ts
      // Just log success
      console.log(
        `[ORCHESTRATOR] sendTemplate SUCCESS - renewal notification managed by caller`,
      );
    } else {
      // For non-renewal templates, update AiReplyDedup if we have a record
      // (This is a simplified path - full implementation would create/update AiReplyDedup)
      console.log(
        `[ORCHESTRATOR] sendTemplate SUCCESS - idempotency handled by caller`,
      );
    }

    // Step 5: Create message record in database
    try {
      await prisma.message.create({
        data: {
          conversationId,
          leadId,
          contactId,
          direction: "OUTBOUND",
          channel: "whatsapp",
          type: "text",
          body: `Template: ${templateName}`,
          providerMessageId: sendResult.messageId,
          status: "SENT",
          sentAt: new Date(),
          payload: JSON.stringify({
            templateName,
            templateParams,
            language,
          }),
        },
      });
    } catch (msgError: any) {
      // Non-blocking - message was sent, just DB record failed
      console.warn(
        `[ORCHESTRATOR] Failed to create message record:`,
        msgError.message,
      );
    }

    console.log(
      `[ORCHESTRATOR] sendTemplate SUCCESS messageId=${sendResult.messageId}`,
    );
    return {
      success: true,
      messageId: sendResult.messageId,
      wasDuplicate: false,
    };
  } catch (error: any) {
    console.error(`[ORCHESTRATOR] sendTemplate error:`, error);

    // Error handling - renewal notifications handle their own error records
    // For non-renewal templates, error is returned to caller
    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}
