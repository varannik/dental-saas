'use client';

import React, { useState, useEffect } from 'react';
import { useVoiceAssistant } from '@/contexts/VoiceAssistantContext';

interface MicrophoneButtonProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * MicrophoneButton component for controlling voice input
 * 
 * This button toggles the voice recording state and displays visual feedback
 * about the current state (listening, processing, speaking).
 */
export function MicrophoneButton({ size = 'md', className = '' }: MicrophoneButtonProps) {
  const { state, startListening, stopListening } = useVoiceAssistant();
  const [audioLevel, setAudioLevel] = useState<number>(0);
  
  // Update audio visualization (simulated for now)
  useEffect(() => {
    let animationFrame: number;
    
    const updateAudioLevel = () => {
      if (state.isListening) {
        // In a real app, we would get this from the audio processor
        setAudioLevel(Math.min(1, Math.max(0, 0.2 + Math.random() * 0.3)));
      } else {
        setAudioLevel(0);
      }
      
      animationFrame = requestAnimationFrame(updateAudioLevel);
    };
    
    animationFrame = requestAnimationFrame(updateAudioLevel);
    
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [state.isListening]);
  
  const toggleListening = () => {
    if (state.isListening) {
      stopListening();
    } else {
      startListening();
    }
  };
  
  // Determine size classes
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
  }[size];
  
  // Determine button state
  let buttonColor = 'bg-blue-500 hover:bg-blue-600';
  let ringColor = 'ring-blue-300';
  let label = 'Start listening';
  
  if (state.isListening) {
    buttonColor = 'bg-red-500 hover:bg-red-600';
    ringColor = 'ring-red-300';
    label = 'Stop listening';
  } else if (state.isProcessing) {
    buttonColor = 'bg-yellow-500 hover:bg-yellow-600';
    ringColor = 'ring-yellow-300';
    label = 'Processing...';
  } else if (state.isSpeaking) {
    buttonColor = 'bg-green-500 hover:bg-green-600';
    ringColor = 'ring-green-300';
    label = 'Speaking...';
  }
  
  // Calculate the ripple effect size based on audio level
  const rippleSize = state.isListening 
    ? `scale-[${1 + audioLevel * 0.5}]` 
    : 'scale-0';
  
  return (
    <div className="relative flex flex-col items-center">
      <button
        onClick={toggleListening}
        disabled={state.isProcessing || state.isSpeaking}
        aria-label={label}
        className={`
          ${sizeClasses}
          ${buttonColor}
          rounded-full
          text-white
          focus:outline-none
          focus:ring-2
          focus:${ringColor}
          transition-colors
          relative
          z-10
          flex
          items-center
          justify-center
          shadow-lg
          ${className}
        `}
      >
        {state.isListening ? (
          <StopIcon className="w-1/2 h-1/2" />
        ) : (
          <MicrophoneIcon className="w-1/2 h-1/2" />
        )}
      </button>
      
      {/* Audio level ripple effect */}
      <div
        className={`
          absolute
          inset-0
          rounded-full
          bg-current
          opacity-20
          transition-transform
          duration-150
          ease-in-out
          ${state.isListening ? 'visible' : 'invisible'}
        `}
        style={{ 
          transform: `scale(${1 + audioLevel * 0.8})`,
          backgroundColor: 'currentColor',
        }}
      />
      
      {/* Processing or speaking indicator */}
      {(state.isProcessing || state.isSpeaking) && (
        <div className="mt-2 text-sm text-gray-600 animate-pulse">
          {state.isProcessing ? 'Processing...' : 'Speaking...'}
        </div>
      )}
      
      {/* Error message */}
      {state.error && (
        <div className="mt-2 text-sm text-red-600">
          {state.error}
        </div>
      )}
    </div>
  );
}

// SVG Icons as internal components
function MicrophoneIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M8 11a4 4 0 1 1 8 0v1a4 4 0 1 1-8 0v-1z" />
      <path d="M12 18a6 6 0 0 0 6-6v-1a6 6 0 1 0-12 0v1a6 6 0 0 0 6 6zM12 20a8 8 0 0 1-8-8v-1a8 8 0 1 1 16 0v1a8 8 0 0 1-8 8zm4-9h-8v1a4 4 0 1 0 8 0v-1z" />
      <path d="M7 22h10m-5-3v3" strokeWidth="2" stroke="currentColor" fill="none" />
    </svg>
  );
}

function StopIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  );
} 