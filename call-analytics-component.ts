// src/components/calls/CallAnalyticsPanel.tsx

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tag } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CallAnalysis } from '@/services/aiCallAnalysisService'; 

interface CallAnalyticsPanelProps {
  callId: string;
  analysis?: CallAnalysis;
  isLoading?: boolean;
  onRequestTranscript?: (callId: string) => void;
}

// Helper function to get sentiment color
const getSentimentColor = (sentiment: string): string => {
  switch (sentiment) {
    case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
    case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    case 'mixed': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  }
};

const CallAnalyticsPanel: React.FC<CallAnalyticsPanelProps> = ({ 
  callId, 
  analysis, 
  isLoading = false,
  onRequestTranscript 
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('summary');
  
  // Create a loading state or placeholder if analysis isn't available yet
  if (isLoading || !analysis) {
    return (
      <Card className="border-2 border-dynagen-blue h-full">
        <CardHeader className="bg-dynagen-blue text-white">
          <CardTitle>Call Analysis</CardTitle>
          <CardDescription className="text-white/80">
            {isLoading ? "Analyzing call..." : "No call analysis available"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 flex flex-col items-center justify-center h-64">
          {isLoading ? (
            <>
              <div className="w-full max-w-xs">
                <Progress value={45} className="h-2 mb-4" />
              </div>
              <p className="text-sm text-muted-foreground">AI is analyzing the call recording...</p>
            </>
          ) : (
            <>
              <Tag className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a call to view its analysis</p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-2 border-dynagen-blue h-full">
      <CardHeader className="bg-dynagen-blue text-white">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Call Analysis</CardTitle>
            <CardDescription className="text-white/80">
              AI-powered insights from your conversation
            </CardDescription>
          </div>
          <Badge className={getSentimentColor(analysis.sentiment)}>
            {analysis.sentiment.charAt(0).toUpperCase() + analysis.sentiment.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 mx-6 mt-2">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
          <TabsTrigger value="agent">Agent Performance</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
        </TabsList>
        
        <CardContent className="p-6">
          <TabsContent value="summary" className="mt-0">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Overall Assessment</h4>
                <p className="text-sm text-muted-foreground">
                  {analysis.summary || "No summary available for this call."}
                </p>
              </div>
              
              <div>
                <h4 className="text-sm font-medium mb-2">Key Phrases</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.keyPhrases.map((phrase, idx) => (
                    <Badge key={idx} variant="outline" className="bg-gray-50 dark:bg-gray-900">
                      {phrase}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {analysis.loanQualificationScore !== undefined && (
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Loan Qualification Score: {analysis.loanQualificationScore}%
                  </h4>
                  <Progress value={analysis.loanQualificationScore} className="h-2" />
                </div>
              )}
              
              <div>
                <h4 className="text-sm font-medium mb-2">Follow-up Recommended</h4>
                <Badge variant={analysis.followUpRecommended ? "default" : "outline"}>
                  {analysis.followUpRecommended ? "Yes" : "No"}
                </Badge>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="risk" className="mt-0">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Risk Indicators</h4>
              
              {analysis.riskIndicators.length === 0 ? (
                <p className="text-sm text-muted-foreground">No risk indicators detected in this call.</p>
              ) : (
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {analysis.riskIndicators.map((risk, idx) => (
                      <div key={idx} className="p-3 border rounded-md">
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="font-medium">{risk.type}</h5>
                          <Badge 
                            variant="outline" 
                            className={
                              risk.confidence > 0.7 ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" :
                              risk.confidence > 0.4 ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" :
                              "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                            }
                          >
                            {Math.round(risk.confidence * 100)}% confidence
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">"{risk.context}"</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="agent" className="mt-0">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Agent Performance Metrics</h4>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Clarity</span>
                    <span className="text-sm font-medium">{analysis.agentPerformanceMetrics.clarity}%</span>
                  </div>
                  <Progress value={analysis.agentPerformanceMetrics.clarity} className="h-2" />
                </div>
                
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Empathy</span>
                    <span className="text-sm font-medium">{analysis.agentPerformanceMetrics.empathy}%</span>
                  </div>
                  <Progress value={analysis.agentPerformanceMetrics.empathy} className="h-2" />
                </div>
                
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Effectiveness</span>
                    <span className="text-sm font-medium">{analysis.agentPerformanceMetrics.effectiveness}%</span>
                  </div>
                  <Progress value={analysis.agentPerformanceMetrics.effectiveness} className="h-2" />
                </div>
                
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Compliance</span>
                    <span className="text-sm font-medium">{analysis.agentPerformanceMetrics.complianceScore}%</span>
                  </div>
                  <Progress 
                    value={analysis.agentPerformanceMetrics.complianceScore} 
                    className={`h-2 ${analysis.agentPerformanceMetrics.complianceScore < 85 ? 'bg-red-500' : ''}`} 
                  />
                </div>
              </div>
              
              <div className="pt-4">
                <h4 className="text-sm font-medium mb-2">Performance Insights</h4>
                <p className="text-sm text-muted-foreground">
                  {analysis.agentPerformanceMetrics.complianceScore < 85 
                    ? "⚠️ Compliance issues detected. Agent should review call script and regulatory guidelines."
                    : "✅ Agent demonstrated good adherence to protocols and regulatory guidelines."}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {analysis.agentPerformanceMetrics.empathy < 70
                    ? "💬 Opportunity to improve customer engagement by showing more empathy."
                    : "💬 Good rapport established with customer."}
                </p>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="transcript" className="mt-0">
            <div className="space-y-3">
              {!analysis.transcriptionSegments || analysis.transcriptionSegments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Detailed transcript not available for this call</p>
                  {onRequestTranscript && (
                    <Button 
                      variant="outline" 
                      onClick={() => onRequestTranscript(callId)}
                    >
                      Request Transcript
                    </Button>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {analysis.transcriptionSegments.map((segment, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg ${
                          segment.speaker === 'agent' 
                            ? 'bg-blue-50 dark:bg-blue-900/10 ml-6' 
                            : 'bg-gray-50 dark:bg-gray-900/10 mr-6'
                        }`}
                      >
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-medium">
                            {segment.speaker === 'agent' ? 'Agent' : 'Customer'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(segment.startTime * 1000).toISOString().substr(14, 5)}
                          </span>
                        </div>
                        <p className="text-sm">{segment.text}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
};

export default CallAnalyticsPanel;