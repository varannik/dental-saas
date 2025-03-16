'use client';

import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import { WebRTCService } from '@/lib/webrtc/WebRTCService';
import { RedisService } from '@/lib/redis/RedisService';
import { 
  VoiceAssistantState, 
  VoiceAssistantAction, 
  AudioConfig, 
  RTCConnectionConfig,
  MessageType
} from '@/types';

// Initial state for the voice assistant
const initialState: VoiceAssistantState = {
  isListening: false,
  isProcessing: false,
  isSpeaking: false,
  error: null,
  lastQuery: null,
  lastResponse: null,
};

// Create a context for the voice assistant
const VoiceAssistantContext = createContext<{
  state: VoiceAssistantState;
  dispatch: React.Dispatch<VoiceAssistantAction>;
  startListening: () => Promise<void>;
  stopListening: () => void;
  webRTCService: WebRTCService | null;
  redisService: RedisService | null;
}>({
  state: initialState,
  dispatch: () => null,
  startListening: async () => {},
  stopListening: () => {},
  webRTCService: null,
  redisService: null,
});

// Reducer function to handle state updates
function voiceAssistantReducer(
  state: VoiceAssistantState,
  action: VoiceAssistantAction
): VoiceAssistantState {
  switch (action.type) {
    case 'START_LISTENING':
      return { ...state, isListening: true, error: null };
    case 'STOP_LISTENING':
      return { ...state, isListening: false };
    case 'START_PROCESSING':
      return { ...state, isProcessing: true };
    case 'STOP_PROCESSING':
      return { ...state, isProcessing: false };
    case 'START_SPEAKING':
      return { ...state, isSpeaking: true };
    case 'STOP_SPEAKING':
      return { ...state, isSpeaking: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_QUERY':
      return { ...state, lastQuery: action.payload };
    case 'SET_RESPONSE':
      return { ...state, lastResponse: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// Default configuration for WebRTC
const defaultRTCConfig: RTCConnectionConfig = {
  iceServers: [
    {
      urls: typeof window !== 'undefined' && process.env.STUN_SERVERS 
        ? process.env.STUN_SERVERS.split(',') 
        : ['stun:stun.l.google.com:19302']
    },
    ...(typeof window !== 'undefined' && process.env.TURN_SERVERS ? [
      {
        urls: process.env.TURN_SERVERS.split(','),
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_CREDENTIAL || '',
      }
    ] : [])
  ]
};

// Default configuration for audio capture
const defaultAudioConfig: AudioConfig = {
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

interface VoiceAssistantProviderProps {
  children: React.ReactNode;
  userId?: string;
  rtcConfig?: RTCConnectionConfig;
  audioConfig?: AudioConfig;
}

/**
 * Provider component for the voice assistant context
 */
export function VoiceAssistantProvider({
  children,
  userId = 'guest',
  rtcConfig = defaultRTCConfig,
  audioConfig = defaultAudioConfig
}: VoiceAssistantProviderProps) {
  const [state, dispatch] = useReducer(voiceAssistantReducer, initialState);
  
  // Create services
  const webRTCService = useMemo(() => new WebRTCService(rtcConfig), []);
  const redisService = useMemo(() => new RedisService(), []);
  
  // Initialize WebRTC service and connect to Redis
  useEffect(() => {
    let isInitialized = false;
    
    const init = async () => {
      try {
        // Initialize WebRTC
        await webRTCService.initialize(audioConfig);
        
        // Connect to Redis proxy
        await redisService.connect(userId);
        
        // Register handlers for Redis messages
        redisService.onMessage(MessageType.RESPONSE_START, (message) => {
          dispatch({ type: 'START_SPEAKING' });
        });
        
        redisService.onMessage(MessageType.RESPONSE_CHUNK, (message) => {
          if (message.payload?.text) {
            dispatch({ type: 'SET_RESPONSE', payload: message.payload.text });
          }
        });
        
        redisService.onMessage(MessageType.RESPONSE_END, (message) => {
          dispatch({ type: 'STOP_SPEAKING' });
          dispatch({ type: 'STOP_PROCESSING' });
        });
        
        redisService.onMessage(MessageType.ERROR, (message) => {
          dispatch({ type: 'SET_ERROR', payload: message.payload?.message || 'Unknown error' });
          dispatch({ type: 'STOP_PROCESSING' });
          dispatch({ type: 'STOP_SPEAKING' });
        });
        
        // Audio data handler
        webRTCService.onAudioData(async (audioData) => {
          try {
            if (state.isListening) {
              // Only send if we're actively listening
              await redisService.sendAudioChunk(audioData, webRTCService.getSessionId());
            }
          } catch (error) {
            console.error('Error sending audio data:', error);
            dispatch({ 
              type: 'SET_ERROR', 
              payload: error instanceof Error ? error.message : 'Error sending audio'
            });
          }
        });
        
        // Error handler
        webRTCService.onError((error) => {
          dispatch({ type: 'SET_ERROR', payload: error.message });
          dispatch({ type: 'STOP_LISTENING' });
        });
        
        isInitialized = true;
      } catch (error) {
        console.error('Error initializing voice assistant:', error);
        dispatch({ 
          type: 'SET_ERROR', 
          payload: error instanceof Error ? error.message : 'Failed to initialize voice assistant'
        });
      }
    };
    
    init();
    
    // Cleanup function
    return () => {
      if (isInitialized) {
        webRTCService.dispose();
        redisService.disconnect();
      }
    };
  }, [userId]);
  
  /**
   * Start listening for voice input
   */
  const startListening = async () => {
    try {
      dispatch({ type: 'START_LISTENING' });
      
      // Notify backend that we're starting a new audio session
      await redisService.sendMessage(MessageType.AUDIO_START, {
        sessionId: webRTCService.getSessionId(),
        timestamp: Date.now()
      });
      
      // Start recording audio
      webRTCService.startRecording();
      
      dispatch({ type: 'START_PROCESSING' });
    } catch (error) {
      console.error('Error starting listening:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: error instanceof Error ? error.message : 'Failed to start listening'
      });
      dispatch({ type: 'STOP_LISTENING' });
    }
  };
  
  /**
   * Stop listening for voice input
   */
  const stopListening = async () => {
    try {
      dispatch({ type: 'STOP_LISTENING' });
      
      // Stop recording audio
      webRTCService.stopRecording();
      
      // Notify backend that we're ending the audio session
      await redisService.sendMessage(MessageType.AUDIO_END, {
        sessionId: webRTCService.getSessionId(),
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error stopping listening:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: error instanceof Error ? error.message : 'Failed to stop listening'
      });
    }
  };
  
  return (
    <VoiceAssistantContext.Provider
      value={{
        state,
        dispatch,
        startListening,
        stopListening,
        webRTCService,
        redisService
      }}
    >
      {children}
    </VoiceAssistantContext.Provider>
  );
}

/**
 * Hook to access the voice assistant context
 */
export function useVoiceAssistant() {
  const context = useContext(VoiceAssistantContext);
  
  if (!context) {
    throw new Error('useVoiceAssistant must be used within a VoiceAssistantProvider');
  }
  
  return context;
} 