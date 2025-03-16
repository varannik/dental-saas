'use client';

import React, { useEffect, useCallback } from 'react';
import { useVoiceAssistant } from '@/contexts/VoiceAssistantContext';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useVoiceAssistantApi } from '@/hooks/useVoiceAssistantApi';

export function VoiceAssistant(): React.ReactElement {
  const { state, dispatch } = useVoiceAssistant();
  const { 
    isAuthenticated, 
    processAudio, 
    cancelProcessing 
  } = useVoiceAssistantApi();
  
  const handleAudioData = useCallback(async (audioData: Blob) => {
    if (state.isProcessing) return;
    await processAudio(audioData);
  }, [processAudio, state.isProcessing]);
  
  const { 
    isInitialized,
    isRecording,
    error: recordingError,
    toggleRecording,
    startRecording,
    stopRecording
  } = useVoiceRecording({
    onAudioData: handleAudioData,
    onError: (error) => {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  });
  
  // Handle errors from the recording hook
  useEffect(() => {
    if (recordingError) {
      dispatch({ type: 'SET_ERROR', payload: recordingError.message });
    }
  }, [recordingError, dispatch]);
  
  // If we're recording and the state starts processing, stop recording
  useEffect(() => {
    if (isRecording && state.isProcessing) {
      stopRecording();
    }
  }, [isRecording, state.isProcessing, stopRecording]);
  
  // Start/stop listening based on recording state
  useEffect(() => {
    if (isRecording) {
      dispatch({ type: 'START_LISTENING' });
    } else if (!state.isProcessing) {
      dispatch({ type: 'STOP_LISTENING' });
    }
  }, [isRecording, dispatch, state.isProcessing]);

  const handleMicrophoneClick = useCallback(() => {
    if (state.isProcessing) {
      cancelProcessing();
    } else {
      toggleRecording();
    }
  }, [toggleRecording, state.isProcessing, cancelProcessing]);

  const renderStatus = () => {
    if (state.error) {
      return <div className="text-red-500">{state.error}</div>;
    }
    
    if (!isInitialized) {
      return <div className="text-gray-500">Initializing...</div>;
    }
    
    if (!isAuthenticated) {
      return <div className="text-yellow-500">Authentication required</div>;
    }
    
    if (state.isProcessing) {
      return <div className="text-blue-500">Processing...</div>;
    }
    
    if (state.isListening) {
      return <div className="text-green-500">Listening...</div>;
    }
    
    return <div className="text-gray-500">Ready</div>;
  };

  return (
    <div className="flex flex-col items-center p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
        AI Voice Assistant
      </div>
      
      {renderStatus()}
      
      <div className="my-4">
        <button
          onClick={handleMicrophoneClick}
          disabled={!isInitialized}
          className={`
            rounded-full p-4 flex items-center justify-center
            ${state.isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}
            ${state.isProcessing ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
            ${!isInitialized ? 'opacity-50 cursor-not-allowed' : ''}
            text-white transition-colors
          `}
          aria-label={state.isListening ? 'Stop recording' : 'Start recording'}
        >
          {state.isListening ? (
            <MicrophoneActiveIcon className="w-8 h-8" />
          ) : state.isProcessing ? (
            <StopIcon className="w-8 h-8" />
          ) : (
            <MicrophoneIcon className="w-8 h-8" />
          )}
        </button>
      </div>
      
      <div className="w-full">
        {state.lastQuery && (
          <div className="mb-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">You said:</div>
            <div className="text-gray-900 dark:text-white">{state.lastQuery}</div>
          </div>
        )}
        
        {state.lastResponse && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
            <div className="text-sm text-blue-500 dark:text-blue-300 mb-1">Assistant:</div>
            <div className="text-gray-900 dark:text-white">{state.lastResponse}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Icon components
function MicrophoneIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      className={className} 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
      />
    </svg>
  );
}

function MicrophoneActiveIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      className={className} 
      fill="currentColor" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
      />
    </svg>
  );
}

function StopIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      className={className} 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
      />
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" 
      />
    </svg>
  );
} 