// src/services/aiCallAnalysisService.ts

import { z } from 'zod';

// Define schemas for call analysis
export const CallMetadataSchema = z.object({
  callId: z.string(),
  agentId: z.string(),
  customerId: z.string().optional(),
  phoneNumber: z.string(),
  timestamp: z.string(),
  duration: z.number().optional(),
  recordingUrl: z.string().optional(),
});

export const CallAnalysisSchema = z.object({
  callId: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
  keyPhrases: z.array(z.string()),
  riskIndicators: z.array(z.object({
    type: z.string(),
    confidence: z.number(),
    context: z.string()
  })),
  loanQualificationScore: z.number().min(0).max(100).optional(),
  followUpRecommended: z.boolean(),
  agentPerformanceMetrics: z.object({
    clarity: z.number().min(0).max(100),
    empathy: z.number().min(0).max(100),
    effectiveness: z.number().min(0).max(100),
    complianceScore: z.number().min(0).max(100)
  }),
  transcriptionSegments: z.array(z.object({
    speaker: z.string(), // 'agent' or 'customer'
    startTime: z.number(),
    endTime: z.number(),
    text: z.string(),
    confidence: z.number().min(0).max(1)
  })).optional(),
  summary: z.string().optional(),
});

export type CallMetadata = z.infer<typeof CallMetadataSchema>;
export type CallAnalysis = z.infer<typeof CallAnalysisSchema>;

// Core prompting functions for the AI models
const generateSystemPrompt = (task: string): string => {
  return `You are a highly trained financial services AI assistant for DynaGen Lending. Your role is to ${task}. 
  
Focus on identifying:
- Customer sentiment and emotional state
- Financial capability signals (income stability, debt mentions, etc.)
- Risk factors or red flags
- Compliance with regulatory requirements
- Agent performance metrics

Base your analysis solely on facts present in the call. Maintain strict confidentiality and objectivity. 
Format your response according to the exact schema requested.`;
};

const generateAnalysisPrompt = (transcription: string): string => {
  return `Analyze the following call transcription between a loan agent and potential customer:

${transcription}

Provide a structured analysis that includes:
1. Overall customer sentiment
2. Key phrases that indicate financial situation
3. Any risk indicators with confidence scores (e.g., inconsistent statements, hesitation on financial questions)
4. Estimate a loan qualification score if enough information is present
5. Whether a follow-up call is recommended
6. Agent performance metrics evaluating clarity, empathy, effectiveness, and compliance

Format your response as structured data that can be parsed as JSON.`;
};

// API interface for call analysis
const analyzeCall = async (metadata: CallMetadata, audioData?: Blob): Promise<CallAnalysis> => {
  try {
    // 1. Get or generate transcription 
    const transcription = await getTranscription(metadata, audioData);
    
    // 2. Create and structure prompts for AI analysis
    const systemPrompt = generateSystemPrompt('analyze loan qualification calls');
    const analysisPrompt = generateAnalysisPrompt(transcription);
    
    // 3. Call the AI model with the prompts
    const analysisResult = await callAIModel({
      systemPrompt,
      userPrompt: analysisPrompt,
      temperature: 0.2, // Low temperature for more deterministic results
      maxTokens: 1500
    });
    
    // 4. Parse and validate the result
    const parsedResult = JSON.parse(analysisResult);
    return CallAnalysisSchema.parse({
      callId: metadata.callId,
      ...parsedResult
    });
  } catch (error) {
    console.error("AI call analysis failed:", error);
    throw new Error(`Failed to analyze call: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Helper function to obtain transcription
const getTranscription = async (metadata: CallMetadata, audioData?: Blob): Promise<string> => {
  // If we have direct audio data, transcribe it
  if (audioData) {
    return transcribeAudio(audioData);
  }
  
  // Otherwise try to fetch transcription from recording URL
  if (metadata.recordingUrl) {
    try {
      const response = await fetch(metadata.recordingUrl);
      const audio = await response.blob();
      return transcribeAudio(audio);
    } catch (error) {
      console.error("Failed to fetch recording:", error);
      throw new Error("Could not retrieve call recording");
    }
  }
  
  throw new Error("No audio data or recording URL provided");
};

// Audio transcription function
const transcribeAudio = async (audioData: Blob): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('file', audioData);
    formData.append('model', 'whisper-1');
    
    // This would call an external transcription service API
    // For example, using OpenAI's Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.text;
  } catch (error) {
    console.error("Failed to transcribe audio:", error);
    throw error;
  }
};

// Call to AI model for analysis
const callAIModel = async ({ 
  systemPrompt, 
  userPrompt, 
  temperature = 0.7, 
  maxTokens = 1000 
}: { 
  systemPrompt: string; 
  userPrompt: string; 
  temperature?: number; 
  maxTokens?: number; 
}): Promise<string> => {
  try {
    // This would call your AI service API
    // Could be OpenAI, Claude, or your custom model
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`AI model request failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.choices[0].message.content;
  } catch (error) {
    console.error("Failed to call AI model:", error);
    throw error;
  }
};

// Generate follow-up recommendations
const generateFollowUpRecommendations = async (analysis: CallAnalysis): Promise<string> => {
  if (!analysis.followUpRecommended) {
    return "No follow-up recommended based on call analysis.";
  }
  
  const systemPrompt = generateSystemPrompt('recommend follow-up actions for loan calls');
  const userPrompt = `Based on this call analysis, suggest specific follow-up actions for the loan agent:
  
${JSON.stringify(analysis, null, 2)}

Provide 3-5 concrete, actionable next steps with justifications based on what was discovered in the call.`;

  return callAIModel({
    systemPrompt,
    userPrompt,
    temperature: 0.4
  });
};

// Export the service functions
const aiCallAnalysisService = {
  analyzeCall,
  generateFollowUpRecommendations
};

export default aiCallAnalysisService;