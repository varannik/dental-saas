import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom'; // Import jest-dom matchers
import { VoiceAssistant } from '@/components/VoiceAssistant';
import { VoiceAssistantProvider } from '@/contexts/VoiceAssistantContext';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useVoiceAssistantApi } from '@/hooks/useVoiceAssistantApi';

// Mock the hooks
jest.mock('@/hooks/useVoiceRecording', () => ({
  useVoiceRecording: jest.fn(),
}));

jest.mock('@/hooks/useVoiceAssistantApi', () => ({
  useVoiceAssistantApi: jest.fn(),
}));

describe('VoiceAssistant', () => {
  beforeEach(() => {
    // Setup default mocks
    (useVoiceRecording as jest.Mock).mockReturnValue({
      isInitialized: true,
      isRecording: false,
      error: null,
      audioLevel: 0,
      sessionId: 'test-session-id',
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      toggleRecording: jest.fn(),
    });
    
    (useVoiceAssistantApi as jest.Mock).mockReturnValue({
      isInitialized: true,
      isAuthenticated: true,
      sessionId: 'test-session-id',
      authenticate: jest.fn(),
      processAudio: jest.fn(),
      cancelProcessing: jest.fn(),
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  it('renders the component with initial state', () => {
    render(
      <VoiceAssistantProvider>
        <VoiceAssistant />
      </VoiceAssistantProvider>
    );
    
    expect(screen.getByText('AI Voice Assistant')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
  
  it('shows the listening state when recording', () => {
    (useVoiceRecording as jest.Mock).mockReturnValue({
      isInitialized: true,
      isRecording: true,
      error: null,
      audioLevel: 0,
      sessionId: 'test-session-id',
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      toggleRecording: jest.fn(),
    });
    
    render(
      <VoiceAssistantProvider>
        <VoiceAssistant />
      </VoiceAssistantProvider>
    );
    
    expect(screen.getByText('Listening...')).toBeInTheDocument();
  });
  
  it('shows the processing state when processing', () => {
    // Mock the context state
    const originalUseContext = React.useContext;
    jest.spyOn(React, 'useContext').mockImplementation((context) => {
      if (context.displayName === 'VoiceAssistantContext') {
        return {
          state: {
            isProcessing: true,
            isListening: false,
            isSpeaking: false,
            error: null,
            lastQuery: null,
            lastResponse: null,
          },
          dispatch: jest.fn(),
        };
      }
      return originalUseContext(context);
    });
    
    render(
      <VoiceAssistantProvider>
        <VoiceAssistant />
      </VoiceAssistantProvider>
    );
    
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });
  
  it('shows an error when there is an error', () => {
    // Mock the context state
    const originalUseContext = React.useContext;
    jest.spyOn(React, 'useContext').mockImplementation((context) => {
      if (context.displayName === 'VoiceAssistantContext') {
        return {
          state: {
            isProcessing: false,
            isListening: false,
            isSpeaking: false,
            error: 'Test error message',
            lastQuery: null,
            lastResponse: null,
          },
          dispatch: jest.fn(),
        };
      }
      return originalUseContext(context);
    });
    
    render(
      <VoiceAssistantProvider>
        <VoiceAssistant />
      </VoiceAssistantProvider>
    );
    
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });
  
  it('calls toggleRecording when the microphone button is clicked', () => {
    const toggleRecording = jest.fn();
    (useVoiceRecording as jest.Mock).mockReturnValue({
      isInitialized: true,
      isRecording: false,
      error: null,
      audioLevel: 0,
      sessionId: 'test-session-id',
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      toggleRecording,
    });
    
    render(
      <VoiceAssistantProvider>
        <VoiceAssistant />
      </VoiceAssistantProvider>
    );
    
    const button = screen.getByRole('button', { name: 'Start recording' });
    fireEvent.click(button);
    
    expect(toggleRecording).toHaveBeenCalled();
  });
  
  it('calls cancelProcessing when the button is clicked during processing', () => {
    const cancelProcessing = jest.fn();
    (useVoiceAssistantApi as jest.Mock).mockReturnValue({
      isInitialized: true,
      isAuthenticated: true,
      sessionId: 'test-session-id',
      authenticate: jest.fn(),
      processAudio: jest.fn(),
      cancelProcessing,
    });
    
    // Mock the context state
    const originalUseContext = React.useContext;
    jest.spyOn(React, 'useContext').mockImplementation((context) => {
      if (context.displayName === 'VoiceAssistantContext') {
        return {
          state: {
            isProcessing: true,
            isListening: false,
            isSpeaking: false,
            error: null,
            lastQuery: null,
            lastResponse: null,
          },
          dispatch: jest.fn(),
        };
      }
      return originalUseContext(context);
    });
    
    render(
      <VoiceAssistantProvider>
        <VoiceAssistant />
      </VoiceAssistantProvider>
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(cancelProcessing).toHaveBeenCalled();
  });
}); 