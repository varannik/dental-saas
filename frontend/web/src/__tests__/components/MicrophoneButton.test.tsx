import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MicrophoneButton } from '@/components/MicrophoneButton';
import { VoiceAssistantProvider, useVoiceAssistant } from '@/contexts/VoiceAssistantContext';
import { WebRTCService } from '@/lib/webrtc/WebRTCService';
import { RedisService } from '@/lib/redis/RedisService';

// Mock the Voice Assistant context
jest.mock('@/contexts/VoiceAssistantContext', () => {
  const originalModule = jest.requireActual('@/contexts/VoiceAssistantContext');
  
  return {
    ...originalModule,
    useVoiceAssistant: jest.fn(),
  };
});

// Mock the services
jest.mock('@/lib/webrtc/WebRTCService');
jest.mock('@/lib/redis/RedisService');

describe('MicrophoneButton', () => {
  // Setup mock implementations for WebRTCService and RedisService
  beforeEach(() => {
    (WebRTCService as jest.Mock).mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      onAudioData: jest.fn(),
      onError: jest.fn(),
      getSessionId: jest.fn(),
      dispose: jest.fn(),
    }));
    
    (RedisService as jest.Mock).mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      onMessage: jest.fn(),
      sendAudioChunk: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    }));
  });
  
  test('renders in initial state', () => {
    // Mock the voice assistant hook
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: false,
        isProcessing: false,
        isSpeaking: false,
        error: null,
        lastQuery: null,
        lastResponse: null,
      },
      startListening: jest.fn(),
      stopListening: jest.fn(),
      webRTCService: null,
      redisService: null,
    });
    
    render(<MicrophoneButton />);
    
    // Button should be in the idle state
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Start listening');
    expect(button).toHaveClass('bg-blue-500');
    expect(button).not.toBeDisabled();
  });
  
  test('shows listening state', () => {
    // Mock the voice assistant hook with listening state
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: true,
        isProcessing: false,
        isSpeaking: false,
        error: null,
        lastQuery: null,
        lastResponse: null,
      },
      startListening: jest.fn(),
      stopListening: jest.fn(),
      webRTCService: null,
      redisService: null,
    });
    
    render(<MicrophoneButton />);
    
    // Button should be in the listening state
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Stop listening');
    expect(button).toHaveClass('bg-red-500');
    expect(button).not.toBeDisabled();
  });
  
  test('shows processing state', () => {
    // Mock the voice assistant hook with processing state
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: false,
        isProcessing: true,
        isSpeaking: false,
        error: null,
        lastQuery: null,
        lastResponse: null,
      },
      startListening: jest.fn(),
      stopListening: jest.fn(),
      webRTCService: null,
      redisService: null,
    });
    
    render(<MicrophoneButton />);
    
    // Button should be in the processing state
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Processing...');
    expect(button).toHaveClass('bg-yellow-500');
    expect(button).toBeDisabled();
    
    // Processing text should be visible
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });
  
  test('shows speaking state', () => {
    // Mock the voice assistant hook with speaking state
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: false,
        isProcessing: false,
        isSpeaking: true,
        error: null,
        lastQuery: null,
        lastResponse: null,
      },
      startListening: jest.fn(),
      stopListening: jest.fn(),
      webRTCService: null,
      redisService: null,
    });
    
    render(<MicrophoneButton />);
    
    // Button should be in the speaking state
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Speaking...');
    expect(button).toHaveClass('bg-green-500');
    expect(button).toBeDisabled();
    
    // Speaking text should be visible
    expect(screen.getByText('Speaking...')).toBeInTheDocument();
  });
  
  test('shows error message', () => {
    // Mock the voice assistant hook with error state
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: false,
        isProcessing: false,
        isSpeaking: false,
        error: 'Microphone access denied',
        lastQuery: null,
        lastResponse: null,
      },
      startListening: jest.fn(),
      stopListening: jest.fn(),
      webRTCService: null,
      redisService: null,
    });
    
    render(<MicrophoneButton />);
    
    // Error message should be visible
    expect(screen.getByText('Microphone access denied')).toBeInTheDocument();
  });
  
  test('calls startListening when button is clicked in idle state', () => {
    const startListeningMock = jest.fn();
    
    // Mock the voice assistant hook
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: false,
        isProcessing: false,
        isSpeaking: false,
        error: null,
        lastQuery: null,
        lastResponse: null,
      },
      startListening: startListeningMock,
      stopListening: jest.fn(),
      webRTCService: null,
      redisService: null,
    });
    
    render(<MicrophoneButton />);
    
    // Click the button
    fireEvent.click(screen.getByRole('button'));
    
    // Check if startListening was called
    expect(startListeningMock).toHaveBeenCalledTimes(1);
  });
  
  test('calls stopListening when button is clicked in listening state', () => {
    const stopListeningMock = jest.fn();
    
    // Mock the voice assistant hook
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: true,
        isProcessing: false,
        isSpeaking: false,
        error: null,
        lastQuery: null,
        lastResponse: null,
      },
      startListening: jest.fn(),
      stopListening: stopListeningMock,
      webRTCService: null,
      redisService: null,
    });
    
    render(<MicrophoneButton />);
    
    // Click the button
    fireEvent.click(screen.getByRole('button'));
    
    // Check if stopListening was called
    expect(stopListeningMock).toHaveBeenCalledTimes(1);
  });
  
  test('different size props apply correct classes', () => {
    // Mock the voice assistant hook
    (useVoiceAssistant as jest.Mock).mockReturnValue({
      state: {
        isListening: false,
        isProcessing: false,
        isSpeaking: false,
        error: null,
        lastQuery: null,
        lastResponse: null,
      },
      startListening: jest.fn(),
      stopListening: jest.fn(),
      webRTCService: null,
      redisService: null,
    });
    
    // Test small size
    const { rerender } = render(<MicrophoneButton size="sm" />);
    expect(screen.getByRole('button')).toHaveClass('w-10 h-10');
    
    // Test medium size (default)
    rerender(<MicrophoneButton size="md" />);
    expect(screen.getByRole('button')).toHaveClass('w-14 h-14');
    
    // Test large size
    rerender(<MicrophoneButton size="lg" />);
    expect(screen.getByRole('button')).toHaveClass('w-20 h-20');
  });
});