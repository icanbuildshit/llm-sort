// src/pages/Calls.tsx

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { 
  Phone, 
  Search, 
  ListFilter, 
  Download, 
  Calendar, 
  Clock, 
  User, 
  BarChart4, 
  AlertTriangle 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';

import CallManagerService from '@/services/callManagerService';
import CallAnalyticsPanel from '@/components/calls/CallAnalyticsPanel';

// Mock data for call history
const MOCK_CALLS = [
  {
    id: 'call_1682541234_a1b2c3d',
    phoneNumber: '(555) 123-4567',
    customerName: 'John Smith',
    date: new Date(2025, 3, 26, 9, 45),
    duration: 324, // seconds
    agentId: 'agent_001',
    agentName: 'Michael Rodriguez',
    recordingUrl: 'https://example.com/recording1.mp3',
    sentiment: 'positive',
    loanScore: 82,
    hasRiskIndicators: false,
    analysisComplete: true
  },
  {
    id: 'call_1682538765_e5f6g7h',
    phoneNumber: '(555) 987-6543',
    customerName: 'Sarah Johnson',
    date: new Date(2025, 3, 26, 11, 30),
    duration: 612, // seconds
    agentId: 'agent_002',
    agentName: 'Emily Williams',
    recordingUrl: 'https://example.com/recording2.mp3',
    sentiment: 'neutral',
    loanScore: 65,
    hasRiskIndicators: true,
    analysisComplete: true
  },
  {
    id: 'call_1682534321_i9j8k7l',
    phoneNumber: '(555) 456-7890',
    customerName: 'David Miller',
    date: new Date(2025, 3, 25, 15, 20),
    duration: 488, // seconds
    agentId: 'agent_001',
    agentName: 'Michael Rodriguez',
    recordingUrl: 'https://example.com/recording3.mp3',
    sentiment: 'negative',
    loanScore: 43,
    hasRiskIndicators: true,
    analysisComplete: true
  },
  {
    id: 'call_1682530987_m6n5o4p',
    phoneNumber: '(555) 234-5678',
    customerName: 'Jennifer Adams',
    date: new Date(2025, 3, 25, 10, 15),
    duration: 375, // seconds
    agentId: 'agent_003',
    agentName: 'Daniel Garcia',
    recordingUrl: 'https://example.com/recording4.mp3',
    sentiment: 'mixed',
    loanScore: 71,
    hasRiskIndicators: false,
    analysisComplete: true
  },
  {
    id: 'call_1682527654_q3r2s1t',
    phoneNumber: '(555) 876-5432',
    customerName: 'Robert Wilson',
    date: new Date(2025, 3, 24, 14, 50),
    duration: 520, // seconds
    agentId: 'agent_002',
    agentName: 'Emily Williams',
    recordingUrl: 'https://example.com/recording5.mp3',
    sentiment: 'neutral',
    loanScore: 59,
    hasRiskIndicators: false,
    analysisComplete: true
  }
];

// Mock data for analytics
const MOCK_ANALYSIS = {
  callId: 'call_1682541234_a1b2c3d',
  sentiment: 'positive',
  keyPhrases: ['second mortgage', 'home renovation', 'good credit score', 'stable income', 'preapproval'],
  riskIndicators: [],
  loanQualificationScore: 82,
  followUpRecommended: true,
  agentPerformanceMetrics: {
    clarity: 92,
    empathy: 85,
    effectiveness: 88,
    complianceScore: 95
  },
  summary: "The customer is seeking a home renovation loan with strong qualifications including stable income and good credit. They're looking for preapproval and have a clear project timeline. The agent provided thorough information on loan options and next steps. This appears to be a high-quality lead worth prioritizing for follow-up.",
  transcriptionSegments: [
    { speaker: 'agent', startTime: 0, endTime: 8, text: "Thank you for calling DynaGen Lending. This is Michael. How can I help you today?", confidence: 0.98 },
    { speaker: 'customer', startTime: 8, endTime: 25, text: "Hi Michael, I'm interested in a loan for home renovations. We're planning to redo our kitchen and possibly add a bathroom.", confidence: 0.95 },
    { speaker: 'agent', startTime: 25, endTime: 45, text: "That sounds like an exciting project. I'd be happy to discuss your home renovation loan options. Could you tell me a bit about your current mortgage situation and how much you're looking to borrow?", confidence: 0.97 },
    { speaker: 'customer', startTime: 45, endTime: 85, text: "We've had our mortgage for about 8 years now with a good rate. We're looking to borrow around $50,000 for the renovations. Our credit score is pretty good, last I checked it was around 780.", confidence: 0.96 }
  ]
};

// Helper function to format duration
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Helper function to get color for sentiment badges
const getSentimentColor = (sentiment: string): string => {
  switch (sentiment) {
    case 'positive': return 'bg-green-100 text-green-800';
    case 'negative': return 'bg-red-100 text-red-800';
    case 'mixed': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const Calls: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [callData, setCallData] = useState(MOCK_CALLS);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  
  // Filter calls based on search term and selected tab
  const filteredCalls = callData.filter(call => {
    const matchesSearch = 
      call.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.phoneNumber.includes(searchTerm) ||
      call.agentName.toLowerCase().includes(searchTerm.toLowerCase());
      
    if (selectedTab === "all") return matchesSearch;
    if (selectedTab === "positive") return matchesSearch && call.sentiment === "positive";
    if (selectedTab === "negative") return matchesSearch && call.sentiment === "negative";
    if (selectedTab === "risk") return matchesSearch && call.hasRiskIndicators;
    
    return matchesSearch;
  });

  // Simulate loading call analysis when a call is selected
  useEffect(() => {
    if (selectedCallId) {
      setIsAnalysisLoading(true);
      
      // Simulate API call delay
      const timer = setTimeout(() => {
        setSelectedAnalysis(MOCK_ANALYSIS);
        setIsAnalysisLoading(false);
      }, 1200);
      
      return () => clearTimeout(timer);
    } else {
      setSelectedAnalysis(null);
    }
  }, [selectedCallId]);

  // Request transcript (placeholder function)
  const handleRequestTranscript = (callId: string) => {
    toast.info("Requesting detailed transcript", {
      description: "This may take a few minutes to process"
    });
    
    // Simulate transcript loading
    setTimeout(() => {
      setSelectedAnalysis({
        ...selectedAnalysis,
        transcriptionSegments: MOCK_ANALYSIS.transcriptionSegments
      });
      
      toast.success("Transcript ready", {
        description: "The call transcript has been loaded"
      });
    }, 3000);
  };

  // Download recording (placeholder function)
  const handleDownloadRecording = (callId: string) => {
    toast.info("Downloading recording", {
      description: "Your download will begin shortly"
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calls</h2>
          <p className="text-muted-foreground">
            View and manage your call history with AI-powered analytics
          </p>
        </div>
        <Button 
          className="bg-dynagen-blue hover:bg-dynagen-blue/90"
          onClick={() => toast.info("This feature is in development")}
        >
          <Phone className="mr-2 h-4 w-4" /> New Call
        </Button>
      </div>
      
      <div className="flex gap-6">
        {/* Left column - Call list */}
        <div className="w-2/3">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search calls by customer, phone, or agent..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" className="px-3">
                  <ListFilter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
                <Button variant="outline" className="px-3">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
              
              <Tabs defaultValue="all" value={selectedTab} onValueChange={setSelectedTab}>
                <TabsList className="grid grid-cols-4">
                  <TabsTrigger value="all">All Calls</TabsTrigger>
                  <TabsTrigger value="positive">Positive</TabsTrigger>
                  <TabsTrigger value="negative">Negative</TabsTrigger>
                  <TabsTrigger value="risk">Risk Indicators</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Table>
                <TableCaption>Call history with AI analysis</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Analysis</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No calls match your search criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCalls.map((call) => (
                      <TableRow 
                        key={call.id} 
                        className={`cursor-pointer ${selectedCallId === call.id ? 'bg-gray-50 dark:bg-gray-900/20' : ''}`}
                        onClick={() => setSelectedCallId(call.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{call.customerName}</div>
                          <div className="text-sm text-muted-foreground">{call.phoneNumber}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                            <span>{format(call.date, 'MMM d, yyyy')}</span>
                          </div>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>{format(call.date, 'h:mm a')}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-1 text-muted-foreground" />
                            <span>{call.agentName}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDuration(call.duration)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={getSentimentColor(call.sentiment)}>
                              {call.sentiment.charAt(0).toUpperCase() + call.sentiment.slice(1)}
                            </Badge>
                            
                            <div className="flex items-center text-sm">
                              <BarChart4 className="h-3 w-3 mr-1 text-muted-foreground" />
                              <span className="text-muted-foreground">Score: {call.loanScore}%</span>
                            </div>
                            
                            {call.hasRiskIndicators && (
                              <div className="flex items-center text-sm text-red-600">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                <span>Risk detected</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadRecording(call.id);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        
        {/* Right column - Call analytics */}
        <div className="w-1/3">
          <CallAnalyticsPanel 
            callId={selectedCallId || ''} 
            analysis={selectedAnalysis}
            isLoading={isAnalysisLoading}
            onRequestTranscript={handleRequestTranscript}
          />
        </div>
      </div>
    </div>
  );
};

export default Calls;