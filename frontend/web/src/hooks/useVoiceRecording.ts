'use client';

import { useState, useEffect, useCallback } from 'react';
import { AudioConfig, RTCConnectionConfig } from '@/types';
import { WebRTCService } from '@/lib/webrtc/WebRTCService';

interface UseVoiceRecordingOptions {
  onAudioData?: (data: Blob) => void;
  onError?: (error: Error) => void;
  rtcConfig?: RTCConnectionConfig;
  audioConfig?: Partial<AudioConfig>;
}

/**
 * Custom hook for voice recording functionality
 * @param options Configuration options for voice recording
 * @returns Object with recording state and control functions
 */
export function useVoiceRecording({
  onAudioData,
  onError,
  rtcConfig = {
    iceServers: [
      { urls: process.env.STUN_SERVERS?.split(',') || 'stun:stun.l.google.com:19302' },
      {
        urls: process.env.TURN_SERVERS?.split(',') || [],
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      },
    ],
  },
  audioConfig = {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
}: UseVoiceRecordingOptions = {}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [webRTCService, setWebRTCService] = useState<WebRTCService | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initialize the WebRTC service
  useEffect(() => {
    // Only initialize once
    if (isInitialized) return;
    
    const service = new WebRTCService(rtcConfig);
    setWebRTCService(service);
    setSessionId(service.getSessionId());
    
    // Set up callbacks
    service.onAudioData((audioData) => {
      onAudioData?.(audioData);
    });
    
    service.onError((err) => {
      setError(err);
      onError?.(err);
    });
    
    // Initialize the service
    const initService = async () => {
      try {
        await service.initialize({
          sampleRate: audioConfig.sampleRate || 16000,
          channelCount: audioConfig.channelCount || 1,
          echoCancellation: audioConfig.echoCancellation !== false,
          noiseSuppression: audioConfig.noiseSuppression !== false,
          autoGainControl: audioConfig.autoGainControl !== false,
        });
        setIsInitialized(true);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
      }
    };
    
    initService();
    
    // Clean up on unmount
    return () => {
      service.dispose();
      setWebRTCService(null);
      setIsInitialized(false);
    };
  }, [
    rtcConfig,
    audioConfig,
    onAudioData,
    onError,
    isInitialized,
  ]);
  
  // Start recording
  const startRecording = useCallback(() => {
    if (!webRTCService || !isInitialized) {
      setError(new Error('WebRTC service not initialized'));
      return;
    }
    
    webRTCService.startRecording();
    setIsRecording(true);
  }, [webRTCService, isInitialized]);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (!webRTCService || !isInitialized) {
      return;
    }
    
    webRTCService.stopRecording();
    setIsRecording(false);
  }, [webRTCService, isInitialized]);
  
  // Toggle recording state
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isInitialized,
    isRecording,
    error,
    audioLevel,
    sessionId,
    startRecording,
    stopRecording,
    toggleRecording,
  };
} 