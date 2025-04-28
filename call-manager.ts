// src/services/callManagerService.ts

import VicidialApi from './vicidialApi';
import aiCallAnalysisService, { CallMetadata } from './aiCallAnalysisService';
import { toast } from "@/components/ui/sonner";
import auditLogger from "./auditLogger";

interface CallRecording {
  callId: string;
  agentId: string;
  recordingUrl: string;
  startTime: Date;
  endTime?: Date;
  metadata: Record<string, any>;
}

class CallManagerService {
  private activeRecordings: Map<string, CallRecording> = new Map();
  private recordingEnabled: boolean = true;
  private activeCall: { callId: string; channelId: string } | null = null;
  
  // Initialize call recording system
  constructor() {
    // Load configuration from local storage or environment variables
    this.recordingEnabled = localStorage.getItem('recordingEnabled') !== 'false';
    
    // Log initialization for auditing
    auditLogger.logSecurity('call_manager_initialized', {
      timestamp: new Date().toISOString(),
      recordingEnabled: this.recordingEnabled
    });
  }
  
  // Start a new call 
  async startCall(phoneNumber: string, leadId: string, agentId: string): Promise<{ callId: string, success: boolean, message: string }> {
    try {
      // Validate inputs using prompt engineering pattern for reliability
      if (!phoneNumber || !leadId || !agentId) {
        throw new Error("Missing required parameters for call initiation");
      }
      
      // Log the call attempt
      auditLogger.logInfo('call_initiated', {
        phoneNumber,
        agentId,
        timestamp: new Date().toISOString()
      });
      
      // Call the VICIdial API to initiate the call
      const response = await VicidialApi.dialNumber(phoneNumber, leadId, agentId);
      
      if (response.result !== 'success') {
        throw new Error(response.result || "Failed to initiate call");
      }
      
      // Generate a unique call ID
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Store the active call information
      this.activeCall = { 
        callId,
        channelId: response.data?.channel || ''
      };
      
      // Start recording if enabled
      if (this.recordingEnabled) {
        this.startRecording(callId, agentId, phoneNumber);
      }
      
      // Display success notification
      toast.success("Call connected", {
        description: `Connected to ${phoneNumber}`
      });
      
      return {
        callId,
        success: true,
        message: "Call initiated successfully"
      };
    } catch (error) {
      // Log error and display error notification
      console.error("Failed to start call:", error);
      auditLogger.logError('call_initiation_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        phoneNumber,
        agentId,
        timestamp: new Date().toISOString()
      });
      
      toast.error("Call failed", {
        description: error instanceof Error ? error.message : "Unable to connect the call"
      });
      
      return {
        callId: '',
        success: false,
        message: error instanceof Error ? error.message : "Call initiation failed"
      };
    }
  }
  
  // End an active call
  async endCall(): Promise<boolean> {
    try {
      if (!this.activeCall) {
        throw new Error("No active call to end");
      }
      
      const { callId, channelId } = this.activeCall;
      
      // Log the call end attempt
      auditLogger.logInfo('call_ending', {
        callId,
        timestamp: new Date().toISOString()
      });
      
      // Stop recording if it's active
      if (this.recordingEnabled && this.activeRecordings.has(callId)) {
        await this.stopRecording(callId);
      }
      
      // Call the VICIdial API to hang up
      if (channelId) {
        await VicidialApi.hangupCall(channelId, callId);
      }
      
      // Clear the active call
      this.activeCall = null;
      
      // Display success notification
      toast.success("Call ended", {
        description: "The call has been disconnected"
      });
      
      return true;
    } catch (error) {
      // Log error and display error notification
      console.error("Failed to end call:", error);
      auditLogger.logError('call_end_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        callId: this.activeCall?.callId || 'unknown',
        timestamp: new Date().toISOString()
      });
      
      toast.error("End call failed", {
        description: error instanceof Error ? error.message : "Unable to disconnect the call"
      });
      
      return false;
    }
  }
  
  // Start recording a call
  private async startRecording(callId: string, agentId: string, phoneNumber: string): Promise<void> {
    try {
      // This would connect to your actual recording service
      // For now, we'll just simulate it
      console.log(`Starting recording for call ${callId}`);
      
      // Create a recording entry
      const recording: CallRecording = {
        callId,
        agentId,
        recordingUrl: `https://recordings.dynagenlending.com/${callId}.mp3`, // Placeholder
        startTime: new Date(),
        metadata: { phoneNumber }
      };
      
      // Store in active recordings
      this.activeRecordings.set(callId, recording);
      
      // Log recording start
      auditLogger.logInfo('recording_started', {
        callId,
        agentId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to start recording:", error);
      auditLogger.logError('recording_start_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        callId,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Stop recording a call
  private async stopRecording(callId: string): Promise<void> {
    try {
      // Get the recording
      const recording = this.activeRecordings.get(callId);
      if (!recording) {
        throw new Error(`No active recording found for call ${callId}`);
      }
      
      // Update recording with end time
      recording.endTime = new Date();
      
      // This would normally call your recording service to stop recording
      console.log(`Stopping recording for call ${callId}`);
      
      // Log recording end
      auditLogger.logInfo('recording_stopped', {
        callId,
        duration: (recording.endTime.getTime() - recording.startTime.getTime()) / 1000,
        timestamp: new Date().toISOString()
      });
      
      // Process the recording with AI analysis
      this.processRecording(callId);
    } catch (error) {
      console.error("Failed to stop recording:", error);
      auditLogger.logError('recording_stop_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        callId,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Process a recording with AI analysis
  private async processRecording(callId: string): Promise<void> {
    try {
      const recording = this.activeRecordings.get(callId);
      if (!recording) {
        throw new Error(`No recording found for call ${callId}`);
      }
      
      // Calculate call duration
      const duration = recording.endTime 
        ? (recording.endTime.getTime() - recording.startTime.getTime()) / 1000
        : 0;
      
      // Prepare metadata for analysis
      const metadata: CallMetadata = {
        callId: recording.callId,
        agentId: recording.agentId,
        phoneNumber: recording.metadata.phoneNumber,
        timestamp: recording.startTime.toISOString(),
        duration,
        recordingUrl: recording.recordingUrl
      };
      
      // Log analysis start
      auditLogger.logInfo('call_analysis_started', {
        callId,
        timestamp: new Date().toISOString()
      });
      
      // This would normally fetch the actual recording audio
      // For now, we'll just call the analysis service with metadata
      const analysis = await aiCallAnalysisService.analyzeCall(metadata);
      
      // Store the analysis results (in a real implementation, this would go to a database)
      console.log('Call analysis complete:', analysis);
      
      // Generate follow-up recommendations if needed
      if (analysis.followUpRecommended) {
        const recommendations = await aiCallAnalysisService.generateFollowUpRecommendations(analysis);
        console.log('Follow-up recommendations:', recommendations);
      }
      
      // Log analysis completion
      auditLogger.logInfo('call_analysis_completed', {
        callId,
        sentiment: analysis.sentiment,
        riskIndicatorsCount: analysis.riskIndicators.length,
        timestamp: new Date().toISOString()
      });
      
      // Finally, remove from active recordings
      this.activeRecordings.delete(callId);
    } catch (error) {
      console.error("Failed to process recording:", error);
      auditLogger.logError('call_analysis_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        callId,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Toggle recording capability
  toggleRecording(enabled: boolean): void {
    this.recordingEnabled = enabled;
    localStorage.setItem('recordingEnabled', enabled.toString());
    
    // Log setting change
    auditLogger.logInfo('recording_setting_changed', {
      enabled,
      timestamp: new Date().toISOString()
    });
    
    toast.info(enabled ? "Call recording enabled" : "Call recording disabled");
  }
  
  // Retrieve recent calls (in a real implementation, this would fetch from a database)
  async getRecentCalls(limit: number = 10): Promise<any[]> {
    // This is a placeholder - in a real implementation, this would fetch from your database
    return [];
  }
}

export default new CallManagerService();
