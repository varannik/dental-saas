import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { VoiceAssistantProvider, useVoiceAssistant } from '@/contexts/VoiceAssistantContext';
import { WebRTCService } from '@/lib/webrtc/WebRTCService';
import { RedisService } from '@/lib/redis/RedisService';
import { MessageType, RedisMessage } from '@/types';

// Mock the services
jest.mock('@/lib/webrtc/WebRTCService');
jest.mock('@/lib/redis/RedisService');

// Test component that uses the context
function TestComponent() {
  const { state, startListening, stopListening } = useVoiceAssistant();
  
  return (
    <div>
      <div data-testid="listening">{state.isListening ? 'Listening' : 'Not Listening'}</div>
      <div data-testid="processing">{state.isProcessing ? 'Processing' : 'Not Processing'}</div>
      <div data-testid="speaking">{state.isSpeaking ? 'Speaking' : 'Not Speaking'}</div>
      {state.error && <div data-testid="error">{state.error}</div>}
      <button onClick={() => startListening()} data-testid="start-button">Start Listening</button>
      <button onClick={() => stopListening()} data-testid="stop-button">Stop Listening</button>
    </div>
  );
}

describe('VoiceAssistantContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup WebRTCService mock implementation
    (WebRTCService as jest.Mock).mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      onAudioData: jest.fn(),
      onError: jest.fn(),
      getSessionId: jest.fn().mockReturnValue('test-session-id'),
      dispose: jest.fn(),
    }));
    
    // Setup RedisService mock implementation
    (RedisService as jest.Mock).mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      onMessage: jest.fn(),
      sendAudioChunk: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    }));
  });
  
  test('provides default state', async () => {
    render(
      <VoiceAssistantProvider>
        <TestComponent />
      </VoiceAssistantProvider>
    );
    
    // Wait for the initialization to complete
    await waitFor(() => {
      expect(screen.getByTestId('listening')).toHaveTextContent('Not Listening');
      expect(screen.getByTestId('processing')).toHaveTextContent('Not Processing');
      expect(screen.getByTestId('speaking')).toHaveTextContent('Not Speaking');
    });
  });
  
  test('starts listening when startListening is called', async () => {
    render(
      <VoiceAssistantProvider>
        <TestComponent />
      </VoiceAssistantProvider>
    );
    
    // Wait for initialization
    await waitFor(() => {
      expect(screen.getByTestId('listening')).toHaveTextContent('Not Listening');
    });
    
    // Click the start button
    act(() => {
      screen.getByTestId('start-button').click();
    });
    
    // Check if state is updated
    await waitFor(() => {
      expect(screen.getByTestId('listening')).toHaveTextContent('Listening');
      expect(screen.getByTestId('processing')).toHaveTextContent('Processing');
    });
  });
  
  test('stops listening when stopListening is called', async () => {
    render(
      <VoiceAssistantProvider>
        <TestComponent />
      </VoiceAssistantProvider>
    );
    
    // Wait for initialization
    await waitFor(() => {
      expect(screen.getByTestId('listening')).toHaveTextContent('Not Listening');
    });
    
    // Start listening first
    act(() => {
      screen.getByTestId('start-button').click();
    });
    
    // Check if state is updated
    await waitFor(() => {
      expect(screen.getByTestId('listening')).toHaveTextContent('Listening');
    });
    
    // Stop listening
    act(() => {
      screen.getByTestId('stop-button').click();
    });
    
    // Check if state is updated
    await waitFor(() => {
      expect(screen.getByTestId('listening')).toHaveTextContent('Not Listening');
    });
  });
  
  test('handles response messages from Redis', async () => {
    // Create a map to hold message handlers with correct typings
    const redisMessageHandlers: { [key in MessageType]?: (message: RedisMessage) => void } = {};
    
    (RedisService as jest.Mock).mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      onMessage: jest.fn().mockImplementation((type: MessageType, handler: (message: RedisMessage) => void) => {
        redisMessageHandlers[type] = handler;
      }),
      sendAudioChunk: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    }));
    
    render(
      <VoiceAssistantProvider>
        <TestComponent />
      </VoiceAssistantProvider>
    );
    
    // Wait for initialization
    await waitFor(() => {
      expect(screen.getByTestId('speaking')).toHaveTextContent('Not Speaking');
    });
    
    // Simulate response start message
    if (redisMessageHandlers[MessageType.RESPONSE_START]) {
      act(() => {
        if (redisMessageHandlers[MessageType.RESPONSE_START]) {
          redisMessageHandlers[MessageType.RESPONSE_START]({
            id: 'test-message',
            timestamp: Date.now(),
            type: MessageType.RESPONSE_START,
            payload: {}
          });
        }
      });
    }
    
    // Check if speaking state is updated
    await waitFor(() => {
      expect(screen.getByTestId('speaking')).toHaveTextContent('Speaking');
    });
    
    // Simulate response chunk message
    if (redisMessageHandlers[MessageType.RESPONSE_CHUNK]) {
      act(() => {
        if (redisMessageHandlers[MessageType.RESPONSE_CHUNK]) {
          redisMessageHandlers[MessageType.RESPONSE_CHUNK]({
            id: 'test-message',
            timestamp: Date.now(),
            type: MessageType.RESPONSE_CHUNK,
            payload: { text: 'Hello, how can I help you?' }
          });
        }
      });
    }
    
    // Simulate response end message
    if (redisMessageHandlers[MessageType.RESPONSE_END]) {
      act(() => {
        if (redisMessageHandlers[MessageType.RESPONSE_END]) {
          redisMessageHandlers[MessageType.RESPONSE_END]({
            id: 'test-message',
            timestamp: Date.now(),
            type: MessageType.RESPONSE_END,
            payload: {}
          });
        }
      });
    }
    
    // Check if state is updated correctly
    await waitFor(() => {
      expect(screen.getByTestId('speaking')).toHaveTextContent('Not Speaking');
      expect(screen.getByTestId('processing')).toHaveTextContent('Not Processing');
    });
  });
  
  test('handles errors from Redis', async () => {
    // Create a map to hold message handlers with correct typings
    const redisMessageHandlers: { [key in MessageType]?: (message: RedisMessage) => void } = {};
    
    (RedisService as jest.Mock).mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      onMessage: jest.fn().mockImplementation((type: MessageType, handler: (message: RedisMessage) => void) => {
        redisMessageHandlers[type] = handler;
      }),
      sendAudioChunk: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    }));
    
    render(
      <VoiceAssistantProvider>
        <TestComponent />
      </VoiceAssistantProvider>
    );
    
    // Wait for initialization
    await waitFor(() => {
      expect(screen.queryByTestId('error')).not.toBeInTheDocument();
    });
    
    // Simulate error message
    if (redisMessageHandlers[MessageType.ERROR]) {
      act(() => {
        if (redisMessageHandlers[MessageType.ERROR]) {
          redisMessageHandlers[MessageType.ERROR]({
            id: 'test-message',
            timestamp: Date.now(),
            type: MessageType.ERROR,
            payload: { message: 'Test error message' }
          });
        }
      });
    }
    
    // Check if error state is updated
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Test error message');
      expect(screen.getByTestId('processing')).toHaveTextContent('Not Processing');
      expect(screen.getByTestId('speaking')).toHaveTextContent('Not Speaking');
    });
  });
}); 