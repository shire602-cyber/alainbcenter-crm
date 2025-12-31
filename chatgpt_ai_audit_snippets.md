# ChatGPT AI Training & Autopilot Audit Snippets

> Generated: 2025-12-31T07:04:43Z


## src/lib/ai/orchestrator.ts (requested 195-726, actual 195-726, total 727)

```ts
   195	export async function generateAIReply(
   196	  input: OrchestratorInput
   197	): Promise<OrchestratorOutput> {
   198	  // DIAGNOSTIC LOG: orchestrator entry
   199	  console.log(`[ORCHESTRATOR] ENTRY`, JSON.stringify({
   200	    conversationId: input.conversationId,
   201	    leadId: input.leadId,
   202	    contactId: input.contactId,
   203	    channel: input.channel,
   204	    inboundMessageId: input.inboundMessageId,
   205	    inboundTextLength: input.inboundText.length,
   206	  }))
   207	  
   208	  try {
   209	    // Step 0: Load conversation state (with optimistic locking)
   210	    const conversationState = await loadConversationState(input.conversationId)
   211	    const expectedStateVersion = conversationState.stateVersion // Use actual state version for optimistic locking
   212	    
   213	    // DIAGNOSTIC LOG: state loaded
   214	    console.log(`[ORCHESTRATOR] STATE-LOADED`, JSON.stringify({
   215	      conversationId: input.conversationId,
   216	      stateVersion: expectedStateVersion,
   217	      qualificationStage: conversationState.qualificationStage,
   218	      questionsAskedCount: conversationState.questionsAskedCount,
   219	      lastQuestionKey: conversationState.lastQuestionKey,
   220	      serviceKey: conversationState.serviceKey,
   221	      knownFields: Object.keys(conversationState.knownFields),
   222	    }))
   223	    
   224	    // Step 1: Load conversation and lead context
   225	    const conversation = await prisma.conversation.findUnique({
   226	      where: { id: input.conversationId },
   227	      include: {
   228	        lead: {
   229	          include: {
   230	            contact: true,
   231	            serviceType: true,
   232	          },
   233	        },
   234	        messages: {
   235	          orderBy: { createdAt: 'desc' },
   236	          take: 10, // Last 10 messages for context
   237	        },
   238	      },
   239	    })
   240	    
   241	    if (!conversation) {
   242	      throw new Error(`Conversation ${input.conversationId} not found`)
   243	    }
   244	    
   245	    const lead = conversation.lead
   246	    if (!lead) {
   247	      throw new Error(`Lead not found for conversation ${input.conversationId}`)
   248	    }
   249	    
   250	    // Step 1.5: Check question budget (max 6 questions)
   251	    if (conversationState.questionsAskedCount >= 6) {
   252	      console.log(`[ORCHESTRATOR] Question budget reached (${conversationState.questionsAskedCount} questions) - triggering handoff`)
   253	      
   254	      // Check if handoff was already triggered
   255	      const handoffTriggered = conversationState.knownFields.handoffTriggeredAt
   256	      if (!handoffTriggered) {
   257	        // Send handoff message (greeting will be added globally)
   258	        const handoffMessage = `Perfect ✅ I have enough to proceed.
   259	Please share your email for the quotation and the best time for our consultant to call you (today or tomorrow).`
   260	        
   261	        // Mark handoff as triggered
   262	        await updateConversationState(
   263	          input.conversationId,
   264	          {
   265	            knownFields: {
   266	              ...conversationState.knownFields,
   267	              handoffTriggeredAt: new Date().toISOString(),
   268	            },
   269	          },
   270	          expectedStateVersion
   271	        )
   272	        
   273	        return {
   274	          replyText: handoffMessage,
   275	          extractedFields: {},
   276	          confidence: 100,
   277	          nextStepKey: 'HANDOFF',
   278	          tasksToCreate: [{
   279	            type: 'FOLLOW_UP',
   280	            title: 'Follow up with customer for email and call time',
   281	            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
   282	          }],
   283	          shouldEscalate: false,
   284	        }
   285	      } else {
   286	        // Handoff already triggered - don't send again
   287	        return {
   288	          replyText: '',
   289	          extractedFields: {},
   290	          confidence: 0,
   291	          tasksToCreate: [],
   292	          shouldEscalate: true,
   293	          handoverReason: 'Question budget exceeded, waiting for customer response',
   294	        }
   295	      }
   296	    }
   297	    
   298	    // Step 1.6: Check for qualification complete (name + service + nationality)
   299	    const hasCoreQualification = 
   300	      conversationState.knownFields.name && 
   301	      conversationState.knownFields.service && 
   302	      conversationState.knownFields.nationality
   303	    
   304	    if (hasCoreQualification && !conversationState.knownFields.qualificationConfirmedAt) {
   305	      // Check if we already sent confirmation
   306	      const confirmationSent = conversation.messages.some(m => 
   307	        m.direction === 'OUTBOUND' && 
   308	        (m.body || '').includes('Perfect') && 
   309	        (m.body || '').includes('Noted:')
   310	      )
   311	      
   312	      if (!confirmationSent) {
   313	        const name = conversationState.knownFields.name || lead.contact.fullName || 'there'
   314	        const service = conversationState.knownFields.service || lead.serviceType?.name || 'service'
   315	        const nationality = conversationState.knownFields.nationality || lead.contact.nationality || 'nationality'
   316	        
   317	        // Confirmation message (greeting will be added globally)
   318	        const confirmationMessage = `Perfect, ${name}! ✅ I've noted:
   319	• Service: ${service}
   320	• Nationality: ${nationality}
   321	
   322	Please share your email so I can send you the quotation,
   323	and let me know the best time for our consultant to call you.`
   324	        
   325	        // Mark confirmation as sent
   326	        await updateConversationState(
   327	          input.conversationId,
   328	          {
   329	            knownFields: {
   330	              ...conversationState.knownFields,
   331	              qualificationConfirmedAt: new Date().toISOString(),
   332	            },
   333	          },
   334	          expectedStateVersion
   335	        )
   336	        
   337	        return {
   338	          replyText: confirmationMessage,
   339	          extractedFields: {
   340	            name: conversationState.knownFields.name,
   341	            service: conversationState.knownFields.service,
   342	            nationality: conversationState.knownFields.nationality,
   343	          },
   344	          confidence: 100,
   345	          nextStepKey: 'QUALIFICATION_COMPLETE',
   346	          tasksToCreate: [],
   347	          shouldEscalate: false,
   348	        }
   349	      }
   350	    }
   351	    
   352	    // Step 1.7: STAGE 1 QUALIFICATION GATE
   353	    // 2) FIX CONVERSATION UX ORDER
   354	    // Priority order: 1) service, 2) name, 3) nationality
   355	    // First question should be ONLY: "How can I help you today?" (service)
   356	    // After user answers with service intent: Ask for name, then nationality
   357	    // Remove any remaining path that asks name before service, unless the user already clearly stated service in their first message.
   358	    
   359	    const hasCoreQualificationCheck = 
   360	      conversationState.knownFields.name && 
   361	      conversationState.knownFields.service && 
   362	      conversationState.knownFields.nationality
   363	    
   364	    // If Stage 1 not complete, enforce strict gate with NEW priority order
   365	    if (!hasCoreQualificationCheck) {
   366	      // Determine which core field to ask for (NEW priority order: service first)
   367	      let nextCoreQuestion: { questionKey: string; question: string } | null = null
   368	      
   369	      // 1) SERVICE FIRST (unless user already stated service in first message)
   370	      if (!conversationState.knownFields.service) {
   371	        // First question: "How can I help you today?" (no service list, no examples)
   372	        nextCoreQuestion = {
   373	          questionKey: 'ASK_SERVICE',
   374	          question: 'How can I help you today?',
   375	        }
   376	      } 
   377	      // 2) NAME SECOND (only after service is known)
   378	      else if (!conversationState.knownFields.name) {
   379	        nextCoreQuestion = {
   380	          questionKey: 'ASK_NAME',
   381	          question: 'May I know your full name, please?',
   382	        }
   383	      } 
   384	      // 3) NATIONALITY THIRD (only after service and name are known)
   385	      else if (!conversationState.knownFields.nationality) {
   386	        nextCoreQuestion = {
   387	          questionKey: 'ASK_NATIONALITY',
   388	          question: 'What is your nationality?',
   389	        }
   390	      }
   391	      
   392	      // If we have a core question to ask, check no-repeat guard
   393	      if (nextCoreQuestion) {
   394	        // Check if this question was asked recently
   395	        const wasAsked = wasQuestionAsked(conversationState, nextCoreQuestion.questionKey)
   396	        
   397	        if (!wasAsked && !BANNED_QUESTION_KEYS.has(nextCoreQuestion.questionKey)) {
   398	          // Record question asked
   399	          const { recordQuestionAsked } = await import('../conversation/flowState')
   400	          await recordQuestionAsked(input.conversationId, nextCoreQuestion.questionKey, `WAIT_${nextCoreQuestion.questionKey}`)
   401	          
   402	          // Increment question count
   403	          const newQuestionsCount = conversationState.questionsAskedCount + 1
   404	          await updateConversationState(
   405	            input.conversationId,
   406	            {
   407	              questionsAskedCount: newQuestionsCount,
   408	              lastQuestionKey: nextCoreQuestion.questionKey,
   409	              knownFields: conversationState.knownFields,
   410	            },
   411	            expectedStateVersion
   412	          )
   413	          
   414	          return {
   415	            replyText: nextCoreQuestion.question,
   416	            extractedFields: {},
   417	            confidence: 100,
   418	            nextStepKey: nextCoreQuestion.questionKey,
   419	            tasksToCreate: [],
   420	            shouldEscalate: false,
   421	          }
   422	        }
   423	      }
   424	    }
   425	    
   426	    // Step 1.8: Extract fields from inbound message and update state
   427	    const stateExtractedFields = extractFieldsToState(input.inboundText, conversationState)
   428	    const updatedKnownFields = {
   429	      ...conversationState.knownFields,
   430	      ...stateExtractedFields,
   431	    }
   432	    
   433	    // Detect service if not already known
   434	    if (!updatedKnownFields.service) {
   435	      const { extractService } = require('../inbound/fieldExtractors')
   436	      const detectedService = extractService(input.inboundText)
   437	      if (detectedService) {
   438	        updatedKnownFields.service = detectedService
   439	      }
   440	    }
   441	    
   442	    // Detect "cheapest" keyword
   443	    const lowerText = input.inboundText.toLowerCase()
   444	    if (lowerText.includes('cheapest') || lowerText.includes('cheap')) {
   445	      updatedKnownFields.priceSensitive = true
   446	      updatedKnownFields.recommendedOffer = 'Professional Mainland License + Investor Visa for AED 12,999'
   447	    }
   448	    
   449	    // Detect "marketing license"
   450	    if (lowerText.includes('marketing license') || lowerText.includes('marketing')) {
   451	      updatedKnownFields.businessActivity = 'Marketing License'
   452	      updatedKnownFields.customServiceLabel = 'Marketing License'
   453	    }
   454	    
   455	    // Step 2: Check if this is first message (CRITICAL: First message bypasses retriever)
   456	    const outboundCount = conversation.messages.filter(m => m.direction === 'OUTBOUND').length
   457	    const isFirstMessage = outboundCount === 0
   458	    
   459	    // CRITICAL FIX: First message ALWAYS gets a reply - bypass retriever/training checks
   460	    // This ensures first inbound message never gets blocked by training document checks
   461	    if (isFirstMessage) {
   462	      console.log(`[ORCHESTRATOR] First message detected - bypassing retriever/training checks`)
   463	    }
   464	    
   465	    // Step 3: Try rule engine first (deterministic, no LLM)
   466	    try {
   467	      // Load conversation memory
   468	      const { loadConversationMemory } = await import('./ruleEngine')
   469	      const memory = await loadConversationMemory(input.conversationId)
   470	      
   471	      const ruleEngineResult = await executeRuleEngine({
   472	        conversationId: input.conversationId,
   473	        leadId: lead.id,
   474	        contactId: lead.contact.id,
   475	        currentMessage: input.inboundText,
   476	        conversationHistory: conversation.messages.map(m => ({
   477	          direction: m.direction,
   478	          body: m.body || '',
   479	          createdAt: m.createdAt,
   480	        })),
   481	        isFirstMessage,
   482	        memory,
   483	      })
   484	      
   485	      if (ruleEngineResult.reply && !ruleEngineResult.needsHuman) {
   486	        console.log(`[ORCHESTRATOR] Rule engine generated reply (deterministic)`)
   487	        
   488	        // Step 3.1: HARD BAN - Check for banned question keys in reply
   489	        const replyLower = ruleEngineResult.reply.toLowerCase()
   490	        let isBanned = false
   491	        for (const bannedKey of BANNED_QUESTION_KEYS) {
   492	          if (replyLower.includes(bannedKey.toLowerCase()) || 
   493	              replyLower.includes('new or renew') || 
   494	              replyLower.includes('company name')) {
   495	            console.error(`[ORCHESTRATOR] BANNED QUESTION DETECTED: ${bannedKey} - blocking reply`)
   496	            isBanned = true
   497	            break
   498	          }
   499	        }
   500	        
   501	        // Step 3.2: Check if lastQuestionKey is banned
   502	        const currentQuestionKey = conversationState.lastQuestionKey
   503	        if (currentQuestionKey && BANNED_QUESTION_KEYS.has(currentQuestionKey)) {
   504	          console.error(`[ORCHESTRATOR] BANNED QUESTION KEY: ${currentQuestionKey} - skipping`)
   505	          isBanned = true
   506	        }
   507	        
   508	        // Step 3.3: Check no-repeat guard (prevent asking same questionKey in last 3 outbound)
   509	        if (!isBanned && currentQuestionKey) {
   510	          const wasAsked = wasQuestionAsked(conversationState, currentQuestionKey)
   511	          if (wasAsked) {
   512	            console.log(`[ORCHESTRATOR] Question ${currentQuestionKey} was asked recently - skipping`)
   513	            isBanned = true
   514	          }
   515	        }
   516	        
   517	        // If banned, skip this reply and fall through to LLM
   518	        if (isBanned) {
   519	          console.log(`[ORCHESTRATOR] Rule engine reply blocked - falling back to LLM`)
   520	        } else {
   521	          // Validate with strictQualification
   522	        const validation = await validateQualificationRules(
   523	          input.conversationId,
   524	          ruleEngineResult.reply
   525	        )
   526	        
   527	          if (validation.isValid && validation.sanitizedReply) {
   528	            // Reload state to check if lastQuestionKey was updated by flow state system
   529	            const stateAfterRuleEngine = await loadConversationState(input.conversationId)
   530	            const lastQuestionKeyChanged = stateAfterRuleEngine.lastQuestionKey !== conversationState.lastQuestionKey
   531	            const hasQuestionKey = stateAfterRuleEngine.lastQuestionKey && 
   532	              (stateAfterRuleEngine.lastQuestionKey.startsWith('BS_Q') || 
   533	               stateAfterRuleEngine.lastQuestionKey.startsWith('ASK_') ||
   534	               stateAfterRuleEngine.lastQuestionKey.startsWith('Q'))
   535	            
   536	            // If lastQuestionKey changed and indicates a question was asked, increment count
   537	            if (lastQuestionKeyChanged && hasQuestionKey && stateAfterRuleEngine.lastQuestionKey) {
   538	              // Check if question key is banned
   539	              if (BANNED_QUESTION_KEYS.has(stateAfterRuleEngine.lastQuestionKey)) {
   540	                console.error(`[ORCHESTRATOR] BANNED QUESTION KEY in state: ${stateAfterRuleEngine.lastQuestionKey} - not incrementing count`)
   541	              } else {
   542	                const newQuestionsCount = conversationState.questionsAskedCount + 1
   543	                await updateConversationState(
   544	                  input.conversationId,
   545	                  {
   546	                    questionsAskedCount: newQuestionsCount,
   547	                    knownFields: updatedKnownFields,
   548	                  },
   549	                  stateAfterRuleEngine.stateVersion
   550	                )
   551	              }
   552	            } else {
   553	              // No question asked - just update known fields
   554	              await updateConversationState(
   555	                input.conversationId,
   556	                {
   557	                  knownFields: updatedKnownFields,
   558	                },
   559	                stateAfterRuleEngine.stateVersion
   560	              )
   561	            }
   562	            
   563	            return {
   564	              replyText: validation.sanitizedReply,
   565	              extractedFields: extractFieldsFromReply(ruleEngineResult.reply, input.inboundText),
   566	              confidence: 90, // High confidence for rule engine
   567	              nextStepKey: stateAfterRuleEngine.lastQuestionKey,
   568	              tasksToCreate: [],
   569	              shouldEscalate: false,
   570	            }
   571	          }
   572	        }
   573	      }
   574	    } catch (ruleEngineError: any) {
   575	      console.warn(`[ORCHESTRATOR] Rule engine failed, falling back to LLM:`, ruleEngineError.message)
   576	    }
   577	    
   578	    // Step 4: Build system prompt from rules + training
   579	    // NOTE: For first messages, we still build the prompt but don't block if training is missing
   580	    const systemPrompt = await buildSystemPrompt(
   581	      input.agentProfileId || lead.aiAgentProfileId || undefined,
   582	      input.language
   583	    )
   584	    
   585	    // Step 4: Build conversation context
   586	    const recentMessages = conversation.messages
   587	      .slice()
   588	      .reverse()
   589	      .map(m => `${m.direction === 'INBOUND' ? 'User' : 'Assistant'}: ${m.body || ''}`)
   590	      .join('\n')
   591	    
   592	    const userPrompt = `Conversation context:
   593	${recentMessages}
   594	
   595	Current user message: ${input.inboundText}
   596	
   597	Lead information:
   598	- Service: ${lead.serviceType?.name || lead.serviceTypeEnum || updatedKnownFields.service || 'Not specified'}
   599	- Contact: ${updatedKnownFields.name || lead.contact.fullName || 'Unknown'}
   600	- Nationality: ${updatedKnownFields.nationality || lead.contact.nationality || 'Not specified'}
   601	
   602	Generate a short, helpful reply that:
   603	1. Answers the user's question or asks ONE clarifying question
   604	2. Follows all rules from training documents
   605	3. Does NOT promise approvals or guarantees
   606	4. Does NOT ask location questions for business setup
   607	5. Keeps it under 300 characters
   608	
   609	Reply:`
   610	    
   611	    // Step 5: Call LLM
   612	    const messages: LLMMessage[] = [
   613	      { role: 'system', content: systemPrompt },
   614	      { role: 'user', content: userPrompt },
   615	    ]
   616	    
   617	    const llmResult = await generateCompletion(messages, {
   618	      temperature: 0.7,
   619	      maxTokens: 300,
   620	    })
   621	    
   622	    let replyText = llmResult.text.trim()
   623	    
   624	    // Step 6: Validate with strictQualification
   625	    const validation = await validateQualificationRules(
   626	      input.conversationId,
   627	      replyText
   628	    )
   629	    
   630	    if (!validation.isValid) {
   631	      console.warn(`[ORCHESTRATOR] LLM output failed validation: ${validation.error}`)
   632	      
   633	      if (validation.sanitizedReply) {
   634	        replyText = validation.sanitizedReply
   635	      } else {
   636	        // Use fallback
   637	        replyText = `Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation.`
   638	      }
   639	    }
   640	    
   641	    // Step 7: Extract fields
   642	    const extractedFields = extractFieldsFromReply(replyText, input.inboundText)
   643	    
   644	    // Step 8: Check for duplicate outbound (deduplication guard)
   645	    const normalizedReply = replyText.trim().toLowerCase().replace(/\s+/g, ' ')
   646	    const replyHash = createHash('sha256')
   647	      .update(`${input.conversationId}:${normalizedReply}`)
   648	      .digest('hex')
   649	    
   650	    // Check if same reply was sent in last 10 minutes
   651	    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
   652	    const recentDuplicate = await prisma.message.findFirst({
   653	      where: {
   654	        conversationId: input.conversationId,
   655	        direction: 'OUTBOUND',
   656	        createdAt: { gte: tenMinutesAgo },
   657	        body: {
   658	          equals: replyText,
   659	          mode: 'insensitive',
   660	        },
   661	      },
   662	    })
   663	    
   664	    if (recentDuplicate) {
   665	      console.warn(`[ORCHESTRATOR] Duplicate outbound detected - skipping send`)
   666	      return {
   667	        replyText: '', // Empty reply = don't send
   668	        extractedFields,
   669	        confidence: 0,
   670	        nextStepKey: undefined,
   671	        tasksToCreate: [],
   672	        shouldEscalate: false,
   673	        handoverReason: 'Duplicate outbound message detected',
   674	      }
   675	    }
   676	    
   677	    // Step 9: Update conversation state (update known fields, but don't increment question count for LLM replies)
   678	    // LLM replies are less deterministic, so we only update known fields
   679	    await updateConversationState(
   680	      input.conversationId,
   681	      {
   682	        knownFields: updatedKnownFields,
   683	      },
   684	      expectedStateVersion
   685	    )
   686	    
   687	    // Step 10: Determine confidence and tasks
   688	    const confidence = validation.isValid ? 75 : 50 // Lower confidence if validation failed
   689	    const tasksToCreate: OrchestratorOutput['tasksToCreate'] = []
   690	    
   691	    // Create task if validation failed
   692	    if (!validation.isValid && validation.error) {
   693	      tasksToCreate.push({
   694	        type: 'QUALIFICATION',
   695	        title: `AI reply validation failed: ${validation.error}`,
   696	        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
   697	      })
   698	    }
   699	    
   700	    return {
   701	      replyText,
   702	      extractedFields,
   703	      confidence,
   704	      nextStepKey: undefined,
   705	      tasksToCreate,
   706	      shouldEscalate: false,
   707	      handoverReason: validation.isValid ? undefined : validation.error,
   708	    }
   709	  } catch (error: any) {
   710	    console.error(`[ORCHESTRATOR] Error generating reply:`, error)
   711	    
   712	    // Fallback deterministic message
   713	    return {
   714	      replyText: `Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation.`,
   715	      extractedFields: {},
   716	      confidence: 0,
   717	      tasksToCreate: [{
   718	        type: 'QUALIFICATION',
   719	        title: `AI orchestrator error: ${error.message}`,
   720	        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
   721	      }],
   722	      shouldEscalate: true,
   723	      handoverReason: error.message,
   724	    }
   725	  }
   726	}
```

## src/lib/autoReply.ts (requested 62-167, actual 62-167, total 1530)

```ts
    62	async function shouldAutoReply(
    63	  leadId: number, 
    64	  isFirstMessage: boolean = false,
    65	  messageText?: string
    66	): Promise<{ shouldReply: boolean; reason?: string; agent?: AgentProfile }> {
    67	  console.log(`🔍 [SHOULD-REPLY] Checking shouldAutoReply for lead ${leadId} (isFirstMessage: ${isFirstMessage})`)
    68	  console.log(`🔍 [SHOULD-REPLY] Message text: "${messageText?.substring(0, 100) || 'none'}..."`)
    69	  
    70	  // Get agent profile for this lead
    71	  const agent = await getAgentProfileForLead(leadId)
    72	  if (!agent) {
    73	    console.log(`⚠️ [SHOULD-REPLY] No agent profile found for lead ${leadId}, using defaults`)
    74	  } else {
    75	    console.log(`🤖 [SHOULD-REPLY] Using agent profile: ${agent.name} (ID: ${agent.id})`)
    76	  }
    77	
    78	  // Fetch lead with all fields (fields exist in schema but Prisma types may not be updated)
    79	  const lead = await prisma.lead.findUnique({
    80	    where: { id: leadId },
    81	  }) as any // Type assertion: fields exist in DB schema (autoReplyEnabled, mutedUntil, lastAutoReplyAt, allowOutsideHours)
    82	
    83	  if (!lead) {
    84	    console.log(`❌ Lead ${leadId} not found`)
    85	    return { shouldReply: false, reason: 'Lead not found' }
    86	  }
    87	
    88	  console.log(`📊 Lead ${leadId} auto-reply settings:`, {
    89	    autoReplyEnabled: lead.autoReplyEnabled,
    90	    mutedUntil: lead.mutedUntil,
    91	    lastAutoReplyAt: lead.lastAutoReplyAt,
    92	    allowOutsideHours: lead.allowOutsideHours,
    93	  })
    94	
    95	  // Check if auto-reply is enabled (treat NULL/undefined as true for backward compatibility)
    96	  // Default to true if not explicitly set to false
    97	  // @ts-ignore - Prisma types may not be updated yet
    98	  const autoReplyEnabled = lead.autoReplyEnabled
    99	  console.log(`🔍 [SHOULD-REPLY] autoReplyEnabled: ${autoReplyEnabled} (type: ${typeof autoReplyEnabled})`)
   100	  if (autoReplyEnabled === false) {
   101	    console.error(`❌ [SHOULD-REPLY] BLOCKED: Auto-reply disabled for lead ${leadId}`)
   102	    return { shouldReply: false, reason: 'Auto-reply disabled for this lead', agent: agent || undefined }
   103	  }
   104	  // If NULL or undefined, default to true (for leads created before migration)
   105	  // @ts-ignore
   106	  console.log(`✅ [SHOULD-REPLY] Auto-reply enabled for lead ${leadId} (autoReplyEnabled: ${autoReplyEnabled ?? 'null/undefined - defaulting to true'})`)
   107	
   108	  // Check if muted
   109	  // @ts-ignore
   110	  if (lead.mutedUntil && lead.mutedUntil > new Date()) {
   111	    // @ts-ignore
   112	    console.log(`⏭️ Lead ${leadId} muted until ${lead.mutedUntil.toISOString()}`)
   113	    // @ts-ignore
   114	    return { shouldReply: false, reason: `Lead muted until ${lead.mutedUntil.toISOString()}`, agent: agent || undefined }
   115	  }
   116	
   117	  // Check skip patterns from agent profile
   118	  if (messageText && agent) {
   119	    if (matchesSkipPatterns(messageText, agent.skipAutoReplyRules)) {
   120	      console.log(`⏭️ Message matches skip pattern - skipping auto-reply`)
   121	      return { shouldReply: false, reason: 'Message matches skip pattern', agent }
   122	    }
   123	  }
   124	
   125	  // Rate limiting: CRITICAL FIX - Only prevent true spam, allow second messages
   126	  // For follow-up messages (not first), use a very short rate limit (10 seconds) to allow quick replies
   127	  // @ts-ignore
   128	  if (!isFirstMessage && lead.lastAutoReplyAt) {
   129	    // @ts-ignore
   130	    const secondsSinceLastReply = (Date.now() - lead.lastAutoReplyAt.getTime()) / 1000
   131	    
   132	    // CRITICAL: For follow-up messages, use a very short rate limit (3 seconds) to allow quick replies
   133	    // This ensures second messages get replies quickly, regardless of agent's rateLimitMinutes
   134	    const followUpRateLimitSeconds = 3 // Always allow replies after 3 seconds for follow-ups (reduced from 5s)
   135	    console.log(`⏱️ [RATE-LIMIT] Last auto-reply was ${secondsSinceLastReply.toFixed(1)} seconds ago (follow-up rate limit: ${followUpRateLimitSeconds}s)`)
   136	    
   137	    // Only block if it's been less than 3 seconds (prevent spam, but allow normal follow-ups)
   138	    if (secondsSinceLastReply < followUpRateLimitSeconds) {
   139	      console.log(`⏭️ [RATE-LIMIT] BLOCKED: replied ${secondsSinceLastReply.toFixed(1)} seconds ago (minimum ${followUpRateLimitSeconds}s for follow-ups)`)
   140	      return { shouldReply: false, reason: `Rate limit: replied ${secondsSinceLastReply.toFixed(0)} seconds ago`, agent: agent || undefined }
   141	    } else {
   142	      console.log(`✅ [RATE-LIMIT] PASSED: ${secondsSinceLastReply.toFixed(1)} seconds since last reply (>= ${followUpRateLimitSeconds}s) - allowing reply`)
   143	    }
   144	  } else if (isFirstMessage && agent && !agent.firstMessageImmediate) {
   145	    // Agent can disable immediate first message replies
   146	    // Use agent's rateLimitMinutes for first messages
   147	    const rateLimitMinutes = agent?.rateLimitMinutes || 0.17 // 10 seconds default
   148	    console.log(`⏭️ Agent ${agent.name} has firstMessageImmediate=false - applying rate limit`)
   149	    // @ts-ignore
   150	    if (lead.lastAutoReplyAt) {
   151	      // @ts-ignore
   152	      const minutesSinceLastReply = (Date.now() - lead.lastAutoReplyAt.getTime()) / (1000 * 60)
   153	      if (minutesSinceLastReply < rateLimitMinutes) {
   154	        return { shouldReply: false, reason: 'Rate limit: replied recently', agent }
   155	      }
   156	    }
   157	  } else if (isFirstMessage) {
   158	    console.log(`✅ First message - rate limit bypassed`)
   159	  }
   160	
   161	  // Business hours check: REMOVED - User wants 24/7 auto-reply
   162	  // Business hours can be configured in AI Training & Response Settings page but won't block replies
   163	  // This allows 24/7 replies regardless of time
   164	  console.log(`✅ [SHOULD-REPLY] Business hours check SKIPPED - 24/7 auto-reply enabled`)
   165	  console.log(`✅ [SHOULD-REPLY] Auto-reply check PASSED for lead ${leadId} - reply will be sent!`)
   166	  return { shouldReply: true, agent: agent || undefined }
   167	}
```

## src/lib/autoReply.ts (requested 202-765, actual 202-765, total 1530)

```ts
   202	export async function handleInboundAutoReply(options: AutoReplyOptions): Promise<{
   203	  replied: boolean
   204	  reason?: string
   205	  error?: string
   206	}> {
   207	  const { leadId, messageId, messageText, channel, contactId, triggerProviderMessageId } = options
   208	  
   209	  // CRITICAL FIX #2: Reply idempotency check (hard dedupe)
   210	  // BUG FIX #2: Check idempotency even if triggerProviderMessageId is missing
   211	  // This prevents duplicates when called from both inbound.ts and webhook
   212	  if (channel.toLowerCase() === 'whatsapp') {
   213	    const { checkOutboundIdempotency } = await import('./webhook/idempotency')
   214	    
   215	    // If we have triggerProviderMessageId, check by that (most reliable)
   216	    if (triggerProviderMessageId) {
   217	      const outboundCheck = await checkOutboundIdempotency('whatsapp', triggerProviderMessageId)
   218	      
   219	      if (outboundCheck.alreadySent) {
   220	        console.log(`⚠️ [IDEMPOTENCY] Outbound already sent for inbound ${triggerProviderMessageId} - skipping reply`)
   221	        console.log(`📊 [OUTBOUND-LOG] triggerProviderMessageId: ${triggerProviderMessageId}, outboundMessageId: ${outboundCheck.logRecord?.outboundMessageId || 'unknown'}, flowStep: ${outboundCheck.logRecord?.flowStep || 'unknown'}, lastQuestionKey: ${outboundCheck.logRecord?.lastQuestionKey || 'unknown'}`)
   222	        return { replied: false, reason: 'Outbound already sent for this inbound message' }
   223	      }
   224	    }
   225	    
   226	    // BUG FIX #2: Also check by messageId to catch duplicates from inbound.ts calls
   227	    // Check if we recently sent a reply for this same messageId (within last 30 seconds)
   228	    // BUG FIX: Use findUnique with composite key - conversation is unique by (contactId, channel)
   229	    const conversation = await prisma.conversation.findUnique({
   230	      where: {
   231	        contactId_channel: {
   232	          contactId: contactId,
   233	          channel: channel.toLowerCase(),
   234	        },
   235	      },
   236	    })
   237	    
   238	    if (conversation) {
   239	      const recentOutbound = await prisma.message.findFirst({
   240	        where: {
   241	          conversationId: conversation.id,
   242	          direction: 'OUTBOUND',
   243	          createdAt: {
   244	            gte: new Date(Date.now() - 30000), // Last 30 seconds
   245	          },
   246	        },
   247	        orderBy: { createdAt: 'desc' },
   248	      })
   249	      
   250	      if (recentOutbound) {
   251	        // Check if this is likely a duplicate (same conversation, very recent)
   252	        const recentInbound = await prisma.message.findFirst({
   253	          where: {
   254	            id: messageId,
   255	            conversationId: conversation.id,
   256	            direction: 'INBOUND',
   257	          },
   258	        })
   259	        
   260	        if (recentInbound && recentOutbound.createdAt > recentInbound.createdAt) {
   261	          // Outbound was sent after this inbound - likely a duplicate
   262	          console.log(`⚠️ [IDEMPOTENCY] Recent outbound detected for message ${messageId} - likely duplicate, skipping`)
   263	          return { replied: false, reason: 'Recent outbound detected for this message - likely duplicate' }
   264	        }
   265	      }
   266	    }
   267	  }
   268	
   269	  if (!messageText || !messageText.trim()) {
   270	    console.log(`⏭️ Auto-reply skipped: Empty message text for lead ${leadId}`)
   271	    return { replied: false, reason: 'Empty message text' }
   272	  }
   273	
   274	  console.log(`🤖 [AUTO-REPLY] AI reply handler called for lead ${leadId}, message: "${messageText.substring(0, 50)}..."`)
   275	  console.log(`🤖 [AUTO-REPLY] Input:`, {
   276	    leadId,
   277	    messageId,
   278	    contactId,
   279	    channel,
   280	    messageLength: messageText.length,
   281	  })
   282	
   283	  // Create structured log entry (will be updated throughout the process)
   284	  let autoReplyLog: any = null
   285	  try {
   286	    // Use type assertion since table may not exist until migration is run
   287	    console.log(`📝 [AUTO-REPLY] Creating AutoReplyLog entry...`)
   288	    autoReplyLog = await (prisma as any).autoReplyLog.create({
   289	      data: {
   290	          leadId,
   291	          contactId,
   292	        messageId,
   293	        channel: channel.toLowerCase(),
   294	        messageText: messageText.substring(0, 500), // Truncate for storage
   295	        inboundParsed: JSON.stringify({
   296	          messageText: messageText.substring(0, 200),
   297	          channel,
   298	          timestamp: new Date().toISOString(),
   299	        }),
   300	        decision: 'processing',
   301	        autoReplyEnabled: true, // Will be updated
   302	      },
   303	    })
   304	    console.log(`✅ [AUTO-REPLY] Created AutoReplyLog entry: ${autoReplyLog.id}`)
   305	  } catch (logError: any) {
   306	    console.error('❌ [AUTO-REPLY] Failed to create AutoReplyLog:', logError.message)
   307	    console.error('❌ [AUTO-REPLY] Error stack:', logError.stack)
   308	    // Continue even if logging fails - don't block replies
   309	  }
   310	
   311	  try {
   312	    // Step 1: Check if we already processed THIS specific message (prevent duplicate replies)
   313	    // Check for both uppercase and lowercase for backward compatibility
   314	    const channelLower = channel.toLowerCase()
   315	    
   316	    // CRITICAL FIX: Check AutoReplyLog first - most reliable way to prevent duplicates
   317	    // This checks if we already processed THIS specific messageId (not other messages)
   318	    // IMPORTANT: Only block if we already replied to THIS exact messageId, not if we replied to a different message
   319	    const existingLog = await (prisma as any).autoReplyLog.findFirst({
   320	          where: {
   321	        messageId: messageId, // CRITICAL: Only check THIS specific messageId
   322	        leadId: leadId,
   323	            channel: channelLower,
   324	        OR: [
   325	          { decision: 'replied' },
   326	          { replySent: true },
   327	        ],
   328	      },
   329	      orderBy: { createdAt: 'desc' },
   330	    })
   331	    
   332	    if (existingLog) {
   333	      console.log(`⏭️ [DUPLICATE-CHECK] Already processed THIS message ${messageId} (log ${existingLog.id}, decision: ${existingLog.decision})`)
   334	      
   335	      // Update current log to mark as duplicate attempt
   336	      if (autoReplyLog) {
   337	        try {
   338	          await (prisma as any).autoReplyLog.update({
   339	            where: { id: autoReplyLog.id },
   340	            data: {
   341	              decision: 'skipped',
   342	              skippedReason: `Duplicate attempt - already replied to this exact message (log ${existingLog.id})`,
   343	            },
   344	          })
   345	        } catch (logError) {
   346	          console.warn('Failed to update AutoReplyLog with duplicate:', logError)
   347	        }
   348	      }
   349	      
   350	      return { replied: false, reason: 'Already replied to this exact message' }
   351	    } else {
   352	      console.log(`✅ [DUPLICATE-CHECK] No existing reply for message ${messageId} - proceeding with AI reply`)
   353	    }
   354	    
   355	    let messageCount = await prisma.message.count({
   356	      where: {
   357	        leadId: leadId,
   358	        OR: [
   359	          { direction: 'INBOUND' },
   360	          { direction: 'inbound' },
   361	          { direction: 'IN' }, // Legacy support
   362	        ],
   363	        channel: channelLower,
   364	      },
   365	    })
   366	    let isFirstMessage = messageCount <= 1
   367	    console.log(`📊 Message count for lead ${leadId} on channel ${channelLower}: ${messageCount} (isFirstMessage: ${isFirstMessage})`)
   368	    
   369	    // Step 2: Check if auto-reply should run (with first message context and messageText for pattern matching)
   370	    const shouldReply = await shouldAutoReply(leadId, isFirstMessage, messageText)
   371	    
   372	    // Update log with autoReplyEnabled status
   373	    if (autoReplyLog) {
   374	      try {
   375	        await (prisma as any).autoReplyLog.update({
   376	          where: { id: autoReplyLog.id },
   377	          data: {
   378	            autoReplyEnabled: shouldReply.shouldReply,
   379	            decision: shouldReply.shouldReply ? 'processing' : 'skipped',
   380	            skippedReason: shouldReply.reason || null,
   381	          },
   382	        })
   383	      } catch (logError) {
   384	        console.warn('Failed to update AutoReplyLog:', logError)
   385	      }
   386	    }
   387	    
   388	    if (!shouldReply.shouldReply) {
   389	      console.error(`❌ [AUTO-REPLY] BLOCKED: Skipping AI reply for lead ${leadId}: ${shouldReply.reason}`)
   390	      console.error(`❌ [AUTO-REPLY] This is why no reply was sent!`)
   391	      
   392	      // Update log with skip reason
   393	      if (autoReplyLog) {
   394	      try {
   395	          await (prisma as any).autoReplyLog.update({
   396	            where: { id: autoReplyLog.id },
   397	          data: {
   398	              decision: 'skipped',
   399	              skippedReason: shouldReply.reason || 'Unknown reason',
   400	          },
   401	        })
   402	        } catch (logError) {
   403	          console.warn('Failed to update AutoReplyLog with skip reason:', logError)
   404	        }
   405	      }
   406	      
   407	      return { replied: false, reason: shouldReply.reason }
   408	    }
   409	    
   410	    const agent = shouldReply.agent
   411	    if (agent) {
   412	      console.log(`🤖 Using agent profile: ${agent.name} (ID: ${agent.id})`)
   413	    }
   414	    
   415	    console.log(`✅ AI reply approved for lead ${leadId} (isFirstMessage: ${isFirstMessage})`)
   416	
   417	    // Step 3: Check if needs human attention (use agent's escalate patterns)
   418	    // CRITICAL: High-risk messages (angry/legal/threat/payment dispute) should NOT auto-reply
   419	    // Instead: create human task and optionally send brief "we'll get back" message
   420	    const humanCheck = needsHumanAttention(messageText, agent)
   421	    if (humanCheck.needsHuman) {
   422	      console.log(`⚠️ High-risk message detected for lead ${leadId}: ${humanCheck.reason}`)
   423	      
   424	      // Create task for human (required)
   425	      let taskCreated = false
   426	      try {
   427	        await createAgentTask(leadId, 'human_request', {
   428	          messageText,
   429	          confidence: 100,
   430	        })
   431	        taskCreated = true
   432	        console.log(`✅ Created human task for high-risk message`)
   433	      } catch (error: any) {
   434	        console.error('Failed to create agent task:', error.message)
   435	      }
   436	      
   437	      // Update log with human task creation
   438	      if (autoReplyLog) {
   439	        try {
   440	          await (prisma as any).autoReplyLog.update({
   441	            where: { id: autoReplyLog.id },
   442	            data: {
   443	              decision: 'notified_human',
   444	              decisionReason: humanCheck.reason,
   445	              humanTaskCreated: taskCreated,
   446	              humanTaskReason: humanCheck.reason,
   447	            },
   448	          })
   449	        } catch (logError) {
   450	          console.warn('Failed to update AutoReplyLog:', logError)
   451	        }
   452	      }
   453	      
   454	      // Optionally send brief acknowledgment message (user requirement: "optionally send a brief 'we'll get back' message")
   455	      // For now, we'll skip auto-reply entirely for high-risk messages to avoid escalating the situation
   456	      // This can be enabled later if needed
   457	      const sendAcknowledgment = false // Set to true if you want to send "We'll get back to you" message
   458	      
   459	      if (sendAcknowledgment) {
   460	        // Brief acknowledgment (default to English for high-risk messages)
   461	        const acknowledgments: Record<string, string> = {
   462	          en: "Thank you for your message. We'll get back to you shortly.",
   463	          ar: "شكراً لرسالتك. سنعود إليك قريباً.",
   464	        }
   465	        const ackText = acknowledgments.en // Use English for high-risk acknowledgment
   466	        
   467	        // Send acknowledgment (code continues below, but we'll return early for now)
   468	        // For now, we skip sending to avoid any risk
   469	      }
   470	      
   471	      return { replied: false, reason: humanCheck.reason }
   472	    }
   473	
   474	    // Step 4: Load lead and contact (also get conversation for logging)
   475	    const lead = await prisma.lead.findUnique({
   476	      where: { id: leadId },
   477	      include: {
   478	        contact: true,
   479	        messages: {
   480	          orderBy: { createdAt: 'desc' },
   481	          take: 10,
   482	        },
   483	      },
   484	    })
   485	    
   486	    // Get conversation for logging
   487	    // BUG FIX: Use findUnique with composite key - conversation is unique by (contactId, channel)
   488	    const conversation = await prisma.conversation.findUnique({
   489	      where: {
   490	        contactId_channel: {
   491	          contactId: contactId,
   492	          channel: channel.toLowerCase(),
   493	        },
   494	      },
   495	      select: { id: true },
   496	    })
   497	    
   498	    // Update log with conversation ID
   499	    if (autoReplyLog && conversation) {
   500	      try {
   501	        await (prisma as any).autoReplyLog.update({
   502	          where: { id: autoReplyLog.id },
   503	          data: {
   504	            conversationId: conversation.id,
   505	          },
   506	        })
   507	      } catch (logError) {
   508	        console.warn('Failed to update AutoReplyLog with conversation:', logError)
   509	      }
   510	    }
   511	
   512	    if (!lead || !lead.contact) {
   513	      console.error(`❌ Lead ${leadId} or contact not found`)
   514	      return { replied: false, reason: 'Lead or contact not found' }
   515	    }
   516	
   517	    // Step 4.5: Check if this is a Golden Visa lead and use qualifier
   518	    if (conversation) {
   519	      const { handleGoldenVisaQualification } = await import('./inbound/goldenVisaHandler')
   520	      const goldenVisaResult = await handleGoldenVisaQualification(
   521	        leadId,
   522	        conversation.id,
   523	        messageText
   524	      )
   525	
   526	      if (goldenVisaResult.shouldUseQualifier && goldenVisaResult.replyText) {
   527	        console.log(`✅ [GOLDEN-VISA] Using Golden Visa qualifier reply`)
   528	        
   529	        // Update log
   530	        if (autoReplyLog) {
   531	          try {
   532	            await (prisma as any).autoReplyLog.update({
   533	              where: { id: autoReplyLog.id },
   534	              data: {
   535	                decision: goldenVisaResult.shouldEscalate ? 'notified_human' : 'replied',
   536	                replyText: goldenVisaResult.replyText.substring(0, 500),
   537	                replySent: true,
   538	                replyStatus: 'sent',
   539	                humanTaskCreated: goldenVisaResult.taskCreated,
   540	              },
   541	            })
   542	          } catch (logError) {
   543	            console.warn('Failed to update AutoReplyLog:', logError)
   544	          }
   545	        }
   546	
   547	        // Send Golden Visa qualifier reply with idempotency
   548	        try {
   549	          const { sendOutboundWithIdempotency } = await import('./outbound/sendWithIdempotency')
   550	          const result = await sendOutboundWithIdempotency({
   551	            conversationId: conversation.id,
   552	            contactId: lead.contact.id,
   553	            leadId: leadId,
   554	            phone: lead.contact.phone,
   555	            text: goldenVisaResult.replyText,
   556	            provider: 'whatsapp',
   557	            triggerProviderMessageId: null, // Golden Visa qualifier
   558	            replyType: 'answer',
   559	            lastQuestionKey: null,
   560	            flowStep: null,
   561	          })
   562	
   563	          if (result.wasDuplicate) {
   564	            console.log(`⚠️ [GOLDEN-VISA] Duplicate outbound blocked by idempotency`)
   565	            return { replied: false, reason: 'Duplicate message blocked (idempotency)' }
   566	          }
   567	
   568	          if (!result.success) {
   569	            throw new Error(result.error || 'Failed to send message')
   570	          }
   571	
   572	          // BUG FIX #2: Add contactId to message creation (use lead.contact.id which is available)
   573	          // BUG FIX #3: Use channel.toLowerCase() for consistency with main flow
   574	          // Note: Message may already be created by idempotency system
   575	          try {
   576	            await prisma.message.create({
   577	              data: {
   578	                conversationId: conversation.id,
   579	                leadId: leadId,
   580	                contactId: lead.contact.id, // BUG FIX #2: Add missing contactId
   581	                direction: 'OUTBOUND',
   582	                channel: channel.toLowerCase(), // BUG FIX #3: Use lowercase for consistency
   583	                type: 'text',
   584	                body: goldenVisaResult.replyText,
   585	                providerMessageId: result.messageId || null,
   586	                status: result.messageId ? 'SENT' : 'FAILED',
   587	                sentAt: new Date(),
   588	              },
   589	            })
   590	          } catch (msgError: any) {
   591	            // Non-critical - message may already exist from idempotency system
   592	            if (!msgError.message?.includes('Unique constraint')) {
   593	              console.warn(`⚠️ [GOLDEN-VISA] Failed to create Message record:`, msgError.message)
   594	            }
   595	          }
   596	
   597	          // Update conversation
   598	          await prisma.conversation.update({
   599	            where: { id: conversation.id },
   600	            data: {
   601	              lastOutboundAt: new Date(),
   602	              lastMessageAt: new Date(),
   603	            },
   604	          })
   605	
   606	          // Update lead lastAutoReplyAt
   607	          await prisma.lead.update({
   608	            where: { id: leadId },
   609	            data: { lastAutoReplyAt: new Date() },
   610	          })
   611	
   612	          console.log(`✅ [GOLDEN-VISA] Sent qualifier reply to lead ${leadId}, messageId: ${result.messageId}`)
   613	          return { replied: true, reason: 'Golden Visa qualifier reply sent' }
   614	        } catch (sendError: any) {
   615	          console.error(`❌ [GOLDEN-VISA] Failed to send reply:`, sendError.message)
   616	          return { replied: false, reason: 'Failed to send Golden Visa qualifier reply', error: sendError.message }
   617	        }
   618	      }
   619	    }
   620	
   621	    // CRITICAL: If contact doesn't have phone number, try to get it from the message
   622	    // This handles cases where contact was created from a different channel
   623	    let phoneNumber = lead.contact.phone?.trim() || null
   624	    
   625	    if (!phoneNumber) {
   626	      console.warn(`⚠️ Contact ${lead.contact.id} has no phone number - attempting to get from message`)
   627	      // Try to get phone from the inbound message's conversation
   628	      const message = await prisma.message.findUnique({
   629	        where: { id: messageId },
   630	        include: {
   631	          conversation: {
   632	            include: {
   633	              contact: {
   634	                select: { phone: true },
   635	              },
   636	            },
   637	          },
   638	        },
   639	      })
   640	      
   641	      if (message?.conversation?.contact?.phone) {
   642	        phoneNumber = message.conversation.contact.phone.trim()
   643	        console.log(`✅ Found phone number from message conversation: ${phoneNumber}`)
   644	        
   645	        // Update contact with phone number for future use
   646	        try {
   647	          await prisma.contact.update({
   648	            where: { id: lead.contact.id },
   649	            data: { phone: phoneNumber },
   650	          })
   651	          console.log(`✅ Updated contact ${lead.contact.id} with phone number ${phoneNumber}`)
   652	        } catch (updateError: any) {
   653	          console.warn(`⚠️ Failed to update contact phone: ${updateError.message}`)
   654	        }
   655	      }
   656	    }
   657	    
   658	    if (!phoneNumber) {
   659	      console.log(`⏭️ Auto-reply skipped: Contact ${lead.contact.id} has no phone number and couldn't retrieve from message`)
   660	      return { replied: false, reason: 'Contact has no phone number' }
   661	    }
   662	
   663	    // @ts-ignore
   664	    console.log(`✅ Lead ${leadId} loaded: contact phone=${phoneNumber}, autoReplyEnabled=${lead.autoReplyEnabled ?? 'null (defaulting to true)'}`)
   665	
   666	    // Step 5: Detect language from message (use agent's language settings)
   667	    let detectedLanguage = agent?.defaultLanguage || 'en'
   668	    if (agent?.autoDetectLanguage !== false) {
   669	      detectedLanguage = detectLanguage(messageText)
   670	    }
   671	    console.log(`🌐 Detected language: ${detectedLanguage} (agent: ${agent?.name || 'none'}, autoDetect: ${agent?.autoDetectLanguage ?? true})`)
   672	
   673	    // Step 6: Log message count (already determined in Step 1)
   674	    console.log(`📨 Message count for lead ${leadId}: ${messageCount} (isFirstMessage: ${isFirstMessage})`)
   675	
   676	    // Step 7: Check if AI can respond (retriever-first chain)
   677	    // CRITICAL FIX: Retrieval must NEVER block replies
   678	    // Policy: If autoReplyEnabled and not muted/rate-limited:
   679	    //   - Always send a reply
   680	    //   - If retrieval returns useful context -> use it
   681	    //   - If retrieval empty/low similarity -> send safe fallback reply
   682	    //   - If message is high-risk -> do NOT auto reply; create human task
   683	    let retrievalResult: any = null
   684	    let hasUsefulContext = false
   685	    let retrievalError: string | null = null
   686	    
   687	    if (!isFirstMessage) {
   688	      try {
   689	        // Lower threshold to ensure training documents are retrieved more often
   690	        const similarityThreshold = agent?.similarityThreshold ?? parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.25')
   691	        retrievalResult = await retrieveAndGuard(messageText, {
   692	          similarityThreshold,
   693	          topK: 5,
   694	          // Use agent's training documents if specified
   695	          trainingDocumentIds: agent?.trainingDocumentIds || undefined,
   696	        })
   697	
   698	        // Check if retrieval found useful context
   699	        hasUsefulContext = retrievalResult.canRespond && retrievalResult.relevantDocuments.length > 0
   700	        
   701	        if (hasUsefulContext) {
   702	          console.log(`✅ Retrieval found relevant training: ${retrievalResult.relevantDocuments.length} documents, similarity scores: ${retrievalResult.relevantDocuments.map((d: any) => d.similarity.toFixed(2)).join(', ')}`)
   703	        } else {
   704	          console.log(`⚠️ No relevant training found (reason: ${retrievalResult.reason}), will use fallback reply`)
   705	        }
   706	        
   707	        // Update log with retrieval results
   708	        if (autoReplyLog) {
   709	          try {
   710	            const maxSimilarity = retrievalResult.relevantDocuments.length > 0
   711	              ? Math.max(...retrievalResult.relevantDocuments.map((d: any) => d.similarity))
   712	              : null
   713	            await (prisma as any).autoReplyLog.update({
   714	              where: { id: autoReplyLog.id },
   715	              data: {
   716	                retrievalDocsCount: retrievalResult.relevantDocuments.length,
   717	                retrievalSimilarity: maxSimilarity,
   718	                  retrievalReason: retrievalResult.reason,
   719	                hasUsefulContext,
   720	              },
   721	            })
   722	          } catch (logError) {
   723	            console.warn('Failed to update AutoReplyLog with retrieval:', logError)
   724	          }
   725	        }
   726	      } catch (retrievalErr: any) {
   727	        // If retrieval fails, log but ALWAYS continue - don't block replies
   728	        retrievalError = retrievalErr.message
   729	        console.warn('Retriever chain error (non-blocking, continuing with fallback):', retrievalError)
   730	        
   731	        // Update log with retrieval error
   732	        if (autoReplyLog) {
   733	          try {
   734	            await (prisma as any).autoReplyLog.update({
   735	              where: { id: autoReplyLog.id },
   736	              data: {
   737	                retrievalReason: `Error: ${retrievalError}`,
   738	                hasUsefulContext: false,
   739	              },
   740	            })
   741	          } catch (logError) {
   742	            console.warn('Failed to update AutoReplyLog with retrieval error:', logError)
   743	          }
   744	        }
   745	        // Don't return - always allow reply to proceed
   746	      }
   747	    } else {
   748	      // First message - always respond with greeting
   749	      console.log(`👋 First message detected - sending greeting for lead ${leadId}`)
   750	      
   751	      // Update log for first message
   752	      if (autoReplyLog) {
   753	        try {
   754	          await (prisma as any).autoReplyLog.update({
   755	            where: { id: autoReplyLog.id },
   756	            data: {
   757	              retrievalReason: 'First message - no retrieval needed',
   758	              hasUsefulContext: false,
   759	            },
   760	          })
   761	        } catch (logError) {
   762	          console.warn('Failed to update AutoReplyLog for first message:', logError)
   763	        }
   764	      }
   765	    }
```

## src/lib/ai/prompts.ts (requested 84-472, actual 84-472, total 654)

```ts
    84	export async function buildDraftReplyPrompt(
    85	  context: ConversationContext,
    86	  tone: 'professional' | 'friendly' | 'short',
    87	  language: 'en' | 'ar',
    88	  agent?: import('../ai/agentProfile').AgentProfile,
    89	  currentMessageText?: string, // Optional: current inbound message text for better training doc retrieval
    90	  preRetrievedDocs?: any // Optional: pre-retrieved training documents
    91	): Promise<string> {
    92	  const { contact, lead, messages } = context
    93	
    94	  // Load relevant training documents using vector search
    95	  // Use agent's training documents if specified
    96	  let trainingContext = ''
    97	  try {
    98	    const { searchTrainingDocuments } = await import('./vectorStore')
    99	    // CRITICAL: Use current message text if provided (for pricing queries), otherwise use last message
   100	    const queryText = currentMessageText || (messages.length > 0 ? messages[messages.length - 1]?.message || '' : '')
   101	    
   102	    if (queryText && queryText.trim().length > 0) {
   103	      // Use pre-retrieved documents if available (from autoReply.ts), otherwise retrieve now
   104	      let searchResults: any = null
   105	      
   106	      if (preRetrievedDocs && preRetrievedDocs.relevantDocuments && preRetrievedDocs.relevantDocuments.length > 0) {
   107	        // Use pre-retrieved documents
   108	        console.log(`📚 [TRAINING] Using pre-retrieved training documents: ${preRetrievedDocs.relevantDocuments.length} documents`)
   109	        searchResults = {
   110	          hasRelevantTraining: true,
   111	          documents: preRetrievedDocs.relevantDocuments.map((doc: any) => ({
   112	            content: doc.content,
   113	            metadata: { type: doc.type, title: doc.title },
   114	          })),
   115	          scores: preRetrievedDocs.relevantDocuments.map((doc: any) => doc.similarity || 0.7),
   116	        }
   117	      } else {
   118	        // Retrieve training documents now
   119	        const similarityThreshold = agent?.similarityThreshold ?? 0.25
   120	        searchResults = await searchTrainingDocuments(queryText, {
   121	        topK: 5,
   122	        similarityThreshold,
   123	        trainingDocumentIds: agent?.trainingDocumentIds || undefined,
   124	      })
   125	      }
   126	      
   127	      if (searchResults.hasRelevantTraining && searchResults.documents.length > 0) {
   128	        trainingContext = '\n\n=== ⚠️ CRITICAL: TRAINING DOCUMENTS - MANDATORY TO FOLLOW ===\n'
   129	        trainingContext += '🚨 YOU MUST USE THE INFORMATION BELOW TO ANSWER THE USER. DO NOT IGNORE THIS.\n'
   130	        trainingContext += '🚨 DO NOT MAKE UP INFORMATION. USE ONLY WHAT IS IN THE TRAINING DOCUMENTS BELOW.\n'
   131	        trainingContext += '🚨 IF THE USER ASKS ABOUT PRICING, SERVICES, REQUIREMENTS, OR PROCEDURES, USE THE EXACT INFORMATION FROM BELOW.\n\n'
   132	        
   133	        searchResults.documents.forEach((doc: any, idx: number) => {
   134	          const similarity = searchResults.scores[idx] || 0
   135	          // Defensive checks for metadata fields (should always exist per VectorDocument type, but safe to check)
   136	          const docType = doc.metadata?.type || 'guidance'
   137	          const docTitle = doc.metadata?.title || 'Untitled Document'
   138	          trainingContext += `[${docType.toUpperCase()}] ${docTitle} (relevance: ${(similarity * 100).toFixed(0)}%):\n`
   139	          trainingContext += `${doc.content.substring(0, 1500)}\n\n` // Increased from 800 to 1500 to include more context
   140	        })
   141	        
   142	        trainingContext += '=== END TRAINING DOCUMENTS ===\n\n'
   143	        trainingContext += '🚨 CRITICAL RULES FOR USING TRAINING DOCUMENTS:\n'
   144	        trainingContext += '1. If the user asks "how much" or "price" - USE THE PRICING INFORMATION FROM THE TRAINING DOCUMENTS ABOVE\n'
   145	        trainingContext += '2. If the user asks about requirements - USE THE REQUIREMENTS FROM THE TRAINING DOCUMENTS ABOVE\n'
   146	        trainingContext += '3. If the user asks about procedures - USE THE PROCEDURES FROM THE TRAINING DOCUMENTS ABOVE\n'
   147	        trainingContext += '4. If the user asks about services - USE THE SERVICE INFORMATION FROM THE TRAINING DOCUMENTS ABOVE\n'
   148	        trainingContext += '5. DO NOT make up pricing, requirements, or procedures - USE ONLY WHAT IS IN THE TRAINING DOCUMENTS\n'
   149	        trainingContext += '6. If the training documents contain specific answers, USE THOSE ANSWERS - do not ask generic questions\n'
   150	        trainingContext += '7. The training documents are YOUR PRIMARY SOURCE OF TRUTH - prioritize them over general knowledge\n'
   151	        trainingContext += '8. If the training documents conflict with general instructions, ALWAYS prioritize the training documents\n\n'
   152	      } else {
   153	        // Even if no training documents found, try with lower threshold
   154	        console.warn(`⚠️ No training documents found, trying with lower threshold 0.1`)
   155	        try {
   156	          const lowerThresholdResults = await searchTrainingDocuments(queryText, {
   157	            topK: 5,
   158	            similarityThreshold: 0.1, // Very low threshold to force retrieval
   159	            trainingDocumentIds: agent?.trainingDocumentIds || undefined,
   160	          })
   161	          
   162	          if (lowerThresholdResults.hasRelevantTraining && lowerThresholdResults.documents.length > 0) {
   163	            trainingContext = '\n\n=== ⚠️ CRITICAL: TRAINING DOCUMENTS - MANDATORY TO FOLLOW ===\n'
   164	            trainingContext += '🚨 YOU MUST USE THE INFORMATION BELOW TO ANSWER THE USER. DO NOT IGNORE THIS.\n\n'
   165	            
   166	            lowerThresholdResults.documents.forEach((doc, idx) => {
   167	              const similarity = lowerThresholdResults.scores[idx] || 0
   168	              const docType = doc.metadata?.type || 'guidance'
   169	              const docTitle = doc.metadata?.title || 'Untitled Document'
   170	              trainingContext += `[${docType.toUpperCase()}] ${docTitle} (relevance: ${(similarity * 100).toFixed(0)}%):\n`
   171	              trainingContext += `${doc.content.substring(0, 1500)}\n\n`
   172	            })
   173	            
   174	            trainingContext += '=== END TRAINING DOCUMENTS ===\n\n'
   175	            trainingContext += '🚨 CRITICAL: Use the training documents above to answer the user. Do not make up information.\n\n'
   176	          }
   177	        } catch (fallbackError) {
   178	          console.warn('Fallback training document search also failed:', fallbackError)
   179	        }
   180	      }
   181	    }
   182	  } catch (error: any) {
   183	    // Don't fail if training documents can't be loaded
   184	    console.warn('Failed to load training documents for prompt:', error.message)
   185	  }
   186	
   187	  // Add agent-specific guidelines
   188	  let agentGuidelines = ''
   189	  if (agent) {
   190	    if (agent.allowedPhrases && agent.allowedPhrases.length > 0) {
   191	      agentGuidelines += `\n\nIMPORTANT - ALLOWED PHRASES/TOPICS:\n`
   192	      agentGuidelines += `You MUST emphasize or use these phrases/topics when relevant:\n`
   193	      agent.allowedPhrases.forEach(phrase => {
   194	        agentGuidelines += `- ${phrase}\n`
   195	      })
   196	    }
   197	    if (agent.prohibitedPhrases && agent.prohibitedPhrases.length > 0) {
   198	      agentGuidelines += `\n\nIMPORTANT - PROHIBITED PHRASES/TOPICS:\n`
   199	      agentGuidelines += `You MUST NEVER use these phrases or discuss these topics:\n`
   200	      agent.prohibitedPhrases.forEach(phrase => {
   201	        agentGuidelines += `- ${phrase}\n`
   202	      })
   203	    }
   204	    if (agent.customGreeting) {
   205	      agentGuidelines += `\n\nCUSTOM GREETING TEMPLATE:\n${agent.customGreeting}\n`
   206	    }
   207	    if (agent.customSignoff) {
   208	      agentGuidelines += `\n\nCUSTOM SIGNOFF TEMPLATE:\n${agent.customSignoff}\n`
   209	    }
   210	  }
   211	
   212	  let prompt = `${getSystemPrompt()}${trainingContext}${agentGuidelines}
   213	
   214	Generate a WhatsApp reply in ${language === 'ar' ? 'Arabic' : 'English'} with ${tone} tone.
   215	
   216	Contact Information:
   217	- Name: ${contact.name}
   218	${contact.nationality ? `- Nationality: ${contact.nationality}` : ''}
   219	${contact.email ? `- Email: ${contact.email}` : ''}
   220	- Phone: ${contact.phone}
   221	
   222	`
   223	
   224	  if (lead) {
   225	    prompt += `Lead Information:
   226	- Service: ${lead.serviceType || lead.leadType || 'Not specified'}
   227	- Status: ${lead.status}
   228	- Pipeline Stage: ${lead.pipelineStage}
   229	${lead.expiryDate ? `- Expiry Date: ${lead.expiryDate.toISOString().split('T')[0]} (URGENT if <30 days)` : ''}
   230	${lead.nextFollowUpAt ? `- Next Follow-up: ${lead.nextFollowUpAt.toISOString().split('T')[0]}` : ''}
   231	${lead.aiScore !== null ? `- AI Score: ${lead.aiScore}/100` : ''}
   232	${lead.aiNotes ? `- AI Notes: ${lead.aiNotes}` : ''}
   233	
   234	`
   235	  } else {
   236	    prompt += `No lead created yet - this is a new inquiry.\n\n`
   237	  }
   238	
   239	  // Build comprehensive conversation history with clear extraction of provided information
   240	  prompt += `\n=== CONVERSATION HISTORY (READ CAREFULLY) ===\n`
   241	  const providedInfo: string[] = []
   242	  messages.slice(-10).forEach((msg, idx) => {
   243	    const messageText = (msg.message || '').substring(0, 300)
   244	    const direction = msg.direction.toUpperCase()
   245	    prompt += `${idx + 1}. [${direction}] ${messageText}\n`
   246	    
   247	    // Extract information that was already provided
   248	    const lowerText = messageText.toLowerCase()
   249	    if (direction === 'INBOUND' || direction === 'IN') {
   250	      // Extract nationality mentions - improved pattern matching
   251	      const nationalityPatterns = [
   252	        /(?:nationality|from|i am|i'm|im)\s+(?:is\s+)?([a-z]+(?:\s+[a-z]+)?)/i,
   253	        /(?:i am|i'm|im)\s+([a-z]+)/i,
   254	        /\b(somalia|somalian|nigeria|nigerian|indian|pakistani|filipino|egyptian|british|american|canadian|kenyan|ethiopian|sudanese|yemeni|jordanian|lebanese|syrian|palestinian|tunisian|moroccan|algerian|libyan|mauritanian|iraqi|iranian|afghan|bangladeshi|sri lankan|nepali|thai|vietnamese|indonesian|malaysian|singaporean|chinese|japanese|korean|russian|ukrainian|polish|romanian|turkish|saudi|emirati|kuwaiti|qatari|bahraini|omani)\b/i
   255	      ]
   256	      
   257	      for (const pattern of nationalityPatterns) {
   258	        const match = messageText.match(pattern)
   259	        if (match && match[1]) {
   260	          const nationality = match[1].trim()
   261	          if (nationality.length > 2 && nationality.length < 30 && !nationality.includes('visa') && !nationality.includes('uae')) {
   262	            providedInfo.push(`Nationality: ${nationality}`)
   263	            break
   264	          }
   265	        }
   266	      }
   267	      // Extract service mentions - improved pattern matching
   268	      if (lowerText.includes('visa') || lowerText.includes('business') || lowerText.includes('setup') || lowerText.includes('renewal') || lowerText.includes('freelance')) {
   269	        if (lowerText.includes('freelance')) providedInfo.push('Service: Freelance Visa')
   270	        if (lowerText.includes('visit visa') || (lowerText.includes('visit') && lowerText.includes('visa'))) providedInfo.push('Service: Visit Visa')
   271	        if (lowerText.includes('family visa') || (lowerText.includes('family') && lowerText.includes('visa'))) providedInfo.push('Service: Family Visa')
   272	        if (lowerText.includes('business setup') || (lowerText.includes('business') && lowerText.includes('setup'))) providedInfo.push('Service: Business Setup')
   273	        if (lowerText.includes('renewal')) providedInfo.push('Service: Renewal')
   274	      }
   275	      
   276	      // Extract expiry date mentions
   277	      const datePatterns = [
   278	        /(?:expir|expires?|expiry|valid until|valid till|until|till)\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i,
   279	        /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)/i,
   280	        /(\d{1,2}\/\d{1,2}\/\d{4})/,
   281	        /(\d{1,2}-\d{1,2}-\d{4})/
   282	      ]
   283	      
   284	      for (const pattern of datePatterns) {
   285	        const match = messageText.match(pattern)
   286	        if (match && match[1]) {
   287	          providedInfo.push(`Expiry Date: ${match[1]}`)
   288	          break
   289	        }
   290	      }
   291	      // Extract location - improved pattern matching
   292	      if (lowerText.includes('inside') || lowerText.includes('outside') || lowerText.includes('in uae') || lowerText.includes('outside uae') || lowerText.includes('im inside') || lowerText.includes('im outside')) {
   293	        if (lowerText.includes('outside') && !lowerText.includes('inside')) {
   294	          providedInfo.push('Location: Outside UAE')
   295	        } else if (lowerText.includes('inside') || lowerText.includes('in uae')) {
   296	          providedInfo.push('Location: Inside UAE')
   297	        }
   298	      }
   299	      // Extract passport info
   300	      if (lowerText.includes('passport')) {
   301	        providedInfo.push('Passport: Mentioned')
   302	      }
   303	      // Extract price queries
   304	      if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('how much')) {
   305	        providedInfo.push('Asked about: Pricing')
   306	      }
   307	    }
   308	  })
   309	  
   310	  if (providedInfo.length > 0) {
   311	    prompt += `\n=== INFORMATION ALREADY PROVIDED (DO NOT ASK AGAIN) ===\n`
   312	    providedInfo.forEach(info => {
   313	      prompt += `- ${info}\n`
   314	    })
   315	    prompt += `\nCRITICAL: Do NOT ask for information that is already listed above. If nationality is listed, do NOT ask "what's your nationality?" again.\n`
   316	  }
   317	  
   318	  prompt += `=== END CONVERSATION HISTORY ===\n\n`
   319	
   320	  // Check if this is first message (no outbound messages yet)
   321	  const hasOutboundMessages = messages.some(m => m.direction === 'OUTBOUND' || m.direction === 'outbound')
   322	  
   323	  const maxMessageLength = agent?.maxMessageLength || 300
   324	  const maxTotalLength = agent?.maxTotalLength || 600
   325	  const maxQuestions = agent?.maxQuestionsPerMessage || 2
   326	
   327	  if (!hasOutboundMessages) {
   328	    // FIRST MESSAGE - Respond naturally to what the user said
   329	    const agentName = agent?.name || 'an assistant'
   330	    const lastUserMessage = messages.length > 0 
   331	      ? messages[messages.length - 1]?.message || ''
   332	      : ''
   333	    
   334	    prompt += `\n=== CRITICAL: FIRST MESSAGE REPLY ===
   335	This is the FIRST message from the customer. Their message was: "${lastUserMessage}"
   336	
   337	YOU MUST:
   338	1. Respond DIRECTLY to what they said. If they said "HI" or "hello", greet them naturally. If they mentioned a service (like "family visa"), acknowledge it and respond about that service.
   339	2. NEVER use a template or generic message like "Welcome to Al Ain Business Center. Please share: 1. Your full name 2. What service..."
   340	3. NEVER ask for multiple pieces of information in a numbered list format
   341	4. Your reply must be UNIQUE and based on their actual message: "${lastUserMessage}"
   342	5. If they just said "HI" or "hello", respond with a friendly greeting and ask ONE simple question (not a numbered list)
   343	6. If they mentioned a service, acknowledge it and ask ONE follow-up question about that service
   344	7. Keep it SHORT (under ${maxMessageLength} characters)
   345	8. Use friendly, warm tone
   346	9. NEVER promises approvals or guarantees
   347	10. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
   348	11. Sign off with your name: "${agentName}"
   349	
   350	CRITICAL: Your reply must be SPECIFIC to "${lastUserMessage}". Do NOT use a generic template or numbered list of questions.
   351	
   352	ABSOLUTELY FORBIDDEN PHRASES (NEVER USE):
   353	- "Thank you for your interest in our services"
   354	- "To better assist you, could you please share"
   355	- "What specific service are you looking for"
   356	- "What is your timeline"
   357	- "Looking forward to helping you"
   358	- Any numbered list format (1. 2. 3.)
   359	- Any template-like structure
   360	
   361	Example GOOD replies:
   362	- If they said "HI": "Hello! I'm ${agentName} from Al Ain Business Center. I can help you with business setup, visas, and other UAE services. What service are you looking for?"
   363	- If they said "family visa": "Great! I can help you with family visa services. What's your nationality?"
   364	- If they said "visit visa": "I'd be happy to help with visit visa. Are you currently in the UAE?"
   365	- If they said "jama family visa somalia": "I can help you with family visa for Somalia. What's your current situation?"
   366	
   367	Example BAD replies (NEVER USE - THESE ARE TEMPLATES):
   368	- "Hi Abdurahman Shire, thank you for your interest in our services. To better assist you, could you please share: 1. What specific service are you looking for? 2. What is your timeline? Looking forward to helping you!"
   369	- "Welcome to Al Ain Business Center. Please share: 1. Your full name 2. What service..."
   370	- "Hi, thank you for your interest. To help you, please provide: 1) Full name 2) Service needed..."
   371	
   372	Reply only with the message text, no explanations or metadata.`
   373	  } else {
   374	    // FOLLOW-UP MESSAGE
   375	    // Get the most recent inbound message - messages are sorted ascending, so last one is latest
   376	    const allInboundMessages = messages.filter(m => m.direction === 'INBOUND' || m.direction === 'inbound' || m.direction === 'IN')
   377	    const lastUserMessage = allInboundMessages.length > 0 
   378	      ? allInboundMessages[allInboundMessages.length - 1]?.message || ''
   379	      : messages[messages.length - 1]?.message || '' // Fallback to last message if no inbound found
   380	    
   381	    // Check if documents are uploaded
   382	    const hasDocuments = lead && lead.id ? await checkIfLeadHasDocuments(lead.id) : false
   383	    
   384	    const agentName = agent?.name || 'an assistant'
   385	    
   386	    // Build a very explicit instruction
   387	    prompt += `\n\n=== CRITICAL INSTRUCTIONS ===
   388	The user's LATEST message (most recent) is: "${lastUserMessage}"
   389	
   390	CRITICAL ANTI-HALLUCINATION RULES:
   391	1. ONLY use information that is EXPLICITLY stated in the conversation history above
   392	2. NEVER make up or assume information that wasn't mentioned
   393	3. If the user said "Somalia", they are Somali - do NOT say they mentioned "Kenyan" or "Nigeria" or any other nationality
   394	4. If the user said "freelance visa", they want FREELANCE visa - do NOT say they mentioned "visit visa" or any other service
   395	5. If the user said "19th january", that's the date - do NOT say "15th of February 2024" or any other date
   396	6. If information is not in the conversation, say "I don't have that information yet" instead of guessing
   397	7. Read the conversation history CAREFULLY - what did they ACTUALLY say?
   398	8. NEVER contradict what the user just told you - if they said "freelance visa", acknowledge FREELANCE visa, not visit visa
   399	
   400	CRITICAL ANTI-REPETITION RULES:
   401	1. Check the "INFORMATION ALREADY PROVIDED" section above - DO NOT ask for information that's already there
   402	2. If nationality was already mentioned (e.g., "Somalia"), DO NOT ask "what's your nationality?" or "can you confirm your nationality?" - they ALREADY told you
   403	3. If service was already mentioned (e.g., "freelance visa"), DO NOT ask "what service?" or "which service?" - they ALREADY told you
   404	4. If location was already mentioned (e.g., "inside UAE"), DO NOT ask "inside or outside?" or "are you in the UAE?" - they ALREADY told you
   405	5. If expiry date was already mentioned (e.g., "19th january"), DO NOT ask for it again - they ALREADY told you
   406	6. Read ALL previous messages in the conversation - do NOT repeat questions that were already asked
   407	7. If the user just answered a question in their latest message, acknowledge their answer and move to the NEXT question, don't ask the same thing again
   408	
   409	YOU MUST:
   410	1. Start your reply by DIRECTLY acknowledging what they just said. Your FIRST sentence must respond to: "${lastUserMessage}"
   411	   - If they said "visit visa" → "Great! I can help you with visit visa services."
   412	   - If they said "how much visit visa?" → "For visit visa pricing, I need a few details..."
   413	   - If they said "hello" or "HI" → "Hello! I can help you with business setup, visas, and other UAE services. What service are you looking for?"
   414	   - If they said "nigeria" → "Great! You're from Nigeria. [continue with next question]"
   415	
   416	2. NEVER send a generic message like "Hi, thank you for your interest. Please share: 1. What service... 2. Timeline..."
   417	   This is WRONG and REPETITIVE. Your reply MUST be unique and based on what they just said.
   418	
   419	3. ABSOLUTELY FORBIDDEN - NEVER use these phrases:
   420	   - "Thank you for your interest in our services"
   421	   - "To better assist you, could you please share"
   422	   - "What specific service are you looking for"
   423	   - "What is your timeline"
   424	   - "Looking forward to helping you"
   425	   - "What brings you here" / "What brings you to UAE" / "What brings you" (too casual, unprofessional)
   426	   - "How can I help you today" (too generic, use service-specific greeting instead)
   427	   - Any numbered list format (1. 2. 3.)
   428	
   429	4. CRITICAL: Your reply must be DIFFERENT from previous messages. Check the conversation history above - do NOT repeat the same questions or use saved templates.
   430	
   431	5. NEVER use saved messages or templates. Every reply must be freshly generated based on the current conversation and the latest inbound message.
   432	
   433	6. If they already mentioned a service (like "family visa" or "visit visa"), acknowledge it SPECIFICALLY and ask for the NEXT specific piece of information needed for that service (but NOT information already provided).
   434	
   435	7. Always sign off with your name: "${agentName}"
   436	   Example: "Best regards, ${agentName}" or "Thanks, ${agentName}"
   437	
   438	${hasDocuments ? '8. NOTE: Documents have been uploaded. If they ask about documents, acknowledge receipt.\n' : ''}
   439	=== END CRITICAL INSTRUCTIONS ===\n\n
   440	
   441	Generate a WhatsApp-ready reply that:
   442	1. STARTS by directly acknowledging their latest message: "${lastUserMessage}" - Your first sentence MUST respond to this
   443	2. Uses ONLY information from the conversation history - do NOT make up or assume information
   444	3. If they mentioned a service (like "freelance visa", "family visa", "visit visa"), acknowledge it SPECIFICALLY and respond about THAT service - do NOT confuse it with other services
   445	4. If they asked a question (like "how much?"), answer it directly using training documents or explain what info you need to provide pricing
   446	5. If they provided information (nationality, location, service, date), acknowledge it SPECIFICALLY and ask for the NEXT specific piece needed (but NOT information already provided - check the "INFORMATION ALREADY PROVIDED" section)
   447	6. DO NOT repeat questions that were already asked - check the conversation history and the "INFORMATION ALREADY PROVIDED" section
   448	7. If they already told you their nationality, location, service, or date, DO NOT ask for it again - use what they told you
   449	8. Asks MAXIMUM ${maxQuestions} qualifying question${maxQuestions > 1 ? 's' : ''} if information is still missing (but NOT as a numbered list, and NOT questions already answered)
   450	9. Keeps it SHORT (under ${maxMessageLength} characters)
   451	10. NEVER promises approvals or guarantees
   452	11. Uses ${tone} tone
   453	12. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
   454	13. MUST end with: "Best regards, ${agentName}" or similar with your name
   455	
   456	CRITICAL REMINDER: 
   457	- Your reply must be SPECIFIC to "${lastUserMessage}"
   458	- Use ONLY information from the conversation - do NOT hallucinate
   459	- Do NOT ask for information already provided (check "INFORMATION ALREADY PROVIDED" section)
   460	- Do NOT confuse services - if they said "freelance visa", don't say "visit visa"
   461	- Do NOT confuse dates - if they said "19th january", don't say "15th february"
   462	- Do NOT use a generic template or numbered list format`
   463	
   464	    if (agent?.customSignoff) {
   465	      prompt += `\n\nCustom signoff style: "${agent.customSignoff}"`
   466	    }
   467	    
   468	    prompt += `\n\nReply ONLY with the message text, no explanations or metadata.`
   469	  }
   470	
   471	  return prompt
   472	}
```

## src/lib/ai/strictPrompt.ts (requested 40-179, actual 40-179, total 352)

```ts
    40	export function buildStrictSystemPrompt(context: StrictPromptContext): string {
    41	  const { agentName = 'Al Ain Business Center', language } = context
    42	  
    43	  return `You are a professional business services consultant for ${COMPANY_IDENTITY}.
    44	Your role is to help customers with UAE business setup, visas, and related services.
    45	You must maintain a professional, business-focused tone - you are NOT a casual friend or social chat assistant.
    46	
    47	CRITICAL OUTPUT RULES (VIOLATIONS WILL CAUSE MESSAGE REJECTION):
    48	1. You MUST return ONLY valid JSON - no other text before or after
    49	2. The "reply" field is the ONLY text sent to customers - no reasoning, no planning, no meta text
    50	3. NEVER include "Best regards", signatures, or agent names unless explicitly configured
    51	4. NEVER invent facts: dates, prices, requirements, timelines, eligibility
    52	5. NEVER switch service types unless customer explicitly changes it
    53	6. Keep replies short (under 300 chars), warm, helpful, WhatsApp-style
    54	7. Ask maximum 1-2 questions per message
    55	8. Answer questions directly when possible, don't just ask more questions
    56	9. DO NOT default to "schedule a call" - actually try to help and provide information first
    57	10. If customer asks about a service, provide helpful info from training docs, ask for needed details, engage - don't just say "schedule a call"
    58	
    59	FORBIDDEN IN CUSTOMER MESSAGES (NEVER SEND):
    60	- "Let's proceed", "I should", "I will", "Let me", "I think", "I believe"
    61	- "Best regards", "Regards", "Sincerely", any formal signatures
    62	- Quoted messages like "you said..." or reasoning text
    63	- "guaranteed", "approval guaranteed", "no risk", "100%", "inside contact"
    64	- Discounts (we don't offer discounts)
    65	- Firm timelines (only vague if needed: "usually a few weeks")
    66	- Dates not provided by customer or in database
    67	- Service confusion (don't say "visit visa" if customer asked "freelance visa")
    68	- Casual/personal questions: "what brings you here", "what brings you to UAE", "what brings you", "how can I help you today" (too casual for business)
    69	- Generic greetings that don't acknowledge their specific request
    70	- Repeating what customer said: "im looking for license noted", "you said X noted", "X noted" - NEVER repeat their exact words with "noted"
    71	- Acknowledgment phrases that quote customer: "Perfect — [customer's exact words] noted" - instead just say "Perfect," or "Got it," then ask the next question
    72	
    73	SERVICE PRICING RULES (CRITICAL - ONLY USE IF IN TRAINING DOCUMENTS):
    74	
    75	⚠️ NEVER INVENT PRICING - If pricing is not in training documents, DO NOT mention specific prices
    76	⚠️ If training documents don't have pricing: Answer what you CAN (requirements, process, general info), ask for needed details, and offer to provide pricing after gathering info
    77	⚠️ DO NOT default to "schedule a call" - try to help first, then offer call as an option if needed
    78	
    79	VISIT VISA:
    80	- Indians/Filipinos/Vietnam/Sri Lanka: AED 400 (30d), AED 750 (60d)
    81	- All other nationalities: AED 480 (30d), AED 900 (60d)
    82	- Ask: nationality + 30 or 60 days + where they are now
    83	- NO discounts - if requested, set needsHuman=true
    84	
    85	FREELANCE VISA (2-year Dubai residence):
    86	- Nigerians, Pakistanis, Bangladesh: "hard" -> needsHuman=true
    87	- Indians, Pakistanis, Sri Lanka, Nepal: AED 8,500 (3rd category)
    88	- All other nationalities: AED 6,999
    89	- Ask: nationality + inside/outside UAE
    90	- Selling points: cost + freedom + bring family + look for job
    91	
    92	FREELANCE PERMIT WITH VISA:
    93	- Price: AED 11,500
    94	- Better when customer wants business setup + permit + visa
    95	
    96	INVESTOR VISA:
    97	- Requires: company in Dubai OR property investment (min AED 750k)
    98	- If no company/property -> not eligible, offer business setup or handover
    99	
   100	FAMILY VISA:
   101	- Ask: sponsor visa type + salary range + where family is + relationship + nationality
   102	- If pricing not in training docs -> Answer what you can (requirements, process), ask for details, offer to provide pricing after gathering info
   103	
   104	GOLDEN VISA:
   105	- Qualification-first approach
   106	- Ask category first, then proof questions
   107	- Never promise approval
   108	- Handover when appears eligible AND serious
   109	
   110	QUALIFICATION (ONLY 3-4 QUESTIONS MAX):
   111	1. Full name (ALWAYS ask FIRST if not provided - this is MANDATORY and must be asked before any service questions)
   112	   * CRITICAL: Even if customer mentions a service (business setup, visa, etc.), you MUST ask for name first
   113	   * CRITICAL: Do NOT proceed to service questions until name is captured
   114	   * Example: Customer says "I want business setup" → Reply: "May I know your full name, please?"
   115	2. Nationality (if not provided)
   116	3. Service-specific questions:
   117	   - For BUSINESS SETUP / LICENSE: Ask "Freezone or Mainland?" (NOT inside/outside UAE)
   118	     * CRITICAL: If customer already answered "mainland" or "freezone", DO NOT ask again
   119	     * CRITICAL: Business licenses do NOT have "year" options - do NOT ask "1 year" or "2 year" license
   120	   - For VISAS: Ask "Inside UAE or outside UAE?"
   121	   - For RENEWALS: Ask expiry date
   122	4. When to start? (ASAP / this week / this month) - only if needed
   123	
   124	HUMAN HANDOVER (ONLY set needsHuman=true in these cases):
   125	- Customer explicitly requests to speak with a human
   126	- Customer is angry/abusive/threatening
   127	- Complex legal questions requiring expert advice
   128	- Payment disputes or refund requests
   129	
   130	CRITICAL: DO NOT set needsHuman=true just because pricing isn't in training docs.
   131	Instead: Answer what you CAN from training docs, ask for missing info, and offer to connect if they need more details.
   132	ONLY escalate if customer explicitly asks or if situation is truly complex/urgent.
   133	
   134	REPLY STYLE:
   135	- Professional business tone - you're a business services consultant, not a casual friend
   136	- Answer question first if possible - ACTUALLY ANSWER, don't just say "schedule a call"
   137	- If customer asks about a service, provide helpful info from training docs
   138	- Ask minimum questions needed - ONLY business-relevant questions (nationality, location, service type, documents)
   139	- Use professional empathy: "Sure — happy to help" or "I can help you with that"
   140	- Offer options: "30 or 60 days?" / "ASAP or later?"
   141	- No pushy language, no long paragraphs, no casual chit-chat
   142	- DO NOT repeat the same message - each reply must be different and responsive to what customer just said
   143	- NEVER ask casual questions like "what brings you here" or "what brings you to UAE" - stay focused on business services
   144	- If customer already mentioned a service (business setup, visa, etc.), acknowledge it specifically and ask relevant business questions only
   145	- CRITICAL: NEVER repeat what customer said with "noted" - e.g., "Perfect — im looking for license noted" is FORBIDDEN
   146	- Instead, use natural acknowledgments: "Perfect," "Got it," "Sure," then ask the next question directly
   147	- DO NOT quote customer's exact words back to them - just acknowledge naturally and move forward
   148	- CRITICAL: If customer asks "how long?" or timeline questions after you promised a quote/response, ALWAYS reply with helpful timeline info:
   149	  * "We'll get you the quote ASAP, usually within 24 hours"
   150	  * "Our team will prepare it as soon as possible, typically within 1-2 business days"
   151	  * "We'll send it to you ASAP, usually by end of day"
   152	  * NEVER ignore timeline questions - always provide helpful, realistic timeframe
   153	
   154	OUTPUT FORMAT (MANDATORY JSON - STRICTLY ENFORCED):
   155	{
   156	  "reply": "Customer-facing message only (no reasoning, no signatures)",
   157	  "service": "visit_visa|freelance_visa|freelance_permit_visa|investor_visa|pro_work|business_setup|family_visa|golden_visa|unknown",
   158	  "stage": "qualify|quote|handover",
   159	  "needsHuman": false,
   160	  "missing": ["nationality", "location"],
   161	  "confidence": 0.8
   162	}
   163	
   164	CRITICAL JSON RULES:
   165	1. You MUST return ONLY valid JSON - no markdown, no code blocks, no explanations
   166	2. The JSON must be parseable - no trailing commas, no comments
   167	3. All string values must be properly escaped
   168	4. The "reply" field is the ONLY text that will be sent to the customer
   169	5. If you cannot generate valid JSON, the system will reject your output
   170	
   171	EXAMPLE VALID OUTPUT (copy this format exactly):
   172	{"reply":"Hi! I can help you with freelance visa. Are you currently inside or outside UAE?","service":"freelance_visa","stage":"qualify","needsHuman":false,"missing":["location"],"confidence":0.85}
   173	
   174	DO NOT include:
   175	- Markdown code blocks (code fences with json or plain backticks)
   176	- Explanations before or after JSON
   177	- Multiple JSON objects
   178	- Invalid JSON syntax`
   179	}
```

## src/lib/ai/retrieverChain.ts (requested 31-136, actual 31-136, total 184)

```ts
    31	export async function retrieveAndGuard(
    32	  query: string,
    33	  options: {
    34	    similarityThreshold?: number
    35	    topK?: number
    36	    subjectTags?: string[] // Optional: specific subjects to match
    37	    trainingDocumentIds?: number[] // Optional: filter by specific training document IDs
    38	  } = {}
    39	): Promise<RetrievalResult> {
    40	  const {
    41	    similarityThreshold = 0.7, // Default threshold
    42	    topK = 5,
    43	    subjectTags = [],
    44	    trainingDocumentIds,
    45	  } = options
    46	
    47	  try {
    48	    // Step 1: Search vector store for relevant training
    49	    const searchResults = await searchTrainingDocuments(query, {
    50	      topK,
    51	      similarityThreshold,
    52	      trainingDocumentIds,
    53	    })
    54	
    55	    // Step 2: Check if we have relevant training
    56	    // Check both documents and scores arrays to handle cases where filtering by type results in empty arrays
    57	    if (!searchResults.hasRelevantTraining || searchResults.documents.length === 0 || searchResults.scores.length === 0) {
    58	      return {
    59	        canRespond: false,
    60	        reason: 'No relevant training found for this topic. The AI has not been trained on this subject.',
    61	        relevantDocuments: [],
    62	        requiresHuman: true,
    63	        suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
    64	      }
    65	    }
    66	
    67	    // Step 3: Check subject tags if specified
    68	    if (subjectTags.length > 0) {
    69	      const matchedSubjects = searchResults.documents.some(doc =>
    70	        subjectTags.some(tag =>
    71	          doc.metadata.title.toLowerCase().includes(tag.toLowerCase()) ||
    72	          doc.content.toLowerCase().includes(tag.toLowerCase())
    73	        )
    74	      )
    75	
    76	      if (!matchedSubjects) {
    77	        return {
    78	          canRespond: false,
    79	          reason: `Query does not match required subject tags: ${subjectTags.join(', ')}`,
    80	          relevantDocuments: [],
    81	          requiresHuman: true,
    82	          suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
    83	        }
    84	      }
    85	    }
    86	
    87	    // Step 4: Check similarity scores
    88	    // Ensure scores array is not empty before calling Math.max (prevents -Infinity issue)
    89	    if (searchResults.scores.length === 0) {
    90	      return {
    91	        canRespond: false,
    92	        reason: 'No similarity scores available for retrieved documents.',
    93	        relevantDocuments: [],
    94	        requiresHuman: true,
    95	        suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
    96	      }
    97	    }
    98	    
    99	    const maxScore = Math.max(...searchResults.scores)
   100	    if (maxScore < similarityThreshold) {
   101	      return {
   102	        canRespond: false,
   103	        reason: `Highest similarity score (${maxScore.toFixed(2)}) is below threshold (${similarityThreshold})`,
   104	        relevantDocuments: [],
   105	        requiresHuman: true,
   106	        suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
   107	      }
   108	    }
   109	
   110	    // Step 5: AI can respond - return relevant context
   111	    // Ensure documents and scores arrays are aligned
   112	    const minLength = Math.min(searchResults.documents.length, searchResults.scores.length)
   113	    return {
   114	      canRespond: true,
   115	      reason: `Found ${minLength} relevant training document(s) with similarity >= ${similarityThreshold}`,
   116	      relevantDocuments: searchResults.documents.slice(0, minLength).map((doc, idx) => ({
   117	        title: doc.metadata.title || 'Untitled',
   118	        content: (doc.content || '').substring(0, 1000), // Limit content length
   119	        type: doc.metadata.type || 'unknown',
   120	        similarity: searchResults.scores[idx] || 0,
   121	      })),
   122	      requiresHuman: false,
   123	    }
   124	  } catch (error: any) {
   125	    console.error('Retriever chain error:', error)
   126	    
   127	    // On error, default to requiring human (fail-safe)
   128	    return {
   129	      canRespond: false,
   130	      reason: `Error during retrieval: ${error.message}`,
   131	      relevantDocuments: [],
   132	      requiresHuman: true,
   133	      suggestedResponse: "I'm experiencing a technical issue. Let me get a human agent for you.",
   134	    }
   135	  }
   136	}
```

## src/lib/ai/vectorStore.ts (requested 264-324, actual 264-324, total 363)

```ts
   264	export async function searchTrainingDocuments(
   265	  query: string,
   266	  options: {
   267	    topK?: number
   268	    similarityThreshold?: number
   269	    type?: string
   270	    trainingDocumentIds?: number[]
   271	  } = {}
   272	): Promise<{
   273	  documents: VectorDocument[]
   274	  scores: number[]
   275	  hasRelevantTraining: boolean
   276	}> {
   277	  const { topK = 5, similarityThreshold = 0.7, type, trainingDocumentIds } = options
   278	
   279	  try {
   280	    // Generate query embedding
   281	    const queryEmbedding = await generateEmbedding(query)
   282	    
   283	    // If embedding generation failed (no API key), return empty results
   284	    if (!queryEmbedding) {
   285	      console.warn('⚠️ [VECTOR-SEARCH] Cannot generate embedding - no API key configured. Returning empty results.')
   286	      return {
   287	        documents: [],
   288	        scores: [],
   289	        hasRelevantTraining: false,
   290	      }
   291	    }
   292	
   293	    // Search vector store (pass trainingDocumentIds to filter)
   294	    const results = await vectorStore.search(queryEmbedding, topK, similarityThreshold, trainingDocumentIds)
   295	
   296	    // Filter by type if specified
   297	    let filteredDocs = results.documents
   298	    let filteredScores = results.scores
   299	    
   300	    if (type) {
   301	      // Filter both documents and scores together to maintain alignment
   302	      const filtered = results.documents
   303	        .map((doc, idx) => ({ doc, score: results.scores[idx] }))
   304	        .filter(({ doc }) => doc.metadata.type === type)
   305	      
   306	      filteredDocs = filtered.map(({ doc }) => doc)
   307	      filteredScores = filtered.map(({ score }) => score)
   308	    }
   309	
   310	    return {
   311	      documents: filteredDocs,
   312	      scores: filteredScores,
   313	      hasRelevantTraining: filteredDocs.length > 0,
   314	    }
   315	  } catch (error: any) {
   316	    console.error('Vector search error:', error)
   317	    // Fallback: return empty results
   318	    return {
   319	      documents: [],
   320	      scores: [],
   321	      hasRelevantTraining: false,
   322	    }
   323	  }
   324	}
```

## src/lib/ai/ruleEngine.ts (requested 12-500, actual 12-500, total 1280)

```ts
    12	const RULE_ENGINE_JSON = {
    13	  "engine": {
    14	    "name": "AlAinBC-Autopilot-RuleEngine",
    15	    "version": "1.0.0",
    16	    "description": "Deterministic conversation router + guardrails for WhatsApp/omnichannel AI (Sales/Support/Follow-up-ready)."
    17	  },
    18	  "global": {
    19	    "channel_policy": {
    20	      "allowed_channels": ["whatsapp", "instagram", "facebook", "webchat"],
    21	      "disallowed_channels": ["email_autoreply"],
    22	      "style": {
    23	        "tone": "friendly_professional",
    24	        "max_questions_per_message": 2,
    25	        "prefer_questions_per_message": 1,
    26	        "single_purpose_message": true,
    27	        "no_internal_reasoning": true,
    28	        "no_generic_stalling": true
    29	      }
    30	    },
    31	    "guardrails": {
    32	      "forbidden_phrases": [
    33	        "guaranteed",
    34	        "guarantee",
    35	        "approval guaranteed",
    36	        "approval assured",
    37	        "100% success",
    38	        "no risk",
    39	        "inside contact",
    40	        "government inside contact",
    41	        "we control approvals",
    42	        "what brings you here",
    43	        "what brings you to uae",
    44	        "what brings you",
    45	        "how can i help you today"
    46	      ],
    47	      "forbidden_behaviors": [
    48	        "explain_chain_of_thought",
    49	        "repeat_same_question_if_answered",
    50	        "ignore_pricing_question",
    51	        "invent_requirements",
    52	        "promise_timelines_unless_allowed",
    53	        "offer_discounts"
    54	      ],
    55	      "timeline_policy": {
    56	        "allow_timelines_only_if_specified": true,
    57	        "allowed_generic_timeline_phrase": "Usually around 2–4 weeks depending on approvals and document readiness."
    58	      },
    59	      "discount_policy": {
    60	        "allow_discounts": false,
    61	        "on_discount_request": {
    62	          "action": "handover_to_human",
    63	          "reason": "Discount requested"
    64	        }
    65	      },
    66	      "fallback_if_confused": {
    67	        "action": "handover_to_human",
    68	        "template": "Thanks for the details, {{name}}. I'm looping in a team member to assist you accurately."
    69	      }
    70	    },
    71	    "memory": {
    72	      "fields": {
    73	        "name": { "type": "string", "required": false },
    74	        "service": { "type": "string", "required": false },
    75	        "nationality": { "type": "string", "required": false },
    76	        "inside_uae": { "type": "boolean", "required": false },
    77	        "timeline_intent": { "type": "string", "required": false },
    78	        "family_location": { "type": "string", "required": false },
    79	        "visit_duration_days": { "type": "integer", "required": false },
    80	        "license_type": { "type": "string", "required": false },
    81	        "business_activity": { "type": "string", "required": false },
    82	        "partners_count": { "type": "integer", "required": false },
    83	        "visas_count": { "type": "integer", "required": false },
    84	        "golden_category": { "type": "string", "required": false }
    85	      },
    86	      "rules": {
    87	        "never_reask_if_present": ["name", "service", "nationality", "inside_uae", "visit_duration_days", "license_type"],
    88	        "acknowledge_correction_then_continue": true
    89	      }
    90	    }
    91	  },
    92	  "routing": {
    93	    "service_intents": {
    94	      "family_visa": {
    95	        "keywords": ["family visa", "wife", "husband", "kids", "children", "dependent", "sponsor family"],
    96	        "display_name": "Family Visa"
    97	      },
    98	      "visit_visa": {
    99	        "keywords": ["visit visa", "tourist", "30 days", "60 days", "tourism"],
   100	        "display_name": "Visit Visa"
   101	      },
   102	      "freelance_visa": {
   103	        "keywords": ["freelance visa", "2 year visa", "residence visa freelance"],
   104	        "display_name": "Freelance Visa"
   105	      },
   106	      "freelance_permit": {
   107	        "keywords": ["freelance permit", "permit + visa", "freezone freelance permit"],
   108	        "display_name": "Freelance Permit with Visa"
   109	      },
   110	      "investor_visa": {
   111	        "keywords": ["investor visa", "property investor", "company investor"],
   112	        "display_name": "Investor Visa"
   113	      },
   114	      "pro_services": {
   115	        "keywords": ["pro", "tasheel", "amer", "documents", "typing center", "government processing"],
   116	        "display_name": "PRO Services"
   117	      },
   118	      "business_setup": {
   119	        "keywords": ["business setup", "company formation", "license", "trade license", "freezone", "mainland", "general trading"],
   120	        "display_name": "Business Setup"
   121	      },
   122	      "golden_visa": {
   123	        "keywords": ["golden visa", "10 year visa", "gold visa"],
   124	        "display_name": "Golden Visa"
   125	      }
   126	    }
   127	  },
   128	  "state_machine": {
   129	    "states": [
   130	      {
   131	        "id": "S0_GREETING",
   132	        "entry_conditions": { "is_first_message_in_thread": true },
   133	        "actions": [
   134	          {
   135	            "type": "send_message",
   136	            "template": "To help quickly, may I have your full name, service needed, and nationality?"
   137	          }
   138	        ],
   139	        "next": "S1_CAPTURE_NAME"
   140	      },
   141	      {
   142	        "id": "S1_CAPTURE_NAME",
   143	        "entry_conditions": { "memory_missing_any": ["name"] },
   144	        "actions": [
   145	          {
   146	            "type": "ask_question",
   147	            "template": "May I know your full name, please?"
   148	          }
   149	        ],
   150	        "next": "S2_IDENTIFY_SERVICE"
   151	      },
   152	      {
   153	        "id": "S2_IDENTIFY_SERVICE",
   154	        "entry_conditions": { "memory_missing_any": ["service"] },
   155	        "actions": [
   156	          {
   157	            "type": "ask_question",
   158	            "template": "Thanks{{#if name}}, {{name}}{{/if}}. How can I help you today?"
   159	          }
   160	        ],
   161	        "next": "S3_SERVICE_FLOW"
   162	      },
   163	      {
   164	        "id": "S3_SERVICE_FLOW",
   165	        "entry_conditions": { "memory_has_all": ["service"] },
   166	        "actions": [{ "type": "route_to_service_flow" }],
   167	        "next": "S9_CLOSE_OR_HANDOVER"
   168	      }
   169	    ],
   170	    "service_flows": {
   171	      "Visit Visa": {
   172	        "steps": [
   173	          {
   174	            "id": "VV_Q1_NATIONALITY",
   175	            "when": { "memory_missing_any": ["nationality"] },
   176	            "ask": "What is your nationality?"
   177	          },
   178	          {
   179	            "id": "VV_Q2_DURATION",
   180	            "when": { "memory_missing_any": ["visit_duration_days"] },
   181	            "ask": "Do you need a 30 days or 60 days visit visa?"
   182	          },
   183	          {
   184	            "id": "VV_PRICE",
   185	            "when": { "always": true },
   186	            "respond": {
   187	              "type": "price_quote",
   188	              "pricing_table_ref": "pricing.visit_visa",
   189	              "template": "For {{visit_duration_days}} days visit visa, the price is {{price}}. If you'd like, share the traveler's age and we can proceed with next steps."
   190	            }
   191	          }
   192	        ],
   193	        "handover_rules": [
   194	          {
   195	            "if": { "customer_requested_discount": true },
   196	            "action": "handover_to_human",
   197	            "reason": "Discount request"
   198	          }
   199	        ]
   200	      },
   201	      "Freelance Visa": {
   202	        "steps": [
   203	          {
   204	            "id": "FV_Q1_NATIONALITY",
   205	            "when": { "memory_missing_any": ["nationality"] },
   206	            "ask": "What is your nationality?"
   207	          },
   208	          {
   209	            "id": "FV_Q2_INSIDE_UAE",
   210	            "when": { "memory_missing_any": ["inside_uae"] },
   211	            "ask": "Are you currently inside the UAE?"
   212	          },
   213	          {
   214	            "id": "FV_Q2_INSIDE_UAE_OVERSTAY",
   215	            "when": { "memory_field_equals": { "inside_uae": true } },
   216	            "ask": null, // Skip this question if already answered
   217	          },
   218	          {
   219	            "id": "FV_Q3_PERMIT_OR_VISA",
   220	            "when": { "memory_missing_any": ["service_variant"] },
   221	            "ask": "Do you want visa only (2-year residence), or freelance permit + visa?"
   222	          },
   223	          {
   224	            "id": "FV_PRICE",
   225	            "when": { "always": true },
   226	            "respond": {
   227	              "type": "conditional_price_quote",
   228	              "pricing_table_ref": "pricing.freelance_visa",
   229	              "template": "Based on nationality, the freelance visa price is {{price}}. Key benefits: cost-effective, freedom to work with any company, you can bring family, and you can later upgrade to get your own license. When would you like to get started?"
   230	            }
   231	          }
   232	        ],
   233	        "handover_rules": [
   234	          {
   235	            "if": { "nationality_in": ["nigerian", "bangladeshi"] },
   236	            "action": "handover_to_human",
   237	            "reason": "Restricted nationality flow"
   238	          },
   239	          {
   240	            "if": { "customer_requested_discount": true },
   241	            "action": "handover_to_human",
   242	            "reason": "Discount request"
   243	          }
   244	        ]
   245	      },
   246	      "Freelance Permit with Visa": {
   247	        "steps": [
   248	          {
   249	            "id": "FPV_Q1_NATIONALITY",
   250	            "when": { "memory_missing_any": ["nationality"] },
   251	            "ask": "What is your nationality?"
   252	          },
   253	          {
   254	            "id": "FPV_Q2_INSIDE_UAE",
   255	            "when": { "memory_missing_any": ["inside_uae"] },
   256	            "ask": "Are you currently inside the UAE?"
   257	          },
   258	          {
   259	            "id": "FPV_PRICE",
   260	            "when": { "always": true },
   261	            "respond": {
   262	              "type": "fixed_price_quote",
   263	              "pricing_table_ref": "pricing.freelance_permit",
   264	              "template": "Freelance permit + visa package is AED 11,500. This is best if you want a freezone permit (license) and a visa under it. When would you like to get started?"
   265	            }
   266	          }
   267	        ],
   268	        "handover_rules": [
   269	          {
   270	            "if": { "customer_requested_discount": true },
   271	            "action": "handover_to_human",
   272	            "reason": "Discount request"
   273	          }
   274	        ]
   275	      },
   276	      "Investor Visa": {
   277	        "steps": [
   278	          {
   279	            "id": "IV_Q1_TYPE",
   280	            "when": { "memory_missing_any": ["investor_type"] },
   281	            "ask": "Is this for real estate investment or company/partner investor visa?"
   282	          },
   283	          {
   284	            "id": "IV_Q2_PROPERTY_VALUE",
   285	            "when": { "memory_field_equals": { "investor_type": "real_estate" } },
   286	            "ask": "What's the approximate property value in AED? (Minimum typically starts around AED 750k)"
   287	          },
   288	          {
   289	            "id": "IV_Q3_COMPANY",
   290	            "when": { "memory_field_equals": { "investor_type": "company" } },
   291	            "ask": "Do you already have a UAE company license, or are you planning to set one up?"
   292	          },
   293	          {
   294	            "id": "IV_NEXT",
   295	            "when": { "always": true },
   296	            "respond": {
   297	              "type": "next_step",
   298	              "template": "Thanks{{#if name}}, {{name}}{{/if}}. Share your nationality and when you'd like to start, and a team member will confirm the best investor visa route and exact total cost."
   299	            }
   300	          }
   301	        ]
   302	      },
   303	      "PRO Services": {
   304	        "steps": [
   305	          {
   306	            "id": "PRO_Q1_SCOPE",
   307	            "when": { "memory_missing_any": ["pro_scope"] },
   308	            "ask": "What do you need help with—business setup processing, family visa, employment visa, document clearing, or something else?"
   309	          },
   310	          {
   311	            "id": "PRO_Q2_URGENCY",
   312	            "when": { "memory_missing_any": ["timeline_intent"] },
   313	            "ask": "How urgent is it—ASAP, this week, or flexible?"
   314	          },
   315	          {
   316	            "id": "PRO_NEXT",
   317	            "when": { "always": true },
   318	            "respond": {
   319	              "type": "handover_soft",
   320	              "template": "Understood. We handle the full process while you're at work and coordinate approvals and submissions. I'll share this with our team and they'll confirm the exact scope and pricing."
   321	            }
   322	          }
   323	        ]
   324	      },
   325	      "Business Setup": {
   326	        "steps": [
   327	          {
   328	            "id": "BS_Q1_LICENSE_TYPE",
   329	            "when": { "memory_missing_any": ["license_type"] },
   330	            "ask": "Do you want Freezone or Mainland license?"
   331	          },
   332	          {
   333	            "id": "BS_Q2_ACTIVITY",
   334	            "when": { "memory_missing_any": ["business_activity"] },
   335	            "ask": "What business activity do you need? (e.g., General Trading, Foodstuff Trading, IT Services, Consulting)"
   336	          },
   337	          {
   338	            "id": "BS_Q3_PARTNERS",
   339	            "when": { "memory_missing_any": ["partners_count"] },
   340	            "ask": "How many partners/shareholders will be on the license? (1/2/3+)"
   341	          },
   342	          {
   343	            "id": "BS_Q4_VISAS",
   344	            "when": { "memory_missing_any": ["visas_count"] },
   345	            "ask": "How many residence visas do you need? (0/1/2/3+)"
   346	          },
   347	          {
   348	            "id": "BS_Q5_TIMELINE",
   349	            "when": { "memory_missing_any": ["timeline_intent"] },
   350	            "ask": "When would you like to get started? (ASAP / this week / this month / later)"
   351	          },
   352	          {
   353	            "id": "BS_NEXT",
   354	            "when": { "always": true },
   355	            "respond": {
   356	              "type": "next_step",
   357	              "template": "Perfect! I'll prepare your personalized quote and a team member will call you to finalize details."
   358	            }
   359	          }
   360	        ]
   361	      },
   362	      "Family Visa": {
   363	        "steps": [
   364	          {
   365	            "id": "FAM_Q1_SPONSOR_STATUS",
   366	            "when": { "memory_missing_any": ["sponsor_status"] },
   367	            "ask": "What type of UAE visa do you currently hold? (Employment / Partner / Investor)"
   368	          },
   369	          {
   370	            "id": "FAM_Q2_FAMILY_LOCATION",
   371	            "when": { "memory_missing_any": ["family_location"] },
   372	            "ask": "Is your family currently inside or outside the UAE?"
   373	          },
   374	          {
   375	            "id": "FAM_Q3_NATIONALITY",
   376	            "when": { "memory_missing_any": ["nationality"] },
   377	            "ask": "What is your family's nationality?"
   378	          },
   379	          {
   380	            "id": "FAM_PRICE_DIRECTION",
   381	            "when": { "always": true },
   382	            "respond": {
   383	              "type": "price_directional",
   384	              "template": "Family visa costs depend on your sponsor visa type and family details. In most cases, the total process usually starts from AED X,XXX (excluding government fees). When would you like to get started so we can give you exact pricing?"
   385	            }
   386	          }
   387	        ]
   388	      },
   389	      "Golden Visa": {
   390	        "steps": [
   391	          {
   392	            "id": "GV_Q1_CATEGORY",
   393	            "when": { "memory_missing_any": ["golden_category"] },
   394	            "ask": "Which Golden Visa category do you believe you qualify under? (Investor / Professional / Media / Student / Executive)"
   395	          },
   396	          {
   397	            "id": "GV_MEDIA_Q1_AUTHORITY",
   398	            "when": { "memory_field_equals": { "golden_category": "Media" } },
   399	            "ask": "Do you already have strong media recognition (awards, major publications, verified work), or are you seeking UAE authority endorsement as part of the process?"
   400	          },
   401	          {
   402	            "id": "GV_MEDIA_Q2_PORTFOLIO",
   403	            "when": { "memory_field_equals": { "golden_category": "Media" } },
   404	            "ask": "Do you have a portfolio of published work or notable achievements we can submit for evaluation?"
   405	          },
   406	          {
   407	            "id": "GV_INVESTOR_Q1_ROUTE",
   408	            "when": { "memory_field_equals": { "golden_category": "Investor" } },
   409	            "ask": "Is your investor route through UAE property or a UAE company?"
   410	          },
   411	          {
   412	            "id": "GV_PROF_Q1_PROFESSION",
   413	            "when": { "memory_field_equals": { "golden_category": "Professional" } },
   414	            "ask": "What is your profession and highest qualification?"
   415	          },
   416	          {
   417	            "id": "GV_INTENT_SOFT",
   418	            "when": { "always": true },
   419	            "ask": "When would you ideally like to get started if you're eligible?"
   420	          },
   421	          {
   422	            "id": "GV_ESCALATE_IF_POSSIBLE",
   423	            "when": { "always": true },
   424	            "respond": {
   425	              "type": "handover_soft",
   426	              "template": "Thanks{{#if name}}, {{name}}{{/if}}. Based on what you shared, we can evaluate your eligibility properly and guide the best route. I'll loop in our specialist to confirm the exact requirements and next steps."
   427	            }
   428	          }
   429	        ],
   430	        "handover_rules": [
   431	          {
   432	            "if": { "customer_declines_to_start": true },
   433	            "action": "stop",
   434	            "reason": "No intent to proceed"
   435	          }
   436	        ]
   437	      }
   438	    }
   439	  },
   440	  "pricing": {
   441	    "visit_visa": {
   442	      "rules": [
   443	        {
   444	          "when": { "nationality_in": ["indian", "india", "philippines", "filipino", "vietnam", "vietnamese", "sri lanka", "srilanka", "sri-lanka"] },
   445	          "prices": { "30": 400, "60": 750 },
   446	          "currency": "AED"
   447	        },
   448	        {
   449	          "when": { "otherwise": true },
   450	          "prices": { "30": 480, "60": 900 },
   451	          "currency": "AED"
   452	        }
   453	      ]
   454	    },
   455	    "freelance_visa": {
   456	      "rules": [
   457	        {
   458	          "when": { "nationality_in": ["indian", "india", "pakistani", "pakistan", "sri lanka", "srilanka", "nepali", "nepal"] },
   459	          "price": 8500,
   460	          "currency": "AED"
   461	        },
   462	        {
   463	          "when": { "otherwise": true },
   464	          "price": 6999,
   465	          "currency": "AED"
   466	        }
   467	      ]
   468	    },
   469	    "freelance_permit": {
   470	      "price": 11500,
   471	      "currency": "AED"
   472	    }
   473	  },
   474	  "handover": {
   475	    "targets": ["human_sales", "human_support", "manager"],
   476	    "conditions": [
   477	      { "if": "customer_requested_discount", "to": "human_sales" },
   478	      { "if": "policy_violation_risk", "to": "manager" },
   479	      { "if": "model_confidence_low", "to": "human_sales" },
   480	      { "if": "missing_required_docs_or_complex_case", "to": "human_support" }
   481	    ],
   482	    "templates": {
   483	      "handover_soft": "Thanks, {{name}}. I'm looping in a team member to help you with accurate pricing and next steps. When is a good time for a quick call or WhatsApp reply?"
   484	    }
   485	  },
   486	  "message_templates": {
   487	    "anti_loop_ack": "Thanks for confirming — noted 👍",
   488	    "no_stalling": "Got it. I can help right away—just need one quick detail:",
   489	    "no_discount": "I understand. Discounts aren't available on this package, but I can have a team member check the best option for you."
   490	  },
   491	  "validation": {
   492	    "pre_send_checks": [
   493	      { "check": "contains_forbidden_phrase", "action": "block_and_rewrite" },
   494	      { "check": "asks_question_already_answered", "action": "remove_question" },
   495	      { "check": "more_than_2_questions", "action": "reduce_questions" },
   496	      { "check": "pricing_question_ignored", "action": "add_price_directional_or_fixed" },
   497	      { "check": "includes_internal_reasoning", "action": "strip_internal_reasoning" }
   498	    ]
   499	  }
   500	}
```

## src/lib/ai/ruleEngine.ts (requested 1021-1279, actual 1021-1279, total 1280)

```ts
  1021	export async function executeRuleEngine(context: RuleEngineContext): Promise<RuleEngineResult> {
  1022	  // Step 0: Check for loops (deduplication)
  1023	  const { isInLoop } = await import('./conversationState')
  1024	  
  1025	  // Step 1: Extract information from current message
  1026	  const memoryUpdates = extractAndUpdateMemory(
  1027	    context.currentMessage,
  1028	    context.memory,
  1029	    context.conversationHistory
  1030	  )
  1031	  
  1032	  // Merge updates into memory
  1033	  const updatedMemory: ConversationMemory = {
  1034	    ...context.memory,
  1035	    ...memoryUpdates
  1036	  }
  1037	  
  1038	  // Step 1.5: Extract provided info from conversation history to ensure we don't miss anything
  1039	  const { extractProvidedInfo: extractFromHistory } = await import('./conversationState')
  1040	  const historyProvided = extractFromHistory(context.conversationHistory)
  1041	  
  1042	  // Merge history-provided info into memory (only if not already set)
  1043	  if (historyProvided.sponsor_status && !updatedMemory.sponsor_status) {
  1044	    updatedMemory.sponsor_status = historyProvided.sponsor_status
  1045	  }
  1046	  if (historyProvided.service && !updatedMemory.service) {
  1047	    updatedMemory.service = historyProvided.service
  1048	  }
  1049	  if (historyProvided.nationality && !updatedMemory.nationality) {
  1050	    updatedMemory.nationality = historyProvided.nationality
  1051	  }
  1052	  if (historyProvided.inside_uae !== undefined && updatedMemory.inside_uae === undefined) {
  1053	    updatedMemory.inside_uae = historyProvided.inside_uae
  1054	  }
  1055	  if (historyProvided.family_location && !updatedMemory.family_location) {
  1056	    updatedMemory.family_location = historyProvided.family_location
  1057	  }
  1058	  if (historyProvided.license_type && !updatedMemory.license_type) {
  1059	    updatedMemory.license_type = historyProvided.license_type
  1060	  }
  1061	  
  1062	  // Step 2: Determine current state
  1063	  let currentState = 'S0_GREETING'
  1064	  
  1065	  // Check if we've sent greeting
  1066	  const hasGreeting = context.conversationHistory.some(m => 
  1067	    m.direction === 'OUTBOUND' && 
  1068	    (m.body || '').toLowerCase().includes('hello') && 
  1069	    (m.body || '').toLowerCase().includes('hamdi')
  1070	  )
  1071	  
  1072	  if (hasGreeting) {
  1073	    currentState = 'S1_CAPTURE_NAME'
  1074	  }
  1075	  
  1076	  // CRITICAL FIX: Always ask for name FIRST before service flow
  1077	  // Even if service is detected, we must capture name first
  1078	  if (!updatedMemory.name && hasGreeting) {
  1079	    currentState = 'S1_CAPTURE_NAME'
  1080	  } else if (updatedMemory.name && !updatedMemory.service) {
  1081	    currentState = 'S2_IDENTIFY_SERVICE'
  1082	  } else if (updatedMemory.name && updatedMemory.service) {
  1083	    currentState = 'S3_SERVICE_FLOW'
  1084	  }
  1085	  
  1086	  // Step 3: Execute state actions
  1087	  let reply = ''
  1088	  let needsHuman = false
  1089	  let handoverReason = ''
  1090	  
  1091	  const states = RULE_ENGINE_JSON.state_machine.states
  1092	  const currentStateDef = states.find(s => s.id === currentState)
  1093	  
  1094	  if (currentState === 'S0_GREETING' && context.isFirstMessage) {
  1095	    const action = currentStateDef?.actions[0] as any
  1096	    if (action?.type === 'send_message' && action?.template) {
  1097	      reply = renderTemplate(action.template, updatedMemory)
  1098	    }
  1099	  } else if (currentState === 'S1_CAPTURE_NAME' && !updatedMemory.name) {
  1100	    // CRITICAL: Always ask for name if missing, even if service is detected
  1101	    const action = currentStateDef?.actions[0] as any
  1102	    if (action?.type === 'ask_question' && action?.template) {
  1103	      reply = renderTemplate(action.template, updatedMemory)
  1104	    }
  1105	  } else if (currentState === 'S2_IDENTIFY_SERVICE' && !updatedMemory.service) {
  1106	    const action = currentStateDef?.actions[0] as any
  1107	    if (action?.type === 'ask_question' && action?.template) {
  1108	      reply = renderTemplate(action.template, updatedMemory)
  1109	    }
  1110	  } else if (currentState === 'S3_SERVICE_FLOW' && updatedMemory.service) {
  1111	    // Route to service-specific flow
  1112	    const serviceFlow = RULE_ENGINE_JSON.state_machine.service_flows[updatedMemory.service as keyof typeof RULE_ENGINE_JSON.state_machine.service_flows]
  1113	    
  1114	    if (serviceFlow) {
  1115	      // Check handover rules first
  1116	      const handoverRules = (serviceFlow as any).handover_rules || []
  1117	      for (const handoverRule of handoverRules) {
  1118	        if (checkCondition(handoverRule.if, updatedMemory, context)) {
  1119	          needsHuman = true
  1120	          handoverReason = handoverRule.reason || 'Complex case'
  1121	          reply = RULE_ENGINE_JSON.handover.templates.handover_soft
  1122	          reply = renderTemplate(reply, updatedMemory)
  1123	          return {
  1124	            reply,
  1125	            needsHuman: true,
  1126	            handoverReason,
  1127	            memoryUpdates,
  1128	            service: updatedMemory.service
  1129	          }
  1130	        }
  1131	      }
  1132	      
  1133	      // Execute service flow steps
  1134	      for (const step of serviceFlow.steps) {
  1135	        if (checkCondition(step.when, updatedMemory, context)) {
  1136	          // CRITICAL: Check if we already asked this question
  1137	          if (step.ask) {
  1138	            // Check conversation state machine (persisted)
  1139	            const { wasQuestionAsked, recordQuestionAsked } = await import('../conversation/flowState')
  1140	            const questionKey = step.id || step.ask.substring(0, 50)
  1141	            
  1142	            // Check if question was asked recently (within 3 minutes)
  1143	            const alreadyAsked = await wasQuestionAsked(context.conversationId, questionKey, 3)
  1144	            if (alreadyAsked) {
  1145	              console.log(`⚠️ [RULE-ENGINE] Question ${questionKey} asked recently - skipping`)
  1146	              continue
  1147	            }
  1148	            
  1149	            // Also check conversation history for semantic similarity
  1150	            const { wasQuestionAsked: wasAskedInHistory } = await import('./conversationState')
  1151	            if (wasAskedInHistory(step.ask, context.conversationHistory)) {
  1152	              console.log(`⚠️ [RULE-ENGINE] Question already asked in history, skipping: ${step.ask.substring(0, 50)}...`)
  1153	              continue // Skip this step, try next
  1154	            }
  1155	            
  1156	            reply = renderTemplate(step.ask, updatedMemory)
  1157	            
  1158	            // CRITICAL FIX #3: Persist question asked to conversation state
  1159	            await recordQuestionAsked(context.conversationId, questionKey, `WAIT_${questionKey}`)
  1160	            
  1161	            // Also update memory flags
  1162	            const questionId = step.id || step.ask.substring(0, 50)
  1163	            if (!updatedMemory.has_asked_name && questionId.includes('NAME')) {
  1164	              updatedMemory.has_asked_name = true
  1165	            }
  1166	            if (!updatedMemory.has_asked_service && questionId.includes('SERVICE')) {
  1167	              updatedMemory.has_asked_service = true
  1168	            }
  1169	            if (!updatedMemory.has_asked_nationality && questionId.includes('NATIONALITY')) {
  1170	              updatedMemory.has_asked_nationality = true
  1171	            }
  1172	            if (!updatedMemory.has_asked_inside_uae && questionId.includes('INSIDE_UAE')) {
  1173	              updatedMemory.has_asked_inside_uae = true
  1174	            }
  1175	            if (!updatedMemory.has_asked_sponsor_status && questionId.includes('SPONSOR')) {
  1176	              updatedMemory.has_asked_sponsor_status = true
  1177	            }
  1178	            if (!updatedMemory.has_asked_family_location && questionId.includes('FAMILY_LOCATION')) {
  1179	              updatedMemory.has_asked_family_location = true
  1180	            }
  1181	            if (!updatedMemory.has_asked_license_type && questionId.includes('LICENSE_TYPE')) {
  1182	              updatedMemory.has_asked_license_type = true
  1183	            }
  1184	            
  1185	            break
  1186	          } else if (step.respond) {
  1187	            if (step.respond.type === 'price_quote' || step.respond.type === 'conditional_price_quote' || step.respond.type === 'fixed_price_quote') {
  1188	              const price = getPricing(updatedMemory.service, updatedMemory)
  1189	              reply = renderTemplate(step.respond.template, updatedMemory, price || undefined)
  1190	            } else if (step.respond.type === 'price_directional') {
  1191	              reply = renderTemplate(step.respond.template, updatedMemory)
  1192	            } else if (step.respond.type === 'next_step' || step.respond.type === 'handover_soft') {
  1193	              reply = renderTemplate(step.respond.template, updatedMemory)
  1194	              // CRITICAL FIX: Don't escalate to human too early - only escalate if customer explicitly requests or complex case
  1195	              // For simple replies like "tomorrow", continue the conversation
  1196	              if (step.respond.type === 'handover_soft') {
  1197	                // Only escalate if customer explicitly requested human OR if it's a complex case
  1198	                const lowerMessage = context.currentMessage.toLowerCase()
  1199	                const explicitHumanRequest = lowerMessage.includes('speak to human') || 
  1200	                                            lowerMessage.includes('talk to someone') ||
  1201	                                            lowerMessage.includes('human agent') ||
  1202	                                            lowerMessage.includes('real person')
  1203	                
  1204	                // Don't escalate for simple timeline answers like "tomorrow", "next week", etc.
  1205	                const isSimpleTimelineAnswer = lowerMessage.match(/^(tomorrow|next week|next month|asap|later|soon)$/i)
  1206	                
  1207	                if (!explicitHumanRequest && isSimpleTimelineAnswer) {
  1208	                  // Continue conversation, don't escalate
  1209	                  needsHuman = false
  1210	                  // Don't set handoverReason - it's optional in the interface
  1211	                  console.log(`✅ [RULE-ENGINE] Simple timeline answer detected, continuing conversation instead of escalating`)
  1212	                } else {
  1213	                  needsHuman = true
  1214	                  handoverReason = 'Service-specific handover'
  1215	                }
  1216	              }
  1217	            }
  1218	            break
  1219	          }
  1220	        }
  1221	      }
  1222	    }
  1223	  }
  1224	  
  1225	  // Step 4: Check for loops (deduplication)
  1226	  if (reply && isInLoop(reply, context.conversationHistory)) {
  1227	    console.log(`⚠️ [RULE-ENGINE] Loop detected! Reply is >80% similar to recent message. Generating clarification request.`)
  1228	    reply = `Thanks for your message. I want to make sure I understand correctly - could you provide a bit more detail about what you need?`
  1229	    needsHuman = false // Don't escalate, just ask for clarification
  1230	  }
  1231	  
  1232	  // Step 5: Validate reply
  1233	  const validation = validateReply(reply, updatedMemory, context)
  1234	  if (!validation.valid) {
  1235	    if (validation.blocked) {
  1236	      // Use fallback
  1237	      reply = RULE_ENGINE_JSON.global.guardrails.fallback_if_confused.template
  1238	      reply = renderTemplate(reply, updatedMemory)
  1239	      needsHuman = true
  1240	      handoverReason = validation.reason || 'Reply blocked by validation'
  1241	    } else if (validation.sanitized) {
  1242	      reply = validation.sanitized
  1243	    }
  1244	  }
  1245	  
  1246	  // Step 6: Check for discount request
  1247	  if (updatedMemory.customer_requested_discount) {
  1248	    needsHuman = true
  1249	    handoverReason = 'Discount requested'
  1250	    reply = RULE_ENGINE_JSON.message_templates.no_discount
  1251	    reply = renderTemplate(reply, updatedMemory)
  1252	  }
  1253	  
  1254	  // Step 7: Persist memory to database and update flow state
  1255	  if (Object.keys(memoryUpdates).length > 0) {
  1256	    try {
  1257	      // Store memory in conversation ruleEngineMemory field
  1258	      await (prisma.conversation.update as any)({
  1259	        where: { id: context.conversationId },
  1260	        data: {
  1261	          ruleEngineMemory: JSON.stringify(updatedMemory),
  1262	          // Also update lockedService if service was identified
  1263	          ...(updatedMemory.service && { lockedService: updatedMemory.service.toLowerCase().replace(/\s+/g, '_') }),
  1264	        }
  1265	      })
  1266	      console.log(`💾 [RULE-ENGINE] Persisted memory updates:`, Object.keys(memoryUpdates))
  1267	    } catch (error) {
  1268	      console.error('❌ [RULE-ENGINE] Failed to persist memory:', error)
  1269	    }
  1270	  }
  1271	  
  1272	  return {
  1273	    reply,
  1274	    needsHuman,
  1275	    handoverReason,
  1276	    memoryUpdates,
  1277	    service: updatedMemory.service
  1278	  }
  1279	}
```

## prisma/schema.prisma (requested 222-273, actual 222-273, total 899)

```prisma
   222	model AIAgentProfile {
   223	  id          Int     @id @default(autoincrement())
   224	  name        String  @unique // e.g., "Sales Agent", "Customer Support Agent", "Follow-up Agent"
   225	  description String? // Optional description
   226	  isActive    Boolean @default(true)
   227	  isDefault   Boolean @default(false) // Only one can be default
   228	
   229	  // Training document associations (which training docs this agent uses)
   230	  trainingDocumentIds String? // JSON array of training document IDs this agent should use
   231	
   232	  // Response Behavior Settings
   233	  systemPrompt           String? // Custom system prompt (overrides default)
   234	  tone                   String  @default("friendly") // professional | friendly | short
   235	  maxMessageLength       Int     @default(300) // Max characters for first message
   236	  maxTotalLength         Int     @default(600) // Max characters total
   237	  maxQuestionsPerMessage Int     @default(2) // Max questions to ask
   238	
   239	  // What to say / What not to say
   240	  allowedPhrases    String? // JSON array of phrases/topics to emphasize
   241	  prohibitedPhrases String? // JSON array of phrases/topics to avoid
   242	  customGreeting    String? // Custom greeting template
   243	  customSignoff     String? // Custom signoff template
   244	
   245	  // Timing Controls
   246	  responseDelayMin      Int     @default(0) // Minimum seconds before replying
   247	  responseDelayMax      Int     @default(5) // Maximum seconds before replying
   248	  rateLimitMinutes      Int     @default(2) // Minutes between auto-replies
   249	  businessHoursStart    String  @default("07:00") // HH:mm format
   250	  businessHoursEnd      String  @default("21:30") // HH:mm format
   251	  timezone              String  @default("Asia/Dubai")
   252	  allowOutsideHours     Boolean @default(false) // Allow replies outside business hours
   253	  firstMessageImmediate Boolean @default(true) // Reply immediately to first message
   254	
   255	  // Response Rules
   256	  similarityThreshold  Float   @default(0.7) // Training document similarity threshold
   257	  confidenceThreshold  Int     @default(50) // Minimum confidence to auto-reply
   258	  escalateToHumanRules String? // JSON array of patterns that trigger human escalation
   259	  skipAutoReplyRules   String? // JSON array of patterns that skip auto-reply
   260	
   261	  // Language Settings
   262	  defaultLanguage    String  @default("en") // en | ar
   263	  autoDetectLanguage Boolean @default(true)
   264	
   265	  createdAt DateTime @default(now())
   266	  updatedAt DateTime @updatedAt
   267	
   268	  // Relations
   269	  leads Lead[] // Leads assigned to this agent
   270	
   271	  @@index([isActive, isDefault])
   272	  @@index([name])
   273	}
```

## prisma/schema.prisma (requested 689-702, actual 689-702, total 899)

```prisma
   689	model AITrainingDocument {
   690	  id              Int      @id @default(autoincrement())
   691	  title           String
   692	  content         String // Long text content for AI training
   693	  type            String // guidance | examples | policies | scripts
   694	  createdByUserId Int
   695	  createdAt       DateTime @default(now())
   696	  updatedAt       DateTime @updatedAt
   697	
   698	  createdBy User @relation(fields: [createdByUserId], references: [id])
   699	
   700	  @@index([type])
   701	  @@index([createdAt])
   702	}
```

## prisma/schema.prisma (requested 311-377, actual 311-377, total 899)

```prisma
   311	model Conversation {
   312	  id                     Int       @id @default(autoincrement())
   313	  contact                Contact   @relation(fields: [contactId], references: [id])
   314	  contactId              Int
   315	  lead                   Lead?     @relation(fields: [leadId], references: [id])
   316	  leadId                 Int?
   317	  channel                String    @default("whatsapp") // WHATSAPP | EMAIL | INSTAGRAM | FACEBOOK | WEBCHAT | INTERNAL_NOTE
   318	  externalId             String? // Provider conversation/thread ID (generic, works for all channels)
   319	  externalThreadId       String? // Legacy field - kept for backward compatibility
   320	  waConversationId       String? // WhatsApp-specific conversation ID from Meta (legacy)
   321	  waUserWaId             String? // WhatsApp user ID (phone/waid)
   322	  status                 String    @default("open") // open | closed
   323	  lastMessageAt          DateTime  @default(now())
   324	  lastInboundAt          DateTime? // Last inbound message timestamp
   325	  lastOutboundAt         DateTime? // Last outbound message timestamp
   326	  needsReplySince        DateTime? // When conversation started needing reply
   327	  slaBreachAt            DateTime? // When SLA was breached
   328	  priorityScore          Int       @default(0) // Computed priority (0-100)
   329	  assignedUserId         Int?
   330	  assignedUser           User?     @relation(fields: [assignedUserId], references: [id])
   331	  unreadCount            Int       @default(0)
   332	  lockedService          String? // Service type locked for this conversation (visit_visa, freelance_visa, etc.)
   333	  ruleEngineMemory       String? // JSON: Rule engine conversation memory (name, service, nationality, etc.)
   334	  // Conversation Flow State Machine (persisted)
   335	  flowKey                String? // e.g., "family_visa", "freelance_visa", "business_setup"
   336	  flowStep               String? // e.g., "WAIT_SPONSOR_VISA_TYPE", "WAIT_FAMILY_LOCATION", "PRICING"
   337	  lastQuestionKey        String? // e.g., "SPONSOR_VISA_TYPE", "FAMILY_LOCATION" - prevents asking same question
   338	  lastQuestionAt         DateTime? // When we last asked a question
   339	  collectedData          String? // JSON: Collected data (sponsorVisaType, familyLocation, dependentsCount, etc.)
   340	  lastAutoReplyKey       String? // PROBLEM D FIX: Hash of (ruleEngineVersion + leadId/contactId + lastInboundExternalId + nextQuestionKey) for dedupe
   341	  aiStateJson            String? // JSON: Reply Engine FSM state (serviceKey, stage, collected, askedQuestionKeys, etc.)
   342	  // Fail-proof dedupe and state machine fields
   343	  stateVersion           Int       @default(0) // Optimistic concurrency control
   344	  lastAssistantMessageAt DateTime? // Last AI-generated message timestamp
   345	  qualificationStage     String? // 'GREETING' | 'COLLECTING_NAME' | 'COLLECTING_SERVICE' | 'COLLECTING_DETAILS' | 'READY_FOR_QUOTE'
   346	  questionsAskedCount    Int       @default(0) // Track total questions asked (max 5 for business setup)
   347	  knownFields            String? // JSON: { name, service, nationality, expiry, businessActivity, etc. }
   348	  deletedAt              DateTime? // Soft delete timestamp
   349	  createdAt              DateTime  @default(now())
   350	  updatedAt              DateTime  @updatedAt
   351	
   352	  messages             Message[]
   353	  communicationLogs    CommunicationLog[]
   354	  aiDrafts             AIDraft[]
   355	  aiActionLogs         AIActionLog[]
   356	  statusEvents         MessageStatusEvent[]
   357	  tasks                Task[]                @relation("ConversationTasks")
   358	  notifications        Notification[]
   359	  autoReplyLogs        AutoReplyLog[]
   360	  inboundMessageDedups InboundMessageDedup[]
   361	  outboundMessageLogs  OutboundMessageLog[]
   362	  replyEngineLogs      ReplyEngineLog[]
   363	  outboundJobs         OutboundJob[]
   364	  // Note: Partial unique index for externalThreadId will be added via migration
   365	
   366	  // C) CONVERSATION UNIQUENESS: One conversation per (contactId, channel, externalThreadId)
   367	  // PostgreSQL handles NULL in unique constraints: multiple NULLs are allowed
   368	  // So: (contactId=1, channel='whatsapp', externalThreadId=NULL) can exist multiple times
   369	  // But: (contactId=1, channel='whatsapp', externalThreadId='thread123') must be unique
   370	  // For null externalThreadId, we use a fallback key in upsertConversation()
   371	  @@unique([contactId, channel])
   372	  @@index([channel, lastMessageAt])
   373	  @@index([contactId])
   374	  @@index([assignedUserId, lastMessageAt])
   375	  @@index([externalId])
   376	  @@index([channel, contactId, externalThreadId]) // For upsert logic with externalThreadId
   377	}
```

## prisma/schema.prisma (requested 122-220, actual 122-220, total 899)

```prisma
   122	model Lead {
   123	  id            Int          @id @default(autoincrement())
   124	  contact       Contact      @relation(fields: [contactId], references: [id])
   125	  contactId     Int
   126	  leadType      String? // Legacy field for backward compatibility
   127	  serviceTypeId Int? // New relation to ServiceType
   128	  serviceType   ServiceType? @relation(fields: [serviceTypeId], references: [id])
   129	
   130	  // Locked enums per spec (stored as strings - works for both SQLite and PostgreSQL)
   131	  stage              String  @default("NEW") // NEW | CONTACTED | ENGAGED | QUALIFIED | PROPOSAL_SENT | IN_PROGRESS | COMPLETED_WON | LOST | ON_HOLD
   132	  serviceTypeEnum    String? // Direct enum field: MAINLAND_BUSINESS_SETUP | FREEZONE_BUSINESS_SETUP | etc.
   133	  priority           String? @default("NORMAL") // LOW | NORMAL | HIGH | URGENT
   134	  lastContactChannel String? // whatsapp | instagram | facebook | website | email | internal
   135	
   136	  // Legacy string fields (for backward compatibility during migration)
   137	  status        String  @default("new")
   138	  pipelineStage String  @default("new")
   139	  urgency       String?
   140	
   141	  notes               String?
   142	  priorityScore       Int?
   143	  aiScore             Int? // AI-generated score (0-100)
   144	  aiNotes             String? // AI-generated qualification notes
   145	  dataJson            String? // JSON: Extracted structured fields (service, nationality, expiry hints, counts, etc.)
   146	  businessActivityRaw String? // Raw business activity mentioned by customer (e.g., "marketing license", "general trading") - stored as-is without questioning
   147	  requestedServiceRaw String? // PROBLEM B FIX: Raw service text mentioned by customer (e.g., "freelance visa", "business setup") - stored exactly as mentioned
   148	
   149	  // Assignment and follow-up
   150	  assignedUserId Int?
   151	  assignedUser   User?     @relation(fields: [assignedUserId], references: [id])
   152	  nextFollowUpAt DateTime?
   153	  lastContactAt  DateTime? // Last communication timestamp
   154	  lastInboundAt  DateTime? // Last inbound message timestamp (for lead)
   155	  lastOutboundAt DateTime? // Last outbound message timestamp (for lead)
   156	  valueEstimate  String? // Revenue estimate (decimal as string)
   157	
   158	  // Legacy expiry tracking (kept for backward compatibility)
   159	  expiryDate         DateTime?
   160	  autoWorkflowStatus String?
   161	  expiry90Sent       Boolean   @default(false)
   162	  expiry30Sent       Boolean   @default(false)
   163	
   164	  // Renewal tracking fields
   165	  isRenewal             Boolean     @default(false)
   166	  originalExpiryItemId  Int? // If this lead came from a renewal
   167	  originalExpiryItem    ExpiryItem? @relation("OriginalExpiryLeads", fields: [originalExpiryItemId], references: [id])
   168	  estimatedValue        String? // Decimal stored as string (works for both SQLite and PostgreSQL)
   169	  estimatedRenewalValue String? // Renewal revenue estimate
   170	  renewalProbability    Int? // 0-100 probability of renewal
   171	  renewalNotes          String? // AI-generated renewal insights
   172	
   173	  // Automation control
   174	  autopilotEnabled Boolean @default(true) // Lead-level autopilot toggle
   175	
   176	  // Auto-reply settings (simplified autopilot)
   177	  autoReplyEnabled  Boolean   @default(true) // Enable auto-reply for this lead
   178	  autoReplyMode     String? // AI_ONLY | TEMPLATES_FIRST | OFF
   179	  mutedUntil        DateTime? // Mute auto-replies until this date
   180	  lastAutoReplyAt   DateTime? // Last auto-reply timestamp (for rate limiting)
   181	  allowOutsideHours Boolean   @default(false) // Allow replies outside business hours
   182	
   183	  // AI Agent Profile assignment
   184	  aiAgentProfileId Int?
   185	  aiAgentProfile   AIAgentProfile? @relation(fields: [aiAgentProfileId], references: [id])
   186	
   187	  // Info/Quotation sharing tracking (Phase 2)
   188	  infoSharedAt       DateTime? // When information was shared with customer
   189	  quotationSentAt    DateTime? // When quotation was sent to customer
   190	  lastInfoSharedType String? // Type of info shared: "pricing" | "brochure" | "document" | "details" | "quotation"
   191	
   192	  // Deal Probability & Revenue Forecasting (Deterministic)
   193	  dealProbability          Int? // 0-100 probability of closing the deal
   194	  expectedRevenueAED       Int? // Expected revenue in AED (nullable if service unknown)
   195	  forecastReasonJson       String? // JSON array of factor strings explaining the probability
   196	  serviceFeeAED            Int? // Optional: Staff-entered service fee override
   197	  stageProbabilityOverride Int? // Optional: Manual override for stage-based probability
   198	  forecastModelVersion     String? // Version of forecast model used (e.g., "forecast_v1")
   199	  forecastLastComputedAt   DateTime? // When forecast was last computed
   200	
   201	  createdAt DateTime @default(now())
   202	  updatedAt DateTime @updatedAt
   203	
   204	  communicationLogs  CommunicationLog[]
   205	  tasks              Task[]
   206	  documents          Document[]
   207	  checklistItems     ChecklistItem[]
   208	  chatMessages       ChatMessage[]
   209	  sentAutomations    SentAutomation[]
   210	  expiryItems        ExpiryItem[]       @relation("LeadExpiryItems")
   211	  renewalExpiryLeads ExpiryItem[]       @relation("RenewalExpiryLeads")
   212	  messages           Message[]
   213	  conversations      Conversation[]
   214	  automationRunLogs  AutomationRunLog[]
   215	  aiDrafts           AIDraft[]
   216	  aiActionLogs       AIActionLog[]
   217	  notifications      Notification[]
   218	  reminders          Reminder[]
   219	  autoReplyLogs      AutoReplyLog[]
   220	}
```

## src/lib/llm/routing.ts (requested 84-218, actual 84-218, total 265)

```ts
    84	  async route(
    85	    messages: LLMMessage[],
    86	    options: LLMCompletionOptions = {},
    87	    context?: {
    88	      leadStage?: string
    89	      conversationLength?: number
    90	      hasMultipleQuestions?: boolean
    91	      requiresReasoning?: boolean
    92	      taskType?: 'greeting' | 'followup' | 'reminder' | 'complex' | 'other' // NEW: task type hint
    93	    }
    94	  ): Promise<{
    95	    result: LLMCompletionResult
    96	    decision: LLMRoutingDecision
    97	    escalated: boolean
    98	  }> {
    99	    // Get available providers
   100	    const availableProviders = await this.getAvailableProviders()
   101	    
   102	    if (availableProviders.length === 0) {
   103	      throw new Error('No LLM providers available. Configure at least one: DeepSeek, OpenAI, Anthropic, or Groq.')
   104	    }
   105	
   106	    // Analyze complexity
   107	    const analysis = analyzeComplexity(messages, context)
   108	    const needsPremium = requiresPremiumLLM(analysis)
   109	    
   110	    // Determine task type from context or message content
   111	    const taskType = context?.taskType || this.detectTaskType(messages)
   112	    const isSimpleTask = taskType === 'greeting' || taskType === 'followup' || taskType === 'reminder'
   113	
   114	    // Routing strategy:
   115	    // - Primary: DeepSeek (for all tasks - cost-effective and high quality)
   116	    // - Fallback: OpenAI → Anthropic → Groq
   117	    // - DeepSeek is preferred for both simple and complex tasks
   118	    
   119	    let primaryProvider: LLMProvider | null = null
   120	    let fallbackProviders: LLMProvider[] = []
   121	    
   122	    // Always prefer DeepSeek as primary
   123	    if (availableProviders.some(p => p.name === 'deepseek')) {
   124	      primaryProvider = availableProviders.find(p => p.name === 'deepseek')!
   125	      // Fallback order: OpenAI → Anthropic → Groq
   126	      fallbackProviders = availableProviders.filter(p => p.name !== 'deepseek').sort((a, b) => {
   127	        const order = { 'openai': 1, 'anthropic': 2, 'llama3': 3 }
   128	        return (order[a.name as keyof typeof order] || 99) - (order[b.name as keyof typeof order] || 99)
   129	      })
   130	    } else {
   131	      // DeepSeek not available, use OpenAI as primary
   132	      if (availableProviders.some(p => p.name === 'openai')) {
   133	        primaryProvider = availableProviders.find(p => p.name === 'openai')!
   134	        fallbackProviders = availableProviders.filter(p => p.name !== 'openai')
   135	      } else {
   136	        // No DeepSeek or OpenAI, use first available
   137	        primaryProvider = availableProviders[0]
   138	        fallbackProviders = availableProviders.slice(1)
   139	      }
   140	    }
   141	
   142	    if (!primaryProvider) {
   143	      throw new Error('No suitable LLM provider found')
   144	    }
   145	
   146	    // Try providers in order: primary → fallbacks
   147	    const providersToTry = [primaryProvider, ...fallbackProviders]
   148	    let lastError: Error | null = null
   149	    let escalated = false
   150	
   151	    for (let i = 0; i < providersToTry.length; i++) {
   152	      const provider = providersToTry[i]
   153	      const isFallback = i > 0
   154	
   155	      try {
   156	        console.log(`🔄 [LLM-ROUTING] Trying ${provider.name}${isFallback ? ' (fallback)' : ' (primary)'} for task: ${taskType}`)
   157	        console.log(`🚀 [LLM-ROUTING] Making API call to ${provider.name}...`)
   158	        
   159	        const result = await provider.complete(messages, options)
   160	        
   161	        console.log(`✅ [LLM-ROUTING] ${provider.name} succeeded: ${result.text.substring(0, 100)}...`)
   162	        console.log(`✅ [LLM-ROUTING] Response length: ${result.text.length} chars`)
   163	
   164	        // Create decision
   165	        const decision: LLMRoutingDecision = {
   166	          provider,
   167	          reason: isFallback 
   168	            ? `Using ${provider.name} as fallback (DeepSeek primary failed)`
   169	            : provider.name === 'deepseek'
   170	              ? `Using DeepSeek (primary) for ${taskType} task`
   171	              : `Using ${provider.name} (DeepSeek not available)`,
   172	          complexity: analysis.level,
   173	          estimatedCost: this.estimateCost(provider, messages, options),
   174	        }
   175	
   176	        // Log usage
   177	        try {
   178	          await logUsage({
   179	            provider: provider.name,
   180	            model: result.model || provider.model,
   181	            promptTokens: result.tokensUsed?.prompt || 0,
   182	            completionTokens: result.tokensUsed?.completion || 0,
   183	            totalTokens: result.tokensUsed?.total || 0,
   184	            cost: this.calculateCost(provider, result.tokensUsed || { prompt: 0, completion: 0, total: 0 }),
   185	            reason: decision.reason,
   186	            complexity: analysis.level,
   187	            success: true,
   188	            timestamp: new Date(),
   189	          })
   190	        } catch (logError) {
   191	          console.warn('Failed to log LLM usage:', logError)
   192	        }
   193	
   194	        return {
   195	          result,
   196	          decision,
   197	          escalated: isFallback,
   198	        }
   199	      } catch (error: any) {
   200	        const errorMsg = error.message || 'Unknown error'
   201	        console.error(`❌ [LLM-ROUTING] ${provider.name} failed:`, errorMsg)
   202	        if (error.stack) {
   203	          console.error(`❌ [LLM-ROUTING] ${provider.name} error stack:`, error.stack)
   204	        }
   205	        lastError = error
   206	        escalated = true
   207	        // Continue to next provider
   208	      }
   209	    }
   210	
   211	    // All providers failed
   212	    const finalError = `All LLM providers failed. Last error: ${lastError?.message || 'Unknown error'}`
   213	    console.error(`❌ [LLM-ROUTING] ${finalError}`)
   214	    if (lastError?.stack) {
   215	      console.error(`❌ [LLM-ROUTING] Last error stack:`, lastError.stack)
   216	    }
   217	    throw new Error(finalError)
   218	  }
```

## src/app/api/admin/ai-training/upload/route.ts (requested 57-268, actual 57-268, total 268)

```ts
    57	export async function POST(req: NextRequest) {
    58	  try {
    59	    const user = await requireAdminApi()
    60	
    61	    const formData = await req.formData()
    62	    const file = formData.get('file') as File | null
    63	    const title = formData.get('title') as string | null
    64	    const type = formData.get('type') as string | null
    65	
    66	    console.log('Upload request received:', {
    67	      hasFile: !!file,
    68	      fileName: file?.name,
    69	      fileSize: file?.size,
    70	      fileType: file?.type,
    71	      title,
    72	      type,
    73	    })
    74	
    75	    if (!file) {
    76	      return NextResponse.json(
    77	        { ok: false, error: 'No file provided' },
    78	        { status: 400 }
    79	      )
    80	    }
    81	
    82	    if (!title || !title.trim()) {
    83	      return NextResponse.json(
    84	        { ok: false, error: 'Title is required' },
    85	        { status: 400 }
    86	      )
    87	    }
    88	
    89	    if (!type || !type.trim()) {
    90	      return NextResponse.json(
    91	        { ok: false, error: 'Type is required' },
    92	        { status: 400 }
    93	      )
    94	    }
    95	
    96	    // Validate file size (max 5MB for text extraction)
    97	    const maxSize = 5 * 1024 * 1024 // 5MB
    98	    if (file.size > maxSize) {
    99	      return NextResponse.json(
   100	        { ok: false, error: 'File size exceeds 5MB limit' },
   101	        { status: 400 }
   102	      )
   103	    }
   104	
   105	    // Validate file type - check both MIME type and extension
   106	    const allowedTypes = [
   107	      'application/pdf',
   108	      'text/plain',
   109	      'application/msword',
   110	      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   111	      'text/markdown',
   112	    ]
   113	    
   114	    const allowedExtensions = ['.pdf', '.txt', '.doc', '.docx', '.md']
   115	    const fileName = file.name.toLowerCase()
   116	    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext))
   117	    const hasValidMimeType = allowedTypes.includes(file.type)
   118	
   119	    if (!hasValidMimeType && !hasValidExtension) {
   120	      console.warn('File type validation failed:', {
   121	        fileName: file.name,
   122	        mimeType: file.type,
   123	        hasValidExtension,
   124	        hasValidMimeType,
   125	      })
   126	      return NextResponse.json(
   127	        { ok: false, error: 'File type not supported. Only PDF, TXT, DOC, DOCX, and MD files are allowed.' },
   128	        { status: 400 }
   129	      )
   130	    }
   131	
   132	    // Read file content with UTF-8 encoding
   133	    const bytes = await file.arrayBuffer()
   134	    let buffer = Buffer.from(bytes)
   135	    
   136	    // Extract text with UTF-8 encoding and retry mechanism
   137	    let content = ''
   138	    
   139	    if (file.type === 'text/plain' || file.type === 'text/markdown') {
   140	      // Try UTF-8 first, fallback to latin1 if needed
   141	      try {
   142	        content = buffer.toString('utf-8')
   143	        // Validate UTF-8
   144	        if (!Buffer.from(content, 'utf-8').equals(buffer)) {
   145	          content = buffer.toString('latin1')
   146	        }
   147	      } catch {
   148	        content = buffer.toString('latin1')
   149	      }
   150	    } else if (file.type === 'application/pdf') {
   151	      // PDF extraction with retry
   152	      content = await extractPDFWithRetry(buffer, 3)
   153	      if (!content) {
   154	        return NextResponse.json(
   155	          { 
   156	            ok: false, 
   157	            error: 'PDF extraction failed after retries. Please copy and paste the content manually, or convert PDF to text first.' 
   158	          },
   159	          { status: 400 }
   160	        )
   161	      }
   162	    } else {
   163	      // For DOC/DOCX, suggest manual input
   164	      return NextResponse.json(
   165	        { 
   166	          ok: false, 
   167	          error: 'Word document extraction not yet implemented. Please copy and paste the content manually.' 
   168	        },
   169	        { status: 400 }
   170	      )
   171	    }
   172	
   173	    // Normalize content (remove BOM, normalize line endings)
   174	    content = content
   175	      .replace(/^\uFEFF/, '') // Remove BOM
   176	      .replace(/\r\n/g, '\n') // Normalize line endings
   177	      .trim()
   178	
   179	    if (!content.trim()) {
   180	      return NextResponse.json(
   181	        { ok: false, error: 'File appears to be empty or could not be read' },
   182	        { status: 400 }
   183	      )
   184	    }
   185	
   186	    // Create training document
   187	    let document
   188	    try {
   189	      console.log('Creating training document:', {
   190	        title: title.trim(),
   191	        type,
   192	        contentLength: content.trim().length,
   193	        userId: user.id,
   194	      })
   195	      
   196	      document = await prisma.aITrainingDocument.create({
   197	        data: {
   198	          title: title.trim(),
   199	          content: content.trim(),
   200	          type,
   201	          createdByUserId: user.id,
   202	        },
   203	      })
   204	      
   205	      console.log('✅ Training document created:', document.id)
   206	    } catch (error: any) {
   207	      console.error('❌ Failed to create training document:', {
   208	        error: error.message,
   209	        code: error.code,
   210	        meta: error.meta,
   211	      })
   212	      
   213	      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
   214	        return NextResponse.json(
   215	          { ok: false, error: 'AI Training table does not exist. Please run database migration first.' },
   216	          { status: 503 }
   217	        )
   218	      }
   219	      
   220	      // More specific error messages
   221	      if (error.code === 'P2002') {
   222	        return NextResponse.json(
   223	          { ok: false, error: 'A document with this title already exists. Please use a different title.' },
   224	          { status: 409 }
   225	        )
   226	      }
   227	      
   228	      throw error
   229	    }
   230	
   231	    // Index document in vector store (async, don't wait)
   232	    // Use void to explicitly mark as fire-and-forget
   233	    void import('@/lib/ai/vectorStore')
   234	      .then(({ indexTrainingDocument }) => {
   235	        console.log('🔄 Indexing document in vector store:', document.id)
   236	        return indexTrainingDocument(document.id)
   237	      })
   238	      .then(() => {
   239	        console.log('✅ Document indexed in vector store:', document.id)
   240	      })
   241	      .catch(err => {
   242	        console.error('❌ Failed to index document in vector store:', err)
   243	      })
   244	
   245	    console.log('✅ Upload completed successfully:', {
   246	      documentId: document.id,
   247	      title: document.title,
   248	      type: document.type,
   249	    })
   250	
   251	    return NextResponse.json({
   252	      ok: true,
   253	      document: {
   254	        id: document.id,
   255	        title: document.title,
   256	        type: document.type,
   257	        createdAt: document.createdAt,
   258	        updatedAt: document.updatedAt,
   259	      },
   260	    })
   261	  } catch (error: any) {
   262	    console.error('POST /api/admin/ai-training/upload error:', error)
   263	    return NextResponse.json(
   264	      { ok: false, error: error.message || 'Failed to upload and process file' },
   265	      { status: 500 }
   266	    )
   267	  }
   268	}
```

## src/components/admin/ResponseSettingsTab.tsx (requested 355-808, actual 355-808, total 820)

```tsx
   355	  return (
   356	    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
   357	      {/* Left: Agent List */}
   358	      <BentoCard className="lg:col-span-1" title="AI Agents">
   359	        <Button onClick={handleNewAgent} className="w-full mb-4" size="sm">
   360	          <Plus className="h-4 w-4 mr-2" />
   361	          New Agent
   362	        </Button>
   363	
   364	        {loading ? (
   365	          <div className="space-y-2">
   366	            <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
   367	            <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
   368	          </div>
   369	        ) : agents.length === 0 ? (
   370	          <div className="text-center py-8 text-muted-foreground">
   371	            <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
   372	            <p className="text-sm">No agents configured</p>
   373	            <p className="text-xs text-slate-500">Create your first AI agent</p>
   374	          </div>
   375	        ) : (
   376	          <div className="space-y-2">
   377	            {agents.map((agent) => (
   378	              <div
   379	                key={agent.id}
   380	                onClick={() => {
   381	                  setSelectedAgent(agent)
   382	                  setIsCreating(false)
   383	                }}
   384	                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
   385	                  selectedAgent?.id === agent.id
   386	                    ? 'bg-primary/10 border-primary'
   387	                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
   388	                }`}
   389	              >
   390	                <div className="flex items-start justify-between gap-2">
   391	                  <div className="flex-1 min-w-0">
   392	                    <div className="flex items-center gap-2">
   393	                      <h3 className="font-medium text-sm truncate">{agent.name}</h3>
   394	                      {agent.isDefault && (
   395	                        <Badge variant="outline" className="text-xs">Default</Badge>
   396	                      )}
   397	                      {!agent.isActive && (
   398	                        <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
   399	                      )}
   400	                    </div>
   401	                    {agent.description && (
   402	                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
   403	                        {agent.description}
   404	                      </p>
   405	                    )}
   406	                    <div className="flex items-center gap-2 mt-2">
   407	                      <Badge variant="outline" className="text-xs">
   408	                        {agent.tone}
   409	                      </Badge>
   410	                    </div>
   411	                  </div>
   412	                  <Button
   413	                    variant="ghost"
   414	                    size="sm"
   415	                    onClick={(e) => {
   416	                      e.stopPropagation()
   417	                      deleteAgent(agent.id)
   418	                    }}
   419	                    className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
   420	                  >
   421	                    <Trash2 className="h-3 w-3" />
   422	                  </Button>
   423	                </div>
   424	              </div>
   425	            ))}
   426	          </div>
   427	        )}
   428	      </BentoCard>
   429	
   430	      {/* Right: Agent Settings Editor */}
   431	      <BentoCard 
   432	        className="lg:col-span-2" 
   433	        title={selectedAgent ? `Edit: ${selectedAgent.name}` : isCreating ? 'New Agent' : 'Select an Agent'}
   434	      >
   435	        {selectedAgent || isCreating ? (
   436	          <div className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto">
   437	            {/* Basic Information */}
   438	            <Section title="Basic Information">
   439	              <div className="space-y-4">
   440	                <div>
   441	                  <Label htmlFor="agent-name">Agent Name *</Label>
   442	                  <Input
   443	                    id="agent-name"
   444	                    value={formData.name || ''}
   445	                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
   446	                    placeholder="e.g., Sales Agent, Customer Support Agent"
   447	                  />
   448	                </div>
   449	                <div>
   450	                  <Label htmlFor="agent-description">Description</Label>
   451	                  <Textarea
   452	                    id="agent-description"
   453	                    value={formData.description || ''}
   454	                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
   455	                    placeholder="Brief description of this agent's purpose"
   456	                    rows={2}
   457	                  />
   458	                </div>
   459	                <div className="grid grid-cols-2 gap-4">
   460	                  <div>
   461	                    <Label htmlFor="agent-language">Default Language</Label>
   462	                    <select
   463	                      id="agent-language"
   464	                      value={formData.defaultLanguage || 'en'}
   465	                      onChange={(e) => setFormData({ ...formData, defaultLanguage: e.target.value })}
   466	                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
   467	                    >
   468	                      <option value="en">English</option>
   469	                      <option value="ar">Arabic</option>
   470	                    </select>
   471	                  </div>
   472	                  <div>
   473	                    <Label htmlFor="agent-tone">Tone</Label>
   474	                    <select
   475	                      id="agent-tone"
   476	                      value={formData.tone || 'friendly'}
   477	                      onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
   478	                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
   479	                    >
   480	                      <option value="professional">Professional</option>
   481	                      <option value="friendly">Friendly</option>
   482	                      <option value="short">Short</option>
   483	                    </select>
   484	                  </div>
   485	                </div>
   486	                <div className="flex items-center gap-4">
   487	                  <div className="flex items-center gap-2">
   488	                    <Switch
   489	                      id="agent-active"
   490	                      checked={formData.isActive ?? true}
   491	                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
   492	                    />
   493	                    <Label htmlFor="agent-active" className="cursor-pointer">Active</Label>
   494	                  </div>
   495	                  <div className="flex items-center gap-2">
   496	                    <Switch
   497	                      id="agent-default"
   498	                      checked={formData.isDefault ?? false}
   499	                      onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
   500	                    />
   501	                    <Label htmlFor="agent-default" className="cursor-pointer">Set as Default</Label>
   502	                  </div>
   503	                  <div className="flex items-center gap-2">
   504	                    <Switch
   505	                      id="agent-auto-detect"
   506	                      checked={formData.autoDetectLanguage ?? true}
   507	                      onCheckedChange={(checked) => setFormData({ ...formData, autoDetectLanguage: checked })}
   508	                    />
   509	                    <Label htmlFor="agent-auto-detect" className="cursor-pointer">Auto-detect Language</Label>
   510	                  </div>
   511	                </div>
   512	              </div>
   513	            </Section>
   514	
   515	            {/* Training Documents Selection */}
   516	            <Section title="Training Documents">
   517	              <p className="text-sm text-muted-foreground mb-3">
   518	                Select which training documents this agent should use for guidance
   519	              </p>
   520	              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
   521	                {trainingDocuments.length === 0 ? (
   522	                  <p className="text-sm text-muted-foreground text-center py-4">
   523	                    No training documents available. Create some in the Training Documents tab.
   524	                  </p>
   525	                ) : (
   526	                  trainingDocuments.map((doc) => (
   527	                    <label key={doc.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
   528	                      <input
   529	                        type="checkbox"
   530	                        checked={selectedTrainingDocs.includes(doc.id)}
   531	                        onChange={(e) => {
   532	                          const newIds = e.target.checked
   533	                            ? [...selectedTrainingDocs, doc.id]
   534	                            : selectedTrainingDocs.filter((id) => id !== doc.id)
   535	                          setFormData({ ...formData, trainingDocumentIds: newIds })
   536	                        }}
   537	                        className="rounded"
   538	                      />
   539	                      <span className="text-sm flex-1">
   540	                        {doc.title} <Badge variant="outline" className="ml-2 text-xs">{doc.type}</Badge>
   541	                      </span>
   542	                    </label>
   543	                  ))
   544	                )}
   545	              </div>
   546	            </Section>
   547	
   548	            {/* Response Behavior */}
   549	            <Section title="Response Behavior">
   550	              <div className="space-y-4">
   551	                <div>
   552	                  <Label htmlFor="agent-system-prompt">Custom System Prompt</Label>
   553	                  <Textarea
   554	                    id="agent-system-prompt"
   555	                    value={formData.systemPrompt || ''}
   556	                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
   557	                    placeholder="Leave empty to use default system prompt. This overrides the base prompt."
   558	                    rows={6}
   559	                  />
   560	                </div>
   561	                <div className="grid grid-cols-3 gap-4">
   562	                  <div>
   563	                    <Label htmlFor="agent-max-first">Max First Message Length</Label>
   564	                    <Input
   565	                      id="agent-max-first"
   566	                      type="number"
   567	                      value={formData.maxMessageLength || 300}
   568	                      onChange={(e) => setFormData({ ...formData, maxMessageLength: parseInt(e.target.value) || 300 })}
   569	                    />
   570	                  </div>
   571	                  <div>
   572	                    <Label htmlFor="agent-max-total">Max Total Length</Label>
   573	                    <Input
   574	                      id="agent-max-total"
   575	                      type="number"
   576	                      value={formData.maxTotalLength || 600}
   577	                      onChange={(e) => setFormData({ ...formData, maxTotalLength: parseInt(e.target.value) || 600 })}
   578	                    />
   579	                  </div>
   580	                  <div>
   581	                    <Label htmlFor="agent-max-questions">Max Questions Per Message</Label>
   582	                    <Input
   583	                      id="agent-max-questions"
   584	                      type="number"
   585	                      value={formData.maxQuestionsPerMessage || 2}
   586	                      onChange={(e) => setFormData({ ...formData, maxQuestionsPerMessage: parseInt(e.target.value) || 2 })}
   587	                    />
   588	                  </div>
   589	                </div>
   590	              </div>
   591	            </Section>
   592	
   593	            {/* Content Guidelines */}
   594	            <Section title="Content Guidelines">
   595	              <div className="space-y-4">
   596	                <div>
   597	                  <Label htmlFor="agent-allowed">Allowed Phrases/Topics (one per line)</Label>
   598	                  <Textarea
   599	                    id="agent-allowed"
   600	                    value={formData.allowedPhrases || ''}
   601	                    onChange={(e) => setFormData({ ...formData, allowedPhrases: e.target.value })}
   602	                    placeholder="These phrases/topics will be emphasized in responses"
   603	                    rows={4}
   604	                  />
   605	                </div>
   606	                <div>
   607	                  <Label htmlFor="agent-prohibited">Prohibited Phrases/Topics (one per line)</Label>
   608	                  <Textarea
   609	                    id="agent-prohibited"
   610	                    value={formData.prohibitedPhrases || ''}
   611	                    onChange={(e) => setFormData({ ...formData, prohibitedPhrases: e.target.value })}
   612	                    placeholder="AI will never use these phrases"
   613	                    rows={4}
   614	                  />
   615	                </div>
   616	                <div className="grid grid-cols-2 gap-4">
   617	                  <div>
   618	                    <Label htmlFor="agent-greeting">Custom Greeting</Label>
   619	                    <Input
   620	                      id="agent-greeting"
   621	                      value={formData.customGreeting || ''}
   622	                      onChange={(e) => setFormData({ ...formData, customGreeting: e.target.value })}
   623	                      placeholder="e.g., Hi! Welcome to..."
   624	                    />
   625	                  </div>
   626	                  <div>
   627	                    <Label htmlFor="agent-signoff">Custom Signoff</Label>
   628	                    <Input
   629	                      id="agent-signoff"
   630	                      value={formData.customSignoff || ''}
   631	                      onChange={(e) => setFormData({ ...formData, customSignoff: e.target.value })}
   632	                      placeholder="e.g., Best regards, [Agent Name]"
   633	                    />
   634	                  </div>
   635	                </div>
   636	              </div>
   637	            </Section>
   638	
   639	            {/* Timing Controls */}
   640	            <Section title="Timing Controls">
   641	              <div className="space-y-4">
   642	                <div className="grid grid-cols-2 gap-4">
   643	                  <div>
   644	                    <Label htmlFor="agent-delay-min">Response Delay Min (seconds)</Label>
   645	                    <Input
   646	                      id="agent-delay-min"
   647	                      type="number"
   648	                      value={formData.responseDelayMin || 0}
   649	                      onChange={(e) => setFormData({ ...formData, responseDelayMin: parseInt(e.target.value) || 0 })}
   650	                    />
   651	                  </div>
   652	                  <div>
   653	                    <Label htmlFor="agent-delay-max">Response Delay Max (seconds)</Label>
   654	                    <Input
   655	                      id="agent-delay-max"
   656	                      type="number"
   657	                      value={formData.responseDelayMax || 5}
   658	                      onChange={(e) => setFormData({ ...formData, responseDelayMax: parseInt(e.target.value) || 5 })}
   659	                    />
   660	                  </div>
   661	                </div>
   662	                <div>
   663	                  <Label htmlFor="agent-rate-limit">Rate Limit (minutes between replies)</Label>
   664	                  <Input
   665	                    id="agent-rate-limit"
   666	                    type="number"
   667	                    value={formData.rateLimitMinutes || 2}
   668	                    onChange={(e) => setFormData({ ...formData, rateLimitMinutes: parseInt(e.target.value) || 2 })}
   669	                  />
   670	                </div>
   671	                <div className="grid grid-cols-2 gap-4">
   672	                  <div>
   673	                    <Label htmlFor="agent-hours-start">Business Hours Start (Not Enforced)</Label>
   674	                    <Input
   675	                      id="agent-hours-start"
   676	                      type="time"
   677	                      value={formData.businessHoursStart || '07:00'}
   678	                      onChange={(e) => setFormData({ ...formData, businessHoursStart: e.target.value })}
   679	                      disabled={true}
   680	                    />
   681	                    <p className="text-xs text-muted-foreground mt-1">Business hours are not currently enforced - replies are sent 24/7</p>
   682	                  </div>
   683	                  <div>
   684	                    <Label htmlFor="agent-hours-end">Business Hours End (Not Enforced)</Label>
   685	                    <Input
   686	                      id="agent-hours-end"
   687	                      type="time"
   688	                      value={formData.businessHoursEnd || '21:30'}
   689	                      onChange={(e) => setFormData({ ...formData, businessHoursEnd: e.target.value })}
   690	                      disabled={true}
   691	                    />
   692	                    <p className="text-xs text-muted-foreground mt-1">Business hours are not currently enforced - replies are sent 24/7</p>
   693	                  </div>
   694	                </div>
   695	                <div>
   696	                  <Label htmlFor="agent-timezone">Timezone (Not Enforced)</Label>
   697	                  <select
   698	                    id="agent-timezone"
   699	                    value={formData.timezone || 'Asia/Dubai'}
   700	                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
   701	                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
   702	                    disabled={true}
   703	                  >
   704	                    <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
   705	                    <option value="UTC">UTC</option>
   706	                    <option value="America/New_York">America/New_York</option>
   707	                    <option value="Europe/London">Europe/London</option>
   708	                  </select>
   709	                  <p className="text-xs text-muted-foreground mt-1">Timezone setting is saved but not enforced - replies are sent 24/7</p>
   710	                </div>
   711	                <div className="flex items-center gap-4">
   712	                  <div className="flex items-center gap-2">
   713	                    <Switch
   714	                      id="agent-outside-hours"
   715	                      checked={true}
   716	                      onCheckedChange={() => {}}
   717	                      disabled={true}
   718	                    />
   719	                    <Label htmlFor="agent-outside-hours" className="cursor-pointer">
   720	                      Allow Replies Outside Business Hours (Always Enabled - 24/7)
   721	                    </Label>
   722	                  </div>
   723	                  <p className="text-xs text-muted-foreground">Business hours are not currently enforced - all replies are sent 24/7</p>
   724	                  <div className="flex items-center gap-2">
   725	                    <Switch
   726	                      id="agent-immediate"
   727	                      checked={formData.firstMessageImmediate ?? true}
   728	                      onCheckedChange={(checked) => setFormData({ ...formData, firstMessageImmediate: checked })}
   729	                    />
   730	                    <Label htmlFor="agent-immediate" className="cursor-pointer">Reply Immediately to First Message</Label>
   731	                  </div>
   732	                </div>
   733	              </div>
   734	            </Section>
   735	
   736	            {/* Response Rules */}
   737	            <Section title="Response Rules">
   738	              <div className="space-y-4">
   739	                <div className="grid grid-cols-2 gap-4">
   740	                  <div>
   741	                    <Label htmlFor="agent-similarity">Similarity Threshold (0-1)</Label>
   742	                    <Input
   743	                      id="agent-similarity"
   744	                      type="number"
   745	                      step="0.1"
   746	                      min="0"
   747	                      max="1"
   748	                      value={formData.similarityThreshold || 0.7}
   749	                      onChange={(e) => setFormData({ ...formData, similarityThreshold: parseFloat(e.target.value) || 0.7 })}
   750	                    />
   751	                  </div>
   752	                  <div>
   753	                    <Label htmlFor="agent-confidence">Confidence Threshold (0-100)</Label>
   754	                    <Input
   755	                      id="agent-confidence"
   756	                      type="number"
   757	                      min="0"
   758	                      max="100"
   759	                      value={formData.confidenceThreshold || 50}
   760	                      onChange={(e) => setFormData({ ...formData, confidenceThreshold: parseInt(e.target.value) || 50 })}
   761	                    />
   762	                  </div>
   763	                </div>
   764	                <div>
   765	                  <Label htmlFor="agent-escalate">Escalate to Human Patterns (one per line)</Label>
   766	                  <Textarea
   767	                    id="agent-escalate"
   768	                    value={formData.escalateToHumanRules || ''}
   769	                    onChange={(e) => setFormData({ ...formData, escalateToHumanRules: e.target.value })}
   770	                    placeholder="Messages matching these patterns will escalate to human"
   771	                    rows={4}
   772	                  />
   773	                </div>
   774	                <div>
   775	                  <Label htmlFor="agent-skip">Skip Auto-Reply Patterns (one per line)</Label>
   776	                  <Textarea
   777	                    id="agent-skip"
   778	                    value={formData.skipAutoReplyRules || ''}
   779	                    onChange={(e) => setFormData({ ...formData, skipAutoReplyRules: e.target.value })}
   780	                    placeholder="Messages matching these patterns will skip auto-reply"
   781	                    rows={4}
   782	                  />
   783	                </div>
   784	              </div>
   785	            </Section>
   786	
   787	            {/* Actions */}
   788	            <div className="flex items-center gap-2 pt-4 border-t">
   789	              <Button onClick={saveAgent} disabled={saving || !formData.name?.trim()}>
   790	                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
   791	                {saving ? 'Saving...' : 'Save Agent'}
   792	              </Button>
   793	              {(selectedAgent || isCreating) && (
   794	                <Button variant="outline" onClick={handleCancel}>
   795	                  Cancel
   796	                </Button>
   797	              )}
   798	            </div>
   799	          </div>
   800	        ) : (
   801	          <EmptyState
   802	            icon={Settings}
   803	            title="Select an Agent"
   804	            description="Choose an agent from the list to configure its response settings, or create a new agent."
   805	          />
   806	        )}
   807	      </BentoCard>
   808	    </div>
```

----
Done. File written to: chatgpt_ai_audit_snippets.md
