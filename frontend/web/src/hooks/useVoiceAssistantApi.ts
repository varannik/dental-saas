'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVoiceAssistant } from '@/contexts/VoiceAssistantContext';
import { VoiceApiService } from '@/lib/api/VoiceApiService';

/**
 * Custom hook to integrate the VoiceApiService with the voice assistant context
 * @returns Object with API functions and state
 */
export function useVoiceAssistantApi() {
  const { state, dispatch } = useVoiceAssistant();
  const [apiService] = useState<VoiceApiService>(() => new VoiceApiService());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initialize the API service
  useEffect(() => {
    if (isInitialized) return;

    const initialize = async () => {
      try {
        // Check if we need to authenticate
        if (process.env.AUTH_REQUIRED === 'true' && !apiService.isAuthenticated()) {
          // In a real app, this would trigger a login flow
          // For now, we'll just set it as not authenticated
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
        }

        // Start a session with the backend
        const sid = await apiService.startSession();
        setSessionId(sid);
        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing voice API:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to connect to voice assistant service' });
      }
    };

    initialize();

    // Clean up on unmount
    return () => {
      apiService.endSession().catch(console.error);
    };
  }, [apiService, dispatch, isInitialized]);

  /**
   * Authenticate with the backend
   * @param username User's username
   * @param password User's password
   */
  const authenticate = useCallback(
    async (username: string, password: string): Promise<boolean> => {
      try {
        const success = await apiService.authenticate(username, password);
        setIsAuthenticated(success);
        return success;
      } catch (error) {
        console.error('Authentication error:', error);
        dispatch({ 
          type: 'SET_ERROR', 
          payload: 'Authentication failed. Please check your credentials and try again.' 
        });
        return false;
      }
    },
    [apiService, dispatch]
  );

  /**
   * Process audio data and get a response
   * @param audioBlob Audio data to process
   */
  const processAudio = useCallback(
    async (audioBlob: Blob): Promise<void> => {
      if (!isInitialized) {
        dispatch({ type: 'SET_ERROR', payload: 'API service not initialized' });
        return;
      }

      dispatch({ type: 'START_PROCESSING' });

      try {
        await apiService.streamAudio(
          audioBlob,
          // Message callback
          (message: string) => {
            if (!state.lastResponse) {
              dispatch({ type: 'SET_RESPONSE', payload: message });
            } else {
              dispatch({ type: 'SET_RESPONSE', payload: state.lastResponse + ' ' + message });
            }
          },
          // Error callback
          (error: Error) => {
            console.error('Streaming error:', error);
            dispatch({ type: 'SET_ERROR', payload: error.message });
          },
          // End callback
          () => {
            dispatch({ type: 'STOP_PROCESSING' });
          }
        );
      } catch (error) {
        console.error('Error processing audio:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to process audio' });
        dispatch({ type: 'STOP_PROCESSING' });
      }
    },
    [apiService, dispatch, isInitialized, state.lastResponse]
  );

  /**
   * Cancel the current audio processing
   */
  const cancelProcessing = useCallback(() => {
    apiService.cancelStream();
    dispatch({ type: 'STOP_PROCESSING' });
  }, [apiService, dispatch]);

  return {
    isInitialized,
    isAuthenticated,
    sessionId,
    authenticate,
    processAudio,
    cancelProcessing,
  };
} 