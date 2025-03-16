'use client';

import React, { useRef, useEffect } from 'react';
import { useVoiceAssistant } from '@/contexts/VoiceAssistantContext';

interface TranscriptProps {
  className?: string;
  maxHeight?: string;
}

/**
 * Transcript component to display the conversation with the AI assistant
 * 
 * This component shows the user's queries and the assistant's responses
 * in a conversational format.
 */
export function Transcript({ className = '', maxHeight = '300px' }: TranscriptProps) {
  const { state } = useVoiceAssistant();
  const transcriptRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to the bottom when new content is added
  useEffect(() => {
    if (transcriptRef.current) {
      const element = transcriptRef.current;
      element.scrollTop = element.scrollHeight;
    }
  }, [state.lastQuery, state.lastResponse]);
  
  // Nothing to display yet
  if (!state.lastQuery && !state.lastResponse) {
    return (
      <div 
        className={`p-4 rounded-lg bg-gray-50 border border-gray-100 text-gray-500 text-center ${className}`}
        style={{ maxHeight }}
      >
        Waiting for you to speak...
      </div>
    );
  }
  
  return (
    <div 
      ref={transcriptRef}
      className={`p-4 rounded-lg bg-gray-50 border border-gray-100 overflow-y-auto ${className}`}
      style={{ maxHeight }}
    >
      {state.lastQuery && (
        <div className="mb-4">
          <div className="font-semibold text-gray-700 mb-1">You:</div>
          <div className="bg-blue-50 rounded-lg p-3 text-gray-800">
            {state.lastQuery}
          </div>
        </div>
      )}
      
      {state.lastResponse && (
        <div className="mb-2">
          <div className="font-semibold text-gray-700 mb-1">Assistant:</div>
          <div className="bg-green-50 rounded-lg p-3 text-gray-800">
            {state.lastResponse}
            {state.isProcessing && (
              <span className="inline-block ml-1 animate-pulse">
                <span className="inline-block mx-0.5">.</span>
                <span className="inline-block mx-0.5">.</span>
                <span className="inline-block mx-0.5">.</span>
              </span>
            )}
          </div>
        </div>
      )}
      
      {state.isListening && (
        <div className="text-sm text-gray-500 mt-2 animate-pulse">
          Listening...
        </div>
      )}
    </div>
  );
} 